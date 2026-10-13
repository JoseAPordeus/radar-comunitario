# Plano de implementação — Radar Comunitário

## Objetivo

Evoluir o MVP para um CRM de atendimento via WhatsApp com dados reais, fila auditável, suporte a mídias, automações controladas e operação simples no Windows.

## Fases e critérios de aceite

### Fase 1 — Base segura e observável

- [x] Exigir `whatsapp_opt_in` antes de criar uma tarefa de envio.
- [x] Impedir que a função transacional retire da fila contatos bloqueados ou sem consentimento.
- [x] Expor consulta paginada de `message_jobs`.
- [x] Registrar mídia como parte da mesma tarefa de envio.
- [x] Aumentar o timeout do protocolo do Chromium e recuperar o agente após falha inesperada.
- [x] Aplicar `database/ddl/012_media_jobs_and_opt_in.sql` no Supabase.
- [x] Validar contato sem opt-in, contato bloqueado e job com mídia em teste integrado com usuário autenticado e agente.

Critério: nenhuma mensagem é enviada sem consentimento; toda tarefa pode ser acompanhada por status; a API e o agente recompilam sem erro.

### Fase 2 — Conversas e CRM de atendimento

- [x] Criar `conversations` e `conversation_messages`.
- [x] Sincronizar mensagens históricas e atualizar periodicamente nomes, fotos disponíveis e novas mensagens do WhatsApp Web.
- [x] Persistir mensagens recebidas pelo evento `message` do agente.
- [x] Registrar direção, tipo, remetente, mensagem citada, status e timestamps.
- [x] Associar conversa ao contato, cidade, bairro, etiquetas e atendente.
- [x] Transformar `notes` em anotações internas vinculadas ao contato e ao histórico de atendimento.
- [x] Implementar assuntos/pautas por meio do campo de assunto da conversa.
- [x] Adicionar filtros por cidade, bairro, assunto, status e responsável nas conversas e no dashboard.
- [x] Permitir resposta direta pela conversa, com texto, imagem ou documento entrando na fila auditável.
- [x] Tratar equivalência entre telefone móvel com e sem o nono dígito, inclusive para não sincronizar a própria conta como contato.

Critério: o atendente consegue abrir um contato e visualizar a conversa completa, notas internas e histórico sem depender dos logs do container.

### Fase 3 — Dashboard real

- [x] Criar endpoints agregados no backend para totais, séries temporais, bairros, etiquetas e status.
- [x] Remover valores fixos do componente `Dashboard`.
- [x] Remover a limitação de apenas 100 contatos para indicadores.
- [x] Adicionar filtros por período, cidade, bairro, atendente, assunto e etiqueta.
- [x] Usar índices e, quando necessário, views/materialized views no PostgreSQL.
- [x] Exibir estado de carregamento, atualização da consulta e data da última sincronização.

Critério: cada número e gráfico exibido pode ser conferido contra uma consulta do banco para o mesmo período e filtros.

### Fase 4 — Imagens e documentos

#### Backend e armazenamento

- [x] Criar bucket privado `message-media` no Supabase Storage.
- [x] Criar endpoint autenticado de upload com limite de tamanho.
- [x] Gerar URL assinada com expiração curta; não aceitar caminho arbitrário do computador do usuário.
- [x] Validar MIME real, extensão, tamanho e nome do arquivo.
- [x] Permitir imagens JPEG, PNG, WebP e GIF.
- [x] Permitir documentos PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV e TXT.
- [x] Armazenar metadados no job e no histórico da conversa.

#### Agente WhatsApp

- [x] Baixar a mídia somente pela URL HTTPS assinada.
- [x] Impor limite de bytes antes de enviar.
- [x] Criar `MessageMedia` no agente.
- [x] Enviar imagem com legenda e documento com nome de arquivo.
- [x] Registrar erro de MIME, tamanho, download, upload ou envio.
- [x] Não permitir conteúdo executável ou tipos não autorizados.

#### Frontend

- [x] Adicionar seletor de imagem/documento na tela de mensagem.
- [x] Mostrar pré-visualização de imagem.
- [x] Mostrar nome, tamanho e tipo do documento.
- [x] Permitir legenda opcional.
- [x] Exibir progresso separado de upload e envio.
- [x] Permitir remover o anexo antes de criar a campanha.
- [x] Permitir anexos também na resposta direta de uma conversa.

