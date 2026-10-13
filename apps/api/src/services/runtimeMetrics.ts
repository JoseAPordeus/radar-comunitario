type RouteMetric = {
  requests: number;
  errors: number;
  totalDurationMs: number;
  lastStatusCode: number | null;
};

const startedAt = Date.now();
const routes = new Map<string, RouteMetric>();

export function recordRequest(path: string, statusCode: number, durationMs: number) {
  const current = routes.get(path) ?? { requests: 0, errors: 0, totalDurationMs: 0, lastStatusCode: null };
  current.requests += 1;
  if (statusCode >= 500) current.errors += 1;
  current.totalDurationMs += durationMs;
  current.lastStatusCode = statusCode;
  routes.set(path, current);
}

export function getRuntimeMetrics() {
  const routeMetrics = [...routes.entries()]
    .map(([path, metric]) => ({
      path,
      requests: metric.requests,
      errors: metric.errors,
      averageDurationMs: metric.requests ? Math.round(metric.totalDurationMs / metric.requests) : 0,
      lastStatusCode: metric.lastStatusCode
    }))
    .sort((left, right) => right.requests - left.requests);
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(startedAt).toISOString(),
    requests: routeMetrics.reduce((total, metric) => total + metric.requests, 0),
    errors: routeMetrics.reduce((total, metric) => total + metric.errors, 0),
    routes: routeMetrics,
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal
    }
  };
}
