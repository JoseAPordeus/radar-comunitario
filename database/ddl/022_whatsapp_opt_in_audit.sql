-- Fase 1: origem e data da autorização de mensagens.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source TEXT;

CREATE INDEX IF NOT EXISTS contacts_whatsapp_opt_in_idx
  ON public.contacts (owner_id, whatsapp_opt_in, whatsapp_opt_in_at DESC);

COMMENT ON COLUMN public.contacts.whatsapp_opt_in_at IS 'Data e hora da última autorização de mensagens.';
COMMENT ON COLUMN public.contacts.whatsapp_opt_in_source IS 'Origem registrada da autorização ou revogação.';
