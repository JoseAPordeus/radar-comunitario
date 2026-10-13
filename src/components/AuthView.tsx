import { FormEvent, useState } from 'react';
import { AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthView() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError('E-mail ou senha inválidos. Verifique sua conta e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0b141a] p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 bg-white dark:bg-[#111b21] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-wa-green flex items-center justify-center text-white text-2xl font-bold">R</div>
          <h1 className="text-2xl font-bold">Entrar no Radar</h1>
          <p className="text-sm text-slate-500">Use sua conta autorizada para acessar os contatos.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 p-3 text-sm">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-semibold">E-mail</span>
          <input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-wa-green" autoComplete="email" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold">Senha</span>
          <input required type="password" value={password} onChange={event => setPassword(event.target.value)} className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-wa-green" autoComplete="current-password" />
        </label>

        <button disabled={loading} className="w-full py-3 rounded-xl bg-wa-green hover:bg-wa-teal disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2">
          <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