Critério: usuário seleciona uma imagem ou documento, o sistema faz upload, cria a tarefa, envia pelo WhatsApp e mantém o registro no histórico.

### Fase 5 — Aniversários e automações

- [x] Retirar a execução de aniversário do login do frontend.
- [x] Criar scheduler no backend ou worker dedicado.
- [x] Aplicar opt-in, bloqueio, horário permitido e deduplicação por data.
- [x] Criar templates versionados.
- [x] Permitir simulação/preview antes de ativar.
- [x] Registrar cada execução e motivo de não envio.

Critério: a automação executa uma vez por dia, é idempotente e não depende de o navegador estar aberto.

### Fase 6 — Fila robusta

- [x] Manter `message_jobs` como fonte de auditoria.
- [x] Adicionar Redis e BullMQ para distribuição de trabalho.
- [x] Separar criação, processamento e confirmação.
- [x] Implementar retry com backoff, dead-letter queue e idempotência.
- [x] Criar cancelamento de campanha e controle global pela política de envio.
- [x] Expor métricas de pendentes, processando, enviados, erros e incertos.
- [x] Reconciliar jobs pendentes após reinício da API ou perda do conteúdo transitório do Redis.
- [x] Exigir confirmação humana antes de reprocessar um resultado `INCERTO`.

Os intervalos devem ser usados para controle operacional e respeito ao usuário, nunca como tentativa de burlar detecção ou políticas da plataforma.

Critério: queda do agente não perde tarefas; a tarefa pode ser retomada ou marcada como incerta sem duplicação silenciosa.

### Fase 7 — Áudio e comandos por voz

- [x] Receber áudio e salvar no Storage privado.
- [x] Criar job de transcrição.
- [x] Normalizar OGG/Opus para o formato exigido pelo provedor.
- [x] Mostrar transcrição e estado `recebido`, `transcrevendo`, `concluído` ou `erro`.
- [x] Separar transcrição de interpretação de comando.
- [x] Exigir confirmação para enviar mensagens, editar contatos ou iniciar campanhas.
- [x] Definir retenção e exclusão dos arquivos de áudio (`AUDIO_RETENTION_DAYS`, padrão de 30 dias).
- [x] Limpar uploads órfãos, limitar tempo de processamento e repetir falhas transitórias com limite (`AUDIO_MAX_ATTEMPTS`).

Critério: áudio recebido vira texto rastreável, com confirmação humana para ações que alteram dados ou disparam mensagens.

### Fase 8 — Produção e operação

- Trocar `whatsapp-web.js` pela WhatsApp Business Platform/Cloud API quando houver necessidade de produção.
- Criar webhook HTTPS para mensagens recebidas e eventos de entrega.
- Manter o agente local apenas como modo piloto ou compatibilidade.
- Adicionar logs estruturados, métricas, alertas e correlação por request/job.
- Executar auditoria de dependências e corrigir vulnerabilidades.
- Documentar backup, recuperação, atualização e encerramento no Windows.

## Status desta implementação

As fases 1 a 7 já possuem implementação no código: opt-in e bloqueios, conversas persistidas, dashboard agregado, anexos privados, scheduler de aniversários, Redis/BullMQ, política de horário/limite, transcrição de áudio com confirmação humana e versões de modelos. As migrações `012` até `033` estão versionadas; o banco precisa estar com a sequência aplicada para habilitar as confirmações transacionais da fila, o vínculo persistente entre contatos do CRM e chats `@lid` e a reivindicação segura de jobs.

A proteção operacional implementada usa consentimento, limite diário, intervalo mínimo/máximo, horário comercial, retry e auditoria. Não foi implementada variação de texto ou mecanismo para burlar detecção/bloqueios da plataforma; o modo recomendado continua sendo a WhatsApp Business Platform oficial quando o sistema sair do piloto local.

## Atualizacao da auditoria

