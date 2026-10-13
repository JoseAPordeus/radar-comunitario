import type { RequestHandler } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  name: string;
}

interface Counter {
  startedAt: number;
  count: number;
}

export function rateLimit({ windowMs, max, name }: RateLimitOptions): RequestHandler {
  const counters = new Map<string, Counter>();

  return (request, response, next) => {
    const now = Date.now();
    const key = `${name}:${request.ip || 'unknown'}`;
    const current = counters.get(key);
    const counter = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;

    counter.count += 1;
    counters.set(key, counter);
    response.setHeader('x-ratelimit-limit', max);
    response.setHeader('x-ratelimit-remaining', Math.max(0, max - counter.count));

    if (counter.count > max) {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Muitas requisições. Tente novamente em instantes.'
        },
        requestId: request.requestId ?? 'unknown'
      });
      return;
    }

    next();
  };
}
