import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';

const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const apiBaseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
function createSupabaseClient(key: string) {
  return createClient(env.SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as never }
  });
}

const service = createSupabaseClient(env.SUPABASE_SERVICE_ROLE_KEY);

type TestUser = { id: string; email: string; password: string; client: SupabaseClient; token: string };

if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY não está configurada no ambiente da API.');

async function apiRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => null) as { data?: any; error?: { message?: string } } | null;
  return { response, body };
}

async function createTestUser(index: number, suffix: string): Promise<TestUser> {
  const email = `radar-rls-${suffix}-${index}@example.invalid`;
  const password = `RlsTest-${suffix}-${index}!Aa9`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Não foi possível criar o usuário de homologação ${index}.`);
  const client = createSupabaseClient(anonKey!);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    await service.auth.admin.deleteUser(created.data.user.id);
    throw new Error(`Não foi possível autenticar o usuário de homologação ${index}.`);
  }
  return { id: created.data.user.id, email, password, client, token: signedIn.data.session.access_token };
}

async function run() {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const users: TestUser[] = [];
  let contactId: string | null = null;

  try {
    users.push(await createTestUser(1, suffix));
    users.push(await createTestUser(2, suffix));
    const owner = users[0]!;
    const other = users[1]!;

    const { data: city, error: cityError } = await service.from('cities').select('id').limit(1).single();
    if (cityError || !city) throw new Error('Nenhuma cidade disponível para a homologação de RLS.');

    const phone = `5583${String(Date.now()).slice(-9)}`;
    const createdContact = await apiRequest(owner.token, '/api/v1/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: `Contato RLS ${suffix}`, phone, city_id: city.id })
    });
    const contactData = createdContact.body?.data as { id?: string } | undefined;
    if (createdContact.response.status !== 201 || !contactData?.id) throw new Error(`A criação do contato de teste falhou (HTTP ${createdContact.response.status}).`);
    contactId = contactData.id;

    const ownRows = await owner.client.from('contacts').select('id').eq('id', contactId);
    const foreignRows = await other.client.from('contacts').select('id').eq('id', contactId);
    if (ownRows.error || ownRows.data?.length !== 1) throw new Error(`O usuário proprietário não conseguiu ler seu contato via RLS (linhas=${ownRows.data?.length ?? 0}, código=${ownRows.error?.code ?? 'nenhum'}).`);
    if (foreignRows.error || foreignRows.data?.length !== 0) throw new Error(`O segundo usuário conseguiu enxergar dados protegidos por RLS (linhas=${foreignRows.data?.length ?? 0}, código=${foreignRows.error?.code ?? 'nenhum'}).`);

    const foreignApi = await apiRequest(other.token, `/api/v1/contacts/${contactId}`);
    if (foreignApi.response.status !== 404) throw new Error(`A API expôs o contato para outro usuário (HTTP ${foreignApi.response.status}).`);

    const dashboard = await apiRequest(owner.token, '/api/v1/analytics/dashboard');
    const whatsapp = await apiRequest(owner.token, '/api/v1/whatsapp/status');
    if (dashboard.response.status !== 200 || whatsapp.response.status !== 200) throw new Error('As rotas autenticadas de Dashboard ou WhatsApp falharam.');

    console.log('[OK] RLS autenticado validado com dois usuários temporários.');
    console.log('[OK] Dashboard e WhatsApp responderam com sessão válida.');
  } finally {
    if (contactId) await service.from('contacts').delete().eq('id', contactId);
    for (const user of users) await service.auth.admin.deleteUser(user.id);
  }
}

run().catch(error => {
  console.error(`[FALHA] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
