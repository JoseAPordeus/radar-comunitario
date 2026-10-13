import express, { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { env } from '../config/env.js';
import { storeMedia } from '../services/mediaStorage.js';
import { enqueueMessageJob } from '../queue/messageQueue.js';
import { brazilPhoneVariants } from '../lib/phone.js';

const uuidSchema = z.string().uuid();
const HEARTBEAT_PERSIST_INTERVAL_MS = 30_000;
const lastPersistedHeartbeats = new Map<string, { state: string; version: string; persistedAt: number }>();
const heartbeatSchema = z.object({
  agentId: z.string().trim().min(1).max(100),
  state: z.enum(['INICIALIZANDO', 'AGUARDANDO_AUTENTICACAO', 'CONECTADO', 'DESCONECTADO', 'ERRO']),
  version: z.string().trim().min(1).max(50),
  qrCode: z.string().max(900000).nullable().optional(),
  phoneNumber: z.string().trim().max(30).nullable().optional()
});
const claimSchema = z.object({
  agentId: z.string().trim().min(1).max(100),
  leaseSeconds: z.number().int().min(30).max(600).default(120)
});
const resultSchema = z.object({
  agentId: z.string().trim().min(1).max(100),
  leaseId: uuidSchema,
  externalMessageId: z.string().trim().max(200).optional()
});
const failureSchema = z.object({
  agentId: z.string().trim().min(1).max(100),
  leaseId: uuidSchema,
  errorCode: z.string().trim().min(1).max(100),
  errorMessage: z.string().trim().min(1).max(1000),
  retryable: z.boolean()
});
const uncertainSchema = z.object({
  agentId: z.string().trim().min(1).max(100),
  leaseId: uuidSchema,
  reason: z.string().trim().min(1).max(1000)
});
const incomingMessageSchema = z.object({
  agentId: z.string().trim().min(1).max(100),
  messageId: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30).default(''),
  whatsappChatId: z.string().trim().max(200).nullable().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  messageType: z.string().trim().min(1).max(40),
  content: z.string().max(20_000).default(''),
  mediaUrl: z.string().url().max(2000).nullable().optional(),
  mediaStoragePath: z.string().trim().max(1000).nullable().optional(),
  mediaMimeType: z.string().max(150).nullable().optional(),
  quotedMessageId: z.string().trim().max(200).nullable().optional(),
  quotedContent: z.string().max(20_000).nullable().optional(),
  senderDisplayName: z.string().trim().max(200).nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactAvatarUrl: z.string().url().max(2000).nullable().optional(),
  createdAt: z.string().datetime().optional()
});
const contactProfileSchema = z.object({
  phone: z.string().trim().min(8).max(30),
  whatsappChatId: z.string().trim().max(200).nullable().optional(),
  fullName: z.string().trim().max(200).nullable().optional(),
  avatarUrl: z.string().url().max(2000).nullable().optional()
});

function isMissingAgentFunctionGrant(error: unknown) {
  const value = error as { code?: string; message?: string };
  const message = String(value.message ?? '').toLowerCase();
  return value.code === '42501' || value.code === '42883' || message.includes('permission denied for function');
}

function isMissingWhatsAppChatIdColumn(error: unknown) {
  const value = error as { code?: string; message?: string };
  const message = String(value.message ?? '').toLowerCase();
  return value.code === '42703' || value.code === 'PGRST204' || message.includes('whatsapp_chat_id');
}

