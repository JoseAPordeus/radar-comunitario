import { AgentApi } from './agentApi.js';
import { WhatsAppClient } from './client/whatsappClient.js';
import { MessageWorker } from './worker.js';

const agentApi = new AgentApi();
const whatsapp = new WhatsAppClient(async (state, qrCode, phoneNumber) => {
  await agentApi.heartbeat(state as 'INICIALIZANDO' | 'AGUARDANDO_AUTENTICACAO' | 'CONECTADO' | 'DESCONECTADO' | 'ERRO', qrCode ?? null, phoneNumber ?? null);
}, payload => agentApi.incomingMessage(payload), payload => agentApi.uploadIncomingMedia(payload), () => agentApi.listContactPhones(), payload => agentApi.updateContactProfile(payload));
const worker = new MessageWorker(agentApi, whatsapp);

let shuttingDown = false;
let recovering = false;

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const INITIALIZATION_TIMEOUT_MS = 90_000;

async function initializeWithTimeout() {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      whatsapp.initialize(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Inicialização do WhatsApp Web excedeu o tempo esperado.')), INITIALIZATION_TIMEOUT_MS); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function start() {
  console.log(JSON.stringify({ level: 'info', message: 'WhatsApp agent starting' }));
  await agentApi.heartbeat('INICIALIZANDO', null, null).catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to publish initial WhatsApp status', detail: error instanceof Error ? error.message : String(error) })));
  console.log(JSON.stringify({ level: 'info', message: 'WhatsApp browser initialization started' }));
  await initializeWithTimeout();
  console.log(JSON.stringify({ level: 'info', message: 'WhatsApp browser initialization completed' }));
  worker.start();
}

async function recover(reason: unknown) {
  if (shuttingDown || recovering) return;
  recovering = true;
  console.error(JSON.stringify({
    level: 'error',
    message: 'Falha inesperada no agente WhatsApp; iniciando recuperação automática',
    detail: reason instanceof Error ? reason.message : String(reason)
  }));
  worker.stop();
  try {
    await whatsapp.destroy().catch(() => undefined);
    await wait(5_000);
    await initializeWithTimeout();
    worker.start();
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Não foi possível recuperar o agente WhatsApp',
      detail: error instanceof Error ? error.message : String(error)
    }));
  } finally {
    recovering = false;
  }
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', message: `Received ${signal}; shutting down agent` }));
  worker.stop();
  try {
    await whatsapp.destroy();
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', error => void recover(error));
process.on('unhandledRejection', reason => void recover(reason));

start().catch(async error => {
  console.error(JSON.stringify({ level: 'error', message: 'Unable to start WhatsApp agent', detail: error instanceof Error ? error.message : String(error) }));
  await whatsapp.destroy().catch(() => undefined);
  process.exit(1);
});
