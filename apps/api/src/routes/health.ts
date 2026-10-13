import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { getRuntimeMetrics } from '../services/runtimeMetrics.js';

export const healthRouter = Router();

type DependencyCheck = {
  name: string;
  ok: boolean;
  code?: string;
};

async function checkDataDependencies(): Promise<DependencyCheck[]> {
  const checks = [
    {
      name: 'contacts',
      run: () => supabaseAdmin.from('contacts').select('id,whatsapp_opt_in_at,whatsapp_opt_in_source', { head: true }).limit(1)
    },
    {
      name: 'whatsapp_chat_identity',
      run: () => supabaseAdmin.from('contacts').select('id,whatsapp_chat_id', { head: true }).limit(1)
    },
    {
      name: 'message_jobs_media_queue',
      run: () => supabaseAdmin.from('message_jobs').select('media_url,media_storage_path,queue_released_at', { head: true }).limit(1)
    },
    {
      name: 'message_media_bucket',
      run: () => supabaseAdmin.storage.getBucket('message-media')
    },
    {
      name: 'conversations_subject',
      run: () => supabaseAdmin.from('conversations').select('id,subject', { head: true }).limit(1)
    },
    {
      name: 'conversation_messages',
      run: () => supabaseAdmin.from('conversation_messages').select('id,quoted_whatsapp_message_id', { head: true }).limit(1)
    },
    {
      name: 'audio_jobs',
      run: () => supabaseAdmin.from('audio_jobs').select('id', { head: true }).limit(1)
    },
    {
      name: 'messaging_policies',
      run: () => supabaseAdmin.from('messaging_policies').select('owner_id', { head: true }).limit(1)
    },
    {
      name: 'service_history_audit',
      run: () => supabaseAdmin.from('service_history_audit').select('id,action,previous_data,new_data', { head: true }).limit(1)
    },
    {
      name: 'automation_runs',
      run: () => supabaseAdmin.from('automation_runs').select('id,automation_key,run_date,status,details', { head: true }).limit(1)
    },
    {
      name: 'message_template_versions',
      run: () => supabaseAdmin.from('message_template_versions').select('id,template_id,version', { head: true }).limit(1)
    },
    {
      name: 'message_job_confirmation_functions',
      run: async () => {
        const probes = await Promise.all([
          supabaseAdmin.rpc('complete_message_job', {
            p_job_id: '00000000-0000-0000-0000-000000000001',
            p_agent_id: 'health-probe',
            p_lease_id: '00000000-0000-0000-0000-000000000002',
            p_external_message_id: null
          }),
          supabaseAdmin.rpc('fail_message_job', {
            p_job_id: '00000000-0000-0000-0000-000000000001',
            p_agent_id: 'health-probe',
            p_lease_id: '00000000-0000-0000-0000-000000000002',
            p_error_code: 'HEALTH_PROBE',
            p_error_message: 'health probe',
            p_retryable: false
          }),
          supabaseAdmin.rpc('mark_message_job_uncertain', {
            p_job_id: '00000000-0000-0000-0000-000000000001',
            p_agent_id: 'health-probe',
            p_lease_id: '00000000-0000-0000-0000-000000000002',
            p_reason: 'health probe'
          })
        ]);
        return { data: null, error: probes.find(result => result.error)?.error ?? null };
      }
    },
    {
      name: 'message_policy_claim_guard',
      run: () => supabaseAdmin.rpc('messaging_policy_claim_guard_v2_ready')
    },
    {
      name: 'dashboard_metrics',
      run: () => supabaseAdmin.rpc('dashboard_metrics', {
        p_owner_id: null,
        p_from: null,
        p_to: null,
        p_city_id: null,
        p_neighborhood_id: null,
        p_assigned_to: null,
        p_label_id: null,
        p_subject: null,
        p_conversation_status: null
      })
    }
  ];

  const results = await Promise.all(checks.map(async (check) => {
    const { error } = await check.run();
    const errorCode = error ? (error as { code?: string }).code : undefined;
    return {
      name: check.name,
      ok: !error,
      ...(error ? { code: errorCode ?? 'UNKNOWN' } : {})
    } satisfies DependencyCheck;
  }));

  return results;
}

healthRouter.get('/live', (_request, response) => {
  response.json({ data: { status: 'ok' }, requestId: response.getHeader('x-request-id') });
});

healthRouter.get('/metrics', (_request, response) => {
  response.json({ data: getRuntimeMetrics(), requestId: response.getHeader('x-request-id') });
});

healthRouter.get('/ready', async (_request, response) => {
  const { error } = await supabaseAdmin.from('contacts').select('id', { head: true, count: 'exact' }).limit(1);

  if (error) {
    console.error(JSON.stringify({ level: 'error', scope: 'health.ready', code: error.code, message: error.message }));
    response.status(503).json({
      error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'A API ainda não está pronta.' },
      requestId: response.getHeader('x-request-id')
    });
    return;
  }

  response.json({ data: { status: 'ready' }, requestId: response.getHeader('x-request-id') });
});

healthRouter.get('/data-ready', async (_request, response) => {
  const checks = await checkDataDependencies();
  const ready = checks.every((check) => check.ok);

  if (!ready) {
    response.status(503).json({
      error: {
        code: 'DATA_DEPENDENCIES_UNAVAILABLE',
        message: 'O banco ainda não está com todas as fases do sistema disponíveis.'
      },
      data: { status: 'waiting', checks },
      requestId: response.getHeader('x-request-id')
    });
    return;
  }

  response.json({ data: { status: 'ready', checks }, requestId: response.getHeader('x-request-id') });
});
