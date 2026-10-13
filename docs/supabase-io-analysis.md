# Análise do alerta de E/S do Supabase

## Evidência observada

O relatório de consultas fornecido foi separado por linha da tabela de `pg_stat_statements`. Os maiores consumidores não são as rotas de envio ou conversas do Radar, mas consultas internas de metadados do Supabase:

- introspecção recursiva de tipos e relações do catálogo (`pg_catalog`), executada 46 vezes;
- funções de `count_estimate` e consultas de estrutura de tabelas usadas pelo SQL Editor/Database Insights;
- operações internas do Storage em `storage.objects` e `storage.buckets`;
- inserções de sessões e tokens do Supabase Auth.

A consulta PostgREST de contatos do Radar apareceu com 193 chamadas, aproximadamente 219 ms acumulados (média de 1,13 ms), somente 6 blocos lidos do disco e 5.878 blocos atendidos em cache. Isso não caracteriza, isoladamente, um gargalo de E/S da aplicação.

## Proteções já existentes no código

- `contacts_last_contact_at_idx` cobre a ordenação principal da lista de contatos.
- Há índices por proprietário, cidade, bairro, conversas, mensagens e estados da fila.
- O heartbeat do agente grava apenas quando há mudança relevante ou após a janela mínima configurada.
- O polling do agente e do painel foi reduzido para evitar consultas contínuas desnecessárias.
- O endpoint `GET /health/data-ready` executa apenas durante inicialização/diagnóstico, não em loop do frontend.

## Conclusão

O alerta do painel não prova que uma consulta do Radar esteja causando o consumo. A evidência disponível aponta principalmente para introspecção do próprio Supabase, Storage/Auth e uso do SQL Editor. Nenhuma alteração destrutiva ou ajuste remoto foi executado.

Se o alerta persistir, a próxima verificação deve ser feita no Database Insights do Supabase após um período de uso real, separando as consultas por schema (`public`, `storage`, `auth`) e observando o crescimento de `shared_blks_read`. A migração de índices adicionais só deve ser aplicada quando uma consulta de `public` demonstrar necessidade real.
