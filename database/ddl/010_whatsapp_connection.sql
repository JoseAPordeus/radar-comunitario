ALTER TABLE public.agent_status
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

GRANT SELECT ON TABLE public.agent_status TO service_role;
