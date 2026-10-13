# Supabase / PostgreSQL

Os scripts desta pasta são a fonte versionada do schema de produção. O arquivo legado `supabase_schema.sql` foi mantido por compatibilidade e não deve ser aplicado em conjunto com os scripts desta pasta.

## Ordem de aplicação

1. `ddl/001_initial_schema.sql`
2. `ddl/002_security_rls.sql`
3. `ddl/003_message_jobs.sql`
4. `ddl/004_agent_processing.sql`
5. `ddl/005_cities_paraiba.sql`
6. `ddl/006_contact_city.sql`
7. `ddl/007_service_role_grants.sql`
8. `ddl/008_neighborhood_catalog_constraints.sql`
9. `ddl/009_phone_normalization.sql`
10. `ddl/010_whatsapp_connection.sql`
11. `ddl/011_whatsapp_disconnect_command.sql`
12. `ddl/012_media_jobs_and_opt_in.sql`
13. `ddl/013_conversations_and_media.sql`
14. `ddl/014_dashboard_metrics.sql`
15. `ddl/015_redis_message_queue.sql`
16. `ddl/016_audio_jobs.sql`
17. `ddl/017_messaging_policies.sql`
18. `ddl/018_service_role_grants_new_features.sql`
19. `ddl/019_dashboard_crm_filters.sql`
20. `ddl/020_service_history_audit.sql`
21. `ddl/021_media_storage_path.sql`
22. `ddl/022_whatsapp_opt_in_audit.sql`
23. `ddl/023_service_history_audit_and_message_quotes.sql`
24. `ddl/024_dashboard_activity_series.sql`
25. `ddl/025_birthday_automation_runs.sql`
26. `ddl/026_message_template_versions.sql`
27. `ddl/027_authenticated_read_grants.sql`
28. `ddl/028_fix_message_job_claim_uuid.sql`
29. `ddl/029_fix_service_history_audit_action.sql`
30. `ddl/030_grant_agent_message_job_functions.sql`
31. `ddl/031_whatsapp_chat_identity.sql`
32. `ddl/032_enforce_messaging_policy_on_claim.sql`
33. `ddl/033_fix_message_job_claim_uuid_after_policy.sql`

Execute os arquivos em uma sessão SQL do projeto Supabase, nesta ordem. Os scripts foram escritos para serem reaplicáveis quando possível, mas a aplicação deve ser validada primeiro em um projeto de homologação.

## Antes de aplicar o RLS

O script `002_security_rls.sql` adiciona `owner_id` às entidades protegidas. Registros existentes precisam ser associados a um usuário autenticado antes de a coluna ser tornada obrigatória. O script interrompe a aplicação se ainda houver registros sem proprietário.

Procedimento recomendado:

1. Criar o usuário administrador no Supabase Auth.
2. Aplicar a primeira parte do script em homologação.
3. Associar registros legados ao UUID do usuário administrador.
4. Confirmar que não há `owner_id` nulo.
5. Concluir a aplicação do script e validar as políticas com uma sessão autenticada.

O backend deverá usar o token do usuário para operações normais. A `service_role` fica restrita ao backend e nunca deve ser usada pelo frontend ou pelo agente WhatsApp.

## Validação mínima

- Usuário autenticado consegue consultar somente seus registros.
- Usuário sem autenticação não consegue consultar ou alterar dados protegidos.
- Inserções com `owner_id` de outro usuário são rejeitadas.
- Relações de histórico, etiquetas, lembretes e logs respeitam o proprietário do contato.
- O agente não acessa o banco diretamente.

## Backup e recuperação

O Supabase permanece como fonte persistente. Backups, retenção e restauração devem ser configurados e testados conforme os recursos disponíveis no plano contratado. O diretório de sessão do WhatsApp não substitui backup do banco.
