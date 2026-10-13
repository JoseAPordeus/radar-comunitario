param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'SilentlyContinue'
if (-not (Test-Path -LiteralPath $Path)) { exit 0 }

$payload = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
foreach ($check in @($payload.data.checks)) {
  if ($check.ok) { continue }
  switch ($check.name) {
    'whatsapp_chat_identity' { Write-Output '         - Vinculo das conversas do WhatsApp' }
    'message_policy_claim_guard' { Write-Output '         - Protecao da fila de envios' }
    'message_job_confirmation_functions' { Write-Output '         - Confirmacao segura dos envios' }
    default { Write-Output ("         - Dependencia do sistema: " + $check.name) }
  }
}
