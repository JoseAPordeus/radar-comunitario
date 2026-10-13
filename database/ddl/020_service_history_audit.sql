-- Fase 2: anotações internas com autoria e rastreabilidade de edição.

ALTER TABLE public.service_history
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS service_history_author_created_idx
  ON public.service_history (author_id, created_at DESC);

COMMENT ON COLUMN public.service_history.author_id IS 'Usuário que criou a anotação interna.';
COMMENT ON COLUMN public.service_history.updated_at IS 'Última alteração da anotação interna.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_history TO service_role;
