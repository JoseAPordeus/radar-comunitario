# Aplicação da migration 031

Esta migration cria `contacts.whatsapp_chat_id`, o vínculo persistente entre um contato do CRM e o identificador serializado do chat no WhatsApp Web (`@c.us` ou `@lid`). Ela é necessária para que mensagens recebidas de chats que não expõem o telefone sejam associadas ao contato correto.

## Como aplicar

1. Abra o SQL Editor do projeto Supabase correto.
2. Abra `database/ddl/031_whatsapp_chat_identity.sql` neste projeto.
3. Copie todo o conteúdo para uma nova consulta.
4. Execute uma única vez e confirme que não houve erro.
5. Reinicie o agente WhatsApp ou use o botão de atualização na tela de Configuração.

A migration é idempotente: repetir a execução não remove contatos nem mensagens.

## Validação

Depois da execução, valide no SQL Editor:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'contacts'
  and column_name = 'whatsapp_chat_id';
```

O resultado deve conter uma linha com `whatsapp_chat_id` e tipo `text`. Em seguida, deixe o agente sincronizar os contatos cadastrados; ele preencherá o vínculo durante a sincronização dos chats.

Não compartilhe chaves secretas do Supabase no SQL Editor, no frontend ou em screenshots.
