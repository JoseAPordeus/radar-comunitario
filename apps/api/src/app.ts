import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { requireUser } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { requestId, requestLogger } from './http/middleware.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { contactsRouter } from './routes/contacts.js';
import { labelsRouter } from './routes/labels.js';
import { neighborhoodsRouter } from './routes/neighborhoods.js';
import { citiesRouter } from './routes/cities.js';
import { templatesRouter } from './routes/templates.js';
import { messageJobsRouter } from './routes/messageJobs.js';
import { automationRouter } from './routes/automation.js';
import { agentRouter } from './routes/agent.js';
import { requireAgent } from './http/agentAuth.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { mediaRouter } from './routes/media.js';
import { conversationsRouter } from './routes/conversations.js';
import { analyticsRouter } from './routes/analytics.js';
import { rateLimit } from './http/rateLimit.js';
import { audioRouter } from './routes/audio.js';
import { messagingPolicyRouter } from './routes/messagingPolicy.js';
import { teamRouter } from './routes/team.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(express.json({ limit: env.API_BODY_LIMIT }));
app.use(requestId);
app.use(requestLogger);
app.set('trust proxy', 1);

// O agente possui autenticação e limite próprios. Ele não deve consumir o
// limite geral da API junto com as consultas do frontend, pois isso impede
// heartbeat, QR Code e comandos de desconexão.
app.use('/api/v1/agent', rateLimit({ name: 'agent', windowMs: 60_000, max: 10_000 }), requireAgent, agentRouter);
app.use(rateLimit({ name: 'api', windowMs: 60_000, max: 120 }));

app.get('/', (_request, response) => {
  response.json({ data: { name: 'Radar Comunitário API' }, requestId: response.getHeader('x-request-id') ?? randomUUID() });
});

app.use('/health', healthRouter);
app.use('/api/v1/auth/me', requireUser, meRouter);
app.use('/api/v1/contacts', requireUser, contactsRouter);
app.use('/api/v1/conversations', requireUser, conversationsRouter);
app.use('/api/v1/analytics', requireUser, analyticsRouter);
app.use('/api/v1/media', requireUser, express.raw({ type: ['application/octet-stream', 'image/*', 'application/pdf', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.*', 'text/plain', 'text/csv', 'audio/*'], limit: '15mb' }), mediaRouter);
app.use('/api/v1/audio', requireUser, express.raw({ type: ['audio/*'], limit: '15mb' }), audioRouter);
app.use('/api/v1/messaging-policy', requireUser, messagingPolicyRouter);
app.use('/api/v1/labels', requireUser, labelsRouter);
app.use('/api/v1/neighborhoods', requireUser, neighborhoodsRouter);
app.use('/api/v1/cities', requireUser, citiesRouter);
app.use('/api/v1/message-templates', requireUser, templatesRouter);
app.use('/api/v1/message-jobs', requireUser, messageJobsRouter);
app.use('/api/v1/automation-settings', requireUser, automationRouter);
app.use('/api/v1/whatsapp', requireUser, whatsappRouter);
app.use('/api/v1/team', requireUser, teamRouter);
app.use(notFoundHandler);
app.use(errorHandler);
