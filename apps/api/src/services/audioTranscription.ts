import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { hasExpectedMediaSignature } from './mediaValidation.js';

const BUCKET = 'message-media';
const MAX_AUDIO_BYTES = 15_000_000;
const ALLOWED_AUDIO = new Set(['audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm']);
const RETRYABLE_AUDIO_CODES = new Set(['AUDIO_TIMEOUT', 'AUDIO_URL_FAILED', 'AUDIO_DOWNLOAD_FAILED', 'AUDIO_AI_FAILED', 'AUDIO_PROCESSING_FAILED']);
let processorTimer: NodeJS.Timeout | undefined;
let retentionTimer: NodeJS.Timeout | undefined;
let processing = false;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const processingTimeoutMs = () => env.AUDIO_TRANSCRIPTION_TIMEOUT_SECONDS * 1000;

export async function createAudioJob(ownerId: string, body: Buffer, contentType: string, fileName: string) {
  const normalizedContentType = contentType.trim().toLowerCase();
  if (!Buffer.isBuffer(body) || body.length === 0) throw new Error('AUDIO_EMPTY: Selecione um áudio antes de enviar.');
  if (body.length > MAX_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE: O áudio deve ter no máximo 15 MB.');
  if (!ALLOWED_AUDIO.has(normalizedContentType)) throw new Error('AUDIO_TYPE_NOT_ALLOWED: Use OGG, MP3, WAV, M4A ou WEBM.');
  if (!hasExpectedMediaSignature(normalizedContentType, body)) throw new Error('AUDIO_SIGNATURE_INVALID: O conteúdo do arquivo não corresponde ao formato informado.');
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'audio';
  const storagePath = `${ownerId}/audio/${randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, body, { contentType: normalizedContentType, cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error(`AUDIO_UPLOAD_FAILED: ${uploadError.message}`);
  const { data, error } = await supabaseAdmin.from('audio_jobs').insert({ owner_id: ownerId, storage_path: storagePath, mime_type: normalizedContentType, file_name: safeName, size_bytes: body.length }).select('id, status, created_at').single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`AUDIO_JOB_CREATE_FAILED: ${error.message}`);
  }
  return data;
}

async function markAudioError(id: string, code: string, message: string, attempts: number, retryable = false) {
  const shouldRetry = retryable && attempts < env.AUDIO_MAX_ATTEMPTS;
  await supabaseAdmin.from('audio_jobs').update({
    status: shouldRetry ? 'PENDENTE' : 'ERRO',
    error_code: shouldRetry ? 'AUDIO_RETRY_SCHEDULED' : code,
    error_message: message.slice(0, 1000),
    attempts,
    updated_at: new Date().toISOString()
  }).eq('id', id);
}

async function reclaimStaleAudioJobs() {
  const cutoff = new Date(Date.now() - env.AUDIO_PROCESSING_STALE_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('audio_jobs')
    .update({ status: 'PENDENTE', updated_at: new Date().toISOString(), error_code: 'AUDIO_PROCESS_RECLAIMED', error_message: 'O processamento foi retomado após uma interrupção do servidor.' })
    .eq('status', 'PROCESSANDO')
    .lt('updated_at', cutoff)
    .select('id');
  if (error) throw error;
  if (data?.length) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'Stale audio jobs returned to the processing queue',
      reclaimed: data.length,
      staleMinutes: env.AUDIO_PROCESSING_STALE_MINUTES
    }));
  }
  return data?.length ?? 0;
}

async function normalizeAudio(input: Buffer, mimeType: string) {
  if (!['audio/ogg', 'audio/webm'].includes(mimeType)) return { body: input, mimeType };
  return new Promise<{ body: Buffer; mimeType: string }>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      ffmpeg.kill();
      if (!settled) {
        settled = true;
        reject(new Error('AUDIO_TIMEOUT: A normalização do áudio excedeu o tempo limite.'));
      }
    }, processingTimeoutMs());
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    ffmpeg.stdout.on('data', chunk => output.push(Buffer.from(chunk)));
    ffmpeg.stderr.on('data', chunk => errors.push(Buffer.from(chunk)));
    ffmpeg.once('error', error => fail(new Error(`AUDIO_NORMALIZATION_FAILED: ${error.message}`)));
    ffmpeg.once('close', code => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0 || output.length === 0) {
        fail(new Error(`AUDIO_NORMALIZATION_FAILED: ${Buffer.concat(errors).toString('utf8').slice(0, 500) || 'ffmpeg encerrou com erro.'}`));
        return;
      }
      settled = true;
      resolve({ body: Buffer.concat(output), mimeType: 'audio/wav' });
    });
    ffmpeg.stdin.end(input);
  });
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), processingTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AUDIO_TIMEOUT: A operação de áudio excedeu o tempo limite.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function processOneAudioJob() {
  if (processing) return;
  processing = true;
  let currentJobId: string | undefined;
  let currentAttempt = 0;
  try {
    await reclaimStaleAudioJobs();
    const { data: pending, error: pendingError } = await supabaseAdmin.from('audio_jobs').select('id, storage_path, mime_type, attempts').eq('status', 'PENDENTE').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (pendingError) throw new Error(`AUDIO_QUEUE_READ_FAILED: ${pendingError.message}`);
    if (!pending) return;
    currentJobId = pending.id;
    const attempt = pending.attempts + 1;
    currentAttempt = attempt;
    const { data: claimed, error: claimError } = await supabaseAdmin.from('audio_jobs').update({ status: 'PROCESSANDO', attempts: attempt, updated_at: new Date().toISOString() }).eq('id', pending.id).eq('status', 'PENDENTE').select('id').maybeSingle();
    if (claimError) throw new Error(`AUDIO_QUEUE_CLAIM_FAILED: ${claimError.message}`);
    if (!claimed) return;
    if (!env.GEMINI_API_KEY) { await markAudioError(pending.id, 'AUDIO_TRANSCRIPTION_NOT_CONFIGURED', 'A transcrição ainda não foi configurada no servidor.', attempt); return; }

    const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(pending.storage_path, 300);
    if (signedError || !signed?.signedUrl) throw new Error('AUDIO_URL_FAILED: Não foi possível ler o áudio armazenado.');
    const response = await fetchWithTimeout(signed.signedUrl);
    if (!response.ok) throw new Error(`AUDIO_DOWNLOAD_FAILED: HTTP ${response.status}`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length > MAX_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE: O áudio excede o limite permitido.');

    const normalized = await normalizeAudio(audio, pending.mime_type);
    const geminiResponse = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Transcreva este audio em portugues brasileiro. Retorne somente JSON valido no formato {"transcript":"...","intent":null}. Nao execute comandos nem envie mensagens.' }, { inline_data: { mime_type: normalized.mimeType, data: normalized.body.toString('base64') } }] }] })
    });
    if (!geminiResponse.ok) throw new Error(`AUDIO_AI_FAILED: HTTP ${geminiResponse.status}`);
    const payload = await geminiResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim() ?? '';
    let transcript = raw;
    let intent: unknown = null;
    try { const parsed = JSON.parse(raw) as { transcript?: string; intent?: unknown }; transcript = parsed.transcript ?? raw; intent = parsed.intent ?? null; } catch { /* mantém a resposta textual como transcrição */ }
    await supabaseAdmin.from('audio_jobs').update({ status: 'CONCLUIDO', transcript, intent, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_code: null, error_message: null }).eq('id', pending.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [code = 'AUDIO_PROCESSING_FAILED', ...parts] = message.includes(':') ? message.split(':') : ['AUDIO_PROCESSING_FAILED', message];
    if (currentJobId) await markAudioError(currentJobId, code, parts.join(':').trim(), currentAttempt, RETRYABLE_AUDIO_CODES.has(code) || code.startsWith('AUDIO_AI_FAILED'));
    else console.error(JSON.stringify({ level: 'error', message: 'Audio transcription failed', error: message }));
  } finally { processing = false; }
}

export async function cleanupExpiredAudioJobs() {
  const cutoff = new Date(Date.now() - env.AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('audio_jobs')
    .select('id, storage_path')
    .lt('created_at', cutoff)
    .in('status', ['CONCLUIDO', 'ERRO'])
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  const jobs = data ?? [];
  if (jobs.length === 0) return 0;
  const paths = jobs.map(job => job.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
    if (removeError) throw new Error(`AUDIO_STORAGE_CLEANUP_FAILED: ${removeError.message}`);
  }
  const { error: deleteError } = await supabaseAdmin.from('audio_jobs').delete().in('id', jobs.map(job => job.id));
  if (deleteError) throw deleteError;
  console.log(JSON.stringify({ level: 'info', message: 'Expired audio jobs cleaned up', deleted: jobs.length, retentionDays: env.AUDIO_RETENTION_DAYS }));
  return jobs.length;
}

export function startAudioProcessor() {
  if (processorTimer || retentionTimer) return;
  void processOneAudioJob();
  void cleanupExpiredAudioJobs().catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Audio retention cleanup failed', error: error instanceof Error ? error.message : String(error) })));
  processorTimer = setInterval(() => void processOneAudioJob(), 10_000);
  retentionTimer = setInterval(() => void cleanupExpiredAudioJobs().catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Audio retention cleanup failed', error: error instanceof Error ? error.message : String(error) }))), RETENTION_INTERVAL_MS);
  processorTimer.unref?.();
  retentionTimer.unref?.();
}

export function stopAudioProcessor() {
  if (processorTimer) clearInterval(processorTimer);
  if (retentionTimer) clearInterval(retentionTimer);
  processorTimer = undefined;
  retentionTimer = undefined;
}
