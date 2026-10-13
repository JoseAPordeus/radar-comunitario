-- Estado do agente local e funções transacionais da fila.
-- Estas funções devem ser executadas antes de iniciar o agente WhatsApp.

CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('INICIALIZANDO', 'AGUARDANDO_AUTENTICACAO', 'CONECTADO', 'DESCONECTADO', 'ERRO')),
  version TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;

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
  lease_id UUID
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
  WHERE jobs.status = 'PENDENTE'
    AND jobs.available_at <= NOW()
    AND (jobs.lease_expires_at IS NULL OR jobs.lease_expires_at < NOW())
  ORDER BY jobs.available_at, jobs.created_at
  FOR UPDATE SKIP LOCKED
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
  FROM contacts contacts
  WHERE jobs.id = selected_id
    AND contacts.id = jobs.contact_id
  RETURNING jobs.id, jobs.contact_id, contacts.phone, jobs.content, jobs.type, jobs.lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_message_job(
  p_job_id UUID,
  p_agent_id TEXT,
  p_lease_id UUID,
  p_external_message_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE message_jobs
  SET status = 'ENVIADO',
      external_message_id = p_external_message_id,
      completed_at = NOW(),
      updated_at = NOW(),
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND agent_id = p_agent_id
    AND lease_id = p_lease_id
    AND status = 'PROCESSANDO';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_message_job(
  p_job_id UUID,
  p_agent_id TEXT,
  p_lease_id UUID,
  p_error_code TEXT,
  p_error_message TEXT,
  p_retryable BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE message_jobs
  SET status = CASE WHEN p_retryable AND attempts < max_attempts THEN 'PENDENTE' ELSE 'ERRO' END,
      available_at = CASE WHEN p_retryable AND attempts < max_attempts
        THEN NOW() + make_interval(secs => LEAST(300, (POWER(2, attempts) * 5)::INTEGER))
        ELSE available_at END,
      error_code = LEFT(p_error_code, 100),
      error_message = LEFT(p_error_message, 1000),
      updated_at = NOW(),
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND agent_id = p_agent_id
    AND lease_id = p_lease_id
    AND status = 'PROCESSANDO';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_message_job_uncertain(
  p_job_id UUID,
  p_agent_id TEXT,
  p_lease_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE message_jobs
  SET status = 'INCERTO',
      error_code = 'SEND_RESULT_UNCERTAIN',
      error_message = LEFT(p_reason, 1000),
      updated_at = NOW(),
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND agent_id = p_agent_id
    AND lease_id = p_lease_id
    AND status = 'PROCESSANDO';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_job(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_message_job(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_message_job(UUID, TEXT, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_message_job_uncertain(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
