import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronRight, Clock3, FileText, Filter, Image as ImageIcon, Info, LoaderCircle, MapPin, MessageSquare, Paperclip, Pause, Play, Search, Send, Table2, Tag, Users, X } from 'lucide-react';
import { ApiClientError, contactsApi, labelsApi, messageJobsApi, messagingPolicyApi, neighborhoodsApi, templatesApi, uploadMediaWithProgress } from '../lib/api';
import type { Contact, Label, MessageTemplate, Neighborhood } from '../types';

type Step = 1 | 2 | 3;
type QueueJob = { id: string; status: string; attempts?: number; available_at?: string | null; processing_started_at?: string | null; lease_expires_at?: string | null; error_code?: string | null; error_message?: string | null; contact?: { full_name?: string | null; phone?: string | null } | null };
const terminalStatuses = new Set(['ENVIADO', 'ERRO', 'INCERTO', 'CANCELADO']);
const pollIntervalMs = 5000;
const pollTimeoutMs = 5 * 60 * 1000;

function friendlyError(job: QueueJob) {
  const code = String(job.error_code ?? '').toUpperCase();
  const text = String(job.error_message ?? '').toLowerCase();
  if (code.includes('WHATSAPP_SEND_FAILED') && (text.includes('data passed to getter') || text.includes('static.whatsapp.net'))) return 'O WhatsApp nao conseguiu preparar este anexo. Confira a conexao e tente enviar novamente.';
  if (code.includes('WHATSAPP_SEND_FAILED')) return 'O WhatsApp nao confirmou este envio. Tente novamente em alguns instantes.';
  if (code.includes('NOT_REGISTERED') || text.includes('não possui whatsapp')) return 'Número sem WhatsApp registrado.';
  if (code.includes('INVALID_PHONE') || text.includes('telefone inválido')) return 'Falha de formato no telefone.';
  if (code.includes('CHAT_NOT_AVAILABLE') || text.includes('conversa whatsapp')) return 'Conversa do WhatsApp não disponível nesta sessão.';
  if (code.includes('TIMEOUT') || text.includes('não confirmou')) return 'O WhatsApp demorou para confirmar o envio.';
  if (code.includes('MEDIA')) return 'Não foi possível enviar o anexo.';
  if (code.includes('OPT_IN')) return 'Contato sem autorização para receber mensagens.';
  if (code.includes('BLOCKED')) return 'Contato bloqueado para envios.';
  return 'Não foi possível concluir este envio.';
}

