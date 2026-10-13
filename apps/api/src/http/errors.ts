import type { ErrorRequestHandler, RequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function describeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return { name: value.name, code: value.code, message: value.message, details: value.details, hint: value.hint };
  }
  return String(error);
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Rota não encontrada.'));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const requestId = request.requestId ?? 'unknown';

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      },
      requestId
    });
    return;
  }

  console.error(JSON.stringify({
    level: 'error',
    requestId,
    method: request.method,
    path: request.path,
    error: describeError(error)
  }));

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Tente novamente.'
    },
    requestId
  });
};
