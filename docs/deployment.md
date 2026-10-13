# Deploy e publicação

## Frontend na Vercel

Importe o repositório na Vercel usando a raiz do projeto.

Configuração:

- Framework: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Node.js: 20 ou superior.

Variáveis de ambiente do frontend:

```text
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=chave-publicável-do-supabase
VITE_API_BASE_URL=https://api.seu-dominio.example/api/v1
```

Somente variáveis `VITE_*` necessárias à interface podem ser configuradas na Vercel. Nunca adicione `SUPABASE_SERVICE_ROLE_KEY` ou `AGENT_TOKEN` ao projeto frontend.

O arquivo `vercel.json` configura o fallback de rotas da SPA e alguns headers básicos de segurança.

## API local

A API é executada no PC local através do Docker Compose. Para que o frontend na Vercel a acesse, configure uma solução de túnel HTTPS com autenticação e URL estável.

O túnel deve encaminhar somente a porta da API local e não deve expor o banco, o Docker ou o agente WhatsApp. Configure no `.env.local`:

```text
CORS_ORIGINS=https://seu-projeto.vercel.app,https://seu-dominio-customizado.example
```

Valide `/health/live` e `/health/ready` externamente antes de apontar o frontend para a URL final.

## Supabase

Inclua também `database/ddl/032_enforce_messaging_policy_on_claim.sql` e `database/ddl/033_fix_message_job_claim_uuid_after_policy.sql` na sequência de migrations. A 032 impede que novos jobs sejam reivindicados quando o proprietário desativar os envios; a 033 corrige a geração do lease e preserva o caminho de mídia dos anexos.

1. Criar o projeto de homologação.
2. Aplicar todas as migrations `database/ddl/001_initial_schema.sql` até `033_fix_message_job_claim_uuid_after_policy.sql` em ordem.
3. Criar usuários no Supabase Auth.
4. Associar dados legados a `owner_id` antes de concluir o RLS.
5. Testar leitura e escrita com usuários diferentes.
6. Configurar backup e retenção conforme o plano contratado.

Após a migration 030, valide que as funções `complete_message_job`, `fail_message_job` e
`mark_message_job_uncertain` podem ser executadas pelo `service_role`. Enquanto essa migration
não for aplicada, a API mantém um fallback direto na tabela para não perder a confirmação da fila,
mas a auditoria de produção deve ser concluída com as funções protegidas habilitadas.

## Agente WhatsApp

O agente roda no mesmo Compose da API e usa a rede interna `api:4000`. O navegador não acessa diretamente o agente.

Em uma implantação de produção, defina `API_NODE_ENV=production` e `WHATSAPP_NODE_ENV=production`. Nesse modo, a API e o agente recusam valores de exemplo e exigem um `AGENT_TOKEN` exclusivo com pelo menos 32 caracteres.

Para trocar o token de autenticação do agente sem exibi-lo no terminal, execute em uma janela de manutenção:

Abra `rotacionar-token-radar.bat` na pasta do projeto ou execute:

```powershell
.\scripts\rotacionar-agent-token.ps1 -ConfirmRotation -RestartServices
```

O script altera somente a linha `AGENT_TOKEN` do `.env.local` e recria API/agente para invalidar o token anterior.

O volume `whatsapp_session` deve ser preservado durante atualizações. Remova-o somente quando for necessário refazer a autenticação por QR Code.

O procedimento de backup e restauração do banco está em [`docs/backup-restore.md`](./backup-restore.md). Nunca use a chave `SUPABASE_SERVICE_ROLE_KEY` como substituta da URL de conexão PostgreSQL.

## Ordem de validação

1. Health checks da API.
2. Login no frontend.
3. Consulta e criação de contato.
4. Criação de tarefa com contato que tenha consentimento.
5. Heartbeat do agente.
6. Reivindicação da tarefa.
7. Envio manual autorizado.
8. Confirmação e histórico da tarefa.
## Inicialização local segura

O `iniciar-radar-comunitario.bat` verifica o `AGENT_TOKEN` antes de subir os containers. Se o valor estiver ausente, curto ou for um placeholder, o inicializador gera automaticamente uma credencial aleatória forte no `.env.local`; um token já válido não é alterado. O valor nunca é exibido no terminal.
