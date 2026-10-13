import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';

const uuid = z.string().uuid();
const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cityId: uuid.optional(),
  neighborhoodId: uuid.optional(),
  assignedTo: uuid.optional(),
  labelId: uuid.optional(),
  subject: z.string().trim().max(100).optional(),
  status: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional()
});

export const analyticsRouter = Router();
analyticsRouter.get('/dashboard', async (request, response, next) => {
  try {
    const query = querySchema.parse(request.query);
    const advancedParams = {
      p_owner_id: request.user!.id,
      p_from: query.from ?? null,
      p_to: query.to ?? null,
      p_city_id: query.cityId ?? null,
      p_neighborhood_id: query.neighborhoodId ?? null,
      p_assigned_to: query.assignedTo ?? null,
      p_label_id: query.labelId ?? null,
      p_subject: query.subject ?? null,
      p_conversation_status: query.status ?? null
    };
    let { data, error } = await supabaseAdmin.rpc('dashboard_metrics', advancedParams);
    const functionMissing = error && (error.code === '42883' || error.code === 'PGRST202' || error.message.toLowerCase().includes('dashboard_metrics'));
    if (functionMissing) {
      const advancedFilterRequested = Boolean(query.assignedTo || query.labelId || query.subject || query.status);
      if (advancedFilterRequested) throw new AppError(503, 'DASHBOARD_FILTER_MIGRATION_REQUIRED', 'Aplique a migracao 019 para usar os filtros avancados do dashboard.');
      const legacy = await supabaseAdmin.rpc('dashboard_metrics', {
        p_owner_id: request.user!.id,
        p_from: query.from ?? null,
        p_to: query.to ?? null,
        p_city_id: query.cityId ?? null,
        p_neighborhood_id: query.neighborhoodId ?? null
      });
      data = legacy.data;
      error = legacy.error;
    }
    if (error) throw new AppError(500, 'DASHBOARD_METRICS_FAILED', 'Não foi possível carregar os indicadores do dashboard.');
    response.json({ data: data ?? { totalContacts: 0, pendingDemands: 0, resolvedThisPeriod: 0, birthdaysThisMonth: 0, neighborhoods: [], labels: [], activitySeries: [], conversationStatuses: [] }, requestId: request.requestId });
  } catch (error) { next(error); }
});
