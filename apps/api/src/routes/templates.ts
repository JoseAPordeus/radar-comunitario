import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';

const uuidSchema = z.string().uuid();
const templateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(5000),
  type: z.enum(['ANIVERSARIO', 'CAMPANHA']),
  is_active: z.boolean().default(true)
});
const templatePatchSchema = templateSchema.partial();
const automationSchema = z.object({
  enabled: z.boolean(),
  template_id: uuidSchema.nullable()
});

async function persistTemplateVersion(template: { id: string; owner_id: string; version: number; title: string; content: string; type: 'ANIVERSARIO' | 'CAMPANHA'; is_active: boolean }) {
  const { error } = await supabaseAdmin.from('message_template_versions').insert({
    template_id: template.id,
    owner_id: template.owner_id,
    version: template.version,
    title: template.title,
    content: template.content,
    type: template.type,
    is_active: template.is_active
  });
  if (error) throw new AppError(500, 'TEMPLATE_VERSION_CREATE_FAILED', 'Não foi possível registrar o histórico do modelo.');
}

export const templatesRouter = Router();

templatesRouter.get('/', async (request, response, next) => {
  try {
    let query = supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('owner_id', request.user!.id)
      .order('created_at', { ascending: false });
    if (request.query.active === 'true') query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw new AppError(500, 'TEMPLATES_LIST_FAILED', 'Não foi possível listar os modelos.');
    response.json({ data: data ?? [], requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

templatesRouter.post('/', async (request, response, next) => {
  try {
    const payload = templateSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .insert({ ...payload, owner_id: request.user!.id, version: 1 })
      .select('*')
      .single();
    if (error) throw new AppError(400, 'TEMPLATE_CREATE_FAILED', 'Não foi possível criar o modelo.');
    await persistTemplateVersion(data);
    response.status(201).json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

templatesRouter.get('/:id/versions', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const { data, error } = await supabaseAdmin
      .from('message_template_versions')
      .select('id, template_id, version, title, content, type, is_active, created_at')
      .eq('template_id', id)
      .eq('owner_id', request.user!.id)
      .order('version', { ascending: false });
    if (error) throw new AppError(500, 'TEMPLATE_VERSIONS_LIST_FAILED', 'Não foi possível listar as versões do modelo.');
    response.json({ data: data ?? [], requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

templatesRouter.patch('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const payload = templatePatchSchema.parse(request.body);
    const { data: current, error: currentError } = await supabaseAdmin
      .from('message_templates')
      .select('version')
      .eq('id', id)
      .eq('owner_id', request.user!.id)
      .maybeSingle();
    if (currentError) throw new AppError(400, 'TEMPLATE_READ_FAILED', 'Nao foi possivel ler o modelo atual.');
    if (!current) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Modelo nao encontrado.');
    if (Object.keys(payload).length === 0) throw new AppError(400, 'EMPTY_UPDATE', 'Informe um campo para atualização.');
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .update({ ...payload, version: (current.version ?? 1) + 1 })
      .eq('id', id)
      .eq('owner_id', request.user!.id)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(400, 'TEMPLATE_UPDATE_FAILED', 'Não foi possível atualizar o modelo.');
    if (!data) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Modelo não encontrado.');
    await persistTemplateVersion(data);
    response.json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

templatesRouter.delete('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .delete()
      .eq('id', id)
      .eq('owner_id', request.user!.id)
      .select('id')
      .maybeSingle();
    if (error) throw new AppError(400, 'TEMPLATE_DELETE_FAILED', 'Não foi possível excluir o modelo.');
    if (!data) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Modelo não encontrado.');
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

templatesRouter.get('/automation/birthday', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('automation_settings')
      .select('value')
      .eq('owner_id', request.user!.id)
      .eq('key', 'birthday_automation')
      .maybeSingle();
    if (error) throw new AppError(500, 'AUTOMATION_READ_FAILED', 'Não foi possível carregar a automação.');
    response.json({ data: data?.value ?? { enabled: false, template_id: null }, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

templatesRouter.patch('/automation/birthday', async (request, response, next) => {
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
    const { data, error } = await supabaseAdmin
      .from('automation_settings')
      .upsert({ owner_id: request.user!.id, key: 'birthday_automation', value }, { onConflict: 'owner_id,key' })
      .select('value')
      .single();
    if (error) throw new AppError(400, 'AUTOMATION_UPDATE_FAILED', 'Não foi possível salvar a automação.');
    response.json({ data: data.value, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});
