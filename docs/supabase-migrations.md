# Migrações do Radar Comunitário

 No Supabase, abra o SQL Editor e execute os arquivos abaixo, um por vez e nesta ordem. Em um projeto novo, aplique a sequência completa `001` até `033`; a lista abaixo começa em `012` somente para ambientes que já possuem `001` até `011` aplicadas e validadas:

1. `database/ddl/012_media_jobs_and_opt_in.sql`
2. `database/ddl/013_conversations_and_media.sql`
3. `database/ddl/014_dashboard_metrics.sql`
4. `database/ddl/015_redis_message_queue.sql`
5. `database/ddl/016_audio_jobs.sql`
6. `database/ddl/017_messaging_policies.sql`
7. `database/ddl/018_service_role_grants_new_features.sql`
8. `database/ddl/019_dashboard_crm_filters.sql`
9. `database/ddl/020_service_history_audit.sql`
10. `database/ddl/021_media_storage_path.sql`
11. `database/ddl/022_whatsapp_opt_in_audit.sql`
12. `database/ddl/023_service_history_audit_and_message_quotes.sql`
13. `database/ddl/024_dashboard_activity_series.sql`
14. `database/ddl/025_birthday_automation_runs.sql`
15. `database/ddl/026_message_template_versions.sql`
16. `database/ddl/027_authenticated_read_grants.sql`
17. `database/ddl/028_fix_message_job_claim_uuid.sql`
18. `database/ddl/029_fix_service_history_audit_action.sql`
19. `database/ddl/030_grant_agent_message_job_functions.sql`
20. `database/ddl/031_whatsapp_chat_identity.sql`
21. `database/ddl/032_enforce_messaging_policy_on_claim.sql`
22. `database/ddl/033_fix_message_job_claim_uuid_after_policy.sql`

Ao final, confirme no editor que não houve erro. O backend já está preparado para usar Redis, mas as tabelas, funções e o bucket privados dependem dessas migrações.

As chaves do Supabase devem ficar somente em `.env.local`/servidor. Como uma chave secreta foi compartilhada durante a configuração, gere uma nova chave no painel do Supabase depois dos testes.
