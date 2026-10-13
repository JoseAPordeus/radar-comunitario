import React, { useEffect, useRef, useState } from 'react';
import { FileText, Headphones, LoaderCircle, MessageSquare, Paperclip, RefreshCw, Send, UserRound, X } from 'lucide-react';
import { ApiClientError, audioApi, citiesApi, conversationsApi, messageJobsApi, neighborhoodsApi, teamApi, uploadMediaWithProgress } from '../lib/api';
import type { City, Neighborhood } from '../types';

type Conversation = { id: string; status: 'OPEN' | 'PENDING' | 'CLOSED'; assigned_to?: string | null; subject?: string | null; last_message_at: string | null; contact?: { id?: string; full_name?: string; phone?: string; avatar_url?: string | null; city_id?: string; neighborhood_id?: string; city?: { name?: string } | null; neighborhood?: { name?: string } | null } | null };
type ConversationMessage = { id: string; direction: 'INBOUND' | 'OUTBOUND'; content: string; message_type: string; created_at: string; sender_phone?: string | null; sender_display_name?: string | null; quoted_content?: string | null; media_url?: string | null; media_mime_type?: string | null; media_filename?: string | null };

function MessageAttachment({ message }: { message: ConversationMessage }) {
  if (!message.media_url) return null;
  if (message.media_mime_type?.startsWith('image/')) {
    return <a href={message.media_url} target="_blank" rel="noreferrer" className="block mb-2"><img src={message.media_url} alt={message.media_filename || 'Imagem recebida'} className="max-h-64 max-w-full rounded-lg object-contain" /></a>;
  }
  const isAudio = message.media_mime_type?.startsWith('audio/');
  return <a href={message.media_url} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline">{isAudio ? <Headphones size={16} /> : <FileText size={16} />}Abrir anexo{message.media_filename ? `: ${message.media_filename}` : ''}</a>;
}

