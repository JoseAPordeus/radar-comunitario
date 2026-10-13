# Desenvolvimento local

## Dependências

- Node.js 20 ou superior.
- npm.
- Docker Engine/CLI para API e agente (no Windows, o engine pode ser fornecido pelo Docker Desktop em segundo plano).
- Um projeto Supabase para homologação.

## Instalação

Na raiz do projeto:

```powershell
Copy-Item .env.example .env.local
npm install
```

Preencha pelo menos `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, `AGENT_ID` e `AGENT_TOKEN`.

Nunca versione `.env.local`.

## Frontend

```powershell
npm run dev
```

O frontend fica disponível em `http://localhost:3000`.

## API

```powershell
npm run dev --workspace @radar-comunitario/api
```

A API fica disponível em `http://localhost:4000`.

## Validações

```powershell
npm run lint
npm run lint:api
npm run build
npm run test:api
```

Os testes que dependem de Supabase, Docker, túnel ou WhatsApp precisam ser executados separadamente e registrados no relatório de release.

Para uma verificação rápida do ambiente Docker em execução, abra `validar-radar-comunitario.bat` na raiz do projeto.

## Banco

Execute as migrations em `database/ddl/` em ordem, primeiro em homologação. Não aplique o `supabase_schema.sql` legado em produção.

## WhatsApp

No Windows, use `scripts\\windows\\iniciar-whatsapp.bat`. O procedimento completo está em [windows-whatsapp.md](windows-whatsapp.md).
