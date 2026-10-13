import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { recordRequest } from '../services/runtimeMetrics.js';

export const requestId: RequestHandler = (request, response, next) => {
  const id = request.header('x-request-id') || randomUUID();
  request.requestId = id;
  response.setHeader('x-request-id', id);
  next();
};

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = Date.now();

  response.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    recordRequest(request.path, response.statusCode, durationMs);
    console.log(JSON.stringify({
      level: 'info',
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs
    }));
  });

  next();
};
