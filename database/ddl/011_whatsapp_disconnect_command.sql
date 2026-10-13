ALTER TABLE public.agent_status
  ADD COLUMN IF NOT EXISTS disconnect_requested_at TIMESTAMPTZ;
