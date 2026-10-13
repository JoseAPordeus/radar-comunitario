# API local

A API usa Node.js, TypeScript, Express, Zod e Supabase. Ela deve ser executada somente com credenciais de servidor; o `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser enviado ao frontend.

## Configuração mínima

Copie o `.env.example` para um arquivo local e preencha:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=chave-apenas-do-servidor
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Execução planejada

Após instalar as dependências do workspace:

```powershell
npm run dev --workspace @radar-comunitario/api
```

A API escuta por padrão em `http://localhost:4000`.

## Rotas implementadas nesta etapa

- `GET /health/live`
- `GET /health/ready`
- `GET /health/data-ready`
- `GET /api/v1/auth/me`
- `GET|POST /api/v1/contacts`
- `GET|PATCH|DELETE /api/v1/contacts/:id`
- `GET|POST /api/v1/contacts/:id/history`
- `PATCH|DELETE /api/v1/contacts/:id/history/:historyId`
- `POST /api/v1/contacts/:id/labels`
- `DELETE /api/v1/contacts/:id/labels/:labelId`
- `GET|POST /api/v1/labels`
- `PATCH|DELETE /api/v1/labels/:id`
- `GET /api/v1/neighborhoods`
- `GET|POST|PATCH|DELETE /api/v1/message-templates`
- `GET|PATCH /api/v1/automation-settings/birthday`
- `POST /api/v1/message-jobs`
- `POST /api/v1/message-jobs/preview`
- `POST /api/v1/agent/heartbeat`
- `POST /api/v1/agent/jobs/claim`
- `POST /api/v1/agent/jobs/:id/success`
- `POST /api/v1/agent/jobs/:id/failure`
- `POST /api/v1/agent/jobs/:id/uncertain`
- `GET /api/v1/conversations`
- `PATCH /api/v1/conversations/:id`
- `GET /api/v1/conversations/:id/messages`
- `GET /api/v1/team`
- `GET /api/v1/analytics/dashboard`
- `GET /api/v1/message-jobs/metrics`
- `POST /api/v1/media`
- `POST /api/v1/audio`

As rotas protegidas exigem `Authorization: Bearer <token-do-usuário>`.

## Operação e limites

- A API usa o `service_role` internamente, mas aplica `owner_id` explicitamente nas consultas.
- O endpoint `/health/data-ready` valida as tabelas, colunas, função de dashboard e permissões necessárias para liberar o painel.
- O envio em massa exige consentimento explícito, respeita horário comercial e limite diário configurável; não há mecanismo de evasão de bloqueios.
- As rotas do agente exigem `Authorization: Bearer <AGENT_TOKEN>` e o header `x-agent-id`.
- A execução local não foi marcada como validada enquanto as dependências não forem instaladas e o Supabase não estiver configurado.
