param(
  [string]$DdlDirectory = "C:\Users\jose.pordeus1\Documents\radar-comunitario\database\ddl"
)

$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $DdlDirectory -Filter '*.sql' -File | Sort-Object Name)
if ($files.Count -eq 0) { throw "Nenhuma migration foi encontrada em $DdlDirectory" }

$allSql = ($files | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
$expectedTables = @(
  'neighborhoods', 'labels', 'contacts', 'contact_labels', 'service_history', 'campaigns',
  'reminders', 'message_templates', 'message_logs', 'automation_settings', 'message_jobs',
  'agent_status', 'cities', 'conversations', 'conversation_messages', 'audio_jobs',
  'messaging_policies', 'service_history_audit', 'automation_runs', 'message_template_versions'
)
$missingTables = @($expectedTables | Where-Object { $allSql -notmatch "(?im)ALTER TABLE(?:\s+public\.)?\s*$([regex]::Escape($_))\s+ENABLE ROW LEVEL SECURITY" })
$requiredFunctions = @(
  'claim_message_job', 'complete_message_job', 'fail_message_job', 'mark_message_job_uncertain', 'dashboard_metrics', 'messaging_policy_claim_guard_ready'
)
$missingFunctions = @($requiredFunctions | Where-Object { $allSql -notmatch "(?im)REVOKE ALL ON FUNCTION public\.$([regex]::Escape($_))" })
$migrationNumbers = @($files | ForEach-Object { if ($_.BaseName -match '^([0-9]{3})_') { [int]$Matches[1] } })
$expectedNumbers = 1..33
$missingNumbers = @($expectedNumbers | Where-Object { $_ -notin $migrationNumbers })

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '       RADAR COMUNITARIO - AUDITORIA ESTATICA DE RLS' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

if ($missingNumbers.Count -gt 0) { throw "Migrations ausentes: $($missingNumbers -join ', ')" }
Write-Host "[OK] Migrations - Sequencia 001-033 encontrada." -ForegroundColor Green

$policyClaimMigration = Join-Path $DdlDirectory '033_fix_message_job_claim_uuid_after_policy.sql'
if (-not (Test-Path $policyClaimMigration)) { throw 'Migration 033 ausente: a fila nao possui a correcao transacional da politica de envios.' }
$policyClaimSql = Get-Content -Raw -LiteralPath $policyClaimMigration
if ($policyClaimSql -notmatch '(?is)COALESCE\s*\(\s*policy\.enabled\s*,\s*TRUE\s*\)\s*=\s*TRUE') {
  throw 'Migration 033 nao valida messaging_policies.enabled durante a reivindicacao.'
}
Write-Host '[OK] Politica de envios - claim_message_job respeita a desativacao global.' -ForegroundColor Green

if ($missingTables.Count -gt 0) { throw "Tabelas sem ENABLE ROW LEVEL SECURITY na sequencia: $($missingTables -join ', ')" }
Write-Host "[OK] RLS - $($expectedTables.Count) tabelas sensiveis possuem habilitacao versionada." -ForegroundColor Green

if ($missingFunctions.Count -gt 0) { throw "Funcoes sem REVOKE ALL de PUBLIC: $($missingFunctions -join ', ')" }
Write-Host "[OK] Funcoes - Funcoes de fila e dashboard nao ficam publicas." -ForegroundColor Green

if ($allSql -notmatch '(?is)GRANT\s+SELECT\s+ON\s+TABLE.*TO\s+authenticated') {
  throw 'Nenhum grant de leitura para authenticated foi encontrado; as policies RLS nao podem ser homologadas diretamente.'
}
Write-Host '[OK] Grants - O papel authenticated possui leitura basica protegida por RLS.' -ForegroundColor Green

if ($allSql -match '(?im)CREATE POLICY[^\r\n]+ON\s+(?:public\.)?(?:contacts|message_jobs|conversation_messages|audio_jobs)[^\r\n]*\r?\n\s*[^\r\n]*USING\s*\(\s*true\s*\)') {
  throw 'Foi encontrada uma policy USING (true) em tabela protegida.'
}
Write-Host '[OK] Policies - Nenhuma policy permissiva detectada nas tabelas protegidas.' -ForegroundColor Green
Write-Host ''
Write-Host '[OK] Auditoria estatica de RLS concluida.' -ForegroundColor Green
