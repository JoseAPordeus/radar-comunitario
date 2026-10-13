-- Fase de segurança operacional: consentimento, horário e limites configuráveis.
CREATE TABLE IF NOT EXISTS public.messaging_policies (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  daily_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_limit BETWEEN 1 AND 1000),
  min_interval_seconds INTEGER NOT NULL DEFAULT 15 CHECK (min_interval_seconds BETWEEN 5 AND 3600),
  max_interval_seconds INTEGER NOT NULL DEFAULT 45 CHECK (max_interval_seconds BETWEEN 5 AND 3600),
  business_start TIME NOT NULL DEFAULT '08:00',
  business_end TIME NOT NULL DEFAULT '18:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_interval_seconds >= min_interval_seconds)
);
ALTER TABLE public.messaging_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messaging_policies_owner_policy ON public.messaging_policies;
CREATE POLICY messaging_policies_owner_policy ON public.messaging_policies FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
