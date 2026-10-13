import { supabaseAdmin } from '../lib/supabase.js';
import { enqueueMessageJob } from '../queue/messageQueue.js';
import { getMessagingPolicy, scheduleMessageJobs } from './messagingPolicy.js';

export type BirthdayAutomationResult = {
  created: Array<{ id: string; contact_id: string; status: string }>;
  skipped: Array<{ contactId: string; reason: string }>;
  reason?: string;
};

type BirthdaySettings = { enabled?: boolean; template_id?: string | null };
const STALE_AUTOMATION_RUN_MS = 30 * 60 * 1000;

function queueColumnMissing(error: unknown) {
  const value = error as { code?: string; message?: string };
  return String(value.code ?? '').includes('PGRST204') || String(value.code ?? '').includes('42703') || String(value.message ?? '').includes('queue_released_at');
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  return { year: value('year'), month: value('month'), day: value('day') };
}

async function claimAutomationRun(ownerId: string, runDate: string) {
  const insert = await supabaseAdmin.from('automation_runs').insert({ owner_id: ownerId, automation_key: 'birthday_automation', run_date: runDate }).select('id, status').maybeSingle();
  if (!insert.error && insert.data) return insert.data.id as string;
  if (insert.error && !String(insert.error.code ?? '').includes('23505')) throw new Error(`AUTOMATION_RUN_CREATE_FAILED: ${insert.error.message}`);

  const { data: existing, error: readError } = await supabaseAdmin.from('automation_runs').select('id, status, started_at').eq('owner_id', ownerId).eq('automation_key', 'birthday_automation').eq('run_date', runDate).maybeSingle();
  if (readError) throw new Error(`AUTOMATION_RUN_READ_FAILED: ${readError.message}`);
  if (!existing || existing.status === 'CONCLUIDO') return null;

  const staleBefore = new Date(Date.now() - STALE_AUTOMATION_RUN_MS).toISOString();
  const canRetry = existing.status === 'ERRO' || (existing.status === 'PROCESSANDO' && existing.started_at < staleBefore);
  if (!canRetry) return null;

  let retryQuery = supabaseAdmin.from('automation_runs').update({ status: 'PROCESSANDO', started_at: new Date().toISOString(), completed_at: null, details: [] }).eq('id', existing.id).eq('status', existing.status);
  if (existing.status === 'PROCESSANDO') retryQuery = retryQuery.lt('started_at', staleBefore);
  const { data: retried, error: retryError } = await retryQuery.select('id').maybeSingle();
  if (retryError) throw new Error(`AUTOMATION_RUN_RETRY_FAILED: ${retryError.message}`);
  return retried?.id as string | undefined ?? null;
}

async function finishAutomationRun(runId: string, status: 'CONCLUIDO' | 'ERRO', createdCount: number, skippedCount: number, details: Array<{ contactId: string; reason: string }> | string) {
  await supabaseAdmin.from('automation_runs').update({ status, created_count: createdCount, skipped_count: skippedCount, details: typeof details === 'string' ? [{ reason: details }] : details, completed_at: new Date().toISOString() }).eq('id', runId);
}

