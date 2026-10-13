-- Permissões necessárias para o backend usar a chave service_role.
-- O RLS continua ativo; o service_role é usado somente dentro da API.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
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
  public.agent_status
TO service_role;
