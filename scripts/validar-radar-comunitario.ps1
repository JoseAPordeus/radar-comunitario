param(
  [string]$ProjectDir = "C:\Users\jose.pordeus1\Documents\radar-comunitario"
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $ProjectDir 'docker-compose.yml'
$envFile = Join-Path $ProjectDir '.env.local'

function Write-Status([string]$label, [bool]$ok, [string]$detail) {
  if ($ok) {
    Write-Host "[OK] $label - $detail" -ForegroundColor Green
  } else {
    Write-Host "[ATENÇÃO] $label - $detail" -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '             RADAR COMUNITÁRIO - VERIFICAÇÃO' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $composeFile) -or -not (Test-Path $envFile)) {
  Write-Status 'Configuração local' $false 'docker-compose.yml ou .env.local não encontrado.'
  exit 1
}

$agentTokenLine = Get-Content -LiteralPath $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*AGENT_TOKEN=' } | Select-Object -First 1
$agentToken = if ($agentTokenLine) { (($agentTokenLine -split '=', 2)[1]).Trim().Trim('"').Trim("'") } else { '' }
$tokenConfigured = $agentToken.Length -ge 32 -and $agentToken -notmatch 'replace-with|change-me|seu-token|token-do-agente'
$tokenDetail = if ($tokenConfigured) { 'Token local presente e não exibido.' } else { 'AGENT_TOKEN ausente, curto ou ainda usa valor de exemplo.' }
Write-Status 'Token do agente' $tokenConfigured $tokenDetail

Push-Location $ProjectDir
try {
  $services = docker compose --env-file $envFile -f $composeFile ps --format '{{.Service}}|{{.Status}}' 2>$null
  $serviceMap = @{}
  foreach ($service in $services) {
    $parts = $service -split '\|', 2
    if ($parts.Count -eq 2) { $serviceMap[$parts[0]] = $parts[1] }
  }

  foreach ($name in @('api', 'redis', 'whatsapp-agent', 'frontend')) {
    $status = $serviceMap[$name]
    $detail = if ($status) { $status } else { 'não encontrado' }
    Write-Status $name ([bool]$status -and $status -match 'Up|running|healthy') $detail
  }

  try {
    $metrics = (curl.exe -fsS --max-time 5 'http://127.0.0.1:4000/health/metrics' | ConvertFrom-Json)
    Write-Status 'Monitoramento' ($null -ne $metrics.data.uptimeSeconds) ("Metricas ativas; {0} requisicoes observadas." -f $metrics.data.requests)
  } catch {
    Write-Status 'Monitoramento' $false 'Metricas da API nao responderam.'
  }

  try {
    $live = (curl.exe -fsS --max-time 5 'http://127.0.0.1:4000/health/live' | ConvertFrom-Json)
    Write-Status 'Servidor do Sistema' ($live.data.status -eq 'ok') 'API respondendo.'
  } catch {
    Write-Status 'Servidor do Sistema' $false 'API não respondeu.'
  }

  try {
    $ready = (curl.exe -fsS --max-time 5 'http://127.0.0.1:4000/health/data-ready' | ConvertFrom-Json)
    $failedChecks = @($ready.data.checks | Where-Object { -not $_.ok })
    if ($failedChecks.Count -eq 0) {
      Write-Status 'Dados e migrations' $true 'Todas as dependências estão prontas.'
    } else {
      Write-Status 'Dados e migrations' $false ($failedChecks.name -join ', ')
    }
  } catch {
    Write-Status 'Dados e migrations' $false 'A API ainda não informou prontidão.'
  }

  try {
    $headers = curl.exe -sS --max-time 5 -D - -o NUL 'http://127.0.0.1:3000/' | Out-String
    $frontendDocker = $headers -match '(?im)^server:\s*nginx'
    $frontendDetail = if ($frontendDocker) { 'Painel Docker respondendo em http://localhost:3000.' } else { 'A porta 3000 respondeu, mas nÃ£o identificou o Nginx do Docker.' }
    Write-Status 'Interface Web' $frontendDocker $frontendDetail
  } catch {
    Write-Status 'Interface Web' $false 'Painel não respondeu.'
  }

  $hasDatabaseUrl = -not [string]::IsNullOrWhiteSpace($env:RADAR_DATABASE_URL)
  $hasPgDump = [bool](Get-Command pg_dump -ErrorAction SilentlyContinue)
  $hasPgRestore = [bool](Get-Command pg_restore -ErrorAction SilentlyContinue)
  if ($hasDatabaseUrl -and $hasPgDump -and $hasPgRestore) {
    Write-Status 'Backup e restauração' $true 'RADAR_DATABASE_URL e PostgreSQL Client disponíveis.'
  } elseif (-not $hasDatabaseUrl) {
    Write-Status 'Backup e restauração' $false 'RADAR_DATABASE_URL não foi definida; o sistema continua funcionando, mas o backup ainda não pode ser executado.'
  } elseif ((Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Status 'Backup e restauração' $false 'Use -UseDocker nos scripts de backup; o PostgreSQL Client local não está instalado.'
  } else {
    Write-Status 'Backup e restauração' $false 'Instale o PostgreSQL Client para disponibilizar pg_dump e pg_restore.'
  }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $agentLog = @(docker logs --tail 200 radar-whatsapp-agent 2>&1) -join "`n"
  $ErrorActionPreference = $previousErrorActionPreference
  if ($agentLog -match 'WhatsApp client ready') {
    Write-Status 'WhatsApp' $true 'Sessão conectada.'
  } elseif ($agentLog -match 'Escaneie o QR Code') {
    Write-Status 'WhatsApp' $true 'QR Code disponível para conexão.'
  } else {
    Write-Status 'WhatsApp' $false 'Agente em inicialização; consulte Configuração no painel.'
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Se houver itens em atenção, execute iniciar-radar-comunitario.bat e aguarde alguns minutos.' -ForegroundColor Gray
