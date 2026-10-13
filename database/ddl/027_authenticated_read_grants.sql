-- Fase 8: permissao basica para consultas autenticadas, mantendo o isolamento por RLS.
-- A API continua sendo o caminho oficial para alteracoes; o papel authenticated
-- recebe somente SELECT para permitir leituras seguras e homologacao direta do RLS.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE
  public.cities,
  public.neighborhoods,
  public.labels,
  public.contacts,
  public.contact_labels,
  public.service_history,
  public.campaigns,
  public.reminders,
  public.message_templates,
  public.message_logs,
  public.automation_settings,
  public.message_jobs,
  public.conversations,
  public.conversation_messages,
  public.audio_jobs,
  public.messaging_policies,
  public.automation_runs,
  public.message_template_versions,
  public.service_history_audit
TO authenticated;
