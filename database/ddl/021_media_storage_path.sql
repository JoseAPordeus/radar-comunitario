-- Fase 4: manter o caminho privado do Storage e renovar a URL no momento do envio.

ALTER TABLE public.message_jobs
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

ALTER TABLE public.message_jobs
  DROP CONSTRAINT IF EXISTS message_jobs_media_consistency_check;

ALTER TABLE public.message_jobs
  ADD CONSTRAINT message_jobs_media_consistency_check CHECK (
    (media_url IS NULL OR media_url ~ '^https://')
    AND (media_storage_path IS NULL OR media_storage_path !~ '(^|/)\.\.(/|$)')
  );

CREATE INDEX IF NOT EXISTS message_jobs_media_path_idx
  ON public.message_jobs (media_storage_path)
  WHERE media_storage_path IS NOT NULL;

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
  WHERE jobs.status = 'PENDENTE'
    AND jobs.queue_released_at IS NOT NULL
    AND jobs.available_at <= NOW()
    AND (jobs.lease_expires_at IS NULL OR jobs.lease_expires_at < NOW())
    AND c.whatsapp_opt_in = TRUE
    AND c.messaging_blocked = FALSE
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
      lease_id = uuid_generate_v4(),
      lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
      agent_id = p_agent_id,
      updated_at = NOW()
  FROM contacts c
  WHERE jobs.id = selected_id
    AND c.id = jobs.contact_id
  RETURNING jobs.id, jobs.contact_id, c.phone, jobs.content, jobs.type, jobs.lease_id,
    jobs.media_url, jobs.media_storage_path, jobs.media_mime_type, jobs.media_filename, jobs.media_caption;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_job(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_message_job(TEXT, INTEGER) TO service_role;
