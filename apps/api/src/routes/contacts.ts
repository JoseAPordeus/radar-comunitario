import { Router, type Request } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { normalizeBrazilPhone, normalizeOptionalBrazilPhone } from '../lib/phone.js';

const uuidSchema = z.string().uuid();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional()
});

const contactSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(3).max(40),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  whatsapp_opt_in: z.boolean().optional(),
  instagram: z.string().trim().max(120).nullable().optional(),
  city_id: uuidSchema.nullable().optional(),
  neighborhood_id: uuidSchema.nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  birth_date: z.string().date().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  avatar_url: z.string().url().max(1000).nullable().optional()
});

const patchContactSchema = contactSchema.partial();
const createContactSchema = contactSchema.extend({ city_id: uuidSchema });
const labelAssignmentSchema = z.object({ labelId: uuidSchema });
const historySchema = z.object({
  description: z.string().trim().min(1).max(5000),
  demand: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(['pending', 'resolved']).nullable().optional(),
  type: z.enum(['observation', 'demand', 'service', 'note']).default('observation')
});
const historyPatchSchema = historySchema.partial();

function userId(request: Request): string {
  if (!request.user?.id) {
    throw new AppError(401, 'UNAUTHENTICATED', 'É necessário estar autenticado.');
  }
  return request.user.id;
}

export const contactsRouter = Router();

async function validateLocation(payload: { city_id?: string | null; neighborhood_id?: string | null }, ownerId: string) {
  if (payload.neighborhood_id && !payload.city_id) {
    throw new AppError(400, 'CITY_REQUIRED_FOR_NEIGHBORHOOD', 'Selecione a cidade do bairro.');
  }

  if (payload.city_id) {
    const { data: city, error: cityError } = await supabaseAdmin
      .from('cities')
      .select('id')
      .eq('id', payload.city_id)
      .maybeSingle();
    if (cityError) throw new AppError(500, 'CITY_VALIDATION_FAILED', 'Não foi possível validar a cidade.');
    if (!city) throw new AppError(400, 'CITY_NOT_FOUND', 'A cidade selecionada não existe.');
  }

  if (payload.neighborhood_id) {
    const { data: neighborhood, error: neighborhoodError } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, city_id')
      .eq('id', payload.neighborhood_id)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (neighborhoodError) throw new AppError(500, 'NEIGHBORHOOD_VALIDATION_FAILED', 'Não foi possível validar o bairro.');
    if (!neighborhood) throw new AppError(400, 'NEIGHBORHOOD_NOT_FOUND', 'O bairro selecionado não existe.');
    if (neighborhood.city_id !== payload.city_id) {
      throw new AppError(400, 'NEIGHBORHOOD_CITY_MISMATCH', 'O bairro não pertence à cidade selecionada.');
    }
  }
}

contactsRouter.get('/', async (request, response, next) => {
  try {
    const query = listSchema.parse(request.query);
    const ownerId = userId(request);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let builder = supabaseAdmin
      .from('contacts')
      .select('*, neighborhood:neighborhood_id(*, city:city_id(*)), city:city_id(*), labels:labels(*)', { count: 'exact' })
      .eq('owner_id', ownerId)
      .order('last_contact_at', { ascending: false })
      .range(from, to);

    if (query.search) {
      const escaped = query.search.replace(/[%_]/g, '\\$&');
      builder = builder.or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }

    const { data, error, count } = await builder;
    if (error) throw new AppError(500, 'CONTACTS_LIST_FAILED', 'Não foi possível listar os contatos.');

    response.json({
      data: {
        items: data ?? [],
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / query.pageSize)
      },
      requestId: request.requestId
    });
  } catch (error) {
    next(error);
  }
});