async function completeMessageJobDirect(jobId: string, agentId: string, leaseId: string, externalMessageId?: string) {
  const { data, error } = await supabaseAdmin.from('message_jobs').update({
    status: 'ENVIADO',
    external_message_id: externalMessageId ?? null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lease_expires_at: null
  }).eq('id', jobId).eq('agent_id', agentId).eq('lease_id', leaseId).eq('status', 'PROCESSANDO').select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function failMessageJobDirect(jobId: string, agentId: string, leaseId: string, errorCode: string, errorMessage: string, retryable: boolean) {
  const { data: current, error: readError } = await supabaseAdmin.from('message_jobs').select('attempts, max_attempts').eq('id', jobId).eq('agent_id', agentId).eq('lease_id', leaseId).eq('status', 'PROCESSANDO').maybeSingle();
  if (readError) throw readError;
  if (!current) return false;
  const shouldRetry = retryable && current.attempts < current.max_attempts;
  const now = new Date();
  const update: Record<string, unknown> = {
    status: shouldRetry ? 'PENDENTE' : 'ERRO',
    error_code: errorCode.slice(0, 100),
    error_message: errorMessage.slice(0, 1000),
    updated_at: now.toISOString(),
    lease_expires_at: null
  };
  if (shouldRetry) update.available_at = new Date(now.getTime() + Math.min(300, (2 ** current.attempts) * 5) * 1000).toISOString();
  const { data, error } = await supabaseAdmin.from('message_jobs').update(update).eq('id', jobId).eq('agent_id', agentId).eq('lease_id', leaseId).eq('status', 'PROCESSANDO').select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function markMessageJobUncertainDirect(jobId: string, agentId: string, leaseId: string, reason: string) {
  const { data, error } = await supabaseAdmin.from('message_jobs').update({
    status: 'INCERTO',
    error_code: 'SEND_RESULT_UNCERTAIN',
    error_message: reason.slice(0, 1000),
    updated_at: new Date().toISOString(),
    lease_expires_at: null
  }).eq('id', jobId).eq('agent_id', agentId).eq('lease_id', leaseId).eq('status', 'PROCESSANDO').select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function assertAgentBody(agentId: string) {
  if (agentId !== env.AGENT_ID) {
    throw new AppError(403, 'AGENT_ID_MISMATCH', 'O identificador do agente não corresponde à credencial.');
  }
}

function contactPhoneFilter(phone: string) {
  const values = brazilPhoneVariants(phone).join(',');
  return `phone.in.(${values}),whatsapp.in.(${values})`;
}

async function resolveMediaUrl(storagePath: string | null | undefined, legacyUrl: string | null | undefined) {
  if (!storagePath) return legacyUrl ?? null;
  const { data, error } = await supabaseAdmin.storage.from('message-media').createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) {
    throw new AppError(503, 'MEDIA_URL_REFRESH_FAILED', 'NÃ£o foi possÃ­vel preparar a mÃ­dia para o envio.');
  }
  return data.signedUrl;
}

export const agentRouter = Router();

agentRouter.get('/contacts', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('contacts').select('phone, whatsapp').limit(5000);
    if (error) throw new AppError(500, 'AGENT_CONTACTS_READ_FAILED', 'Nao foi possivel carregar os telefones cadastrados.');
    const phones = [...new Set((data ?? []).flatMap(contact => [contact.phone, contact.whatsapp]).filter(Boolean).map(phone => String(phone).replace(/\D/g, '')))].filter(phone => /^55[1-9][0-9]{9,10}$/.test(phone));
    response.json({ data: phones, requestId: request.requestId });
  } catch (error) { next(error); }
});

agentRouter.post('/contacts/profile', async (request, response, next) => {
  try {
    const payload = contactProfileSchema.parse(request.body);
    const phone = payload.phone.replace(/\D/g, '');
    const { data: contacts, error: lookupError } = await supabaseAdmin.from('contacts').select('id, owner_id').or(contactPhoneFilter(phone));
    if (lookupError) throw new AppError(500, 'AGENT_CONTACT_PROFILE_LOOKUP_FAILED', 'Nao foi possivel localizar o contato cadastrado.');
    for (const contact of contacts ?? []) {
      const update = {
        ...(payload.whatsappChatId ? { whatsapp_chat_id: payload.whatsappChatId } : {}),
        ...(payload.fullName ? { full_name: payload.fullName } : {}),
        ...(payload.avatarUrl !== undefined ? { avatar_url: payload.avatarUrl } : {})
      };
      if (Object.keys(update).length > 0) {
        let { error: updateError } = await supabaseAdmin.from('contacts').update(update).eq('id', contact.id).eq('owner_id', contact.owner_id);
        if (updateError && isMissingWhatsAppChatIdColumn(updateError)) {
          const { whatsapp_chat_id: _ignored, ...legacyUpdate } = update;
          if (Object.keys(legacyUpdate).length > 0) {
            ({ error: updateError } = await supabaseAdmin.from('contacts').update(legacyUpdate).eq('id', contact.id).eq('owner_id', contact.owner_id));
          } else {
            updateError = null;
          }
        }
        if (updateError) console.error(JSON.stringify({ level: 'warn', message: 'Unable to update WhatsApp contact identity', code: updateError.code, detail: updateError.message }));
      }
    }
    response.json({ data: { updated: contacts?.length ?? 0 }, requestId: request.requestId });
  } catch (error) { next(error); }
});