function friendlySkip(reason: string) {
  const labels: Record<string, string> = { DAILY_LIMIT_REACHED: 'Limite diário atingido', CONTACT_NOT_FOUND: 'Contato não encontrado', MESSAGING_BLOCKED: 'Contato bloqueado para envios', WHATSAPP_OPT_IN_REQUIRED: 'Sem autorização para receber mensagens', MEDIA_STORAGE_PATH_INVALID: 'Anexo não reconhecido pelo armazenamento' };
  return labels[reason] ?? 'Não atende às regras de envio';
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}min ${seconds % 60}s` : `${seconds}s`;
}

function renderSpintax(text: string) {
  return text.replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_match, options: string) => options.split('|')[0]);
}

function greetingByTime() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function contactSubject(contact: Contact) {
  const info = contact.additional_info;
  if (!info || typeof info !== 'object') return '';
  const value = (info as Record<string, unknown>).subject ?? (info as Record<string, unknown>).assunto;
  return typeof value === 'string' ? value : '';
}

function isBirthdayThisMonth(contact: Contact) {
  return Boolean(contact.birth_date && Number(contact.birth_date.split('-')[1]) === new Date().getMonth() + 1);
}

function Avatar({ contact }: { contact: Contact }) {
  return contact.avatar_url ? <img src={contact.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{contact.full_name.charAt(0).toUpperCase()}</span>;
}

export default function BulkMessageView() {
  const [step, setStep] = useState<Step>(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState('all');
  const [labelId, setLabelId] = useState('all');
  const [subject, setSubject] = useState('');
  const [birthdaysOnly, setBirthdaysOnly] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewResult, setPreviewResult] = useState<{ key: string; eligible: Array<{ contactId: string; availableAt: string }>; skipped: Array<{ contactId: string; reason: string }>; remainingToday: number } | null>(null);
  const [queueMetrics, setQueueMetrics] = useState<Record<string, number> | null>(null);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [batchJobs, setBatchJobs] = useState<QueueJob[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [errorDetails, setErrorDetails] = useState<QueueJob | null>(null);
  const [hiddenErrorIds, setHiddenErrorIds] = useState<Set<string>>(new Set());
  const [sendingStatus, setSendingStatus] = useState('Preparando a fila…');
  const [sendingProgress, setSendingProgress] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const activeRef = useRef(false);

  const messageText = templates.find(template => template.id === templateId)?.content ?? message;
  const selectedContacts = useMemo(() => contacts.filter(contact => selectedIds.has(contact.id)), [contacts, selectedIds]);
  const filteredContacts = useMemo(() => contacts.filter(contact => {
    const query = search.trim().toLowerCase();
    return (!query || contact.full_name.toLowerCase().includes(query) || contact.phone.includes(query)) && (neighborhoodId === 'all' || contact.neighborhood_id === neighborhoodId) && (labelId === 'all' || contact.labels?.some(label => label.id === labelId)) && (!subject.trim() || contactSubject(contact).toLowerCase().includes(subject.trim().toLowerCase())) && (!birthdaysOnly || isBirthdayThisMonth(contact));
  }), [contacts, search, neighborhoodId, labelId, subject, birthdaysOnly]);
  const allFilteredSelected = filteredContacts.length > 0 && filteredContacts.every(contact => selectedIds.has(contact.id));
  const firstSelected = selectedContacts[0];
  const previewKey = `${[...selectedIds].sort().join(',')}|${templateId}|${message}|${file?.name ?? ''}|${file?.size ?? 0}`;
  const completedBatch = batchJobs.filter(job => terminalStatuses.has(job.status)).length;
  const failedBatch = batchJobs.filter(job => job.status === 'ERRO' || job.status === 'INCERTO').length;
  const elapsedSeconds = startedAt ? Math.max(1, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  const speed = completedBatch > 0 ? Math.round((completedBatch / elapsedSeconds) * 60) : 0;
  const remainingSeconds = speed > 0 ? Math.max(0, Math.ceil(((batchJobs.length - completedBatch) / speed) * 60)) : 0;
  const currentJob = batchJobs.find(job => job.status === 'PROCESSANDO') ?? batchJobs.find(job => job.status === 'PENDENTE');

  useEffect(() => {
    if (!file?.type.startsWith('image/')) { setFilePreview(''); return; }
    const url = URL.createObjectURL(file); setFilePreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    void loadData(); void refreshQueue();
    const timer = window.setInterval(() => void refreshQueue(), 5000);
    return () => { window.clearInterval(timer); activeRef.current = false; };
  }, []);

  async function loadData() {
    setLoading(true); setLoadError('');
    try {
      const [contactData, neighborhoodData, labelData, templateData] = await Promise.all([contactsApi.listAll(), neighborhoodsApi.list(), labelsApi.list(), templatesApi.list(true)]);
      setContacts(contactData); setNeighborhoods(neighborhoodData); setLabels(labelData); setTemplates(templateData);
    } catch { setLoadError('Não foi possível carregar os destinatários. Tente novamente.'); }
    finally { setLoading(false); }
  }

  async function refreshQueue() {
    try { const [metrics, jobs] = await Promise.all([messageJobsApi.metrics(), messageJobsApi.list({ page: 1, pageSize: 30 })]); setQueueMetrics(metrics); setQueueJobs(jobs.items as QueueJob[]); } catch { setQueueMetrics(null); }
  }

  function toggleVisibleSelection() {
    setSelectedIds(previous => { const next = new Set(previous); if (allFilteredSelected) filteredContacts.forEach(contact => next.delete(contact.id)); else filteredContacts.forEach(contact => next.add(contact.id)); return next; });
  }

  function toggleContact(id: string) { setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  function replaceVariables(text: string, contact: Contact) {
    return renderSpintax(text).replace(/{nome}/g, contact.full_name).replace(/{bairro}/g, contact.neighborhood?.name || 'seu bairro').replace(/{telefone}/g, contact.phone).replace(/{saudacao_tempo}/g, greetingByTime());
  }

  function addVariable(variable: string) { setMessage(previous => `${previous}${previous && !previous.endsWith(' ') ? ' ' : ''}${variable}`); }

  async function validateRecipients() {
    if (!selectedContacts.length) return;
    if (!messageText.trim() && !file) { setNotice('Escreva uma mensagem ou anexe um arquivo antes de continuar.'); return; }
    setPreviewLoading(true); setNotice('Validando autorização e regras de envio…');
    try {
      const result = await messageJobsApi.preview(selectedContacts.map(contact => ({ contactId: contact.id, content: replaceVariables(messageText || `[Anexo: ${file?.name ?? 'arquivo'}]`, contact), type: 'CAMPANHA' as const })));
      setPreviewResult({ key: previewKey, eligible: result.eligible, skipped: result.skipped, remainingToday: result.remainingToday });
      setNotice(result.eligible.length ? 'Destinatários validados. Revise a prévia e inicie quando estiver pronto.' : 'Nenhum destinatário está disponível para envio.');
    } catch (error) { setNotice(error instanceof ApiClientError ? error.message : 'Não foi possível validar os destinatários.'); setPreviewResult(null); }
    finally { setPreviewLoading(false); }
  }

  async function startSending() {
    if (!selectedContacts.length || previewResult?.key !== previewKey) return;
    activeRef.current = true; setStep(3); setSendingProgress(0); setSendingStatus('Preparando a fila de envio…'); setStartedAt(Date.now());
    try {
      let media: { url?: string; storagePath?: string; mimeType?: string; fileName?: string; caption?: string } | undefined;
      if (file) { setSendingStatus('Enviando o anexo com segurança…'); const uploaded = await uploadMediaWithProgress(file, progress => setUploadProgress(progress)); media = { url: uploaded.url, storagePath: uploaded.storagePath, mimeType: uploaded.mimeType, fileName: uploaded.fileName, caption: messageText }; }
      const result = await messageJobsApi.create(selectedContacts.map(contact => ({ contactId: contact.id, content: replaceVariables(messageText, contact), type: 'CAMPANHA' as const, ...(templateId ? { templateId } : {}), ...(media ? { media } : {}) })));
      const ids = result.created.map(job => job.id); setBatchJobs(result.created as QueueJob[]); setSendingStatus(`${ids.length} tarefa(s) entrou(aram) na fila. O envio respeitará os intervalos configurados.`);
      if (result.skipped.length) setNotice(`${result.skipped.length} contato(s) não entraram na fila: ${friendlySkip(result.skipped[0].reason)}.`);
      await pollBatch(ids);
    } catch (error) { setSendingStatus(error instanceof ApiClientError ? error.message : 'Não foi possível iniciar o envio.'); setNotice('Revise a fila e tente novamente.'); activeRef.current = false; }
  }

  async function pollBatch(ids: string[]) {
    if (!ids.length) { setSendingProgress(100); return; }
    const started = Date.now(); let finished = false;
    for (let attempt = 0; attempt < pollTimeoutMs / pollIntervalMs && !finished && activeRef.current; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, pollIntervalMs));
      const result = await messageJobsApi.list({ page: 1, pageSize: 500, ids }); const jobs = result.items as QueueJob[]; setBatchJobs(jobs);
      const terminal = jobs.filter(job => terminalStatuses.has(job.status)).length; setSendingProgress(Math.round((terminal / ids.length) * 100)); setSendingStatus(`${terminal} de ${ids.length} concluído(s)${failedBatch ? ` · ${failedBatch} precisa(m) de atenção` : ''}.`); finished = terminal >= ids.length;
      if (finished) { setSendingProgress(100); setSendingStatus('Processamento concluído. Confira os resultados abaixo.'); }
      else if (Date.now() - started >= pollTimeoutMs) setSendingStatus('A fila continua ativa no servidor. Você pode voltar ao painel sem interromper o processamento.');
    }
  }

  async function togglePause() {
    try { setNotice(paused ? 'Retomando a fila…' : 'Pausando novos envios…'); await messagingPolicyApi.update({ enabled: paused }); setPaused(!paused); setNotice(paused ? 'Fila retomada. Os envios continuarão respeitando os intervalos.' : 'Fila pausada. As tarefas pendentes aguardam até você retomar.'); }
    catch (error) { setNotice(error instanceof ApiClientError ? error.message : 'Não foi possível alterar o estado da fila.'); }
  }

  async function cancelBatch() {
    const pending = batchJobs.filter(job => job.status === 'PENDENTE');
    if (!pending.length) { setNotice('Não há tarefas pendentes para cancelar.'); return; }
    await Promise.all(pending.map(job => messageJobsApi.cancel(job.id).catch(() => undefined))); setNotice(`${pending.length} tarefa(s) pendente(s) cancelada(s).`); await refreshQueue();
  }

  function continueInBackground() { activeRef.current = false; setStep(1); setNotice('O envio continua no servidor. Acompanhe o resultado pelo contador da fila.'); }
  async function retry(job: QueueJob, confirmNotDelivered = false) { try { await messageJobsApi.retry(job.id, confirmNotDelivered); await refreshQueue(); } catch (error) { setNotice(error instanceof ApiClientError ? error.message : 'Não foi possível reprocessar a tarefa.'); } }
  function clearErrorsFromScreen() {
    setHiddenErrorIds(previous => {
      const next = new Set(previous);
      [...queueJobs, ...batchJobs].filter(job => job.status === 'ERRO' || job.status === 'INCERTO').forEach(job => next.add(job.id));
      return next;
    });
    setErrorDetails(null);
    setNotice('Falhas ocultadas desta tela. O histórico técnico continua salvo no sistema.');
  }
  function resetFilters() { setSearch(''); setNeighborhoodId('all'); setLabelId('all'); setSubject(''); setBirthdaysOnly(false); }

  const previewContact = firstSelected ?? contacts[0];
  const previewContent = previewContact ? replaceVariables(messageText || 'Sua mensagem aparecerá aqui.', previewContact) : 'Sua mensagem aparecerá aqui.';

  return <div className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
    <header className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-[#111b21]"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 text-2xl font-bold"><Users className="text-wa-green" /> Envio em Massa</h2><p className="text-sm text-slate-500">Organize, revise e acompanhe seus envios autorizados.</p></div><div className="flex items-center gap-3 text-xs font-semibold text-slate-500"><span>{selectedIds.size} selecionado(s)</span>{step < 3 && <button disabled={!selectedIds.size} onClick={() => setStep(2)} className="flex items-center gap-2 rounded-xl bg-wa-green px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Prosseguir <ChevronRight size={16} /></button>}</div></div><div className="mt-5 grid max-w-3xl grid-cols-3 gap-2">{[['1', 'Destinatários'], ['2', 'Mensagem e prévia'], ['3', 'Acompanhamento']].map(([number, label]) => <button key={number} onClick={() => Number(number) < step && setStep(Number(number) as Step)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold ${step === Number(number) ? 'bg-wa-green/10 text-wa-green' : step > Number(number) ? 'text-wa-green' : 'text-slate-400'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${step >= Number(number) ? 'bg-wa-green text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{step > Number(number) ? <Check size={14} /> : number}</span>{label}</button>)}</div></header>
    {notice && <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200"><Info size={17} className="mt-0.5 shrink-0" /><span className="flex-1">{notice}</span><button onClick={() => setNotice('')}><X size={16} /></button></div>}
    {loadError && <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{loadError}</span><button className="font-semibold underline" onClick={() => void loadData()}>Tentar novamente</button></div>}

    {step === 1 && <section className="flex-1 overflow-y-auto p-6">
      {queueMetrics && <div className="mb-4 flex flex-wrap gap-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-800 dark:bg-[#111b21]"><span><b className="text-amber-600">{queueMetrics.PENDENTE ?? 0}</b> pendentes</span><span><b className="text-blue-600">{queueMetrics.PROCESSANDO ?? 0}</b> processando</span><span><b className="text-wa-green">{queueMetrics.ENVIADO ?? 0}</b> enviados</span><span><b className="text-red-600">{queueMetrics.ERRO ?? 0}</b> erros</span><span><b className="text-orange-600">{queueMetrics.INCERTO ?? 0}</b> incertos</span></div>}
      {queueJobs.some(job => (job.status === 'ERRO' || job.status === 'INCERTO') && !hiddenErrorIds.has(job.id)) && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-amber-800 dark:text-amber-200"><span className="flex items-center gap-2"><AlertCircle size={17} /> Tarefas que precisam de atenção</span><button onClick={clearErrorsFromScreen} className="rounded-lg border border-amber-400 px-2.5 py-1 text-xs font-semibold">Limpar erros da tela</button></div>{queueJobs.filter(job => (job.status === 'ERRO' || job.status === 'INCERTO') && !hiddenErrorIds.has(job.id)).slice(0, 5).map(job => <div key={job.id} className="flex items-center gap-3 border-t border-amber-200/60 py-2 text-sm dark:border-amber-900/40"><span className="min-w-0 flex-1 truncate text-amber-900 dark:text-amber-100">{job.contact?.full_name || 'Contato'} — {friendlyError(job)}</span><button onClick={() => setErrorDetails(job)} className="shrink-0 text-xs font-semibold underline">Ver detalhes</button>{job.status === 'ERRO' && <button onClick={() => void retry(job)} className="shrink-0 rounded-lg border border-amber-400 px-2 py-1 text-xs font-semibold">Reprocessar</button>}{job.status === 'INCERTO' && <button onClick={() => void retry(job, true)} className="shrink-0 rounded-lg border border-orange-400 px-2 py-1 text-xs font-semibold">Reenviar após conferir</button>}</div>)}</div>}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111b21]"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><Filter size={17} className="text-wa-green" /> Filtros inteligentes</div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="relative xl:col-span-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" className="w-full rounded-lg bg-slate-100 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-wa-green/40 dark:bg-slate-800" /></label><select value={neighborhoodId} onChange={event => setNeighborhoodId(event.target.value)} className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm outline-none dark:bg-slate-800"><option value="all">Todos os bairros</option>{neighborhoods.map(neighborhood => <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.name}</option>)}</select><select value={labelId} onChange={event => setLabelId(event.target.value)} className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm outline-none dark:bg-slate-800"><option value="all">Todas as etiquetas</option>{labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select><input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Assunto" className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm outline-none dark:bg-slate-800" /></div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={birthdaysOnly} onChange={event => setBirthdaysOnly(event.target.checked)} className="accent-green-500" /> Aniversariantes do mês</label><button onClick={resetFilters} className="text-xs font-semibold text-slate-500 underline">Limpar filtros</button></div></div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111b21]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div className="flex items-center gap-2 text-sm font-bold"><Table2 size={17} className="text-wa-green" /> {loading ? 'Carregando destinatários…' : `${filteredContacts.length} destinatário(s) encontrados`}</div><button onClick={toggleVisibleSelection} disabled={!filteredContacts.length} className="flex items-center gap-2 rounded-lg border border-wa-green px-3 py-2 text-xs font-bold text-wa-green disabled:opacity-40">{allFilteredSelected ? <X size={14} /> : <Check size={14} />} {allFilteredSelected ? 'Desmarcar filtrados' : 'Selecionar todos os filtros'}</button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="w-12 px-4 py-3"></th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Bairro</th><th className="px-4 py-3">Etiquetas / assunto</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredContacts.map(contact => { const selected = selectedIds.has(contact.id); return <tr key={contact.id} onClick={() => toggleContact(contact.id)} className={`cursor-pointer transition-colors ${selected ? 'bg-wa-green/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}><td className="px-4 py-3"><input readOnly type="checkbox" checked={selected} className="h-4 w-4 accent-green-500" /></td><td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar contact={contact} /><div><div className="font-semibold">{contact.full_name}</div><div className="text-xs text-slate-500">{contact.whatsapp_opt_in ? 'Autorizado para mensagens' : 'Sem autorização'}</div></div></div></td><td className="px-4 py-3 font-mono text-xs text-slate-500">{contact.phone}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} />{contact.neighborhood?.name || 'Não informado'}</span></td><td className="px-4 py-3"><div className="flex max-w-xs flex-wrap gap-1">{contact.labels?.slice(0, 3).map(label => <span key={label.id} className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold dark:bg-slate-800"><Tag size={10} className="mr-1 inline" />{label.name}</span>)}{contactSubject(contact) && <span className="rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{contactSubject(contact)}</span>}</div></td></tr>; })}</tbody></table></div>{!loading && !filteredContacts.length && <div className="p-12 text-center text-sm text-slate-500"><Search className="mx-auto mb-3 opacity-30" size={40} />Nenhum contato corresponde aos filtros.</div>}</div>
    </section>}

    {step === 2 && <section className="flex-1 overflow-y-auto p-6"><div className="mb-4 flex items-center gap-3"><button onClick={() => setStep(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"><ArrowLeft size={19} /></button><div><h3 className="text-xl font-bold">Mensagem e prévia</h3><p className="text-sm text-slate-500">{selectedContacts.length} destinatário(s) selecionado(s)</p></div></div><div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]"><div className="space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111b21]"><div className="mb-3 flex items-center justify-between"><h4 className="flex items-center gap-2 font-bold"><MessageSquare size={18} className="text-wa-green" /> Compor mensagem</h4><span className="text-xs text-slate-500">{messageText.length}/5000</span></div><select value={templateId} onChange={event => { setTemplateId(event.target.value); const template = templates.find(item => item.id === event.target.value); if (template) setMessage(template.content); }} className="mb-3 w-full rounded-lg bg-slate-100 px-3 py-2.5 text-sm outline-none dark:bg-slate-800"><option value="">Mensagem manual</option>{templates.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}</select><textarea value={message} onChange={event => { setMessage(event.target.value); setPreviewResult(null); }} placeholder="Escreva a mensagem aqui…" className="h-48 w-full resize-none rounded-xl bg-slate-100 p-4 text-sm outline-none focus:ring-2 focus:ring-wa-green/40 dark:bg-slate-800" /><div className="mt-3 flex flex-wrap gap-2"><span className="mr-1 self-center text-xs text-slate-500">Inserir:</span>{['{nome}', '{bairro}', '{saudacao_tempo}'].map(variable => <button key={variable} onClick={() => addVariable(variable)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs hover:border-wa-green hover:text-wa-green dark:border-slate-700">{variable}</button>)}</div><p className="mt-3 text-xs text-slate-500">Use variações como <code>{'{Olá|Oi|Bom dia} {nome}'}</code>. A prévia mostra a primeira opção.</p></div><label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold dark:border-slate-700 dark:bg-[#111b21]"><Paperclip size={18} className="text-wa-green" />Adicionar imagem ou documento<input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreviewResult(null); }} /></label>{file && <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#111b21]">{filePreview ? <img src={filePreview} alt="Prévia do anexo" className="h-14 w-14 rounded-lg object-cover" /> : <FileText className="text-wa-green" size={28} />}<div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{file.name}</div><div className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</div>{uploadProgress > 0 && <div className="mt-1 h-1.5 rounded bg-slate-200"><div className="h-full rounded bg-wa-green" style={{ width: `${uploadProgress}%` }} /></div>}</div><button onClick={() => setFile(null)} className="rounded p-2 hover:bg-red-50 hover:text-red-600"><X size={16} /></button></div>}<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"><div className="mb-1 flex items-center gap-2 font-bold"><AlertCircle size={16} /> Envio responsável</div>Somente contatos autorizados entram na fila. O sistema valida o telefone, respeita o intervalo e o horário configurados e registra cada resultado.</div></div><div className="xl:sticky xl:top-0 xl:self-start"><div className="mx-auto max-w-[330px] overflow-hidden rounded-[2rem] border-8 border-slate-800 bg-slate-100 shadow-2xl dark:border-slate-950"><div className="flex items-center gap-2 bg-[#075e54] px-4 py-3 text-white"><span className="h-8 w-8 rounded-full bg-wa-green/80" /><div><div className="text-sm font-bold">{previewContact?.full_name || 'Contato'}</div><div className="text-[10px] opacity-80">online</div></div></div><div className="min-h-[380px] bg-[#efeae2] p-4 dark:bg-[#0b141a]"><div className="ml-auto max-w-[90%] rounded-xl rounded-tr-none bg-[#d9fdd3] p-3 text-sm text-slate-800 shadow-sm dark:text-slate-900">{file && (filePreview ? <img src={filePreview} alt="" className="mb-2 max-h-44 w-full rounded object-cover" /> : <div className="mb-2 flex items-center gap-2 rounded bg-white/50 p-2 text-xs"><FileText size={16} />{file.name}</div>)}<p className="whitespace-pre-wrap">{previewContent}</p><div className="mt-1 text-right text-[10px] text-slate-500">agora ✓✓</div></div></div><div className="bg-white p-3 text-xs text-slate-400">Prévia do WhatsApp</div></div><div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500"><ImageIcon size={14} /> O destinatário verá texto e anexo juntos</div></div></div><div className="mt-6 flex flex-wrap justify-end gap-3"><button onClick={() => setStep(1)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold dark:border-slate-700">Voltar</button><button onClick={() => void validateRecipients()} disabled={previewLoading || (!messageText.trim() && !file)} className="rounded-xl border border-wa-green px-5 py-3 text-sm font-bold text-wa-green disabled:opacity-40">{previewLoading ? 'Validando…' : 'Validar destinatários'}</button><button onClick={() => void startSending()} disabled={!previewResult || previewResult.key !== previewKey || !previewResult.eligible.length} className="flex items-center gap-2 rounded-xl bg-wa-green px-6 py-3 text-sm font-bold text-white disabled:opacity-40">Iniciar envio <Send size={17} /></button></div>{previewResult?.key === previewKey && <div className="mt-4 rounded-xl border border-wa-green/30 bg-wa-green/5 p-4 text-sm"><div className="font-bold text-wa-green">{previewResult.eligible.length} destinatário(s) prontos</div><div className="mt-1 text-xs text-slate-500">{previewResult.skipped.length ? `${previewResult.skipped.length} ignorado(s): ${friendlySkip(previewResult.skipped[0].reason)}.` : 'Todos os selecionados passaram pela validação.'} Limite restante hoje: {previewResult.remainingToday}.</div></div>}</section>}

    {step === 3 && <section className="flex-1 overflow-y-auto p-6"><div className="mx-auto max-w-4xl space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-2xl font-bold">Acompanhamento do envio</h3><p className="text-sm text-slate-500">A fila continua no servidor mesmo se você voltar ao painel.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void togglePause()} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Retomar envio' : 'Pausar envio'}</button><button onClick={() => void cancelBatch()} className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600">Cancelar fila</button><button onClick={continueInBackground} className="rounded-xl border border-wa-green px-4 py-2 text-sm font-semibold text-wa-green">Continuar em segundo plano</button></div></div><div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111b21]"><div className="mb-3 flex items-center justify-between text-sm"><span className="font-semibold">Progresso geral</span><strong className="text-wa-green">{sendingProgress}%</strong></div><div className="h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-wa-green transition-all duration-500" style={{ width: `${sendingProgress}%` }} /></div><div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="text-xs text-slate-500">Concluídos</div><div className="text-xl font-bold">{completedBatch}/{batchJobs.length}</div></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="text-xs text-slate-500">Velocidade</div><div className="text-xl font-bold">{speed}/min</div></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="text-xs text-slate-500">Tempo estimado</div><div className="text-xl font-bold">{remainingSeconds ? formatDuration(remainingSeconds) : 'calculando…'}</div></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="text-xs text-slate-500">Com falha</div><div className="text-xl font-bold text-red-600">{failedBatch}</div></div></div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111b21]"><div className="mb-3 flex items-center gap-2 font-bold"><LoaderCircle className="animate-spin text-wa-green" size={18} /> Contato em processamento</div><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">{currentJob?.contact ? <><div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-bold dark:bg-slate-700">{currentJob.contact.full_name?.charAt(0) || '?'}</div><div><div className="font-semibold">{currentJob.contact.full_name || 'Contato'}</div><div className="font-mono text-xs text-slate-500">{currentJob.contact.phone || 'telefone protegido'}</div></div><span className="ml-auto text-xs text-amber-600">{currentJob.status === 'PENDENTE' ? 'Aguardando intervalo de segurança' : 'Enviando agora'}</span></> : <span className="text-sm text-slate-500">{sendingStatus}</span>}</div><p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Clock3 size={14} /> {sendingStatus}{startedAt ? ` · tempo decorrido ${formatDuration(elapsedSeconds)}` : ''}</p></div>{batchJobs.some(job => job.status === 'ERRO' || job.status === 'INCERTO') && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"><div className="mb-2 font-bold text-amber-800 dark:text-amber-200">Resultados que precisam de revisão</div>{batchJobs.filter(job => job.status === 'ERRO' || job.status === 'INCERTO').map(job => <div key={job.id} className="flex items-center gap-3 border-t border-amber-200/60 py-2 text-sm dark:border-amber-900/40"><span className="flex-1">{job.contact?.full_name || 'Contato'} — {friendlyError(job)}</span><button onClick={() => setErrorDetails(job)} className="text-xs font-semibold underline">Ver detalhes</button></div>)}</div>}</div></section>}

    {errorDetails && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">Detalhes do envio</h3><button onClick={() => setErrorDetails(null)}><X /></button></div><p className="mt-4 text-sm font-semibold">{friendlyError(errorDetails)}</p><dl className="mt-4 space-y-3 rounded-xl bg-slate-100 p-4 text-xs dark:bg-slate-800"><div><dt className="font-semibold text-slate-500">Contato</dt><dd>{errorDetails.contact?.full_name || 'Não informado'} · {errorDetails.contact?.phone || 'telefone não informado'}</dd></div><div><dt className="font-semibold text-slate-500">Código técnico</dt><dd className="font-mono">{errorDetails.error_code || 'não informado'}</dd></div><div><dt className="font-semibold text-slate-500">Registro técnico</dt><dd className="break-words font-mono text-[11px]">{errorDetails.error_message || 'Não há detalhes adicionais.'}</dd></div></dl><p className="mt-4 text-xs text-slate-500">O detalhe técnico fica oculto na lista para facilitar o uso do sistema.</p><button onClick={() => setErrorDetails(null)} className="mt-5 w-full rounded-xl bg-wa-green px-4 py-3 font-bold text-white">Fechar</button></div></div>}
  </div>;
}
