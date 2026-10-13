import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';

const uuidSchema = z.string().uuid();
const labelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export const labelsRouter = Router();

labelsRouter.get('/', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('labels')
      .select('*')
      .eq('owner_id', request.user!.id)
      .order('name');
    if (error) throw new AppError(500, 'LABELS_LIST_FAILED', 'Não foi possível listar as etiquetas.');
    response.json({ data: data ?? [], requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

labelsRouter.post('/', async (request, response, next) => {
  try {
    const payload = labelSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('labels')
      .insert({ ...payload, owner_id: request.user!.id })
      .select('*')
      .single();
    if (error) throw new AppError(400, 'LABEL_CREATE_FAILED', 'Não foi possível criar a etiqueta.');
    response.status(201).json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

labelsRouter.patch('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const payload = labelSchema.partial().parse(request.body);
    if (Object.keys(payload).length === 0) throw new AppError(400, 'EMPTY_UPDATE', 'Informe um campo para atualização.');
    const { data, error } = await supabaseAdmin
      .from('labels')
      .update(payload)
      .eq('id', id)
      .eq('owner_id', request.user!.id)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(400, 'LABEL_UPDATE_FAILED', 'Não foi possível atualizar a etiqueta.');
    if (!data) throw new AppError(404, 'LABEL_NOT_FOUND', 'Etiqueta não encontrada.');
    response.json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

labelsRouter.delete('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const { data, error } = await supabaseAdmin
      .from('labels')
      .delete()
      .eq('id', id)
      .eq('owner_id', request.user!.id)
      .select('id')
      .maybeSingle();
    if (error) throw new AppError(400, 'LABEL_DELETE_FAILED', 'Não foi possível excluir a etiqueta.');
    if (!data) throw new AppError(404, 'LABEL_NOT_FOUND', 'Etiqueta não encontrada.');
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
