# Radar Comunitário — arquitetura e contratos

Status: proposta para validação antes da implementação.

## 1. Objetivo

Separar o sistema em três componentes independentes, preservando as funcionalidades atuais e centralizando regras de negócio no backend:

1. Frontend React/Vite hospedado na Vercel.
2. API Node.js/TypeScript executada localmente em Docker.
3. Agente WhatsApp Node.js executado localmente em Docker, utilizando `whatsapp-web.js`.

O Supabase/PostgreSQL será a fonte persistente dos dados. O frontend não acessará o Supabase diretamente após a migração.

## 2. Arquitetura de execução

```text
Navegador
   |
   | HTTPS + sessão do usuário
   v
Frontend na Vercel
   |
   | HTTPS + CORS restrito
   v
Túnel seguro para o PC local
   |
   v
API local em Docker
   |
   +--> Supabase PostgreSQL
   |
   +--> Fila persistente de mensagens
   |
   +<-- Polling autenticado do agente
             |
             v
       Agente WhatsApp
             |
             v
       whatsapp-web.js
```

O túnel deve encaminhar somente a API HTTPS. O microserviço WhatsApp não deve expor uma porta local diretamente à internet.

## 3. Responsabilidades

### Frontend

- Renderizar a interface e manter a identidade visual atual.
- Gerenciar sessão do usuário e permissões de interface.
- Validar formulários antes do envio.
- Consumir exclusivamente a API do backend.
- Exibir estados de carregamento, vazio, erro e indisponibilidade.
- Não armazenar `SUPABASE_SERVICE_ROLE_KEY`, credenciais do agente ou segredos.

### Backend

- Autenticar usuários e agentes autorizados.
- Aplicar autorização por operação.
- Validar e normalizar dados recebidos.
- Encapsular o acesso ao Supabase.
- Implementar contatos, etiquetas, histórico, templates e campanhas.
- Criar e administrar tarefas de envio.
- Registrar auditoria, erros e correlação das operações.
- Expor health check e métricas operacionais mínimas.

### Agente WhatsApp

- Inicializar e manter o cliente `whatsapp-web.js`.
- Solicitar QR Code quando não houver sessão válida.
- Persistir a sessão com `LocalAuth` em volume local.
- Consultar tarefas autorizadas no backend.
- Processar tarefas com concorrência configurável e conservadora.
- Confirmar sucesso, falha ou resultado incerto.
- Reconectar com espera progressiva.
- Nunca ser a fonte única do histórico ou das tarefas.

## 4. Autenticação e confiança

### Usuário do sistema

O frontend utilizará uma sessão de usuário. A API validará essa sessão em todas as rotas protegidas. A implementação concreta poderá utilizar Supabase Auth, desde que o token seja validado no backend e as permissões sejam aplicadas no servidor.

### Agente WhatsApp

O agente utilizará uma credencial própria, diferente da sessão de usuário e diferente da `service_role` do Supabase.

Requisitos da credencial:

- Armazenada somente em variável de ambiente local.
- Identificador próprio do agente.
- Revogável sem alterar usuários.
- Enviada em HTTPS.
- Nunca registrada em logs.
- Autorizada somente para consultar/reivindicar/confirmar tarefas e informar status.

O agente não receberá credenciais administrativas do Supabase.

## 5. Contrato HTTP da API

Prefixo: `/api/v1`

Formato padrão de sucesso:

```json
{
  "data": {},
  "requestId": "uuid"
}
```