agentRouter.post('/heartbeat', async (request, response, next) => {
  try {
    const payload = heartbeatSchema.parse(request.body);
    assertAgentBody(payload.agentId);
    const { data: control, error: controlError } = await supabaseAdmin
      .from('agent_status')
      .select('disconnect_requested_at')
      .eq('agent_id', payload.agentId)
      .maybeSingle();
    if (controlError) throw new AppError(500, 'AGENT_CONTROL_READ_FAILED', 'Não foi possível consultar os comandos do agente.');
    const disconnectRequested = Boolean(control?.disconnect_requested_at);
    const now = Date.now();
    const previous = lastPersistedHeartbeats.get(payload.agentId);
    const statusChanged = !previous || previous.state !== payload.state || previous.version !== payload.version;
    const volatileDataProvided = payload.qrCode !== undefined || payload.phoneNumber !== undefined;
    const shouldPersist = disconnectRequested || statusChanged || volatileDataProvided || now - (previous?.persistedAt ?? 0) >= HEARTBEAT_PERSIST_INTERVAL_MS;
    const statusPayload: Record<string, unknown> = {
      agent_id: payload.agentId,
      state: payload.state,
      version: payload.version,
      last_seen_at: new Date(now).toISOString()
    };
    if (disconnectRequested) statusPayload.disconnect_requested_at = null;
    if (payload.qrCode !== undefined) statusPayload.qr_code = payload.qrCode;
    if (payload.phoneNumber !== undefined) statusPayload.phone_number = payload.phoneNumber;
    if (shouldPersist) {
      const { error } = await supabaseAdmin.from('agent_status').upsert(statusPayload, { onConflict: 'agent_id' });
      if (error) throw new AppError(400, 'AGENT_HEARTBEAT_FAILED', 'Heartbeat do agente falhou.');
      lastPersistedHeartbeats.set(payload.agentId, { state: payload.state, version: payload.version, persistedAt: now });
    }
    response.json({ data: { accepted: true, disconnectRequested, persisted: shouldPersist }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

agentRouter.post('/messages/incoming', async (request, response, next) => {
  try {
    const payload = incomingMessageSchema.parse(request.body);
    assertAgentBody(payload.agentId);
    let phone = payload.phone.replace(/\D/g, '');
    let contact: { id: string; owner_id: string; full_name?: string | null; avatar_url?: string | null; phone?: string | null } | null = null;
    const contactError = null;
    if (payload.whatsappChatId) {
      const chatLookup = await supabaseAdmin.from('contacts')
        .select('id, owner_id, full_name, avatar_url, phone').eq('whatsapp_chat_id', payload.whatsappChatId).limit(1).maybeSingle();
      if (chatLookup.error && !isMissingWhatsAppChatIdColumn(chatLookup.error)) {
        throw new AppError(500, 'INCOMING_CONTACT_LOOKUP_FAILED', 'Nao foi possivel localizar o contato da mensagem.');
      }
      contact = chatLookup.data;
    }
    if (!contact && phone.length >= 8) {
      const phoneLookup = await supabaseAdmin.from('contacts')
        .select('id, owner_id, full_name, avatar_url, phone').or(contactPhoneFilter(phone)).limit(1).maybeSingle();
      if (phoneLookup.error) throw new AppError(500, 'INCOMING_CONTACT_LOOKUP_FAILED', 'Nao foi possivel localizar o contato da mensagem.');
      contact = phoneLookup.data;
    }
    if (contactError) throw new AppError(500, 'INCOMING_CONTACT_LOOKUP_FAILED', 'Não foi possível localizar o contato da mensagem.');
    if (!contact) {
      response.json({ data: { accepted: false, reason: 'CONTACT_NOT_FOUND' }, requestId: request.requestId });
      return;
    }
    if (contact?.phone) phone = contact.phone.replace(/\D/g, '');
    const profileUpdate = {
      ...(payload.whatsappChatId ? { whatsapp_chat_id: payload.whatsappChatId } : {}),
      ...(payload.contactName ? { full_name: payload.contactName } : {}),
      ...(payload.contactAvatarUrl ? { avatar_url: payload.contactAvatarUrl } : {})
    };
    if (Object.keys(profileUpdate).length > 0) {
      let { error: profileError } = await supabaseAdmin.from('contacts').update(profileUpdate).eq('id', contact.id).eq('owner_id', contact.owner_id);
      if (profileError && isMissingWhatsAppChatIdColumn(profileError)) {
        const { whatsapp_chat_id: _ignored, ...legacyProfileUpdate } = profileUpdate;
        if (Object.keys(legacyProfileUpdate).length > 0) {
          ({ error: profileError } = await supabaseAdmin.from('contacts').update(legacyProfileUpdate).eq('id', contact.id).eq('owner_id', contact.owner_id));
        } else {
          profileError = null;
        }
      }
      if (profileError) console.error(JSON.stringify({ level: 'warn', message: 'Unable to update WhatsApp contact profile', code: profileError.code, detail: profileError.message }));
    }
    if (payload.mediaStoragePath && !payload.mediaStoragePath.startsWith(`${contact.owner_id}/`)) {
      throw new AppError(400, 'INCOMING_MEDIA_PATH_INVALID', 'O caminho da midia nao pertence ao contato.');
    }
    const now = payload.createdAt ?? new Date().toISOString();
    const { data: conversation, error: conversationError } = await supabaseAdmin.from('conversations')
      .upsert({ owner_id: contact.owner_id, contact_id: contact.id, status: 'OPEN', last_message_at: now, updated_at: now }, { onConflict: 'owner_id,contact_id' })
      .select('id').single();
    if (conversationError) throw new AppError(500, 'CONVERSATION_CREATE_FAILED', 'Não foi possível abrir a conversa.');
    const { error: messageError } = await supabaseAdmin.from('conversation_messages').upsert({
      owner_id: contact.owner_id,
      conversation_id: conversation.id,
      whatsapp_message_id: payload.messageId,
      direction: payload.direction,
      message_type: payload.messageType,
      content: payload.content,
      media_url: payload.mediaUrl ?? null,
      media_storage_path: payload.mediaStoragePath ?? null,
      media_mime_type: payload.mediaMimeType ?? null,
      quoted_whatsapp_message_id: payload.quotedMessageId ?? null,
      quoted_content: payload.quotedContent ?? null,
      sender_display_name: payload.senderDisplayName ?? null,
      sender_phone: phone || null,
      created_at: now
    }, { onConflict: 'owner_id,whatsapp_message_id' });
    if (messageError) throw new AppError(500, 'INCOMING_MESSAGE_SAVE_FAILED', 'Não foi possível salvar a mensagem recebida.');
    response.status(201).json({ data: { accepted: true, conversationId: conversation.id }, requestId: request.requestId });
  } catch (error) { next(error); }
});

agentRouter.post('/media', express.raw({ type: ['application/octet-stream', 'image/*', 'application/pdf', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.*', 'text/plain', 'text/csv', 'audio/*'], limit: '15mb' }), async (request, response, next) => {
  try {
    const phone = String(request.headers['x-phone'] ?? '').replace(/\D/g, '');
    if (phone.length < 8) throw new AppError(400, 'MEDIA_PHONE_INVALID', 'O telefone da mensagem nao e valido.');
    const { data: contact, error: contactError } = await supabaseAdmin.from('contacts')
      .select('id, owner_id').or(contactPhoneFilter(phone)).limit(1).maybeSingle();
    if (contactError) throw new AppError(500, 'MEDIA_CONTACT_LOOKUP_FAILED', 'Nao foi possivel localizar o contato da midia.');
    if (!contact) throw new AppError(404, 'MEDIA_CONTACT_NOT_FOUND', 'O contato da midia ainda nao esta cadastrado.');
    const contentType = (String(request.headers['x-media-mime-type'] ?? request.headers['content-type'] ?? '').split(';')[0] ?? '').trim().toLowerCase();
    const fileName = String(request.headers['x-file-name'] ?? 'whatsapp-media');
    try {
      const stored = await storeMedia(contact.owner_id, request.body as Buffer, contentType, fileName, 'incoming');
      response.status(201).json({ data: stored, requestId: request.requestId });
    } catch (error) {
      const code = error instanceof Error ? (error.message.split(':')[0] ?? 'MEDIA_UPLOAD_FAILED') : 'MEDIA_UPLOAD_FAILED';
      const status = code === 'MEDIA_TOO_LARGE' ? 413 : code === 'MEDIA_TYPE_NOT_ALLOWED' || code === 'MEDIA_SIGNATURE_INVALID' || code === 'MEDIA_EXTENSION_INVALID' ? 415 : 400;
      throw new AppError(status, code, 'Nao foi possivel armazenar a midia recebida.');
    }
  } catch (error) { next(error); }
});

agentRouter.post('/jobs/claim', async (request, response, next) => {
  try {
    const payload = claimSchema.parse(request.body);
    assertAgentBody(payload.agentId);
    const { data, error } = await supabaseAdmin.rpc('claim_message_job', {
      p_agent_id: payload.agentId,
      p_lease_seconds: payload.leaseSeconds
    });
    if (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Message job claim failed', code: error.code, detail: error.message, details: error.details, hint: error.hint }));
    }
    if (error) throw new AppError(503, 'JOB_CLAIM_FAILED', 'Não foi possível consultar a fila de mensagens.');
    const job = Array.isArray(data) && data.length > 0 ? data[0] : null;
    response.json({
      data: {
        job: job ? {
          id: job.id,
          contactId: job.contact_id,
          phone: job.phone,
          content: job.content,
          type: job.type,
          mediaUrl: await resolveMediaUrl(job.media_storage_path, job.media_url),
          mediaStoragePath: job.media_storage_path ?? null,
          mediaMimeType: job.media_mime_type ?? null,
          mediaFilename: job.media_filename ?? null,
          mediaCaption: job.media_caption ?? null
        } : null,
        ...(job?.lease_id ? { leaseId: job.lease_id } : {})
      },
      requestId: request.requestId
    });
  } catch (error) {
    next(error);
  }
});

agentRouter.post('/jobs/:id/success', async (request, response, next) => {
  try {
    const jobId = uuidSchema.parse(request.params.id);
    const payload = resultSchema.parse(request.body);
    assertAgentBody(payload.agentId);
    let { data, error } = await supabaseAdmin.rpc('complete_message_job', {
      p_job_id: jobId,
      p_agent_id: payload.agentId,
      p_lease_id: payload.leaseId,
      p_external_message_id: payload.externalMessageId ?? null
    });
    if (error && isMissingAgentFunctionGrant(error)) {
      data = await completeMessageJobDirect(jobId, payload.agentId, payload.leaseId, payload.externalMessageId);
      error = null;
      console.warn(JSON.stringify({ level: 'warn', message: 'Message job completion used direct fallback; apply the agent function grants migration.', jobId }));
    }
    if (error) console.error(JSON.stringify({ level: 'error', message: 'Message job completion failed', code: error.code, detail: error.message, details: error.details, hint: error.hint, jobId }));
    if (error) throw new AppError(400, 'JOB_SUCCESS_FAILED', 'Não foi possível confirmar a tarefa.');
    if (!data) throw new AppError(409, 'JOB_LEASE_INVALID', 'A tarefa não está mais sob posse deste agente.');
    // O histórico é persistido pelo evento `message_create` do agente, que
    // contém o ID definitivo da mensagem no WhatsApp. Persistir também aqui
    // criava duas linhas: uma com o ID da tarefa e outra com o ID do WhatsApp.
    response.json({ data: { accepted: true }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

agentRouter.post('/jobs/:id/failure', async (request, response, next) => {
  try {
    const jobId = uuidSchema.parse(request.params.id);
    const payload = failureSchema.parse(request.body);
    assertAgentBody(payload.agentId);
    let { data, error } = await supabaseAdmin.rpc('fail_message_job', {
      p_job_id: jobId,
      p_agent_id: payload.agentId,
      p_lease_id: payload.leaseId,
      p_error_code: payload.errorCode,
      p_error_message: payload.errorMessage,
      p_retryable: payload.retryable
    });
    if (error && isMissingAgentFunctionGrant(error)) {
      data = await failMessageJobDirect(jobId, payload.agentId, payload.leaseId, payload.errorCode, payload.errorMessage, payload.retryable);
      error = null;
      console.warn(JSON.stringify({ level: 'warn', message: 'Message job failure used direct fallback; apply the agent function grants migration.', jobId }));
    }
    if (error) console.error(JSON.stringify({ level: 'error', message: 'Message job failure update failed', code: error.code, detail: error.message, details: error.details, hint: error.hint, jobId }));
    if (error) throw new AppError(400, 'JOB_FAILURE_UPDATE_FAILED', 'Não foi possível registrar a falha.');
    if (!data) throw new AppError(409, 'JOB_LEASE_INVALID', 'A tarefa não está mais sob posse deste agente.');
    if (payload.retryable) {
      const { data: retriedJob, error: retriedJobError } = await supabaseAdmin
        .from('message_jobs')
        .select('id, status, available_at')
        .eq('id', jobId)
        .maybeSingle();
      if (retriedJobError) throw new AppError(503, 'JOB_REQUEUE_FAILED', 'A falha foi registrada, mas não foi possível reprogramar a tentativa.');
      if (retriedJob?.status === 'PENDENTE') await enqueueMessageJob(retriedJob.id, retriedJob.available_at);
    }
    response.json({ data: { accepted: true }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

agentRouter.post('/jobs/:id/uncertain', async (request, response, next) => {
  try {
    const jobId = uuidSchema.parse(request.params.id);
    const payload = uncertainSchema.parse(request.body);
    assertAgentBody(payload.agentId);
    let { data, error } = await supabaseAdmin.rpc('mark_message_job_uncertain', {
      p_job_id: jobId,
      p_agent_id: payload.agentId,
      p_lease_id: payload.leaseId,
      p_reason: payload.reason
    });
    if (error && isMissingAgentFunctionGrant(error)) {
      data = await markMessageJobUncertainDirect(jobId, payload.agentId, payload.leaseId, payload.reason);
      error = null;
      console.warn(JSON.stringify({ level: 'warn', message: 'Message job uncertain used direct fallback; apply the agent function grants migration.', jobId }));
    }
    if (error) console.error(JSON.stringify({ level: 'error', message: 'Message job uncertain update failed', code: error.code, detail: error.message, details: error.details, hint: error.hint, jobId }));
    if (error) throw new AppError(400, 'JOB_UNCERTAIN_UPDATE_FAILED', 'Não foi possível registrar o resultado incerto.');
    if (!data) throw new AppError(409, 'JOB_LEASE_INVALID', 'A tarefa não está mais sob posse deste agente.');
    response.json({ data: { accepted: true }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});
