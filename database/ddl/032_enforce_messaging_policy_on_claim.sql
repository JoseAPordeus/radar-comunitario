-- Fase 6: o agente nunca deve reivindicar tarefas enquanto o proprietario
-- tiver desativado globalmente os envios.
-- A ausencia de uma linha de politica mantem o comportamento padrao habilitado.

DROP FUNCTION IF EXISTS public.claim_message_job(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.claim_message_job(
  p_agent_id TEXT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  id UUID,
  contact_id UUID,
  phone TEXT,
  content TEXT,
  type TEXT,
  lease_id UUID,
  media_url TEXT,
  media_storage_path TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_caption TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_id UUID;
BEGIN
  SELECT jobs.id INTO selected_id
  FROM message_jobs jobs
  JOIN contacts c ON c.id = jobs.contact_id
  LEFT JOIN messaging_policies policy ON policy.owner_id = jobs.owner_id
  WHERE jobs.status = 'PENDENTE'
    AND jobs.queue_released_at IS NOT NULL
    AND jobs.available_at <= NOW()
    AND (jobs.lease_expires_at IS NULL OR jobs.lease_expires_at < NOW())
    AND c.whatsapp_opt_in = TRUE
    AND c.messaging_blocked = FALSE
    AND COALESCE(policy.enabled, TRUE) = TRUE
  ORDER BY jobs.available_at, jobs.created_at
  FOR UPDATE OF jobs SKIP LOCKED
  LIMIT 1;

  IF selected_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE message_jobs jobs
  SET status = 'PROCESSANDO',
      attempts = jobs.attempts + 1,
      processing_started_at = NOW(),
      lease_id = gen_random_uuid(),
      lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
      agent_id = p_agent_id,
      updated_at = NOW()
  FROM contacts c
  WHERE jobs.id = selected_id
    AND c.id = jobs.contact_id
  RETURNING jobs.id, jobs.contact_id, c.phone, jobs.content, jobs.type,
    jobs.lease_id, jobs.media_url, jobs.media_storage_path, jobs.media_mime_type, jobs.media_filename,
    jobs.media_caption;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_job(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_message_job(TEXT, INTEGER) TO service_role;

-- Marcador seguro usado pelo health check. Ele não lê nem altera tarefas;
-- apenas confirma que esta migration foi executada no banco atual.
CREATE OR REPLACE FUNCTION public.messaging_policy_claim_guard_ready()
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  definition TEXT;
BEGIN
  definition := pg_get_functiondef('public.claim_message_job(text,integer)'::regprocedure);
  RETURN definition LIKE '%gen_random_uuid()%' 
    AND definition LIKE '%COALESCE(policy.enabled, TRUE)%'
    AND definition LIKE '%media_storage_path%';
END;
 $function$;

REVOKE ALL ON FUNCTION public.messaging_policy_claim_guard_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.messaging_policy_claim_guard_ready() TO service_role;

CREATE OR REPLACE FUNCTION public.messaging_policy_claim_guard_v2_ready()
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  definition TEXT;
BEGIN
  definition := pg_get_functiondef('public.claim_message_job(text,integer)'::regprocedure);
  RETURN definition LIKE '%gen_random_uuid()%' 
    AND definition LIKE '%COALESCE(policy.enabled, TRUE)%'
    AND definition LIKE '%media_storage_path%';
END;
$function$;

REVOKE ALL ON FUNCTION public.messaging_policy_claim_guard_v2_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.messaging_policy_claim_guard_v2_ready() TO service_role;

