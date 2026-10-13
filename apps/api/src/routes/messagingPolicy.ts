import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { defaultMessagingPolicy, getMessagingPolicy, reschedulePendingMessageJobs } from '../services/messagingPolicy.js';

const timeSchema = z.string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .transform(value => value.length === 5 ? `${value}:00` : value);

const baseSchema = z.object({
  enabled: z.boolean(),
  daily_limit: z.number().int().min(1).max(1000),
  min_interval_seconds: z.number().int().min(5).max(3600),
  max_interval_seconds: z.number().int().min(5).max(3600),
  business_start: timeSchema,
  business_end: timeSchema,
  timezone: z.string().min(3).max(80)
});
const schema = baseSchema.refine(value => value.max_interval_seconds >= value.min_interval_seconds, {
  message: 'O intervalo maximo deve ser maior ou igual ao minimo.'
});
const patchSchema = baseSchema.partial();

export const messagingPolicyRouter = Router();

messagingPolicyRouter.get('/', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('messaging_policies')
      .select('*')
      .eq('owner_id', request.user!.id)
      .maybeSingle();
    if (error) throw new AppError(500, 'MESSAGING_POLICY_READ_FAILED', 'Nao foi possivel carregar a politica de envios.');
    response.json({ data: data ?? { owner_id: request.user!.id, ...defaultMessagingPolicy }, requestId: request.requestId });
  } catch (error) { next(error); }
});

messagingPolicyRouter.patch('/', async (request, response, next) => {
  try {
    const input = patchSchema.parse(request.body);
    const current = await getMessagingPolicy(request.user!.id);
    const payload = schema.parse({ ...current, ...input });
    const { data, error } = await supabaseAdmin
      .from('messaging_policies')
      .upsert({ owner_id: request.user!.id, ...payload }, { onConflict: 'owner_id' })
      .select('*')
      .single();
    if (error) throw new AppError(400, 'MESSAGING_POLICY_UPDATE_FAILED', 'Nao foi possivel salvar a politica de envios.');
    let rescheduledPending = 0;
    let rescheduleWarning: string | undefined;
    try {
      const rescheduled = await reschedulePendingMessageJobs(request.user!.id, payload);
      rescheduledPending = rescheduled.length;
    } catch (rescheduleError) {
      rescheduleWarning = 'A política foi salva, mas não foi possível reagendar todas as tarefas pendentes. Verifique a fila antes de iniciar novos envios.';
      console.error(JSON.stringify({
        level: 'warn',
        message: 'Messaging policy saved but pending jobs could not be fully rescheduled',
        ownerId: request.user!.id,
        detail: rescheduleError instanceof Error ? rescheduleError.message : String(rescheduleError)
      }));
    }
    response.json({ data: { ...data, rescheduledPending, ...(rescheduleWarning ? { rescheduleWarning } : {}) }, requestId: request.requestId });
  } catch (error) { next(error); }
});
