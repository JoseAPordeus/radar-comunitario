import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { runBirthdayAutomation } from '../services/birthdayAutomation.js';

const uuidSchema = z.string().uuid();
const automationSchema = z.object({ enabled: z.boolean(), template_id: uuidSchema.nullable() });

export const automationRouter = Router();

automationRouter.get('/birthday', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('automation_settings').select('value').eq('owner_id', request.user!.id).eq('key', 'birthday_automation').maybeSingle();
    if (error) throw new AppError(500, 'AUTOMATION_READ_FAILED', 'Não foi possível carregar a automação.');
    response.json({ data: data?.value ?? { enabled: false, template_id: null }, requestId: request.requestId });
  } catch (error) { next(error); }
});

automationRouter.patch('/birthday', async (request, response, next) => {
  try {
    const value = automationSchema.parse(request.body);
    if (value.enabled && value.template_id) {
      const { data: template, error: templateError } = await supabaseAdmin
        .from('message_templates')
        .select('id, type, is_active')
        .eq('owner_id', request.user!.id)
        .eq('id', value.template_id)
        .maybeSingle();
      if (templateError) throw new AppError(500, 'TEMPLATE_READ_FAILED', 'Não foi possível validar o modelo de aniversário.');
      if (!template) throw new AppError(400, 'TEMPLATE_NOT_FOUND', 'O modelo selecionado não foi encontrado.');
      if (template.type !== 'ANIVERSARIO') throw new AppError(400, 'TEMPLATE_TYPE_INVALID', 'Selecione um modelo do tipo aniversário.');
      if (!template.is_active) throw new AppError(400, 'TEMPLATE_INACTIVE', 'Ative o modelo de aniversário antes de habilitar a automação.');
    }
    if (value.enabled && !value.template_id) throw new AppError(400, 'TEMPLATE_REQUIRED', 'Selecione um modelo de aniversário.');
    const { data, error } = await supabaseAdmin.from('automation_settings').upsert({ owner_id: request.user!.id, key: 'birthday_automation', value }, { onConflict: 'owner_id,key' }).select('value').single();
    if (error) throw new AppError(400, 'AUTOMATION_UPDATE_FAILED', 'Não foi possível salvar a automação.');
    response.json({ data: data.value, requestId: request.requestId });
  } catch (error) { next(error); }
});

automationRouter.post('/birthday/run', async (request, response, next) => {
  try {
    const result = await runBirthdayAutomation(request.user!.id);
    response.status(result.created.length ? 201 : 200).json({ data: result, requestId: request.requestId });
  } catch (error) {
    if (error instanceof Error && error.message.includes(':')) {
      const [code = 'AUTOMATION_FAILED', ...parts] = error.message.split(':');
      next(new AppError(500, code, parts.join(':').trim()));
      return;
    }
    next(error);
  }
});
