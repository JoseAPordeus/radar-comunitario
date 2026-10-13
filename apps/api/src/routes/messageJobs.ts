import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { enqueueMessageJob } from '../queue/messageQueue.js';
import { scheduleMessageJobs } from '../services/messagingPolicy.js';
import { env } from '../config/env.js';
import { isProjectSignedMediaUrl } from '../services/mediaUrlPolicy.js';
import { allowedOutboundMessageMime } from '../services/mediaValidation.js';

const uuidSchema = z.string().uuid();
const mediaSchema = z.object({
  url: z.string().url().max(2000).refine(value => value.startsWith('https://'), 'A mídia precisa usar uma URL HTTPS.').optional(),
  storagePath: z.string().trim().max(1000).optional(),
  mimeType: z.string().trim().max(150).optional(),
  fileName: z.string().trim().max(255).optional(),
  caption: z.string().trim().max(5000).optional()
})
  .refine(media => !media || Boolean(media.url || media.storagePath), 'A mídia precisa ter uma URL ou caminho de armazenamento.')
  .refine(media => !media?.url || Boolean(media.storagePath) || isProjectSignedMediaUrl(media.url, env.SUPABASE_URL), 'A URL da mídia deve ser uma URL assinada do Storage privado do projeto.')
  .refine(media => !media?.mimeType || allowedOutboundMessageMime.test(media.mimeType), 'Este tipo de arquivo nao pode ser enviado pelo WhatsApp.')
  .optional();
const jobSchema = z.object({
  contactId: uuidSchema,
  content: z.string().trim().max(5000).default(''),
  type: z.enum(['ANIVERSARIO', 'CAMPANHA']),
  templateId: uuidSchema.optional(),
  correlationId: uuidSchema.optional(),
  availableAt: z.string().datetime().optional(),
  media: mediaSchema
}).refine(job => job.content.length > 0 || Boolean(job.media), {
  message: 'Informe uma mensagem ou um arquivo para envio.'
});

const jobsSchema = z.object({ jobs: z.array(jobSchema).min(1).max(500) });

function queueColumnMissing(error: unknown) {
  const value = error as { code?: string; message?: string };
  return String(value.code ?? '').includes('PGRST204') || String(value.code ?? '').includes('42703') || String(value.message ?? '').includes('queue_released_at');
}

function optionalMediaColumnMissing(error: unknown) {
  const value = error as { message?: string };
  return queueColumnMissing(error) || String(value.message ?? '').includes('media_storage_path');
}

async function insertMessageJobs(rows: Array<Record<string, unknown>>) {
  const result = await supabaseAdmin.from('message_jobs').insert(rows).select('id, contact_id, status, correlation_id, available_at');
  if (!result.error || !optionalMediaColumnMissing(result.error)) return result;
  const legacyRows = rows.map(({ queue_released_at: _queueReleasedAt, media_storage_path: _mediaStoragePath, ...row }) => row);
  return supabaseAdmin.from('message_jobs').insert(legacyRows).select('id, contact_id, status, correlation_id, available_at');
}

type ParsedMessageJob = z.infer<typeof jobSchema>;

async function previewMessageJobs(ownerId: string, jobs: ParsedMessageJob[]) {
  const contactIds = [...new Set(jobs.map(job => job.contactId))];
  const { data: contacts, error: contactsError } = await supabaseAdmin
    .from('contacts')
    .select('id, whatsapp_opt_in, messaging_blocked')
    .eq('owner_id', ownerId)
    .in('id', contactIds);
  if (contactsError) throw new AppError(500, 'CONTACTS_READ_FAILED', 'Nao foi possivel validar os destinatarios.');

  const contactMap = new Map((contacts ?? []).map(contact => [contact.id, contact]));
  const skipped: Array<{ contactId: string; reason: string }> = [];
  const scheduling = await scheduleMessageJobs(ownerId, jobs.map(job => job.availableAt));
  const eligible = jobs.flatMap((job, index) => {
    const availableAt = scheduling.schedule[index];
    if (!availableAt) {
      skipped.push({ contactId: job.contactId, reason: 'DAILY_LIMIT_REACHED' });
      return [];
    }
    const contact = contactMap.get(job.contactId);
    if (!contact) {
      skipped.push({ contactId: job.contactId, reason: 'CONTACT_NOT_FOUND' });
      return [];
    }
    if (contact.messaging_blocked) {
      skipped.push({ contactId: job.contactId, reason: 'MESSAGING_BLOCKED' });
      return [];
    }
    if (!contact.whatsapp_opt_in) {
      skipped.push({ contactId: job.contactId, reason: 'WHATSAPP_OPT_IN_REQUIRED' });
      return [];
    }
    if (job.media?.storagePath && !job.media.storagePath.startsWith(`${ownerId}/`)) {
      skipped.push({ contactId: job.contactId, reason: 'MEDIA_STORAGE_PATH_INVALID' });
      return [];
    }
    return [{
      contactId: job.contactId,
      availableAt,
      hasMedia: Boolean(job.media?.storagePath || job.media?.url),
      mediaMimeType: job.media?.mimeType ?? null
    }];
  });

  return { eligible, skipped, policy: scheduling.policy, remainingToday: scheduling.remaining };
}

