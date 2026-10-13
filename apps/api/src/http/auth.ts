import type { RequestHandler } from 'express';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from './errors.js';

const TOKEN_CACHE_TTL_MS = 30_000;
const tokenCache = new Map<string, { user: User; expiresAt: number }>();

export const requireUser: RequestHandler = async (request, _response, next) => {
  try {
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

    if (!token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'É necessário estar autenticado.');
    }

    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      request.user = cached.user;
      next();
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new AppError(401, 'INVALID_TOKEN', 'A sessão informada é inválida ou expirou.');
    }

    request.user = data.user;
    tokenCache.set(token, { user: data.user, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    next();
  } catch (error) {
    next(error);
  }
};
