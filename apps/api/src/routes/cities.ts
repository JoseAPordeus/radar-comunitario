import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';

export const citiesRouter = Router();

citiesRouter.get('/', async (_request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cities')
      .select('id, ibge_code, name, state_uf')
      .order('name');
    if (error) {
      console.error(JSON.stringify({ level: 'error', scope: 'cities.list', code: error.code, message: error.message }));
      throw new AppError(500, 'CITIES_LIST_FAILED', 'Não foi possível listar as cidades.');
    }
    response.json({ data: data ?? [], requestId: response.getHeader('x-request-id') });
  } catch (error) {
    next(error);
  }
});
