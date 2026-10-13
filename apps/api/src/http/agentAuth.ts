import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

function safeTokenEquals(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export const requireAgent: RequestHandler = (request, _response, next) => {
  const token = request.header('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const agentId = request.header('x-agent-id')?.trim();

  if (!agentId || agentId !== env.AGENT_ID || !safeTokenEquals(token, env.AGENT_TOKEN)) {
    next(new AppError(401, 'INVALID_AGENT_CREDENTIALS', 'Credenciais do agente inválidas.'));
    return;
  }

  next();
};
