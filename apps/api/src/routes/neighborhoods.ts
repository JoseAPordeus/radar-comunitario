import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';

export const neighborhoodsRouter = Router();

neighborhoodsRouter.get('/', async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('neighborhoods')
      .select('*, city:city_id(id, ibge_code, name, state_uf)')
      .eq('owner_id', request.user!.id)
      .order('name');
    if (error) throw new AppError(500, 'NEIGHBORHOODS_LIST_FAILED', 'Não foi possível listar os bairros.');
    response.json({ data: data ?? [], requestId: request.requestId });
  } catch (error) {
    next(error);
  }
});
