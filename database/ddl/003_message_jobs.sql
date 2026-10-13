-- Fila persistente e controle de consentimento para o agente WhatsApp.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS messaging_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS messaging_blocked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS message_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ANIVERSARIO', 'CAMPANHA')),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ERRO', 'INCERTO', 'CANCELADO')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  agent_id TEXT,
  correlation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  external_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (correlation_id)
);

CREATE INDEX IF NOT EXISTS message_jobs_available_idx
  ON message_jobs (status, available_at, created_at)
  WHERE status = 'PENDENTE';

CREATE INDEX IF NOT EXISTS message_jobs_lease_idx
  ON message_jobs (status, lease_expires_at)
  WHERE status = 'PROCESSANDO';

CREATE INDEX IF NOT EXISTS message_jobs_owner_idx
  ON message_jobs (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS message_jobs_contact_idx
  ON message_jobs (contact_id, created_at DESC);

ALTER TABLE message_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_jobs_owner_policy ON message_jobs;

CREATE POLICY message_jobs_owner_policy ON message_jobs
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- O agente não deve receber acesso direto ao banco. A API reivindica tarefas
-- em transação e expõe apenas os endpoints específicos do agente.
