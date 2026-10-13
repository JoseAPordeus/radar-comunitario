import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';

const QUEUE_NAME = 'radar-message-jobs';
const DLQ_NAME = 'radar-message-jobs-dlq';
let connection: Redis | undefined;
let queue: Queue<{ messageJobId: string }> | undefined;
let deadLetterQueue: Queue<{ messageJobId: string; error: string }> | undefined;
let worker: Worker<{ messageJobId: string }> | undefined;
let reconcileTimer: NodeJS.Timeout | undefined;
let staleLeaseTimer: NodeJS.Timeout | undefined;
let reconciling = false;

function queueColumnMissing(error: unknown) {
  const value = error as { code?: string; message?: string };
  return String(value.code ?? '').includes('PGRST204') || String(value.code ?? '').includes('42703') || String(value.message ?? '').includes('queue_released_at');
}

function getConnection() {
  if (!connection) connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  return connection;
}

async function reconcilePendingMessageJobs() {
  if (!queue || reconciling) return;
  reconciling = true;
  try {
    const { data, error } = await supabaseAdmin
      .from('message_jobs')
      .select('id, available_at')
      .eq('status', 'PENDENTE')
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    let recovered = 0;
    for (const job of data ?? []) {
      const existing = await queue.getJob(job.id);
      if (existing) continue;
      const delay = job.available_at ? Math.max(0, new Date(job.available_at).getTime() - Date.now()) : 0;
      try {
        await queue.add('release-message-job', { messageJobId: job.id }, {
          jobId: job.id,
          delay,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: 100
        });
        recovered += 1;
      } catch (queueError) {
        if (!String(queueError).toLowerCase().includes('job') || !String(queueError).toLowerCase().includes('exist')) throw queueError;
      }
    }
    if (recovered > 0) console.log(JSON.stringify({ level: 'info', message: 'Pending message jobs reconciled', recovered }));
  } finally {
    reconciling = false;
  }
}

async function reconcileExpiredLeases() {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('message_jobs')
    .select('id, lease_expires_at')
    .eq('status', 'PROCESSANDO')
    .not('lease_expires_at', 'is', null)
    .lt('lease_expires_at', now)
    .limit(100);
  if (error) throw error;
  for (const job of data ?? []) {
    const { error: updateError } = await supabaseAdmin.from('message_jobs').update({
      status: 'INCERTO',
      error_code: 'LEASE_EXPIRED',
      error_message: 'A tarefa ficou sem confirmacao do agente antes do fim do lease. Confira o WhatsApp antes de reenviar.',
      lease_id: null,
      lease_expires_at: null,
      updated_at: now
    }).eq('id', job.id).eq('status', 'PROCESSANDO').eq('lease_expires_at', job.lease_expires_at);
    if (updateError) throw updateError;
  }
  if ((data ?? []).length > 0) console.warn(JSON.stringify({ level: 'warn', message: 'Expired message leases moved to uncertain', count: data?.length }));
}

