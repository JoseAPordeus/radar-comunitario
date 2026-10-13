# Agente WhatsApp local

Agente independente baseado em `whatsapp-web.js`. Ele mantém uma sessão persistente com `LocalAuth`, mostra o QR Code no primeiro uso e consulta o backend para reivindicar tarefas de envio.

## Estado atual

- Cliente WhatsApp e QR Code implementados.
- Sessão persistente implementada.
- Polling autenticado preparado.
- Worker com confirmação de sucesso e falha preparado.
- Endpoints `/agent/*` estão implementados no backend, mas dependem da aplicação da migration `004_agent_processing.sql`.

## Execução futura

O agente será executado pelo `docker-compose.whatsapp.yml`. O arquivo `.env.local` deve conter `AGENT_API_URL`, `AGENT_ID`, `AGENT_TOKEN` e os parâmetros `WHATSAPP_*`.

Os arquivos de sessão ficam no volume `whatsapp_session` e não devem ser commitados ou copiados para outro computador.

O uso de `whatsapp-web.js` automatiza o WhatsApp Web e não é uma integração oficial da Meta. A sessão pode ser desconectada e a conta pode sofrer restrições. Utilize somente uma conta autorizada e respeite consentimento, opt-out e limites aplicáveis.