function ContactAvatar({ conversation, size = 'w-9 h-9' }: { conversation: Conversation; size?: string }) {
  const name = conversation.contact?.full_name || 'Contato';
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = conversation.contact?.avatar_url;
  useEffect(() => setImageFailed(false), [avatarUrl]);
  return avatarUrl && !imageFailed
    ? <img src={avatarUrl} alt={name} onError={() => setImageFailed(true)} className={`${size} rounded-full object-cover`} />
    : <span className={`${size} rounded-full bg-wa-green text-white flex items-center justify-center`}><UserRound size={17} /></span>;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ConversationsView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversationError, setConversationError] = useState('');
  const [audioStatus, setAudioStatus] = useState('');
  const [transcript, setTranscript] = useState('');
  const [subjectDraft, setSubjectDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<Conversation['status']>('OPEN');
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replyPreviewUrl, setReplyPreviewUrl] = useState('');
  const [replyUploadProgress, setReplyUploadProgress] = useState(0);
  const [replyStatus, setReplyStatus] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filterCityId, setFilterCityId] = useState('');
  const [filterNeighborhoodId, setFilterNeighborhoodId] = useState('');
  const [filterAssignedTo, setFilterAssignedTo] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | Conversation['status']>('');
  const [cities, setCities] = useState<City[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!replyFile?.type.startsWith('image/')) {
      setReplyPreviewUrl('');
      return;
    }
    const previewUrl = URL.createObjectURL(replyFile);
    setReplyPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [replyFile]);

  const loadConversations = async (silent = false) => {
    if (!silent) setLoading(true);
    setConversationError('');
    try {
      const data = await conversationsApi.list({ cityId: filterCityId || undefined, neighborhoodId: filterNeighborhoodId || undefined, assignedTo: filterAssignedTo || undefined, subject: filterSubject.trim() || undefined, status: filterStatus || undefined });
      const items = data as unknown as Conversation[];
      setConversations(items);
      // Durante o polling, preserve a mesma referência da conversa selecionada.
      // Se ela for trocada a cada ciclo, o efeito das mensagens reinicia, limpa
      // o histórico e tira o usuário da continuação da conversa.
      setSelected(current => current && items.some(item => item.id === current.id) ? current : items[0] ?? null);
    } catch (error) {
      // Uma falha transitória do polling não deve apagar a tela que o usuário
      // já está usando. Só a carga inicial substitui a lista por estado vazio.
      if (!silent) {
        setConversations([]);
        setConversationError(error instanceof ApiClientError ? error.message : 'Nao foi possivel carregar as conversas.');
      }
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void Promise.allSettled([citiesApi.list(), neighborhoodsApi.list(), teamApi.list()]).then(([cityResult, neighborhoodResult, teamResult]) => {
      if (cityResult.status === 'fulfilled') setCities(cityResult.value);
      if (neighborhoodResult.status === 'fulfilled') setNeighborhoods(neighborhoodResult.value);
      if (teamResult.status === 'fulfilled') setTeam(teamResult.value.map(item => ({ id: item.id, name: item.name })));
    });
  }, []);
  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(true), 5000);
    return () => window.clearInterval(timer);
  }, [filterCityId, filterNeighborhoodId, filterAssignedTo, filterSubject, filterStatus]);
  useEffect(() => {
    if (!selected) { setMessages([]); setMessagesError(''); setMessagesLoading(false); return; }
    setSubjectDraft(selected.subject || '');
    setStatusDraft(selected.status);
    setMessagesError('');
    setMessages([]);
    lastMessageAtRef.current = null;
    setMessagesLoading(true);
    let active = true;
    const loadMessages = () => conversationsApi.messages(selected.id, lastMessageAtRef.current ? { after: lastMessageAtRef.current } : {})
      .then(data => {
        if (!active) return;
        const incoming = data as unknown as ConversationMessage[];
        const currentLatestMs = lastMessageAtRef.current ? Date.parse(lastMessageAtRef.current) : Number.NEGATIVE_INFINITY;
        const newestIncomingMs = incoming.reduce((latest, message) => {
          const timestamp = Date.parse(message.created_at);
          return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
        }, currentLatestMs);
        if (Number.isFinite(newestIncomingMs)) lastMessageAtRef.current = new Date(newestIncomingMs).toISOString();
        const container = messagesContainerRef.current;
        const keepAtBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 96;
        setMessages(previous => {
          const merged = new Map<string, ConversationMessage>(previous.map(message => [message.id, message] as [string, ConversationMessage]));
          incoming.forEach(message => merged.set(message.id, message));
          const chronological = [...merged.values()].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
          const seenOutbound: Array<{ signature: string; timestamp: number }> = [];
          const next = chronological.filter(message => {
            // Protege a tela contra registros duplicados antigos gerados pelo
            // retorno do envio e pelo evento do WhatsApp para a mesma mensagem.
            // Mensagens recebidas não são agrupadas por conteúdo, pois o contato
            // pode enviar o mesmo texto legitimamente várias vezes.
            if (message.direction !== 'OUTBOUND') return true;
            const signature = [
              message.message_type,
              message.content,
              message.media_url ?? ''
            ].join('|');
            const timestamp = Date.parse(message.created_at);
            const duplicated = seenOutbound.some(previous => previous.signature === signature
              && Number.isFinite(timestamp)
              && Number.isFinite(previous.timestamp)
              && Math.abs(timestamp - previous.timestamp) <= 2_000);
            if (duplicated) return false;
            seenOutbound.push({ signature, timestamp });
            return true;
          });
          if (next.length === previous.length && next.every((message, index) => message.id === previous[index]?.id && message.content === previous[index]?.content)) return previous;
          window.setTimeout(() => {
            if (keepAtBottom && messagesContainerRef.current) messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }, 0);
          return next;
        });
        setMessagesError('');
      })
      .catch(error => { if (active) setMessagesError(error instanceof ApiClientError ? error.message : 'Nao foi possivel carregar as mensagens.'); })
      .finally(() => { if (active) setMessagesLoading(false); });
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.id]);

  const saveConversation = async () => {
    if (!selected) return;
    try {
      const updated = await conversationsApi.update(selected.id, { subject: subjectDraft.trim() || null, status: statusDraft });
      setSelected({ ...selected, ...(updated as unknown as Conversation) });
      setConversations(items => items.map(item => item.id === selected.id ? { ...item, ...(updated as unknown as Conversation) } : item));
    } catch (error) {
      setAudioStatus(error instanceof ApiClientError ? error.message : 'Nao foi possivel atualizar a conversa.');
    }
  };

  const sendReply = async () => {
    if (!selected?.contact?.id || (!replyText.trim() && !replyFile)) return;
    setReplyStatus('Preparando envio...');
    try {
      let media: { url?: string; storagePath?: string; mimeType?: string; fileName?: string; caption?: string } | undefined;
      if (replyFile) {
        setReplyUploadProgress(0);
        setReplyStatus('Enviando anexo...');
        const uploaded = await uploadMediaWithProgress(replyFile, progress => setReplyUploadProgress(progress));
        media = { url: uploaded.url, storagePath: uploaded.storagePath, mimeType: uploaded.mimeType, fileName: uploaded.fileName, caption: replyText.trim() };
      }
      await messageJobsApi.create([{
        contactId: selected.contact.id,
        content: replyText.trim() || `[Anexo: ${replyFile?.name ?? 'arquivo'}]`,
        type: 'CAMPANHA',
        ...(media ? { media } : {})
      }]);
      setReplyText('');
      setReplyFile(null);
      setAudioStatus('');
      setReplyUploadProgress(0);
      setReplyStatus('Mensagem adicionada à fila de envio.');
      await loadConversations();
    } catch (error) {
      setReplyStatus(error instanceof ApiClientError ? error.message : 'Nao foi possivel enviar a mensagem.');
    }
  };

  const analyzeAudio = async (file: File) => {
    setAudioStatus('Enviando audio para analise...');
    setTranscript('');
    try {
      const job = await audioApi.upload(file);
      setAudioStatus('Processando o audio...');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = await audioApi.get(job.id);
        if (result.status === 'CONCLUIDO') { setTranscript(result.transcript || 'Nenhuma fala foi identificada.'); setAudioStatus('Audio processado.'); return; }
        if (result.status === 'ERRO') throw new Error(result.error_message || 'Nao foi possivel processar o audio.');
        if (result.error_code === 'AUDIO_RETRY_SCHEDULED') setAudioStatus('Tentando novamente o processamento do audio...');
      }
      setAudioStatus('O audio ainda esta sendo processado. Atualize em alguns instantes.');
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'AUDIO_TRANSCRIPTION_NOT_CONFIGURED') {
          setAudioStatus('Transcricao indisponivel. Para enviar o audio, use o clipe no campo de mensagem.');
          return;
        }
        setAudioStatus(error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : 'Falha ao analisar o audio.');
    }
  };

  const visibleConversations = conversations.filter(conversation => {
    const search = searchName.trim().toLocaleLowerCase();
    if (!search) return true;
    const name = conversation.contact?.full_name?.toLocaleLowerCase() || '';
    return name.includes(search);
  });

  return <div className="wa-chat-bg flex-1 min-h-0 flex flex-col p-6 gap-4">
    <div className="flex items-center justify-between">
      <div><h2 className="text-2xl font-bold">Conversas</h2><p className="wa-muted text-sm">Mensagens recebidas e enviadas pelo WhatsApp.</p></div>
      <button onClick={() => void loadConversations()} className="wa-muted rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10" title="Atualizar"><RefreshCw size={18} /></button>
    </div>
    <div className="wa-surface rounded-2xl border p-3">
      <input value={searchName} onChange={event => setSearchName(event.target.value)} placeholder="Buscar conversa por nome..." aria-label="Buscar conversa por nome" className="wa-input w-full rounded-lg p-2 text-sm" />
    </div>
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      <section className="wa-surface overflow-y-auto rounded-2xl border">
        {loading ? <div className="p-6 text-slate-500">Carregando conversas...</div> : conversationError ? <div className="p-6 text-red-500">{conversationError}<button className="mt-2 block text-sm underline" onClick={() => void loadConversations()}>Tentar novamente</button></div> : conversations.length === 0 ? <div className="p-6 text-slate-500">Ainda nao ha mensagens persistidas.</div> : visibleConversations.length === 0 ? <div className="p-6 text-slate-500">Nenhum nome encontrado.</div> : visibleConversations.map(conversation => <button key={conversation.id} onClick={() => setSelected(conversation)} className={`w-full p-4 text-left border-b border-slate-100 dark:border-slate-800 ${selected?.id === conversation.id ? 'bg-wa-green/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}><div className="flex items-center gap-3"><ContactAvatar conversation={conversation} /><span className="min-w-0"><strong className="block truncate">{conversation.contact?.full_name || 'Contato'}</strong><small className="text-slate-500">{conversation.contact?.phone || 'Telefone nao informado'}</small></span></div></button>)}
      </section>
      <section className="wa-surface flex min-h-0 flex-col rounded-2xl border p-5">
        {!selected ? <div className="flex flex-1 items-center justify-center text-slate-500"><MessageSquare size={18} className="mr-2" />Selecione uma conversa</div> : <>
          <header className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <ContactAvatar conversation={selected} size="w-10 h-10" />
            <div className="min-w-0"><h3 className="truncate font-semibold">{selected.contact?.full_name || 'Contato'}</h3><p className="text-xs text-slate-500">{selected.contact?.phone || 'Telefone nao informado'}{selected.contact?.city?.name ? ` · ${selected.contact.city.name}` : ''}{selected.contact?.neighborhood?.name ? ` · ${selected.contact.neighborhood.name}` : ''}</p></div>
          </header>
          <div className="flex gap-2 border-b border-slate-200 py-3 dark:border-slate-800">
            <input value={subjectDraft} onChange={event => setSubjectDraft(event.target.value)} placeholder="Assunto da conversa" className="wa-input min-w-0 flex-1 rounded-lg p-2 text-sm" />
            <select value={statusDraft} onChange={event => setStatusDraft(event.target.value as Conversation['status'])} className="wa-input rounded-lg p-2 text-sm"><option value="OPEN">Aberta</option><option value="PENDING">Pendente</option><option value="CLOSED">Encerrada</option></select>
            <button type="button" onClick={() => void saveConversation()} className="rounded-lg bg-wa-green px-4 py-2 text-sm font-semibold text-white">Salvar</button>
          </div>
          <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
            {messagesLoading && messages.length === 0 ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" />Carregando mensagens...</div> : messages.length === 0 ? <div className="flex items-center justify-center py-10 text-sm text-slate-500">Nenhuma mensagem nesta conversa.</div> : messages.map(message => {
              const outgoing = message.direction === 'OUTBOUND';
              return <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                <article className={`max-w-[86%] rounded-lg px-3 py-2 text-sm shadow-sm ${outgoing ? 'wa-bubble-out' : 'wa-bubble-in'}`}>
                  {message.quoted_content && <div className="mb-2 border-l-2 border-wa-green pl-2 text-xs opacity-70">{message.quoted_content}</div>}
                  <MessageAttachment message={message} />
                  {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] wa-message-time"><span>{formatMessageTime(message.created_at)}</span>{outgoing && <span aria-label="Enviada">✓✓</span>}</div>
                </article>
              </div>;
            })}
          </div>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:border-wa-green dark:border-slate-700"><Paperclip size={16} />Adicionar áudio<input type="file" className="hidden" accept="audio/ogg,audio/mpeg,audio/wav,audio/mp4,audio/webm,.mp3,.m4a" onChange={event => { const file = event.target.files?.[0]; if (file) { setReplyFile(file); setAudioStatus('Áudio anexado para envio. Clique no botão enviar.'); } event.currentTarget.value = ''; }} /></label>{audioStatus && <span className="ml-3 text-xs text-slate-500">{audioStatus}</span>}<p className="mt-2 text-xs text-slate-500">Este clipe apenas anexa o áudio. A transcrição não é executada.</p>
            {replyFile && <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">
              {replyPreviewUrl ? <img src={replyPreviewUrl} alt="Pré-visualização do anexo" className="h-12 w-12 rounded-lg object-cover" /> : <FileText size={15} className="text-wa-green" />}
              <span className="min-w-0 flex-1 truncate"><strong className="block truncate">{replyFile.name}</strong><span className="text-slate-500">{replyFile.type || 'tipo desconhecido'} · {Math.max(1, Math.round(replyFile.size / 1024))} KB</span></span>
              <button type="button" onClick={() => { setReplyFile(null); setReplyUploadProgress(0); }} aria-label="Remover anexo"><X size={15} /></button>
            </div>}
            {replyUploadProgress > 0 && <div className="mt-2 text-[11px] text-slate-500">Upload do anexo: {replyUploadProgress}%</div>}
            <div className="mt-3 flex items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-300 p-2 dark:border-slate-700" title="Adicionar imagem, documento ou áudio"><Paperclip size={17} /><input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,audio/ogg,audio/mpeg,audio/wav,audio/mp4,audio/webm,.mp3,.m4a" onChange={event => setReplyFile(event.target.files?.[0] ?? null)} /></label>
              <input value={replyText} onChange={event => setReplyText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendReply(); } }} placeholder="Responder pelo WhatsApp..." className="wa-input min-w-0 flex-1 rounded-lg p-3 text-sm" />
              <button type="button" onClick={() => void sendReply()} disabled={!replyText.trim() && !replyFile} className="rounded-lg bg-wa-green p-3 text-white disabled:opacity-50" title="Enviar mensagem"><Send size={17} /></button>
            </div>
            {replyStatus && <p className="mt-2 text-xs text-slate-500">{replyStatus}</p>}
          </div>
        </>}
        {messagesError && <p className="mt-2 text-xs text-red-500">{messagesError}</p>}
      </section>
    </div>
  </div>;
}
