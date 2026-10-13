# Checklist de segurança e testes

## Concluído nesta etapa

- [x] Segredos administrativos ficam fora do frontend.
- [x] `SUPABASE_SERVICE_ROLE_KEY` é utilizada somente pela API.
- [x] Autenticação própria do agente com token e identificador.
- [x] Comparação em tempo constante do token do agente.
- [x] RLS versionado e sem políticas públicas no novo DDL.
- [x] Erros internos não são retornados ao cliente.
- [x] Helmet e limite de corpo JSON habilitados.
- [x] CORS restrito por configuração.
- [x] Rate limiting global e específico do agente.
- [x] Sessão do WhatsApp excluída do Git e persistida em volume Docker.
- [x] Estados de fila e resultado incerto definidos.

## Resultado da auditoria local

- `npm audit --omit=dev` não apontou vulnerabilidade alta ou crítica nas dependências de produção da API; há uma vulnerabilidade baixa transitiva no `esbuild` de desenvolvimento.
- O agente WhatsApp ainda reporta vulnerabilidades transitivas de alto risco em `puppeteer`/`extract-zip`/`basic-ftp`, vinculadas ao `whatsapp-web.js`. Não foi usado `npm audit fix --force`, pois ele propõe downgrade incompatível; a migração para a API oficial do WhatsApp continua sendo o caminho recomendado para produção.
- O lockfile foi sincronizado com os manifests atuais; não foi aplicado `npm audit fix --force` porque a correção sugerida altera a versão do `whatsapp-web.js` e pode quebrar o agente. O risco fica restrito ao modo local baseado em WhatsApp Web e deve ser reavaliado na migração para a API oficial.

## Ainda obrigatório antes da publicação

- [ ] Rotacionar `AGENT_TOKEN` por um valor real e armazená-lo fora do Git. Use `scripts/rotacionar-agent-token.ps1 -ConfirmRotation -RestartServices` durante uma janela de manutenção; o script não imprime o token.
- [x] Aplicar as migrations 012–029 e validar as dependências disponíveis de `GET /health/data-ready` no ambiente atual.
- [ ] Aplicar a migration 030 e validar as funções transacionais da fila no `service_role`.
- [ ] Criar usuários reais no Supabase Auth.
- [x] Testar isolamento RLS com dois usuários distintos.
- [ ] Configurar URL pública HTTPS da API e CORS somente para a Vercel.
- [x] Testar backup e restauração em PostgreSQL descartável no Docker; backup de produção ainda depende de `RADAR_DATABASE_URL`.
- [x] Executar auditoria de dependências (com pendências transitivas documentadas acima).
- [x] Executar build Docker da API e do agente.
- [ ] Validar o QR Code e a reutilização da sessão em uma conta autorizada.
- [ ] Validar o fluxo completo com um destinatário que tenha consentimento.

## Testes automatizados

Os testes unitários da máquina de estados da fila não dependem de Supabase, Docker ou WhatsApp:

```powershell
npm run test --workspace @radar-comunitario/api
```

Testes que dependem de serviços externos devem ser executados separadamente e registrados como aprovados somente após execução real.
