param(
  [string]$ApiBaseUrl = 'http://127.0.0.1:4000',
  [string]$AccessToken = $env:RADAR_ACCESS_TOKEN,
  [string]$ContactId,
  [string]$MediaStoragePath
)

$ErrorActionPreference = 'Stop'
$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')

function Write-Check([string]$label, [bool]$ok, [string]$detail) {
  if ($ok) {
    Write-Host "[OK] $label - $detail" -ForegroundColor Green
  } else {
    Write-Host "[FALHA] $label - $detail" -ForegroundColor Red
    throw "Falha de homologacao: $label"
  }
}

function Invoke-Api([string]$path, [hashtable]$headers = @{}, [string]$method = 'GET', $body = $null) {
  $curlArgs = @('--globoff', '--silent', '--show-error', '--max-time', '10', '--request', $method, '--url', "$ApiBaseUrl$path")
  foreach ($header in $headers.GetEnumerator()) { $curlArgs += @('--header', "$($header.Key): $($header.Value)") }
  $temporaryBodyFile = $null
  if ($null -ne $body) {
    $temporaryBodyFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($temporaryBodyFile, ($body | ConvertTo-Json -Depth 10 -Compress), [System.Text.UTF8Encoding]::new($false))
    $curlArgs += @('--header', 'Content-Type: application/json', '--data-binary', "@$temporaryBodyFile")
  }
  try {
    $raw = [string](& curl.exe @curlArgs --write-out 'STATUS:%{http_code}' 2>$null)
  } finally {
    if ($temporaryBodyFile) { Remove-Item -LiteralPath $temporaryBodyFile -Force -ErrorAction SilentlyContinue }
  }
  $statusMatch = [regex]::Match($raw, 'STATUS:(\d{3})$')
  if (-not $statusMatch.Success) { return @{ Status = 0; Body = $null } }
  $bodyText = $raw.Substring(0, $statusMatch.Index).Trim()
  $parsed = $null
  if ($bodyText) { try { $parsed = $bodyText | ConvertFrom-Json } catch { $parsed = $bodyText } }
  return @{ Status = [int]$statusMatch.Groups[1].Value; Body = $parsed }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '       RADAR COMUNITARIO - HOMOLOGACAO SEGURA' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

$live = Invoke-Api '/health/live'
Write-Check 'API live' ($live.Status -eq 200 -and $live.Body.data.status -eq 'ok') "HTTP $($live.Status)"

$ready = Invoke-Api '/health/data-ready'
Write-Check 'Dados prontos' ($ready.Status -eq 200 -and @($ready.Body.data.checks | Where-Object { -not $_.ok }).Count -eq 0) "HTTP $($ready.Status)"

$unauthenticated = Invoke-Api '/api/v1/message-jobs/preview' @{} 'POST' @{ jobs = @(@{ contactId = '00000000-0000-0000-0000-000000000000'; content = 'smoke test'; type = 'CAMPANHA' }) }
Write-Check 'Rota protegida' ($unauthenticated.Status -eq 401) "Sem sessao retorna HTTP $($unauthenticated.Status)"

foreach ($protectedPath in @('/api/v1/whatsapp/status', '/api/v1/analytics/dashboard', '/api/v1/conversations', '/api/v1/message-jobs/metrics')) {
  $protectedResponse = Invoke-Api $protectedPath
  Write-Check "Protecao $protectedPath" ($protectedResponse.Status -eq 401) "Sem sessao retorna HTTP $($protectedResponse.Status)"
}

if (-not $AccessToken) {
  Write-Host ''
  Write-Host '[INFO] Nenhum token informado; homologacao autenticada foi preservada sem executar mutacoes.' -ForegroundColor Yellow
  Write-Host '       Para completar a etapa autenticada, defina RADAR_ACCESS_TOKEN temporariamente e execute novamente.' -ForegroundColor Gray
  exit 0
}

$authHeaders = @{ Authorization = "Bearer $AccessToken" }
$contacts = Invoke-Api '/api/v1/contacts?page=1&pageSize=100' $authHeaders
Write-Check 'Sessao autenticada' ($contacts.Status -eq 200) "Consulta de contatos retorna HTTP $($contacts.Status)"
$contactItems = @($contacts.Body.data.items)

$dashboard = Invoke-Api '/api/v1/analytics/dashboard' $authHeaders
Write-Check 'Dashboard autenticado' ($dashboard.Status -eq 200 -and $null -ne $dashboard.Body.data.totalContacts) "Consulta agregada retorna HTTP $($dashboard.Status)"

$whatsapp = Invoke-Api '/api/v1/whatsapp/status' $authHeaders
Write-Check 'WhatsApp autenticado' ($whatsapp.Status -eq 200 -and $null -ne $whatsapp.Body.data.state) "Status do agente retorna HTTP $($whatsapp.Status)"

$queueMetrics = Invoke-Api '/api/v1/message-jobs/metrics' $authHeaders
Write-Check 'Fila autenticada' ($queueMetrics.Status -eq 200 -and $null -ne $queueMetrics.Body.data.PENDENTE) "Métricas da fila retornam HTTP $($queueMetrics.Status)"

if (-not $ContactId -and $contactItems.Count -gt 0) {
  $ContactId = $contactItems[0].id
}
if (-not $ContactId) {
  Write-Host '[INFO] Usuario autenticado ainda nao possui contato para testar a pre-visualizacao.' -ForegroundColor Yellow
  exit 0
}

$job = @{ contactId = $ContactId; content = 'Homologacao sem envio'; type = 'CAMPANHA' }
if ($MediaStoragePath) {
  $job.media = @{ storagePath = $MediaStoragePath; mimeType = 'application/pdf'; fileName = 'homologacao.pdf'; caption = 'Homologacao' }
}
$preview = Invoke-Api '/api/v1/message-jobs/preview' $authHeaders 'POST' @{ jobs = @($job) }
Write-Check 'Previa de envio' ($preview.Status -eq 200 -and $null -ne $preview.Body.data.eligible -and $null -ne $preview.Body.data.skipped) "Nenhum job foi criado; elegiveis=$($preview.Body.data.eligible.Count), ignorados=$($preview.Body.data.skipped.Count)"

$withoutOptIn = $contactItems | Where-Object { -not $_.whatsapp_opt_in } | Select-Object -First 1
if ($withoutOptIn) {
  $optInPreview = Invoke-Api '/api/v1/message-jobs/preview' $authHeaders 'POST' @{ jobs = @(@{ contactId = $withoutOptIn.id; content = 'Homologacao sem envio'; type = 'CAMPANHA' }) }
  $optInReasons = @($optInPreview.Body.data.skipped | ForEach-Object { $_.reason })
  Write-Check 'Bloqueio sem consentimento' ($optInPreview.Status -eq 200 -and $optInReasons -contains 'WHATSAPP_OPT_IN_REQUIRED') 'Contato sem opt-in foi impedido no preview.'
} else {
  Write-Host '[INFO] Nenhum contato sem opt-in disponível para testar essa regra.' -ForegroundColor Yellow
}

$blockedContact = $contactItems | Where-Object { $_.messaging_blocked } | Select-Object -First 1
if ($blockedContact) {
  $blockedPreview = Invoke-Api '/api/v1/message-jobs/preview' $authHeaders 'POST' @{ jobs = @(@{ contactId = $blockedContact.id; content = 'Homologacao sem envio'; type = 'CAMPANHA' }) }
  $blockedReasons = @($blockedPreview.Body.data.skipped | ForEach-Object { $_.reason })
  Write-Check 'Bloqueio de contato' ($blockedPreview.Status -eq 200 -and $blockedReasons -contains 'MESSAGING_BLOCKED') 'Contato bloqueado foi impedido no preview.'
} else {
  Write-Host '[INFO] Nenhum contato bloqueado disponível para testar essa regra.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '[OK] Homologacao segura concluida; nenhuma mensagem foi enviada.' -ForegroundColor Green
