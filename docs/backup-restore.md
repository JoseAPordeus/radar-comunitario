# Backup e restauração

Este procedimento é destinado ao responsável técnico pelo ambiente. O arquivo de conexão do PostgreSQL contém credenciais e nunca deve ser commitado ou enviado ao frontend.

## Backup

Defina temporariamente a URL de conexão do banco em uma variável de ambiente e use o script seguro do projeto:

```powershell
$env:RADAR_DATABASE_URL = 'postgresql://usuario:senha@host:5432/postgres'
.\scripts\backup-radar.ps1
Remove-Item Env:RADAR_DATABASE_URL
```

Por padrão, o arquivo é salvo em `Documentos\Radar-Comunitario-Backups`, fora do repositório.
Para escolher outro destino, use `-OutputDirectory` explicitamente. Se `pg_dump` não estiver instalado,
adicione `-UseDocker` para usar a imagem `postgres:16-alpine` pelo Docker.
Em um banco que esteja em uma rede Docker específica, informe também `-DockerNetwork nome-da-rede`.

Armazene o arquivo `.dump` fora do repositório, com acesso restrito. O backup deve ser acompanhado de uma cópia do `.env.example` e da versão das migrations, nunca das chaves secretas.

## Restauração em ambiente de homologação

Restaure primeiro em um banco separado. A operação sobrescreve dados do destino e exige confirmação explícita:

```powershell
$env:RADAR_DATABASE_URL = 'postgresql://usuario:senha@host-de-homologacao:5432/postgres'
.\scripts\restore-radar.ps1 -BackupFile '.\backup\radar-AAAAMMDD-HHMMSS.dump' -ConfirmRestore
Remove-Item Env:RADAR_DATABASE_URL
```

Quando o PostgreSQL Client não estiver instalado, acrescente `-UseDocker`. A restauração deve ser feita
primeiro em um banco separado de homologação. Para um banco em uma rede Docker específica, acrescente
`-DockerNetwork nome-da-rede`.

Depois da restauração:

1. Execute `docker compose --env-file .env.local -f docker-compose.yml up -d`.
2. Confirme `GET /health/data-ready` com HTTP 200.
3. Execute `auditar-release-radar-comunitario.bat`.
4. Valide login, contatos, conversas, fila e status do WhatsApp.

O checklist de release só deve marcar backup/restauração como concluído depois de um restore real documentado, com data, ambiente e resultado.

Validação local executada em 11/10/2026: PostgreSQL `postgres:16-alpine` descartável no Docker,
rede `radar-backup-test-net`, dump de 1.662 bytes, tabela sintética removida e restaurada; o valor
`restauracao-confirmada` foi recuperado. Os recursos temporários foram removidos ao final do teste.
