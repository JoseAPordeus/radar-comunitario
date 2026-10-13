# Operação local no Windows

## Pré-requisitos

- Windows com Docker Engine/CLI instalado e iniciado; no Windows, o engine pode ser fornecido pelo Docker Desktop minimizado.
- Conta autorizada do WhatsApp no celular.
- Projeto Supabase configurado.
- Migrations `001_initial_schema.sql` até `027_authenticated_read_grants.sql` aplicadas na ordem correta.

## Configuração inicial

Na raiz do projeto:

```powershell
Copy-Item .env.example .env.local
```

Preencha `.env.local` com valores locais reais:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=chave-apenas-do-backend
AGENT_ID=whatsapp-local-01
AGENT_TOKEN=token-longo-gerado-e-revogavel
```

Não versione `.env.local`. A `SUPABASE_SERVICE_ROLE_KEY` não deve ser usada pelo frontend nem pelo agente.

## Primeira inicialização

Execute na área de trabalho:

```text
iniciar-radar-comunitario.bat
```

O script verifica o ambiente, inicia o Docker quando necessário, constrói as imagens, sobe API, Redis, agente e interface web e abre o painel automaticamente somente depois que o health check de dados estiver pronto. Se alguma migration estiver pendente, o terminal mostra qual dependência está aguardando. Na primeira execução, o QR Code ficará disponível no painel de Configuração. No WhatsApp do celular, abra **Dispositivos conectados** e escaneie o QR Code.

Depois da autenticação, os dados da sessão ficam no volume Docker `whatsapp_session` e não precisam ser autenticados novamente a cada reinício.

## Operações comuns

Ver status:

```powershell
docker compose --env-file .env.local ps
```

Ver logs:

```powershell
docker compose --env-file .env.local logs -f whatsapp-agent
docker compose --env-file .env.local logs -f api
```

Parar:

```powershell
docker compose --env-file .env.local down
```

Atualizar código e imagens:

```powershell
docker compose --env-file .env.local up -d --build api whatsapp-agent
```

## Recuperação

Se o agente desconectar, verifique a internet, o estado do celular e os logs. O worker tenta continuar o polling e a sessão persistida será reutilizada.

Para limpar somente uma sessão corrompida, confirme que o agente está parado e remova o volume explicitamente:

```powershell
docker compose --env-file .env.local down
docker volume rm radar-comunitario_whatsapp_session
```

Essa operação exige novo QR Code e não deve ser usada como procedimento normal.

## Limitações operacionais

- O PC precisa permanecer ligado e conectado à internet.
- A API local fica indisponível quando o PC ou o Docker Engine está desligado.
- O WhatsApp Web pode desconectar ou alterar seu comportamento.
- `whatsapp-web.js` não é uma API oficial da Meta e não fornece garantia de entrega.
