param(
  [string]$DatabaseUrl = $env:RADAR_DATABASE_URL,
  [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Radar-Comunitario-Backups'),
  [switch]$UseDocker,
  [string]$DockerNetwork
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'Informe RADAR_DATABASE_URL ou passe -DatabaseUrl com a URL PostgreSQL.'
}

$hasPgDump = [bool](Get-Command pg_dump -ErrorAction SilentlyContinue)
if (-not $hasPgDump -and -not $UseDocker) {
  throw 'pg_dump nao foi encontrado. Instale o PostgreSQL Client ou execute novamente com -UseDocker.'
}
if ($UseDocker -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI nao foi encontrado para executar o backup pelo container PostgreSQL.'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = Join-Path $OutputDirectory "radar-$stamp.dump"

Write-Host 'Criando backup do Radar Comunitario...'
if ($hasPgDump -and -not $UseDocker) {
  & pg_dump --format=custom --no-owner --file=$backupFile $DatabaseUrl
} else {
  $backupRoot = (Resolve-Path -LiteralPath $OutputDirectory).Path
  $backupName = Split-Path -Leaf $backupFile
  $dockerArgs = @('run', '--rm')
  if (-not [string]::IsNullOrWhiteSpace($DockerNetwork)) { $dockerArgs += @('--network', $DockerNetwork) }
  $dockerArgs += @('-v', "${backupRoot}:/backup", 'postgres:16-alpine', 'pg_dump', '--format=custom', '--no-owner', "--file=/backup/$backupName", $DatabaseUrl)
  & docker @dockerArgs
}
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $backupFile -Force -ErrorAction SilentlyContinue
  throw "pg_dump encerrou com codigo $LASTEXITCODE."
}

$size = (Get-Item -LiteralPath $backupFile).Length
if ($size -le 0) {
  Remove-Item -LiteralPath $backupFile -Force -ErrorAction SilentlyContinue
  throw 'O arquivo de backup foi criado vazio.'
}

Write-Host "Backup concluido: $backupFile ($size bytes)" -ForegroundColor Green
Write-Host 'Mantenha esse arquivo fora do repositorio e com acesso restrito.'
