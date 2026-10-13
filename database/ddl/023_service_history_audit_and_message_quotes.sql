-- Fase 2: auditoria imutavel das anotacoes internas e mensagens citadas.

CREATE TABLE IF NOT EXISTS public.service_history_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_history_id UUID REFERENCES public.service_history(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  previous_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_history_audit_owner_created_idx
  ON public.service_history_audit (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS service_history_audit_history_idx
  ON public.service_history_audit (service_history_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_service_history_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
  v_owner_id UUID;
  v_actor_id UUID;
BEGIN
  v_contact_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.contact_id ELSE NEW.contact_id END;
  SELECT c.owner_id INTO v_owner_id FROM public.contacts c WHERE c.id = v_contact_id;
  v_actor_id := COALESCE(auth.uid(), CASE WHEN TG_OP = 'DELETE' THEN OLD.author_id ELSE NEW.author_id END);

  INSERT INTO public.service_history_audit (
    owner_id, service_history_id, contact_id, actor_id, action, previous_data, new_data
  ) VALUES (
    v_owner_id,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_contact_id,
    v_actor_id,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_history_audit_trigger ON public.service_history;
CREATE TRIGGER service_history_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.service_history
  FOR EACH ROW EXECUTE FUNCTION public.audit_service_history_change();

ALTER TABLE public.service_history_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_history_audit_owner_policy ON public.service_history_audit;
CREATE POLICY service_history_audit_owner_policy
  ON public.service_history_audit FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS quoted_whatsapp_message_id TEXT,
  ADD COLUMN IF NOT EXISTS quoted_content TEXT,
  ADD COLUMN IF NOT EXISTS sender_display_name TEXT;

CREATE INDEX IF NOT EXISTS conversation_messages_quoted_idx
  ON public.conversation_messages (conversation_id, quoted_whatsapp_message_id)
  WHERE quoted_whatsapp_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_history_audit TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_service_history_change() TO service_role;
