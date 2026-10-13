-- Fase 5: histórico imutável das versões dos modelos de mensagem.

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_version_positive;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_version_positive CHECK (version > 0);

CREATE TABLE IF NOT EXISTS public.message_template_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES public.message_templates(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ANIVERSARIO', 'CAMPANHA')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version)
);

INSERT INTO public.message_template_versions (template_id, owner_id, version, title, content, type, is_active, created_at)
SELECT id, owner_id, version, title, content, type, is_active, created_at
FROM public.message_templates
ON CONFLICT (template_id, version) DO NOTHING;

CREATE INDEX IF NOT EXISTS message_template_versions_owner_idx
  ON public.message_template_versions (owner_id, template_id, version DESC);

ALTER TABLE public.message_template_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_template_versions_owner_policy ON public.message_template_versions;
CREATE POLICY message_template_versions_owner_policy ON public.message_template_versions
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_template_versions TO service_role;
