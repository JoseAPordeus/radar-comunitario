import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';

const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const apiBaseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY não está configurada no ambiente da API.');

async function run() {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `radar-api-${suffix}@example.invalid`;
  const password = `ApiTest-${suffix}!Aa9`;
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: WebSocket as never } };
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
  const anon = createClient(env.SUPABASE_URL, anonKey!, clientOptions);
  let userId: string | null = null;
  const contactIds: string[] = [];

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', Authorization: `Bearer ${sessionToken}`, ...(init.headers || {}) }
    });
    const body = await response.json().catch(() => null) as { data?: any; error?: { message?: string } } | null;
    return { response, body };
  }

  async function uploadMedia(fileName: string, contentType: string, body: Buffer) {
    const response = await fetch(`${apiBaseUrl}/api/v1/media`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${sessionToken}`, 'Content-Type': contentType, 'X-File-Name': fileName },
      body: body as unknown as BodyInit
    });
    const payload = await response.json().catch(() => null) as { data?: { storagePath?: string; url?: string }; error?: { message?: string } } | null;
    return { response, payload };
  }

  let sessionToken = '';
  const mediaPaths: string[] = [];
  try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Não foi possível criar o usuário temporário.');
    userId = created.data.user.id;
    const signedIn = await anon.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error('Não foi possível autenticar o usuário temporário.');
    sessionToken = signedIn.data.session.access_token;

    const { data: city, error: cityError } = await service.from('cities').select('id').limit(1).single();
    if (cityError || !city) throw new Error('Nenhuma cidade disponível para a homologação autenticada.');

    const createContact = async (index: number, optIn: boolean) => {
      const response = await api('/api/v1/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: `Homologação API ${index} ${suffix}`, phone: `5583${String(Date.now() + index).slice(-9)}`, city_id: city.id, whatsapp_opt_in: optIn })
      });
      const contactId = response.body?.data?.id as string | undefined;
      if (response.response.status !== 201 || !contactId) throw new Error(`A criação do contato temporário falhou (HTTP ${response.response.status}).`);
      contactIds.push(contactId);
      return contactId;
    };

    const noOptInId = await createContact(1, false);
    const blockedId = await createContact(2, true);
    const eligibleId = await createContact(3, true);
    const { error: blockError } = await service.from('contacts').update({ messaging_blocked: true }).eq('id', blockedId).eq('owner_id', userId);
    if (blockError) throw new Error('Não foi possível preparar o contato bloqueado.');

    const [contacts, dashboard, whatsapp, conversations, metrics] = await Promise.all([
      api('/api/v1/contacts?page=1&pageSize=100'),
      api('/api/v1/analytics/dashboard'),
      api('/api/v1/whatsapp/status'),
      api('/api/v1/conversations'),
      api('/api/v1/message-jobs/metrics')
    ]);
    for (const [name, result] of [['CRM', contacts], ['Dashboard', dashboard], ['WhatsApp', whatsapp], ['Conversas', conversations], ['Fila', metrics]] as const) {
      if (result.response.status !== 200) throw new Error(`${name} autenticado falhou (HTTP ${result.response.status}).`);
    }

    const preview = await api('/api/v1/message-jobs/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: [
        { contactId: noOptInId, content: 'Homologação sem envio', type: 'CAMPANHA' },
        { contactId: blockedId, content: 'Homologação sem envio', type: 'CAMPANHA' }
      ] })
    });
    if (preview.response.status !== 200) throw new Error(`Preview autenticado falhou (HTTP ${preview.response.status}).`);
    const reasons = new Set((preview.body?.data?.skipped ?? []).map((item: { reason?: string }) => item.reason));
    const createdJob = await api('/api/v1/message-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: [{ contactId: eligibleId, content: 'Homologacao de fila sem envio real', type: 'CAMPANHA' }] })
    });
    if (createdJob.response.status !== 201 || !createdJob.body?.data?.created?.length) {
      throw new Error(`Criacao autenticada de tarefa falhou (HTTP ${createdJob.response.status}): ${JSON.stringify(createdJob.body?.error ?? createdJob.body)}`);
    }
    if (!reasons.has('WHATSAPP_OPT_IN_REQUIRED') || !reasons.has('MESSAGING_BLOCKED')) throw new Error('O preview não bloqueou corretamente o contato sem consentimento e o contato bloqueado.');

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pdf = Buffer.from('%PDF-1.7\n% homologacao');
    const imageUpload = await uploadMedia('homologacao.png', 'image/png', png);
    if (imageUpload.response.status !== 201 || !imageUpload.payload?.data?.storagePath || !imageUpload.payload.data.url) throw new Error(`Upload privado de imagem falhou (HTTP ${imageUpload.response.status}).`);
    mediaPaths.push(imageUpload.payload.data.storagePath);
    const documentUpload = await uploadMedia('homologacao.pdf', 'application/pdf', pdf);
    if (documentUpload.response.status !== 201 || !documentUpload.payload?.data?.storagePath || !documentUpload.payload.data.url) throw new Error(`Upload privado de documento falhou (HTTP ${documentUpload.response.status}).`);
    mediaPaths.push(documentUpload.payload.data.storagePath);

    console.log('[OK] CRM, Dashboard, WhatsApp, Conversas e Fila responderam com sessão autenticada.');
    console.log('[OK] Preview impediu contato sem opt-in e contato bloqueado; nenhuma mensagem foi enviada.');
    console.log('[OK] Upload privado de imagem e documento gerou URL assinada; arquivos temporários serão removidos.');
  } finally {
    if (mediaPaths.length) await service.storage.from('message-media').remove(mediaPaths);
    if (contactIds.length) await service.from('contacts').delete().in('id', contactIds);
    if (userId) await service.auth.admin.deleteUser(userId);
  }
}

run().catch(error => {
  console.error(`[FALHA] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
