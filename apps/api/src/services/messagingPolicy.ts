import { supabaseAdmin } from '../lib/supabase.js';
import { rescheduleMessageJob } from '../queue/messageQueue.js';

export type MessagingPolicy = {
  enabled: boolean; daily_limit: number; min_interval_seconds: number; max_interval_seconds: number;
  business_start: string; business_end: string; timezone: string;
};

export const defaultMessagingPolicy: MessagingPolicy = { enabled: true, daily_limit: 100, min_interval_seconds: 15, max_interval_seconds: 45, business_start: '08:00:00', business_end: '18:00:00', timezone: 'America/Sao_Paulo' };

export async function getMessagingPolicy(ownerId: string): Promise<MessagingPolicy> {
  const { data, error } = await supabaseAdmin.from('messaging_policies').select('enabled, daily_limit, min_interval_seconds, max_interval_seconds, business_start, business_end, timezone').eq('owner_id', ownerId).maybeSingle();
  if (error && !String(error.code).includes('PGRST205') && !String(error.code).includes('42P01')) throw error;
  if (error) return defaultMessagingPolicy;
  return { ...defaultMessagingPolicy, ...(data ?? {}) } as MessagingPolicy;
}

function localMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function parseMinutes(value: string) { const [hour = '0', minute = '0'] = value.split(':'); return Number(hour) * 60 + Number(minute); }

function startOfDayForTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const localNowAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour') % 24, value('minute'), value('second'));
  const localMidnightAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'));
  const timezoneOffset = localNowAsUtc - date.getTime();
  return new Date(localMidnightAsUtc - timezoneOffset);
}

function nextBusinessTime(date: Date, policy: MessagingPolicy) {
  const start = parseMinutes(policy.business_start);
  const end = parseMinutes(policy.business_end);
  let candidate = new Date(date);
  for (let i = 0; i <= 24 * 60; i += 1) {
    const current = localMinutes(candidate, policy.timezone);
    if (current >= start && current < end) return candidate;
    candidate = new Date(candidate.getTime() + 60_000);
  }
  return candidate;
}

function randomBetween(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function nextSafeIntervalSeconds(policy: MessagingPolicy, positionInBatch: number) {
  // Pausas por lote reduzem rajadas de mensagens e deixam o operador revisar
  // a fila. Isso e uma protecao operacional, nao uma tentativa de burlar regras.
  if (positionInBatch > 0 && positionInBatch % 15 === 0) return randomBetween(180, 300);
  return randomBetween(policy.min_interval_seconds, policy.max_interval_seconds);
}

export async function scheduleMessageJobs(ownerId: string, requestedTimes: Array<string | undefined>) {
  const policy = await getMessagingPolicy(ownerId);
  const startOfDay = startOfDayForTimezone(new Date(), policy.timezone);
  const { count, error } = await supabaseAdmin.from('message_jobs').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).gte('created_at', startOfDay.toISOString()).neq('status', 'CANCELADO');
  if (error) throw error;
  const remaining = Math.max(0, policy.daily_limit - (count ?? 0));
  const schedule: Array<string | undefined> = [];
  let cursor = new Date();
  let positionInBatch = 0;
  for (const requested of requestedTimes.slice(0, remaining)) {
    if (requested) cursor = new Date(Math.max(cursor.getTime(), new Date(requested).getTime()));
    cursor = nextBusinessTime(cursor, policy);
    schedule.push(cursor.toISOString());
    positionInBatch += 1;
    cursor = new Date(cursor.getTime() + nextSafeIntervalSeconds(policy, positionInBatch) * 1000);
  }
  return { policy, remaining, schedule };
}

export async function reschedulePendingMessageJobs(ownerId: string, policy: MessagingPolicy) {
  const { data: jobs, error } = await supabaseAdmin
    .from('message_jobs')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('status', 'PENDENTE')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw error;

  const scheduled: Array<{ id: string; availableAt: string }> = [];
  let cursor = new Date();
  let positionInBatch = 0;
  for (const job of jobs ?? []) {
    cursor = nextBusinessTime(cursor, policy);
    const availableAt = cursor.toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('message_jobs')
      .update({ available_at: availableAt, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('owner_id', ownerId)
      .eq('status', 'PENDENTE')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) {
      scheduled.push({ id: job.id, availableAt });
      positionInBatch += 1;
      cursor = new Date(cursor.getTime() + nextSafeIntervalSeconds(policy, positionInBatch) * 1000);
    }
  }

  await Promise.all(scheduled.map(job => rescheduleMessageJob(job.id, job.availableAt)));
  return scheduled;
}
