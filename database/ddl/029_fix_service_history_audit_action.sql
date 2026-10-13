-- Fase 7: alinhar os valores do trigger de auditoria ao check constraint.
-- TG_OP retorna INSERT, mas a tabela de auditoria aceita CREATE.

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
  v_action TEXT;
BEGIN
  v_contact_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.contact_id ELSE NEW.contact_id END;
  SELECT c.owner_id INTO v_owner_id FROM public.contacts c WHERE c.id = v_contact_id;
  v_actor_id := COALESCE(auth.uid(), CASE WHEN TG_OP = 'DELETE' THEN OLD.author_id ELSE NEW.author_id END);
  v_action := CASE WHEN TG_OP = 'INSERT' THEN 'CREATE' ELSE TG_OP END;

  INSERT INTO public.service_history_audit (
    owner_id, service_history_id, contact_id, actor_id, action, previous_data, new_data
  ) VALUES (
    v_owner_id,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_contact_id,
    v_actor_id,
    v_action,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_service_history_change() TO service_role;
