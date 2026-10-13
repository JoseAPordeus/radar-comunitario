# Aplicação da migration 033

Esta migration corrige a reivindicação da fila depois da 032. Ela é necessária quando o banco retorna `function uuid_generate_v4() does not exist` no endpoint `/api/v1/agent/jobs/claim`.

No Supabase:

1. Abra o **SQL Editor** do projeto correto.
2. Execute `database/ddl/033_fix_message_job_claim_uuid_after_policy.sql` inteiro.
3. Reinicie o agente WhatsApp ou aguarde o próximo ciclo de polling.
4. Confirme `GET http://localhost:4000/health/data-ready` com HTTP 200.

A migration usa `gen_random_uuid()`, preserva `media_storage_path` para anexos e atualiza o marcador de prontidão para validar o corpo real da função.
