import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LogOut, QrCode, RefreshCw, Settings, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiClientError, messagingPolicyApi, whatsappApi, type WhatsAppStatus } from '../lib/api';

const stateLabels: Record<WhatsAppStatus['state'], string> = {
  INICIALIZANDO: 'Inicializando',
  AGUARDANDO_AUTENTICACAO: 'Aguardando leitura do QR Code',
  CONECTADO: 'Conectado',
  DESCONECTADO: 'Desconectado',
  ERRO: 'Erro na conexão'
};

const displayPhone = (phone: string | null | undefined) => phone?.replace(/@c\.us$/i, '') || '';
type MessagingPolicy = { enabled: boolean; daily_limit: number; min_interval_seconds: number; max_interval_seconds: number; business_start: string; business_end: string; timezone: string; rescheduledPending?: number; rescheduleWarning?: string };

export default function SettingsView() {
  const { user, updatePassword } = useAuth();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [disconnectingWhatsApp, setDisconnectingWhatsApp] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState<MessagingPolicy>({ enabled: true, daily_limit: 100, min_interval_seconds: 15, max_interval_seconds: 45, business_start: '08:00', business_end: '18:00', timezone: 'America/Sao_Paulo' });
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      setStatus(await whatsappApi.status());
      setError('');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'Não foi possível consultar o WhatsApp.');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    void messagingPolicyApi.get().then(value => setPolicy(value as unknown as MessagingPolicy)).catch(() => undefined);
    const timer = window.setInterval(() => void loadStatus(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const savePolicy = async (event: FormEvent) => {
    event.preventDefault(); setSavingPolicy(true); setError(''); setMessage('');
    try {
      const saved = await messagingPolicyApi.update(policy) as unknown as MessagingPolicy;
      setPolicy(saved);
      const rescheduled = saved.rescheduledPending ?? 0;
      setMessage(saved.rescheduleWarning ?? (rescheduled > 0 ? `Limites e horário salvos. ${rescheduled} tarefa(s) pendente(s) foram reagendada(s).` : 'Limites e horário de envio salvos.'));
    }
    catch (requestError) { setError(requestError instanceof ApiClientError ? requestError.message : 'Não foi possível salvar os limites de envio.'); }
    finally { setSavingPolicy(false); }
  };

  const handlePassword = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (password.length < 6) return setError('A nova senha deve ter pelo menos 6 caracteres.');
    if (password !== confirmation) return setError('A confirmação da senha não confere.');
    setSavingPassword(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirmation('');
      setMessage('Senha alterada com sucesso.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível alterar a senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleWhatsAppDisconnect = async () => {
    setError('');
    setMessage('Solicitando desconexão do WhatsApp...');
    setDisconnectingWhatsApp(true);
    try {
      await whatsappApi.disconnect();
      setMessage('WhatsApp desconectado. Aguarde o QR Code aparecer para conectar outro número.');
      await loadStatus();
    } catch (requestError) {
      setMessage('');
      setError(requestError instanceof ApiClientError ? requestError.message : 'Não foi possível desconectar o WhatsApp.');
    } finally {
      setDisconnectingWhatsApp(false);
    }
  };

  const connected = status?.state === 'CONECTADO';

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="text-wa-green" />
          <div><h2 className="text-2xl font-bold">Configuração</h2><p className="text-sm text-slate-500">Conta e conexão do WhatsApp Web</p></div>
        </div>

        {(error || message) && <div className={`rounded-xl p-4 text-sm ${error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{error || message}</div>}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center gap-3"><KeyRound className="text-wa-green" /><div><h3 className="font-bold">Acesso da conta</h3><p className="text-xs text-slate-500">Login usado no Radar Comunitário</p></div></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Login</label><input readOnly value={user?.email || ''} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500" /></div>
            <form onSubmit={handlePassword} className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase">Nova senha</label>
              <input required type="password" minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-wa-green" />
              <input required type="password" minLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Repita a nova senha" className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-wa-green" />
              <button disabled={savingPassword} className="w-full p-3 rounded-xl bg-wa-green text-white font-bold disabled:opacity-50">{savingPassword ? 'Salvando...' : 'Alterar senha'}</button>
            </form>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Smartphone className="text-wa-green" /><div><h3 className="font-bold">WhatsApp Web</h3><p className="text-xs text-slate-500">{displayPhone(status?.phone_number) || 'Nenhum número conectado'}</p></div></div><button onClick={() => void loadStatus()} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Atualizar"><RefreshCw size={18} /></button></div>
            <div className={`rounded-xl p-4 flex items-center gap-3 ${connected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {connected ? <Wifi size={20} /> : <WifiOff size={20} />}<span className="font-bold">{loadingStatus ? 'Consultando...' : stateLabels[status?.state || 'DESCONECTADO']}</span>
            </div>
            {status?.phone_number && <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-4"><p className="text-xs font-bold text-slate-500 uppercase">Telefone conectado</p><p className="text-lg font-bold mt-1">{displayPhone(status.phone_number)}</p></div>}
            {status?.qr_code && !connected ? <div className="text-center space-y-3"><div className="flex items-center justify-center gap-2 text-sm font-bold"><QrCode size={18} /> Escaneie este QR Code no WhatsApp</div><img src={status.qr_code} alt="QR Code de conexão do WhatsApp" className="mx-auto w-64 h-64 rounded-xl border-8 border-white shadow" /></div> : connected ? <div className="text-center py-8 text-green-600"><CheckCircle2 size={48} className="mx-auto mb-2" /><p className="font-bold">WhatsApp conectado e pronto para enviar</p></div> : <div className="text-center py-8 text-slate-400"><QrCode size={48} className="mx-auto mb-2 opacity-40" /><p>Aguardando o agente disponibilizar o QR Code.</p></div>}
            {connected && <button type="button" onClick={() => void handleWhatsAppDisconnect()} disabled={disconnectingWhatsApp} className="w-full rounded-xl border border-red-200 bg-red-50 p-3 font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"><span className="inline-flex items-center justify-center gap-2"><LogOut size={18} />{disconnectingWhatsApp ? 'Desconectando...' : 'Desconectar WhatsApp'}</span></button>}
            {status?.last_seen_at && <p className="text-[11px] text-slate-400">Última comunicação: {new Date(status.last_seen_at).toLocaleString('pt-BR')}</p>}
          </div>
        </section>
        <form onSubmit={savePolicy} className="rounded-2xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div><h3 className="font-bold">Proteção dos envios</h3><p className="text-xs text-slate-500">Use apenas com contatos autorizados. O sistema respeita limite diário e horário comercial.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={event => setPolicy({ ...policy, enabled: event.target.checked })} /> Permitir novos envios</label>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-xs text-slate-500">Limite diário<input type="number" min="1" max="1000" value={policy.daily_limit} onChange={event => setPolicy({ ...policy, daily_limit: Number(event.target.value) })} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800" /></label>
            <label className="text-xs text-slate-500">Intervalo mínimo (s)<input type="number" min="5" value={policy.min_interval_seconds} onChange={event => setPolicy({ ...policy, min_interval_seconds: Number(event.target.value) })} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800" /></label>
            <label className="text-xs text-slate-500">Intervalo máximo (s)<input type="number" min="5" value={policy.max_interval_seconds} onChange={event => setPolicy({ ...policy, max_interval_seconds: Number(event.target.value) })} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800" /></label>
            <label className="text-xs text-slate-500">Fuso horário<input value={policy.timezone} onChange={event => setPolicy({ ...policy, timezone: event.target.value })} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-500">Início<input type="time" value={policy.business_start.slice(0, 5)} onChange={event => setPolicy({ ...policy, business_start: event.target.value })} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800" /></label><label className="text-xs text-slate-500">Fim<input type="time" value={policy.business_end.slice(0, 5)} onChange={event => setPolicy({ ...policy, business_end: event.target.value })} className="mt-1 w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800" /></label></div>
          <button disabled={savingPolicy} className="rounded-xl bg-wa-green px-5 py-3 text-white font-bold disabled:opacity-50">{savingPolicy ? 'Salvando...' : 'Salvar proteção dos envios'}</button>
        </form>
      </div>
    </div>
  );
}