contactsRouter.post('/', async (request, response, next) => {
  try {
    const payload = createContactSchema.parse(request.body);
    const ownerId = userId(request);
    const normalizedPayload = {
      ...payload,
      phone: normalizeBrazilPhone(payload.phone),
      whatsapp: normalizeOptionalBrazilPhone(payload.whatsapp) ?? normalizeBrazilPhone(payload.phone),
      whatsapp_opt_in: payload.whatsapp_opt_in ?? false,
      whatsapp_opt_in_at: payload.whatsapp_opt_in ? new Date().toISOString() : null,
      whatsapp_opt_in_source: payload.whatsapp_opt_in ? 'CONTACT_CREATE' : null
    };
    await validateLocation(normalizedPayload, ownerId);
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({ ...normalizedPayload, owner_id: ownerId })
      .select('*, neighborhood:neighborhood_id(*, city:city_id(*)), city:city_id(*), labels:labels(*)')
      .single();

    if (error) throw new AppError(400, 'CONTACT_CREATE_FAILED', 'Não foi possível criar o contato.');
    response.status(201).json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

contactsRouter.get('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('*, neighborhood:neighborhood_id(*, city:city_id(*)), city:city_id(*), labels:labels(*)')
      .eq('id', id)
      .eq('owner_id', userId(request))
      .maybeSingle();

    if (error) throw new AppError(500, 'CONTACT_READ_FAILED', 'Não foi possível consultar o contato.');
    if (!data) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contato não encontrado.');
    response.json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

contactsRouter.patch('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const payload = patchContactSchema.parse(request.body);
    if (Object.keys(payload).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', 'Informe ao menos um campo para atualização.');
    }
    const ownerId = userId(request);
    const normalizedPayload = {
      ...payload,
      ...(payload.phone !== undefined ? { phone: normalizeBrazilPhone(payload.phone) } : {}),
      ...(payload.whatsapp !== undefined ? { whatsapp: normalizeOptionalBrazilPhone(payload.whatsapp) } : {}),
      ...(payload.whatsapp_opt_in !== undefined ? {
        whatsapp_opt_in_at: payload.whatsapp_opt_in ? new Date().toISOString() : null,
        whatsapp_opt_in_source: payload.whatsapp_opt_in ? 'CONTACT_MANAGEMENT' : 'OPT_OUT'
      } : {})
    };
    const { data: currentContact, error: currentContactError } = await supabaseAdmin
      .from('contacts')
      .select('city_id, neighborhood_id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (currentContactError) throw new AppError(500, 'CONTACT_READ_FAILED', 'Não foi possível consultar o contato.');
    if (!currentContact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contato não encontrado.');
    await validateLocation({
      city_id: payload.city_id !== undefined ? payload.city_id : currentContact.city_id,
      neighborhood_id: payload.neighborhood_id !== undefined ? payload.neighborhood_id : currentContact.neighborhood_id
    }, ownerId);

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .update(normalizedPayload)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select('*, neighborhood:neighborhood_id(*, city:city_id(*)), city:city_id(*), labels:labels(*)')
      .maybeSingle();

    if (error) throw new AppError(400, 'CONTACT_UPDATE_FAILED', 'Não foi possível atualizar o contato.');
    if (!data) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contato não encontrado.');
    response.json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

contactsRouter.delete('/:id', async (request, response, next) => {
  try {
    const id = uuidSchema.parse(request.params.id);
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId(request))
      .select('id')
      .maybeSingle();

    if (error) throw new AppError(400, 'CONTACT_DELETE_FAILED', 'Não foi possível excluir o contato.');
    if (!data) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contato não encontrado.');
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

contactsRouter.post('/:id/labels', async (request, response, next) => {
  try {
    const contactId = uuidSchema.parse(request.params.id);
    const { labelId } = labelAssignmentSchema.parse(request.body);
    const ownerId = userId(request);

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    const { data: label } = await supabaseAdmin
      .from('labels')
      .select('id')
      .eq('id', labelId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (!contact || !label) throw new AppError(404, 'LABEL_ASSIGNMENT_NOT_FOUND', 'Contato ou etiqueta não encontrado.');

    const { error } = await supabaseAdmin
      .from('contact_labels')
      .upsert({ contact_id: contactId, label_id: labelId }, { onConflict: 'contact_id,label_id', ignoreDuplicates: true });
    if (error) throw new AppError(400, 'LABEL_ASSIGNMENT_FAILED', 'Não foi possível associar a etiqueta.');
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

contactsRouter.delete('/:id/labels/:labelId', async (request, response, next) => {
  try {
    const contactId = uuidSchema.parse(request.params.id);
    const labelId = uuidSchema.parse(request.params.labelId);
    const ownerId = userId(request);
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contato não encontrado.');
    const { error } = await supabaseAdmin
      .from('contact_labels')
      .delete()
      .eq('contact_id', contactId)
      .eq('label_id', labelId);
    if (error) throw new AppError(400, 'LABEL_UNASSIGNMENT_FAILED', 'Não foi possível remover a etiqueta.');
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

async function assertContactOwner(contactId: string, ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw new AppError(500, 'CONTACT_READ_FAILED', 'Não foi possível validar o contato.');
  if (!data) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contato não encontrado.');
}

contactsRouter.get('/:id/history', async (request, response, next) => {
  try {
    const contactId = uuidSchema.parse(request.params.id);
    await assertContactOwner(contactId, userId(request));
    const { data, error } = await supabaseAdmin
      .from('service_history')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    if (error) throw new AppError(500, 'HISTORY_LIST_FAILED', 'Não foi possível carregar o histórico.');
    response.json({ data: data ?? [], requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

contactsRouter.post('/:id/history', async (request, response, next) => {
  try {
    const contactId = uuidSchema.parse(request.params.id);
    await assertContactOwner(contactId, userId(request));
    const payload = historySchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('service_history')
      .insert({ ...payload, contact_id: contactId, author_id: userId(request), updated_at: new Date().toISOString() })
      .select('*')
      .single();
    if (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Service history create failed', code: error.code, detail: error.message, details: error.details, hint: error.hint }));
    }
    if (error) throw new AppError(400, 'HISTORY_CREATE_FAILED', 'Não foi possível registrar o histórico.');

    await supabaseAdmin
      .from('contacts')
      .update({ last_contact_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('owner_id', userId(request));

    response.status(201).json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

contactsRouter.patch('/:id/history/:historyId', async (request, response, next) => {
  try {
    const contactId = uuidSchema.parse(request.params.id);
    const historyId = uuidSchema.parse(request.params.historyId);
    await assertContactOwner(contactId, userId(request));
    const payload = historyPatchSchema.parse(request.body);
    if (Object.keys(payload).length === 0) throw new AppError(400, 'EMPTY_UPDATE', 'Informe um campo para atualização.');
    const { data, error } = await supabaseAdmin
      .from('service_history')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', historyId)
      .eq('contact_id', contactId)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(400, 'HISTORY_UPDATE_FAILED', 'Não foi possível atualizar o histórico.');
    if (!data) throw new AppError(404, 'HISTORY_NOT_FOUND', 'Item de histórico não encontrado.');
    response.json({ data, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});

contactsRouter.delete('/:id/history/:historyId', async (request, response, next) => {
  try {
    const contactId = uuidSchema.parse(request.params.id);
    const historyId = uuidSchema.parse(request.params.historyId);
    await assertContactOwner(contactId, userId(request));
    const { data, error } = await supabaseAdmin
      .from('service_history')
      .delete()
      .eq('id', historyId)
      .eq('contact_id', contactId)
      .select('id')
      .maybeSingle();
    if (error) throw new AppError(400, 'HISTORY_DELETE_FAILED', 'Não foi possível excluir o histórico.');
    if (!data) throw new AppError(404, 'HISTORY_NOT_FOUND', 'Item de histórico não encontrado.');
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
