param(
  [string]$ProjectDir = 'C:\Users\jose.pordeus1\Documents\radar-comunitario'
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $ProjectDir '.env.local'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw ".env.local não encontrado: $envFile"
}

$lines = [System.IO.File]::ReadAllLines($envFile)
$tokenLine = $lines | Where-Object { $_ -match '^\s*AGENT_TOKEN=' } | Select-Object -First 1
$currentToken = if ($tokenLine) { (($tokenLine -split '=', 2)[1]).Trim().Trim('"').Trim("'") } else { '' }
$isPlaceholder = $currentToken -match 'replace-with|change-me|seu-token|token-do-agente'

if ($currentToken.Length -ge 32 -and -not $isPlaceholder) {
  exit 0
}

$bytes = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
$token = [Convert]::ToBase64String($bytes).TrimEnd('=') -replace '\+', '-' -replace '/', '_'

$found = $false
$updatedLines = foreach ($line in $lines) {
  if ($line -match '^\s*AGENT_TOKEN=') {
    $found = $true
    'AGENT_TOKEN="' + $token + '"'
  } else {
    $line
  }
}

if (-not $found) {
  $updatedLines = @($lines + ('AGENT_TOKEN="' + $token + '"'))
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envFile, [string[]]$updatedLines, $utf8NoBom)
exit 0
