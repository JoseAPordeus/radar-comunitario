-- Fase 5: execucao idempotente e auditavel da automacao de aniversarios.

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_key TEXT NOT NULL,
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSANDO' CHECK (status IN ('PROCESSANDO', 'CONCLUIDO', 'ERRO')),
  created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (owner_id, automation_key, run_date)
);

CREATE INDEX IF NOT EXISTS automation_runs_owner_created_idx
  ON public.automation_runs (owner_id, started_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_owner_policy ON public.automation_runs;
CREATE POLICY automation_runs_owner_policy ON public.automation_runs
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE ON public.automation_runs TO service_role;
