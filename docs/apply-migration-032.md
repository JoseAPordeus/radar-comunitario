# Aplicação da migration 032

Esta migration impede que o agente reivindique novas tarefas enquanto a política de envios do proprietário estiver desativada. Tarefas que já estejam em `PROCESSANDO` não são interrompidas retroativamente.

No SQL Editor do projeto Supabase correto, execute o arquivo:

```text
database/ddl/032_enforce_messaging_policy_on_claim.sql
```

Depois valide que a função continua disponível para o `service_role`:

```sql
select has_function_privilege(
  'service_role',
  'public.claim_message_job(text, integer)',
  'execute'
) as claim_job_allowed;
```

O resultado esperado é `true`. A migration é reaplicável e não remove dados.

Também valide o marcador usado pelo inicializador:

```sql
select public.messaging_policy_claim_guard_ready() as policy_claim_guard_ready;
```

O resultado esperado é `true`.
