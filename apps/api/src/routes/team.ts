import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';

export const teamRouter = Router();

teamRouter.get('/', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) throw new AppError(500, 'TEAM_LIST_FAILED', 'Não foi possível listar os atendentes.');

    const users = (data.users ?? []).map(user => ({
      id: user.id,
      email: user.email ?? null,
      name: typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : user.email ?? 'Atendente'
    }));

    response.json({ data: users, requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});
