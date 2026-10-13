param(
  [string]$ProjectDir = 'C:\Users\jose.pordeus1\Documents\radar-comunitario',
  [switch]$ConfirmRotation,
  [switch]$RestartServices
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $ProjectDir '.env.local'

if (-not $ConfirmRotation) {
  throw 'A rotação invalida o token atual. Execute novamente com -ConfirmRotation após confirmar a janela de manutenção.'
}

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw ".env.local não encontrado: $envFile"
}

$lines = [System.IO.File]::ReadAllLines($envFile)
$bytes = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
$token = [Convert]::ToBase64String($bytes).TrimEnd('=') -replace '\+', '-' -replace '/', '_'

$found = $false
$updatedLines = foreach ($line in $lines) {
  if ($line -match '^\s*AGENT_TOKEN\s*=') {
    $found = $true
    'AGENT_TOKEN="' + $token + '"'
  } else {
    $line
  }
}

if (-not $found) {
  throw 'A variável AGENT_TOKEN não foi encontrada no .env.local; nenhum arquivo foi alterado.'
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envFile, [string[]]$updatedLines, $utf8NoBom)
Write-Host 'AGENT_TOKEN rotacionado com sucesso. O valor não será exibido.' -ForegroundColor Green

if ($RestartServices) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI não foi encontrado para reiniciar os serviços.'
  }
  Push-Location $ProjectDir
  try {
    & docker compose --env-file .env.local -f docker-compose.yml up -d --force-recreate api whatsapp-agent
    if ($LASTEXITCODE -ne 0) { throw "O reinício dos serviços encerrou com código $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
  Write-Host 'API e agente WhatsApp reiniciados para usar o novo token.' -ForegroundColor Green
}
