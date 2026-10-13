import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AGENT_API_URL = 'http://localhost:4000/api/v1';
process.env.AGENT_ID = 'test-agent';
process.env.AGENT_TOKEN = 'test-token';
process.env.WHATSAPP_POLL_INTERVAL_MS = '1000';
process.env.WHATSAPP_SEND_DELAY_MS = '0';
process.env.WHATSAPP_SESSION_PATH = './.test-wwebjs-auth';

const { MessageWorker } = await import('../src/worker.ts');
const { WhatsAppSendTimeoutError } = await import('../src/client/whatsappClient.ts');

const job = {
  id: 'job-1',
  contactId: 'contact-1',
  phone: '5583987447464',
  content: 'Mensagem autorizada',
  type: 'CAMPANHA' as const
};

function connectedWhatsApp(overrides: Record<string, unknown> = {}) {
  return {
    getState: () => ({ state: 'CONECTADO', ready: true }),
    sendMessage: async () => ({ id: { id: 'external-1' } }),
    logout: async () => undefined,
    ...overrides
  };
}

function runWorker(agentApi: Record<string, unknown>, whatsapp: Record<string, unknown>) {
  const worker = new MessageWorker(agentApi as never, whatsapp as never);
  worker.start();
  return worker;
}

test('reports a send failure without marking the job as uncertain', async () => {
  const calls: string[] = [];
  const agentApi = {
    heartbeat: async () => false,
    claimJob: async () => ({ job, leaseId: 'lease-1' }),
    failure: async () => { calls.push('failure'); },
    uncertain: async () => { calls.push('uncertain'); }
  };
  const whatsapp = connectedWhatsApp({
    sendMessage: async () => { throw new Error('recipient unavailable'); }
  });

  const worker = runWorker(agentApi, whatsapp);
  await new Promise(resolve => setTimeout(resolve, 25));
  worker.stop();

  assert.deepEqual(calls, ['failure']);
});

test('marks a WhatsApp Web timeout as uncertain instead of retrying automatically', async () => {
  const calls: string[] = [];
  const agentApi = {
    heartbeat: async () => false,
    claimJob: async () => ({ job, leaseId: 'lease-1' }),
    failure: async () => { calls.push('failure'); },
    uncertain: async () => { calls.push('uncertain'); }
  };
  const whatsapp = connectedWhatsApp({
    sendMessage: async () => { throw new WhatsAppSendTimeoutError(45000); }
  });

  const worker = runWorker(agentApi, whatsapp);
  await new Promise(resolve => setTimeout(resolve, 25));
  worker.stop();

  assert.deepEqual(calls, ['uncertain']);
});

test('marks a successful send as uncertain when confirmation fails', async () => {
  const calls: string[] = [];
  const agentApi = {
    heartbeat: async () => false,
    claimJob: async () => ({ job, leaseId: 'lease-1' }),
    success: async () => { throw new Error('API timeout after send'); },
    uncertain: async () => { calls.push('uncertain'); },
    failure: async () => { calls.push('failure'); }
  };

  const worker = runWorker(agentApi, connectedWhatsApp());
  await new Promise(resolve => setTimeout(resolve, 25));
  worker.stop();

  assert.deepEqual(calls, ['uncertain']);
});

test('confirms a successful send when WhatsApp returns a serialized id', async () => {
  let externalMessageId: string | undefined;
  const agentApi = {
    heartbeat: async () => false,
    claimJob: async () => ({ job, leaseId: 'lease-1' }),
    success: async (_jobId: string, _leaseId: string, id?: string) => { externalMessageId = id; },
    failure: async () => { throw new Error('Nao deveria registrar falha'); },
    uncertain: async () => { throw new Error('Nao deveria registrar resultado incerto'); }
  };
  const whatsapp = connectedWhatsApp({ sendMessage: async () => ({ _serialized: 'external-serialized-1' }) });

  const worker = runWorker(agentApi, whatsapp);
  await new Promise(resolve => setTimeout(resolve, 25));
  worker.stop();

  assert.equal(externalMessageId, 'external-serialized-1');
});

test('confirms a successful send without an id instead of crashing the worker', async () => {
  let successCalled = false;
  let externalMessageId: string | undefined;
  const agentApi = {
    heartbeat: async () => false,
    claimJob: async () => ({ job, leaseId: 'lease-1' }),
    success: async (_jobId: string, _leaseId: string, id?: string) => { successCalled = true; externalMessageId = id; },
    failure: async () => { throw new Error('Nao deveria registrar falha'); },
    uncertain: async () => { throw new Error('Nao deveria registrar resultado incerto'); }
  };
  const whatsapp = connectedWhatsApp({ sendMessage: async () => ({}) });

  const worker = runWorker(agentApi, whatsapp);
  await new Promise(resolve => setTimeout(resolve, 25));
  worker.stop();

  assert.equal(successCalled, true);
  assert.equal(externalMessageId, undefined);
});

test('forwards media metadata to the WhatsApp client', async () => {
  let receivedMedia: Record<string, unknown> | undefined;
  const mediaJob = {
    ...job,
    mediaUrl: 'https://example.supabase.co/storage/v1/object/sign/message-media/owner/file.pdf?token=test',
    mediaMimeType: 'application/pdf',
    mediaFilename: 'documento.pdf',
    mediaCaption: 'Segue o documento'
  };
  const agentApi = {
    heartbeat: async () => false,
    claimJob: async () => ({ job: mediaJob, leaseId: 'lease-1' }),
    success: async () => undefined,
    failure: async () => undefined,
    uncertain: async () => undefined
  };
  const whatsapp = connectedWhatsApp({
    sendMessage: async (_phone: string, _content: string, media: Record<string, unknown>) => {
      receivedMedia = media;
      return { id: { id: 'external-media-1' } };
    }
  });

  const worker = runWorker(agentApi, whatsapp);
  await new Promise(resolve => setTimeout(resolve, 25));
  worker.stop();

  assert.deepEqual(receivedMedia, {
    mediaUrl: mediaJob.mediaUrl,
    mediaMimeType: mediaJob.mediaMimeType,
    mediaFilename: mediaJob.mediaFilename,
    mediaCaption: mediaJob.mediaCaption
  });
});
