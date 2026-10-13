-- Fase de publicação: o backend usa service_role para operações autenticadas do CRM.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_policies TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID) TO service_role;
