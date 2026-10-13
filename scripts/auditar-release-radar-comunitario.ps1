param(
  [string]$ProjectDir = "C:\Users\jose.pordeus1\Documents\radar-comunitario"
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $ProjectDir 'docker-compose.yml'
$envFile = Join-Path $ProjectDir '.env.local'
$failures = [System.Collections.Generic.List[string]]::new()

function Check([string]$label, [bool]$ok, [string]$detail) {
  if ($ok) {
    Write-Host "[OK] $label - $detail" -ForegroundColor Green
  } else {
    Write-Host "[FALHA] $label - $detail" -ForegroundColor Red
    $script:failures.Add($label)
  }
}

function HttpStatus([string]$url, [string[]]$headers = @()) {
  $arguments = @('-sS', '--max-time', '8', '-o', 'NUL', '-w', '%{http_code}')
  foreach ($header in $headers) { $arguments += @('-H', $header) }
  $arguments += $url
  return (& curl.exe @arguments 2>$null).Trim()
}

function EnvValue([string]$name) {
  $line = Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '       RADAR COMUNITARIO - AUDITORIA DE RELEASE' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

Check 'Arquivos locais' ((Test-Path $composeFile) -and (Test-Path $envFile)) 'docker-compose.yml e .env.local encontrados.'

Push-Location $ProjectDir
try {
  docker compose --env-file $envFile -f $composeFile config --quiet 2>$null
  Check 'Compose' ($LASTEXITCODE -eq 0) 'Configuração válida.'

  $rlsScript = Join-Path $ProjectDir 'scripts\auditar-rls-radar-comunitario.ps1'
  if (Test-Path $rlsScript) {
    $null = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $rlsScript 2>&1)
    $rlsExit = $LASTEXITCODE
    Check 'RLS estatico' ($rlsExit -eq 0) 'Migrations, isolamento e funcoes protegidas conferidos.'
  } else {
    Check 'RLS estatico' $false 'Auditor de RLS nao encontrado.'
  }

  $services = docker compose --env-file $envFile -f $composeFile ps --format '{{.Service}}|{{.Status}}' 2>$null
  foreach ($name in @('api', 'redis', 'whatsapp-agent', 'frontend')) {
    $entry = $services | Where-Object { $_ -like "$name|*" } | Select-Object -First 1
    Check "Container $name" ([bool]$entry -and $entry -match '\|(Up|running|healthy)') $(if ($entry) { $entry } else { 'não encontrado' })
  }

  $live = HttpStatus 'http://127.0.0.1:4000/health/live'
  $ready = HttpStatus 'http://127.0.0.1:4000/health/ready'
  $dataReady = HttpStatus 'http://127.0.0.1:4000/health/data-ready'
  $metrics = HttpStatus 'http://127.0.0.1:4000/health/metrics'
  Check 'Health live' ($live -eq '200') "HTTP $live"
  Check 'Health ready' ($ready -eq '200') "HTTP $ready"
  Check 'Dados prontos' ($dataReady -eq '200') "HTTP $dataReady"
  Check 'Métricas' ($metrics -eq '200') "HTTP $metrics"

  $protected = HttpStatus 'http://127.0.0.1:4000/api/v1/contacts'
  Check 'Autenticação da API' ($protected -eq '401') "Rota protegida retorna HTTP $protected sem sessão."

  $dataReadyBody = curl.exe -sS --max-time 8 'http://127.0.0.1:4000/health/data-ready' 2>$null | Out-String
  $dataReadyPayload = $null
  try { $dataReadyPayload = $dataReadyBody | ConvertFrom-Json } catch { }
  $dependencyChecks = @($dataReadyPayload.data.checks)

  $functionCheck = $dependencyChecks | Where-Object { $_.name -eq 'message_job_confirmation_functions' } | Select-Object -First 1
  $agentFunctionsOk = [bool]$functionCheck -and [bool]$functionCheck.ok
  $agentFunctionDetail = if ($agentFunctionsOk) { 'Funções de confirmação acessíveis ao service_role.' } else { 'Aplique database/ddl/030_grant_agent_message_job_functions.sql no Supabase.' }
  Check 'Funções transacionais da fila' $agentFunctionsOk $agentFunctionDetail

  $chatIdentityCheck = $dependencyChecks | Where-Object { $_.name -eq 'whatsapp_chat_identity' } | Select-Object -First 1
  $chatIdentityOk = [bool]$chatIdentityCheck -and [bool]$chatIdentityCheck.ok
  $chatIdentityDetail = if ($chatIdentityOk) { 'Coluna whatsapp_chat_id acessível.' } else { 'Aplique database/ddl/031_whatsapp_chat_identity.sql no Supabase.' }
  Check 'Identidade dos chats WhatsApp' $chatIdentityOk $chatIdentityDetail

  $policyGuardCheck = $dependencyChecks | Where-Object { $_.name -eq 'message_policy_claim_guard' } | Select-Object -First 1
  $policyGuardOk = [bool]$policyGuardCheck -and [bool]$policyGuardCheck.ok
  $policyGuardDetail = if ($policyGuardOk) { 'A reivindicação respeita a política global de envios.' } else { 'Aplique database/ddl/032_enforce_messaging_policy_on_claim.sql e depois 033_fix_message_job_claim_uuid_after_policy.sql no Supabase.' }
  Check 'Proteção da política de envios' $policyGuardOk $policyGuardDetail

  $allowedHeaders = curl.exe -sS --max-time 8 -D - -o NUL -H 'Origin: http://localhost:3000' http://127.0.0.1:4000/health/live 2>$null | Out-String
  Check 'CORS local' ($allowedHeaders -match '(?im)^access-control-allow-origin:\s*http://localhost:3000') 'Origem local autorizada.'

  $frontendFiles = @(Get-ChildItem (Join-Path $ProjectDir 'src') -Recurse -File -ErrorAction SilentlyContinue) + @(Get-Item (Join-Path $ProjectDir 'vite.config.ts') -ErrorAction SilentlyContinue)
  $frontendSource = @($frontendFiles | Where-Object { $_ } | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
  Check 'Segredos fora do frontend' ($frontendSource -notmatch 'SUPABASE_SERVICE_ROLE_KEY|AGENT_TOKEN|GEMINI_API_KEY') 'Nenhuma chave administrativa encontrada no frontend ou na configuração do build.'
} finally {
  Pop-Location
}

Write-Host ''
if ($failures.Count -eq 0) {
  Write-Host '[OK] Auditoria de release concluída sem falhas.' -ForegroundColor Green
  exit 0
}

Write-Host "[FALHA] Itens pendentes: $($failures -join ', ')" -ForegroundColor Red
exit 1
