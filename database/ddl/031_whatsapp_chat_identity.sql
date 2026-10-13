-- Fase 2: preserva o identificador real do chat WhatsApp Web.
-- Necessário para associar eventos @lid a contatos já cadastrados no CRM.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_chat_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_whatsapp_chat_id_idx
  ON public.contacts (owner_id, whatsapp_chat_id)
  WHERE whatsapp_chat_id IS NOT NULL AND btrim(whatsapp_chat_id) <> '';

CREATE INDEX IF NOT EXISTS contacts_whatsapp_chat_id_idx
  ON public.contacts (whatsapp_chat_id)
  WHERE whatsapp_chat_id IS NOT NULL;

COMMENT ON COLUMN public.contacts.whatsapp_chat_id IS
  'Identificador serializado do contato no WhatsApp Web, incluindo IDs @c.us ou @lid.';
