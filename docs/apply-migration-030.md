# Aplicação da migration 030

Esta etapa habilita as confirmações transacionais da fila para o `service_role`. Ela deve ser executada no SQL Editor do projeto Supabase correto, depois das migrations 001 a 029.

## 1. Aplicar

Abra `database/ddl/030_grant_agent_message_job_functions.sql`, copie todo o conteúdo para uma nova consulta do SQL Editor e execute uma única vez.

O arquivo contém somente concessões de `EXECUTE` para estas funções públicas:

- `complete_message_job`
- `fail_message_job`
- `mark_message_job_uncertain`

Nenhuma tabela ou dado é removido por essa migration.

## 2. Verificar

Depois da execução, rode a consulta abaixo no mesmo projeto:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'complete_message_job',
    'fail_message_job',
    'mark_message_job_uncertain'
  )
  and grantee = 'service_role'
  and privilege_type = 'EXECUTE'
order by routine_name;
```

O resultado esperado contém três linhas, uma por função. Em seguida, execute `auditar-release-radar-comunitario.bat`; o item `Funções transacionais da fila` deve passar.

## Segurança

Não coloque a `SUPABASE_SERVICE_ROLE_KEY` no frontend, no SQL compartilhado ou em screenshots. A aplicação dessa migration não exige copiar nenhuma chave secreta para o editor, apenas executar o arquivo SQL no projeto correto.