export const messageJobsRouter = Router();

messageJobsRouter.post('/preview', async (request, response, next) => {
  try {
    const { jobs } = jobsSchema.parse(request.body);
    const preview = await previewMessageJobs(request.user!.id, jobs);
    if (!preview.policy.enabled) {
      response.status(422).json({ error: { code: 'MESSAGING_DISABLED', message: 'Os envios estao desativados nas configuracoes.' }, requestId: request.requestId });
      return;
    }
    response.json({ data: preview, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

messageJobsRouter.post('/', async (request, response, next) => {
  try {
    const { jobs } = jobsSchema.parse(request.body);
    const ownerId = request.user!.id;
    const contactIds = [...new Set(jobs.map(job => job.contactId))];
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('id, whatsapp_opt_in, messaging_blocked')
      .eq('owner_id', ownerId)
      .in('id', contactIds);
    if (contactsError) throw new AppError(500, 'CONTACTS_READ_FAILED', 'Não foi possível validar os destinatários.');

    const contactMap = new Map((contacts ?? []).map(contact => [contact.id, contact]));
    const skipped: Array<{ contactId: string; reason: string }> = [];
    const scheduling = await scheduleMessageJobs(ownerId, jobs.map(job => job.availableAt));
    if (!scheduling.policy.enabled) {
      response.status(422).json({ error: { code: 'MESSAGING_DISABLED', message: 'Os envios estão desativados nas configurações.' }, requestId: request.requestId });
      return;
    }
    const insertable = jobs.flatMap((job, index) => {
      const availableAt = scheduling.schedule[index];
      if (!availableAt) {
        skipped.push({ contactId: job.contactId, reason: 'DAILY_LIMIT_REACHED' });
        return [];
      }
      const contact = contactMap.get(job.contactId);
      if (!contact) {
        skipped.push({ contactId: job.contactId, reason: 'CONTACT_NOT_FOUND' });
        return [];
      }
      if (contact.messaging_blocked) {
        skipped.push({ contactId: job.contactId, reason: 'MESSAGING_BLOCKED' });
        return [];
      }
      if (!contact.whatsapp_opt_in) {
        skipped.push({ contactId: job.contactId, reason: 'WHATSAPP_OPT_IN_REQUIRED' });
        return [];
      }
      if (job.media?.storagePath && !job.media.storagePath.startsWith(`${ownerId}/`)) {
        skipped.push({ contactId: job.contactId, reason: 'MEDIA_STORAGE_PATH_INVALID' });
        return [];
      }
      return [{
        owner_id: ownerId,
        contact_id: job.contactId,
        content: job.content,
        type: job.type,
        template_id: job.templateId ?? null,
        correlation_id: job.correlationId ?? randomUUID(),
        available_at: availableAt,
        media_url: job.media?.url ?? null,
        media_storage_path: job.media?.storagePath ?? null,
        media_mime_type: job.media?.mimeType ?? null,
        media_filename: job.media?.fileName ?? null,
        media_caption: job.media?.caption ?? null,
        queue_released_at: null
      }];
    });

    if (insertable.length === 0) {
      response.status(422).json({
        error: { code: 'NO_ELIGIBLE_RECIPIENTS', message: 'Nenhum destinatário válido está disponível para envio.', details: skipped },
        requestId: request.requestId
      });
      return;
    }

    const { data, error } = await insertMessageJobs(insertable);
    if (error) throw error;
    await Promise.all((data ?? []).map(job => enqueueMessageJob(job.id, job.available_at)));
    response.status(201).json({ data: { created: data ?? [], skipped }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

messageJobsRouter.get('/', async (request, response, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(500).default(25),
      status: z.enum(['PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ERRO', 'INCERTO', 'CANCELADO']).optional(),
      type: z.enum(['ANIVERSARIO', 'CAMPANHA']).optional(),
      ids: z.string().optional()
    }).parse(request.query);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let builder = supabaseAdmin
      .from('message_jobs')
      .select('id, contact_id, type, status, attempts, max_attempts, available_at, processing_started_at, lease_expires_at, created_at, updated_at, completed_at, error_code, error_message, media_url, media_storage_path, media_mime_type, media_filename, media_caption, contact:contact_id(id, full_name, phone)', { count: 'exact' })
      .eq('owner_id', request.user!.id)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.status) builder = builder.eq('status', query.status);
    if (query.type) builder = builder.eq('type', query.type);
    if (query.ids) {
      const ids = query.ids.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 500 || ids.some(id => !uuidSchema.safeParse(id).success)) {
        throw new AppError(400, 'MESSAGE_JOB_IDS_INVALID', 'A lista de tarefas informada nao e valida.');
      }
      builder = builder.in('id', ids);
    }
    const { data, error, count } = await builder;
    if (error) throw new AppError(500, 'MESSAGE_JOBS_LIST_FAILED', 'Não foi possível consultar o andamento dos envios.');
    response.json({
      data: { items: data ?? [], page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) },
      requestId: request.requestId
    });
  } catch (error) {
    next(error);
  }
});

messageJobsRouter.get('/metrics', async (request, response, next) => {
  try {
    const statuses = ['PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ERRO', 'INCERTO', 'CANCELADO'] as const;
    const entries = await Promise.all(statuses.map(async status => {
      const { count, error } = await supabaseAdmin.from('message_jobs').select('id', { count: 'exact', head: true }).eq('owner_id', request.user!.id).eq('status', status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }));
    response.json({ data: Object.fromEntries(entries), requestId: request.requestId });
  } catch (error) { next(new AppError(500, 'MESSAGE_JOBS_METRICS_FAILED', 'NÃ£o foi possÃ­vel carregar as mÃ©tricas da fila.')); }
});

messageJobsRouter.post('/:id/cancel', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const { data, error } = await supabaseAdmin.from('message_jobs').update({ status: 'CANCELADO', updated_at: new Date().toISOString(), lease_expires_at: null }).eq('id', id).eq('owner_id', request.user!.id).eq('status', 'PENDENTE').select('id, status').maybeSingle();
    if (error) throw new AppError(400, 'MESSAGE_JOB_CANCEL_FAILED', 'NÃ£o foi possÃ­vel cancelar a tarefa.');
    if (!data) throw new AppError(409, 'MESSAGE_JOB_NOT_CANCELABLE', 'A tarefa jÃ¡ foi processada ou nÃ£o existe.');
    response.json({ data, requestId: request.requestId });
  } catch (error) { next(error); }
});

messageJobsRouter.post('/:id/retry', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const retryOptions = z.object({ confirmNotDelivered: z.literal(true).optional() }).default({}).parse(request.body ?? {});
    const ownerId = request.user!.id;
    const reset = {
      status: 'PENDENTE',
      attempts: 0,
      available_at: new Date().toISOString(),
      processing_started_at: null,
      lease_id: null,
      lease_expires_at: null,
      agent_id: null,
      external_message_id: null,
      completed_at: null,
      error_code: null,
      error_message: null,
      queue_released_at: null,
      updated_at: new Date().toISOString()
    };
    let { data, error } = await supabaseAdmin.from('message_jobs')
      .update(reset)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .in('status', retryOptions.confirmNotDelivered ? ['ERRO', 'INCERTO'] : ['ERRO'])
      .select('id, status, available_at')
      .maybeSingle();
    if (error && queueColumnMissing(error)) {
      const { queue_released_at: _queueReleasedAt, ...legacyReset } = reset;
      ({ data, error } = await supabaseAdmin.from('message_jobs')
        .update(legacyReset)
        .eq('id', id)
        .eq('owner_id', ownerId)
        .in('status', retryOptions.confirmNotDelivered ? ['ERRO', 'INCERTO'] : ['ERRO'])
        .select('id, status, available_at')
        .maybeSingle());
    }
    if (error) throw new AppError(400, 'MESSAGE_JOB_RETRY_FAILED', 'NÃ£o foi possÃ­vel reprocessar a tarefa.');
    if (!data) throw new AppError(409, 'MESSAGE_JOB_NOT_RETRYABLE', 'Somente tarefas com erro podem ser reprocessadas. Resultados incertos exigem conferÃªncia manual.');
    await enqueueMessageJob(data.id, data.available_at);
    response.json({ data, requestId: request.requestId });
  } catch (error) { next(error); }
});
