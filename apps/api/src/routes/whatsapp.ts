import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { env } from '../config/env.js';

export const whatsappRouter = Router();

whatsappRouter.post('/disconnect', async (request, response, next) => {
  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('agent_status')
      .upsert({
        agent_id: env.AGENT_ID,
        state: 'DESCONECTADO',
        version: 'control',
        last_seen_at: now,
        disconnect_requested_at: now
      }, { onConflict: 'agent_id' });
    if (error) throw new AppError(500, 'WHATSAPP_DISCONNECT_FAILED', 'Não foi possível solicitar a desconexão do WhatsApp.');
    response.json({ data: { requested: true }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.get('/status', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_status')
      .select('agent_id, state, version, last_seen_at, qr_code, phone_number')
      .eq('agent_id', env.AGENT_ID)
      .maybeSingle();
    if (error) throw new AppError(500, 'WHATSAPP_STATUS_FAILED', 'Não foi possível consultar o status do WhatsApp.');

    response.json({
      data: data ?? {
        agent_id: env.AGENT_ID,
        state: 'DESCONECTADO',
        version: null,
        last_seen_at: null,
        qr_code: null,
        phone_number: null
      },
      requestId: request.requestId
    });
  } catch (error) {
    next(error);
  }
});
