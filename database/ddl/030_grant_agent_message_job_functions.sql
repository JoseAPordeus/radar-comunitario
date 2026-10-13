-- Fase 7: o agente precisa confirmar sucesso, falha e resultado incerto.
-- Algumas execuções antigas revogaram PUBLIC, mas não concederam novamente
-- essas funções ao service_role. O backend possui fallback direto, porém esta
-- migração restaura o caminho transacional preferencial no Supabase.

GRANT EXECUTE ON FUNCTION public.complete_message_job(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_message_job(UUID, TEXT, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_message_job_uncertain(UUID, TEXT, UUID, TEXT) TO service_role;