- CRM de conversas, notas e historico: implementado no frontend e na API, com sincronização histórica/recorrente do agente e fallback visual quando o WhatsApp não fornece avatar.
- Dashboard: implementado com dados agregados e filtros por periodo, cidade, bairro, etiqueta, assunto, status e atendente. A migracao 019 adiciona o campo de assunto e a funcao agregada compativel.
- Midia: upload privado, URL assinada, imagens e documentos com limite e MIME permitido.
- Midia recebida: o agente baixa anexos do WhatsApp, armazena no bucket privado e a conversa exibe imagem ou link protegido.
- Dashboard: agregados reais de bairros, etiquetas, serie diaria de atividade e status das conversas.
- Audio: upload e job de transcricao com normalizacao OGG/WebM via FFmpeg, revisao humana, retencao configuravel e comandos nao executados automaticamente.
- Aniversarios: scheduler idempotente, respeitando consentimento, bloqueio, politica de horario/limite e registrando cada execucao.
- Fila: Redis/BullMQ, retry automÃ¡tico e manual autorizado para erros, dead-letter, cancelamento, controle operacional e separaÃ§Ã£o entre falha de envio e resultado incerto para evitar reenvio duplicado.
- Inicializacao: Docker, API, Redis, agente WhatsApp e frontend com espera por readiness.
- Operacao: scripts `scripts/backup-radar.ps1` e `scripts/restore-radar.ps1` adicionados, com fallback opcional `-UseDocker`; a restauracao exige confirmacao textual e permanece pendente de teste real em banco separado.
- Segurança operacional: `scripts/rotacionar-agent-token.ps1` gera e aplica um novo token sem exibi-lo, com reinício opcional da API e do agente.
- E/S do Supabase: relatório de consultas analisado em `docs/supabase-io-analysis.md`; o maior consumo observado está em introspecção, Storage/Auth e SQL Editor, enquanto a listagem de contatos do Radar usa índice e teve média de aproximadamente 1,13 ms.
- Observabilidade local: logs estruturados com requestId, metricas de latencia/erros em `/health/metrics` e validacao pelo script amigavel.
- Correcao de estabilidade: o worker WhatsApp nao duplica mais o agendamento de heartbeat e o lock do perfil Chromium usa o diretorio correto.
- Fila: a interface mostra a previsão da janela de cada job e o prazo de confirmação do WhatsApp; leases expirados são movidos para `INCERTO` para evitar processamento infinito ou reenvio silencioso.
- Fila: o agente possui timeout de envio, reconciliação de leases, atualização visual de tempo em processamento e fallback para chats já carregados em modo LID.
- Auditoria de release: agora verifica por chamada segura e sem efeito se as três funções de confirmação da fila estão autorizadas no `service_role`.
- Homologação restante: escanear o QR Code e executar fluxos reais com um contato que tenha consentimento.

## Auditoria funcional mais recente

- O agente local foi validado conectado e sincronizou 30 mensagens persistidas, incluindo midia privada, nome e avatar quando fornecidos pelo WhatsApp Web.
- A sincronizacao atual e intencionalmente limitada aos telefones ja cadastrados no CRM; chats desconhecidos, grupos e identificadores `@lid` sem mapeamento de telefone nao sao transformados automaticamente em contatos.
- O envio em massa usa intervalo operacional de 15-45 segundos por destinatario. A tela acompanha o lote por ate 5 minutos e pode ser fechada/retomada sem cancelar os jobs; o servidor continua processando e a fila permanece auditavel.
- Resultado `PROCESSANDO` nao e considerado enviado. Apos o lease, o job e marcado como `INCERTO` para impedir reenvio silencioso; a confirmacao manual continua obrigatoria.
- O bundle inicial do frontend nÃ£o carrega mais os grÃ¡ficos do Dashboard; `DashboardCharts` Ã© carregado sob demanda quando o painel Ã© aberto.

## Proximos passos de homologacao

O ciclo de troca de sessÃ£o do agente recria a instÃ¢ncia do `whatsapp-web.js` apÃ³s logout ou recuperaÃ§Ã£o, permitindo que um novo QR Code seja emitido sem reutilizar um Chromium destruÃ­do.

1. Confirmar `GET /health/data-ready` com HTTP 200 após as migrations 030, 031, 032 e 033.
2. Escanear o QR Code com o WhatsApp autorizado.
3. Testar opt-in, jobs com mídia, conversas, dashboard e transcrição em homologação.
4. Validar RLS com dois usuários distintos. (Concluído pela homologação automatizada.)
5. Avaliar migração para a API oficial do WhatsApp quando o sistema sair do piloto local.

## Regra de segurança para mensagens

O sistema deve enviar somente para contatos que forneceram consentimento, respeitar pedidos de saída/bloqueio, registrar a origem do consentimento e oferecer cancelamento de campanhas. Intervalos, variações de texto e limites não garantem ausência de bloqueio e não substituem conformidade.
