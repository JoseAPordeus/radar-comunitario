-- Fase 2/4: conversas recebidas e bucket privado para anexos.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-media', 'message-media', FALSE, 15728640, ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PENDING','CLOSED')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL, last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (owner_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  whatsapp_message_id TEXT NOT NULL, direction TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  message_type TEXT NOT NULL DEFAULT 'chat', content TEXT NOT NULL DEFAULT '', media_url TEXT, media_mime_type TEXT,
  sender_phone TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (owner_id, whatsapp_message_id)
);

CREATE INDEX IF NOT EXISTS conversations_owner_last_message_idx ON public.conversations (owner_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversation_messages_conversation_created_idx ON public.conversation_messages (conversation_id, created_at);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_owner_policy ON public.conversations;
CREATE POLICY conversations_owner_policy ON public.conversations FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS conversation_messages_owner_policy ON public.conversation_messages;
CREATE POLICY conversation_messages_owner_policy ON public.conversation_messages FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
