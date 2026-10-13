param(
  [string]$DatabaseUrl = $env:RADAR_DATABASE_URL,
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [switch]$ConfirmRestore,
  [switch]$UseDocker,
  [string]$DockerNetwork
)

$ErrorActionPreference = 'Stop'

if (-not $ConfirmRestore) {
  throw 'A restauracao sobrescreve dados. Execute novamente com -ConfirmRestore somente em um banco separado de homologacao.'
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'Informe RADAR_DATABASE_URL ou passe -DatabaseUrl com a URL PostgreSQL.'
}

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
  throw "Arquivo de backup nao encontrado: $BackupFile"
}

$hasPgRestore = [bool](Get-Command pg_restore -ErrorAction SilentlyContinue)
if (-not $hasPgRestore -and -not $UseDocker) {
  throw 'pg_restore nao foi encontrado. Instale o PostgreSQL Client ou execute novamente com -UseDocker.'
}
if ($UseDocker -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI nao foi encontrado para executar a restauracao pelo container PostgreSQL.'
}

$confirmation = Read-Host 'Digite RESTAURAR_RADAR para confirmar a restauracao neste banco'
if ($confirmation -cne 'RESTAURAR_RADAR') {
  throw 'Confirmacao nao reconhecida. Nenhum dado foi alterado.'
}

Write-Host 'Restaurando backup do Radar Comunitario...'
if ($hasPgRestore -and -not $UseDocker) {
  & pg_restore --clean --if-exists --no-owner --dbname=$DatabaseUrl $BackupFile
} else {
  $backupPath = (Resolve-Path -LiteralPath $BackupFile).Path
  $backupRoot = Split-Path -Parent $backupPath
  $backupName = Split-Path -Leaf $backupPath
  $dockerArgs = @('run', '--rm')
  if (-not [string]::IsNullOrWhiteSpace($DockerNetwork)) { $dockerArgs += @('--network', $DockerNetwork) }
  $dockerArgs += @('-v', "${backupRoot}:/backup:ro", 'postgres:16-alpine', 'pg_restore', '--clean', '--if-exists', '--no-owner', "--dbname=$DatabaseUrl", "/backup/$backupName")
  & docker @dockerArgs
}
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore encerrou com codigo $LASTEXITCODE."
}

Write-Host 'Restauracao concluida. Valide /health/data-ready, login, contatos, conversas e fila.' -ForegroundColor Green
