# Radar Comunitário

CRM comunitário com frontend React/Vite, API Node.js/Express, Supabase/PostgreSQL e agente local de WhatsApp Web.

## Componentes

- `src/`: frontend atual, preparado para publicação na Vercel.
- `apps/api/`: API e regras de negócio.
- `apps/whatsapp/`: agente local com `whatsapp-web.js`.
- `packages/contracts/`: contratos compartilhados.
- `database/ddl/`: scripts SQL versionados.
- `docs/`: arquitetura, operação e publicação.

## Desenvolvimento rápido

1. Copie `.env.example` para `.env.local` e preencha as variáveis locais sem versionar o arquivo.
2. Execute `iniciar-radar-comunitario.bat` na Área de Trabalho.
3. Aguarde a mensagem de sistema pronto; o navegador será aberto automaticamente.

Consulte [docs/local-development.md](docs/local-development.md) para o fluxo completo.

## Operação para usuário não técnico

Use `iniciar-radar-comunitario.bat` na Área de Trabalho. Ele inicia o ambiente necessário, aguarda a API, Redis, agente WhatsApp, dependências do banco e interface web e abre `http://localhost:3000` automaticamente. Para encerrar, use `encerrar-radar-comunitario.bat`.

Antes do primeiro uso dos módulos de CRM, mídia, fila, áudio e proteção de envios, execute em ordem as migrações descritas em [docs/supabase-migrations.md](docs/supabase-migrations.md).

Se precisar verificar o ambiente sem interpretar logs, abra `validar-radar-comunitario.bat`. Ele mostra, em linguagem simples, quais serviços, dados, painel e conexão do WhatsApp estão prontos.

Para uma checagem de release mais completa, abra `auditar-release-radar-comunitario.bat`. O relatório verifica Compose, health, autenticação, CORS e a ausência de segredos administrativos no frontend sem imprimir tokens ou chaves.

Depois de aplicar todas as migrations, use `homologar-rls-radar-comunitario.bat` para validar o isolamento com dois usuários temporários. O teste remove automaticamente os usuários e o contato criado para homologação.

Para validar as rotas autenticadas sem enviar mensagens, use `homologar-api-radar-comunitario.bat`. Ele cria dados temporários, testa CRM, Dashboard, WhatsApp, fila e consentimento, e remove tudo ao terminar.

## Publicação

O frontend é publicado na Vercel. A API continua executando no PC local e deve ser disponibilizada ao frontend por uma URL HTTPS protegida, com CORS configurado para o domínio da Vercel.

Consulte [docs/deployment.md](docs/deployment.md) e [docs/security-checklist.md](docs/security-checklist.md).

### Variaveis obrigatorias em producao

Preencha o `.env.local` (ou o secret manager do ambiente) com `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_API_BASE_URL`, `CORS_ORIGINS`, `REDIS_URL`, `AGENT_ID`, `AGENT_TOKEN` e `AGENT_API_URL`. Para audio, configure tambem `GEMINI_API_KEY` e `GEMINI_MODEL` quando a transcricao estiver habilitada. O `AGENT_TOKEN` deve ter no minimo 32 caracteres e nunca deve ser publicado no frontend.

Em producao, use `API_NODE_ENV=production`, `WHATSAPP_NODE_ENV=production`, URLs HTTPS em `CORS_ORIGINS`, `SUPABASE_URL` e `VITE_API_BASE_URL`, alem de configurar `WHATSAPP_SESSION_PATH`, `WHATSAPP_CLIENT_ID`, `WHATSAPP_HEADLESS`, `CHROMIUM_PATH`, `WHATSAPP_MEDIA_MAX_BYTES`, `WHATSAPP_SEND_TIMEOUT_MS` e `WHATSAPP_RECONNECT_DELAY_MS` conforme a infraestrutura.

## Limitações conhecidas

- A API local depende do PC e do Docker Engine ligado; no Windows, o engine costuma ser fornecido pelo Docker Desktop, que pode permanecer minimizado.
- O agente depende de uma sessão válida do WhatsApp Web.
- `whatsapp-web.js` não é uma API oficial da Meta.
- O inicializador não abre o painel enquanto as migrações obrigatórias do Supabase não estiverem disponíveis.
- O fluxo real de envio depende de credenciais, consentimento do contato e serviços externos configurados.
