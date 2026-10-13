import { Router, type Request } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { createMediaSignedUrl } from '../services/mediaStorage.js';

const uuidSchema = z.string().uuid();
const updateConversationSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional(),
  assignedTo: uuidSchema.nullable().optional(),
  subject: z.string().trim().max(100).nullable().optional()
});
function ownerId(request: Request) {
  if (!request.user?.id) throw new AppError(401, 'UNAUTHENTICATED', 'É necessário estar autenticado.');
  return request.user.id;
}

export const conversationsRouter = Router();

conversationsRouter.get('/', async (request, response, next) => {
  try {
    const owner = ownerId(request);
    const query = z.object({
      cityId: uuidSchema.optional(),
      neighborhoodId: uuidSchema.optional(),
      assignedTo: uuidSchema.optional(),
      subject: z.string().trim().max(100).optional(),
      status: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional()
    }).parse(request.query);
    let builder = supabaseAdmin.from('conversations')
      .select('id, contact_id, status, assigned_to, subject, last_message_at, created_at, updated_at, contact:contact_id!inner(id, full_name, phone, avatar_url, city_id, neighborhood_id, city:city_id(id, name), neighborhood:neighborhood_id(id, name))')
      .eq('owner_id', owner).order('last_message_at', { ascending: false, nullsFirst: false }).limit(200);
    if (query.status) builder = builder.eq('status', query.status);
    if (query.assignedTo) builder = builder.eq('assigned_to', query.assignedTo);
    if (query.subject) builder = builder.ilike('subject', `%${query.subject}%`);
    if (query.cityId) builder = builder.eq('contact.city_id', query.cityId);
    if (query.neighborhoodId) builder = builder.eq('contact.neighborhood_id', query.neighborhoodId);
    const { data, error } = await builder;
    if (error) throw new AppError(500, 'CONVERSATIONS_LIST_FAILED', 'Não foi possível listar as conversas.');
    response.json({ data: data ?? [], requestId: request.requestId });
  } catch (error) { next(error); }
});

conversationsRouter.get('/:id/messages', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const owner = ownerId(request);
    const query = z.object({ after: z.string().trim().min(1).optional() }).parse(request.query);
    const afterDate = query.after ? new Date(query.after) : null;
    const after = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate.toISOString() : undefined;
    const { data: conversation, error: conversationError } = await supabaseAdmin.from('conversations')
      .select('id').eq('id', id).eq('owner_id', owner).maybeSingle();
    if (conversationError) throw new AppError(500, 'CONVERSATION_READ_FAILED', 'Não foi possível validar a conversa.');
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    let messagesQuery = supabaseAdmin.from('conversation_messages').select('*')
      .eq('conversation_id', id).eq('owner_id', owner).order('created_at', { ascending: true });
    // Depois da carga inicial, devolva somente mensagens a partir do último
    // horário conhecido. O gte mantém mensagens que chegaram no mesmo segundo;
    // o frontend remove duplicatas pelo id.
    if (after) messagesQuery = messagesQuery.gte('created_at', after);
    const { data, error } = await messagesQuery.limit(after ? 100 : 500);
    if (error) throw new AppError(500, 'CONVERSATION_MESSAGES_FAILED', 'Não foi possível carregar as mensagens.');
    const messages = await Promise.all((data ?? []).map(async message => {
      if (!message.media_storage_path) return message;
      try {
        return { ...message, media_url: await createMediaSignedUrl(message.media_storage_path) };
      } catch {
        return { ...message, media_url: null };
      }
    }));
    response.json({ data: messages, requestId: request.requestId });
  } catch (error) { next(error); }
});

conversationsRouter.patch('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const owner = ownerId(request);
    const payload = updateConversationSchema.parse(request.body);
    if (Object.keys(payload).length === 0) throw new AppError(400, 'EMPTY_UPDATE', 'Informe uma alteracao para a conversa.');
    const update = {
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.assignedTo !== undefined ? { assigned_to: payload.assignedTo } : {}),
      ...(payload.subject !== undefined ? { subject: payload.subject } : {}),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabaseAdmin.from('conversations').update(update).eq('id', id).eq('owner_id', owner).select('id, contact_id, status, assigned_to, subject, last_message_at, created_at, updated_at').maybeSingle();
    if (error) throw new AppError(400, 'CONVERSATION_UPDATE_FAILED', 'Nao foi possivel atualizar a conversa.');
    if (!data) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversa nao encontrada.');
    response.json({ data, requestId: request.requestId });
  } catch (error) { next(error); }
});