export async function startMessageQueue(): Promise<void> {
  if (queue || worker) return;
  try {
    const redis = getConnection();
    await redis.ping();
    const { error: schemaError } = await supabaseAdmin.from('message_jobs').select('queue_released_at').limit(0);
    if (schemaError && queueColumnMissing(schemaError)) {
      console.warn(JSON.stringify({ level: 'warn', message: 'Redis queue aguardando a migração 015; jobs legados continuarão pelo banco' }));
      await redis.quit();
      connection = undefined;
      return;
    }
    if (schemaError) throw schemaError;
    queue = new Queue<{ messageJobId: string }>(QUEUE_NAME, { connection: redis });
    deadLetterQueue = new Queue<{ messageJobId: string; error: string }>(DLQ_NAME, { connection: redis });
    worker = new Worker<{ messageJobId: string }>(QUEUE_NAME, async job => {
      const { error } = await supabaseAdmin.from('message_jobs').update({ queue_released_at: new Date().toISOString(), available_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.data.messageJobId).eq('status', 'PENDENTE');
      if (error) throw error;
    }, { connection: redis, concurrency: 10 });
    worker.on('failed', (job, error) => {
      console.error(JSON.stringify({ level: 'error', message: 'Message queue job failed', jobId: job?.id, error: error.message }));
      if (job && job.attemptsMade >= 5) void deadLetterQueue?.add('release-message-job-failed', { messageJobId: job.data.messageJobId, error: error.message }, { removeOnFail: false });
      if (job && job.attemptsMade >= 5) {
        void supabaseAdmin.from('message_jobs').update({ status: 'ERRO', error_code: 'QUEUE_RELEASE_FAILED', error_message: error.message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', job.data.messageJobId).eq('status', 'PENDENTE')
          .then(result => { if (result.error) console.error(JSON.stringify({ level: 'error', message: 'Unable to mark queue job as failed', jobId: job.data.messageJobId, error: result.error.message })); });
      }
    });
    console.log(JSON.stringify({ level: 'info', message: 'Redis message queue ready', queue: QUEUE_NAME }));
    await reconcilePendingMessageJobs();
    await reconcileExpiredLeases();
    reconcileTimer = setInterval(() => void reconcilePendingMessageJobs().catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Message queue reconciliation failed', error: error instanceof Error ? error.message : String(error) }))), 60_000);
    reconcileTimer.unref?.();
    staleLeaseTimer = setInterval(() => void reconcileExpiredLeases().catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Expired lease reconciliation failed', error: error instanceof Error ? error.message : String(error) }))), 30_000);
    staleLeaseTimer.unref?.();
  } catch (error) {
    queue = undefined;
    console.error(JSON.stringify({ level: 'warn', message: 'Redis unavailable; message jobs will use direct fallback release', error: error instanceof Error ? error.message : String(error) }));
  }
}

export async function enqueueMessageJob(messageJobId: string, availableAt?: string | null): Promise<void> {
  if (!queue) {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('message_jobs').update({ queue_released_at: now, available_at: availableAt ?? now, updated_at: now }).eq('id', messageJobId).eq('status', 'PENDENTE');
    if (error && !queueColumnMissing(error)) throw error;
    return;
  }
  const delay = availableAt ? Math.max(0, new Date(availableAt).getTime() - Date.now()) : 0;
  try {
    await queue.add('release-message-job', { messageJobId }, { jobId: messageJobId, delay, attempts: 5, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: true, removeOnFail: 100 });
  } catch (error) {
    const now = new Date().toISOString();
    const { error: fallbackError } = await supabaseAdmin.from('message_jobs').update({ queue_released_at: now, available_at: availableAt ?? now, updated_at: now }).eq('id', messageJobId).eq('status', 'PENDENTE');
    if (fallbackError && !queueColumnMissing(fallbackError)) throw fallbackError;
    console.error(JSON.stringify({ level: 'warn', message: 'Redis enqueue failed; direct fallback release applied', messageJobId, error: error instanceof Error ? error.message : String(error) }));
  }
}

export async function rescheduleMessageJob(messageJobId: string, availableAt: string): Promise<void> {
  if (queue) {
    const existing = await queue.getJob(messageJobId);
    if (existing) {
      try {
        await existing.remove();
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', message: 'Unable to remove the previous Redis schedule before rescheduling', messageJobId, detail: error instanceof Error ? error.message : String(error) }));
      }
    }
  }
  await enqueueMessageJob(messageJobId, availableAt);
}

export async function stopMessageQueue(): Promise<void> {
  if (reconcileTimer) clearInterval(reconcileTimer);
  if (staleLeaseTimer) clearInterval(staleLeaseTimer);
  reconcileTimer = undefined;
  staleLeaseTimer = undefined;
  reconciling = false;
  await worker?.close();
  await queue?.close();
  await deadLetterQueue?.close();
  await connection?.quit();
  worker = undefined;
  queue = undefined;
  deadLetterQueue = undefined;
  connection = undefined;
}
