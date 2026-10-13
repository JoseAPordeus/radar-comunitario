-- Fase 7: recebimento e transcrição segura de áudios enviados pelo usuário.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-media', 'message-media', FALSE, 15728640, ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword',
  'application/vnd.ms-excel','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','audio/ogg','audio/mpeg','audio/wav','audio/mp4','audio/webm'
])
ON CONFLICT (id) DO UPDATE SET allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.audio_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','PROCESSANDO','CONCLUIDO','ERRO')),
  transcript TEXT,
  intent JSONB,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audio_jobs_owner_created_idx ON public.audio_jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audio_jobs_pending_idx ON public.audio_jobs (status, created_at) WHERE status IN ('PENDENTE','PROCESSANDO');
ALTER TABLE public.audio_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audio_jobs_owner_policy ON public.audio_jobs;
CREATE POLICY audio_jobs_owner_policy ON public.audio_jobs FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