Formato padrão de erro:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Os dados enviados são inválidos.",
    "details": []
  },
  "requestId": "uuid"
}
```

O campo `message` deve ser seguro para exibição. Stack traces, tokens, SQL e detalhes internos não devem ser retornados ao frontend.

### Health checks

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| GET | `/health/live` | Não | Processo está respondendo |
| GET | `/health/ready` | Não | API e dependências essenciais estão prontas |

### Sessão e usuário

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| GET | `/auth/me` | Usuário | Retornar usuário e permissões |

O login e a renovação de sessão ficam inicialmente delegados ao provedor de autenticação escolhido. A API deve validar o token recebido.

### Contatos

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| GET | `/contacts` | Usuário | Listar com busca, filtros, ordenação e paginação |
| POST | `/contacts` | Usuário | Criar contato |
| GET | `/contacts/:id` | Usuário | Consultar detalhes |
| PATCH | `/contacts/:id` | Usuário | Atualizar contato |
| DELETE | `/contacts/:id` | Usuário | Excluir contato conforme permissão |
| GET | `/contacts/:id/history` | Usuário | Listar histórico |
| POST | `/contacts/:id/history` | Usuário | Criar item de histórico |
| PATCH | `/contacts/:id/history/:historyId` | Usuário | Editar histórico |
| DELETE | `/contacts/:id/history/:historyId` | Usuário | Excluir histórico |

### Classificação e configuração

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| GET/POST | `/labels` | Usuário | Listar/criar etiquetas |
| PATCH/DELETE | `/labels/:id` | Usuário | Editar/excluir etiqueta |
| GET | `/neighborhoods` | Usuário | Listar bairros |
| GET/POST/PATCH/DELETE | `/message-templates` | Usuário | Gerenciar modelos |
| GET/PATCH | `/automation-settings/birthday` | Usuário autorizado | Consultar/alterar automação |

### Mensagens e fila

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| POST | `/messages/preview` | Usuário | Renderizar variáveis sem criar tarefa |
| POST | `/messages/jobs` | Usuário | Criar uma ou mais tarefas de envio |
| GET | `/messages/jobs` | Usuário | Consultar tarefas e filtros de status |
| POST | `/campaigns` | Usuário | Criar campanha e tarefas autorizadas |
| GET | `/campaigns` | Usuário | Listar campanhas |

### Operações do agente

Essas rotas aceitam somente a credencial do agente WhatsApp:

| Método | Rota | Finalidade |
| --- | --- | --- |
| POST | `/agent/heartbeat` | Informar presença e estado do agente |
| POST | `/agent/jobs/claim` | Reivindicar uma tarefa disponível |
| POST | `/agent/jobs/:id/success` | Confirmar envio |
| POST | `/agent/jobs/:id/failure` | Registrar falha processável |
| POST | `/agent/jobs/:id/uncertain` | Registrar resultado incerto |
| POST | `/agent/jobs/:id/cancel` | Cancelar tarefa ainda não processada |

Uma tarefa só pode ser reivindicada uma vez por vez. A reivindicação deve possuir expiração/lease para recuperação após queda do agente.

## 6. Estados da fila

```text
PENDENTE --> PROCESSANDO --> ENVIADO
                    |------> ERRO
                    |------> INCERTO
PENDENTE ----------> CANCELADO
ERRO ---------------> PENDENTE   (somente por reprocessamento autorizado)
```

Regras:

- Cada tarefa possui identificador único e `correlationId`.
- O backend controla `attempts` e `maxAttempts`.
- Uma tarefa em `PROCESSANDO` expira após um timeout configurável.
- O reprocessamento nunca deve ser feito cegamente quando o resultado anterior for `INCERTO`.
- O frontend consulta o estado persistido; não mantém a fila como estado local.
- A confirmação deve ser idempotente: repetir a mesma confirmação não pode criar outro envio.

## 7. Dados que permanecem no Supabase

As tabelas atuais são o ponto de partida:

- `contacts`
- `neighborhoods`
- `labels`
- `contact_labels`
- `service_history`
- `campaigns`
- `reminders`
- `message_templates`
- `message_logs`
- `automation_settings`

Antes de criar novas tabelas, será feita uma revisão do modelo. A fila deverá ser adicionada somente se a estrutura atual não puder representar, com segurança, reivindicação, tentativas, lease, correlação e resultado incerto.

## 8. Decisões operacionais

- O PC local precisa permanecer ligado para a API local e o agente processarem tarefas.
- Se o PC estiver desligado, o frontend poderá continuar acessível, mas operações que dependem da API local ou do WhatsApp ficarão indisponíveis.
- O Supabase continuará preservando os dados durante reinicializações do frontend, backend ou PC.
- A sessão do WhatsApp ficará em volume Docker persistente e fora do Git.
- QR Code, cookies, tokens e conteúdo sensível não serão registrados em logs.
- O uso de `whatsapp-web.js` é não oficial e não oferece garantia de disponibilidade, entrega ou ausência de bloqueio.

## 9. Critérios de aceite desta etapa

- A arquitetura proposta está documentada.
- As responsabilidades dos três componentes estão separadas.
- O fluxo de autenticação está definido.
- Os endpoints principais possuem contrato inicial.
- A fila possui estados e regras de idempotência definidos.
- A dependência operacional do PC local está explícita.
- Nenhum código de produção, DDL ou configuração foi alterado nesta etapa.

## 10. Próxima etapa

Após a aprovação deste documento, a próxima task será a preparação da estrutura do repositório e dos contratos compartilhados, sem ainda migrar todas as telas nem alterar o schema de produção.