export async function runBirthdayAutomation(ownerId: string): Promise<BirthdayAutomationResult> {
  const { data: settingsRow, error: settingsError } = await supabaseAdmin.from('automation_settings').select('value').eq('owner_id', ownerId).eq('key', 'birthday_automation').maybeSingle();
  if (settingsError) throw new Error(`AUTOMATION_READ_FAILED: ${settingsError.message}`);
  const settings = (settingsRow?.value ?? { enabled: false, template_id: null }) as BirthdaySettings;
  if (!settings.enabled || !settings.template_id) return { created: [], skipped: [], reason: 'DISABLED' };

  const policy = await getMessagingPolicy(ownerId);
  if (!policy.enabled) return { created: [], skipped: [], reason: 'MESSAGING_DISABLED' };
  const today = new Date();
  const parts = localDateParts(today, policy.timezone);
  const runDate = `${parts.year}-${parts.month}-${parts.day}`;
  const runId = await claimAutomationRun(ownerId, runDate);
  if (!runId) return { created: [], skipped: [], reason: 'ALREADY_RUN_TODAY' };

  const skipped: Array<{ contactId: string; reason: string }> = [];
  try {
    const { data: contacts, error: birthdaysError } = await supabaseAdmin.from('contacts').select('id, full_name, phone, address, birth_date, whatsapp_opt_in, messaging_blocked').eq('owner_id', ownerId).not('birth_date', 'is', null);
    if (birthdaysError) throw new Error(`BIRTHDAYS_READ_FAILED: ${birthdaysError.message}`);
    const birthdays = (contacts ?? []).filter(contact => {
      const dateParts = String(contact.birth_date ?? '').split('-');
      return dateParts.length === 3 && dateParts[1] === parts.month && dateParts[2] === parts.day;
    });
    const { data: template, error: templateError } = await supabaseAdmin.from('message_templates').select('id, content, type, is_active').eq('owner_id', ownerId).eq('id', settings.template_id).maybeSingle();
    if (templateError) throw new Error(`TEMPLATE_READ_FAILED: ${templateError.message}`);
    if (!template) throw new Error('TEMPLATE_NOT_FOUND: O modelo da automacao nao foi encontrado.');
    if (template.type !== 'ANIVERSARIO') throw new Error('TEMPLATE_TYPE_INVALID: Selecione um modelo do tipo aniversario.');
    if (!template.is_active) throw new Error('TEMPLATE_INACTIVE: Ative o modelo de aniversario antes de usar a automacao.');

    const eligible = (birthdays ?? []).flatMap(contact => {
      if (contact.messaging_blocked) { skipped.push({ contactId: contact.id, reason: 'MESSAGING_BLOCKED' }); return []; }
      if (!contact.whatsapp_opt_in) { skipped.push({ contactId: contact.id, reason: 'WHATSAPP_OPT_IN_REQUIRED' }); return []; }
      const content = template.content.replace(/{nome}/g, contact.full_name).replace(/{bairro}/g, contact.address || '').replace(/{telefone}/g, contact.phone);
      return [{ contact, content }];
    });

    const scheduling = await scheduleMessageJobs(ownerId, eligible.map(() => undefined));
    const insertable = eligible.flatMap((item, index) => {
      const availableAt = scheduling.schedule[index];
      if (!availableAt) { skipped.push({ contactId: item.contact.id, reason: 'DAILY_LIMIT_REACHED' }); return []; }
      return [{ owner_id: ownerId, contact_id: item.contact.id, content: item.content, type: 'ANIVERSARIO', template_id: template.id, available_at: availableAt, queue_released_at: null }];
    });
    if (insertable.length === 0) {
      await finishAutomationRun(runId, 'CONCLUIDO', 0, skipped.length, skipped);
      return { created: [], skipped };
    }

    let { data: created, error: insertError } = await supabaseAdmin.from('message_jobs').insert(insertable).select('id, contact_id, status, available_at');
    if (insertError && queueColumnMissing(insertError)) {
      const legacyRows = insertable.map(({ queue_released_at: _queueReleasedAt, ...job }) => job);
      ({ data: created, error: insertError } = await supabaseAdmin.from('message_jobs').insert(legacyRows).select('id, contact_id, status, available_at'));
    }
    if (insertError) throw new Error(`BIRTHDAY_JOBS_CREATE_FAILED: ${insertError.message}`);
    await Promise.all((created ?? []).map(job => enqueueMessageJob(job.id, job.available_at)));
    await finishAutomationRun(runId, 'CONCLUIDO', created?.length ?? 0, skipped.length, skipped);
    return { created: created ?? [], skipped };
  } catch (error) {
    await finishAutomationRun(runId, 'ERRO', 0, skipped.length, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function runEnabledBirthdayAutomations(): Promise<void> {
  const { data: settings, error } = await supabaseAdmin.from('automation_settings').select('owner_id, value').eq('key', 'birthday_automation');
  if (error) throw error;
  for (const row of settings ?? []) {
    const value = row.value as BirthdaySettings;
    if (!value?.enabled || !value.template_id) continue;
    try {
      const result = await runBirthdayAutomation(row.owner_id);
      if (result.created.length || result.skipped.length) console.log(JSON.stringify({ level: 'info', message: 'Birthday automation checked', ownerId: row.owner_id, created: result.created.length, skipped: result.skipped.length, reason: result.reason }));
    } catch (automationError) {
      console.error(JSON.stringify({ level: 'error', message: 'Birthday automation failed', ownerId: row.owner_id, error: automationError instanceof Error ? automationError.message : String(automationError) }));
    }
  }
}
