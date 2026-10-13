# Checklist final de release

## Código

- [x] `npm install` executado com sucesso dentro dos builds Docker.
- [x] `npm run lint` validado com `tsc --noEmit` no container do frontend.
- [x] `npm run lint:api` validado pelo build TypeScript da API.
- [x] `npm run build` executado com sucesso.
- [x] `npm run build:api` executado com sucesso.
- [x] `npm run build:whatsapp` executado com sucesso.
- [x] `npm run test:api` executado com sucesso: 4 arquivos e 16 testes.
- [x] `npm run test:whatsapp` executado com sucesso: 6 testes do worker.
- [x] Validações de MIME e assinatura real para imagens, documentos e áudios executadas dentro da imagem Docker.
- [x] Dependências auditadas; riscos transitivos do agente permanecem documentados.

## Banco

- [ ] Migration 032 (`claim_message_job` respeitando `messaging_policies.enabled`) aplicada e validada no Supabase. Procedimento: `docs/apply-migration-032.md`.
- [ ] Migration 033 (`claim_message_job` usando `gen_random_uuid()` e retornando o caminho de mídia) aplicada e validada no Supabase.

- [ ] Migration 031 (`whatsapp_chat_id` para vincular chats `@lid` aos contatos) aplicada e validada no Supabase.

- [x] Migrations 001–029 aplicadas em projeto novo, ou 012–029 em banco legado previamente validado; prontidão das funcionalidades confirmada.
- [x] Migration 027 (`authenticated` read grants) aplicada no Supabase e homologação RLS autenticada aprovada.
- [ ] Migration 030 (`service_role` grants das funções de confirmação da fila) aplicada e validada no Supabase. Procedimento: `docs/apply-migration-030.md`.
- [x] RLS validado com usuário autenticado.
- [x] Auditoria estatica de RLS e funcoes protegidas executada pelo script de release.
- [x] Homologação autenticada de RLS com dois usuários executada por `homologar-rls-radar-comunitario.bat` após a migration 027.
- [ ] Dados legados associados a `owner_id`.
- [ ] Fila e funções transacionais validadas.
- [x] Backup e restauração testados em PostgreSQL descartável no Docker; dump criado, tabela removida e registro recuperado com sucesso. O backup do Supabase de produção ainda depende de `RADAR_DATABASE_URL`.

## Frontend e API

- [ ] Variáveis da Vercel configuradas sem segredos administrativos.
- [ ] `VITE_API_BASE_URL` aponta para HTTPS.
- [ ] CORS permite somente domínios aprovados.
- [x] Health checks respondem corretamente nos estados `live`, `ready` e `data-ready` (o último bloqueia corretamente enquanto faltam migrações).
- [ ] Auditoria local de release concluída sem pendências; a execução atual detecta a ausência da migration 030 nas funções transacionais da fila.
- [x] Estados de erro, carregamento e indisponibilidade validados no frontend, inicializador e health checks locais.
- [ ] Túnel HTTPS protegido e monitorado.

## Homologacao automatizada

- [x] Smoke test seguro em `homologar-radar-comunitario.bat`; a etapa autenticada usa token temporario e nao cria jobs.
- [x] Homologação autenticada de CRM, Dashboard, WhatsApp, fila, bloqueios de consentimento e upload privado de imagem/PDF executada por `homologar-api-radar-comunitario.bat`, sem envio real.
- [x] Tela de Conversas validada com dados reais sincronizados pelo agente: contato, telefone, mensagens persistidas, mídia privada e fallback de avatar.

## Acompanhamento de envios

- [x] A tela acompanha os jobs do lote por atÃ© 5 minutos e permite voltar ao painel sem cancelar a fila.
- [ ] Executar um envio real em homologaÃ§Ã£o com contato autorizado e confirmar o resultado no WhatsApp.

## Desempenho do frontend

- [x] GrÃ¡ficos do Dashboard separados em chunk carregado sob demanda; build Docker validado sem erro.

## Otimizacao de E/S do Supabase

- [x] Heartbeat do agente otimizado: grava no Supabase apenas em mudanca de estado, QR/telefone novo ou janela de 30 segundos.
- [x] Polling operacional reduzido para 10 segundos no agente e 15 segundos no painel de configuracao.
- [ ] Monitorar Database Health/Database Insights do Supabase apos a mudanca e investigar consultas fora do padrao.

## WhatsApp

- [ ] `AGENT_TOKEN` exclusivo e rotacionável.
- [ ] QR Code autenticado manualmente.
- [x] Logout do WhatsApp recria a instÃ¢ncia do agente e disponibiliza um novo QR Code.
- [ ] Sessão persistente após reinício.
- [x] Heartbeat recebido pelo backend; os logs atuais registram respostas HTTP 200 em `/heartbeat`.
- [ ] Tarefa reivindicada e confirmada.
- [x] Falha e resultado incerto registrados na máquina de estados, no agente e na reconciliação de leases.
- [x] Consentimento e opt-out verificados pela homologação automatizada, sem envio real.

## Operação

- [ ] PC configurado para não suspender durante o processamento.
- [x] Docker Engine/CLI configurado para iniciar pelo inicializador Windows conforme a política local.
- [x] Logs e procedimento de recuperação documentados em `docs/deployment.md`, `docs/backup-restore.md` e nos scripts de diagnóstico.
- [x] Limitações do WhatsApp Web comunicadas em `docs/security-checklist.md` e `docs/implementation-plan.md`.
