import { supabase } from './supabase';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ApiClientError('Não foi possível recuperar a sessão.', 401, 'SESSION_ERROR');
  return data.session?.access_token;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiClientError('Não foi possível conectar à API.', 0, 'API_UNAVAILABLE');
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(
      body?.error?.message || 'A API recusou a operação.',
      response.status,
      body?.error?.code
    );
  }

  return body?.data as T;
}

export interface ApiContactList {
  items: import('../types').Contact[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const contactsApi = {
  list: (params: { page?: number; pageSize?: number; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search) query.set('search', params.search);
    return apiRequest<ApiContactList>(`/contacts${query.toString() ? `?${query}` : ''}`);
  },
  listAll: async (params: { search?: string } = {}) => {
    const pageSize = 100;
    const firstPage = await contactsApi.list({ ...params, page: 1, pageSize });
    const pages = await Promise.all(
      Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
        contactsApi.list({ ...params, page: index + 2, pageSize })
      )
    );
    return [firstPage, ...pages].flatMap(page => page.items);
  },
  create: (payload: Record<string, unknown>) => apiRequest<import('../types').Contact>('/contacts', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  update: (id: string, payload: Record<string, unknown>) => apiRequest<import('../types').Contact>(`/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  remove: (id: string) => apiRequest<void>(`/contacts/${id}`, { method: 'DELETE' }),
  assignLabel: (id: string, labelId: string) => apiRequest<void>(`/contacts/${id}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labelId })
  }),
  removeLabel: (id: string, labelId: string) => apiRequest<void>(`/contacts/${id}/labels/${labelId}`, { method: 'DELETE' })
};

export const labelsApi = {
  list: () => apiRequest<import('../types').Label[]>('/labels'),
  create: (payload: { name: string; color: string }) => apiRequest<import('../types').Label>('/labels', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  update: (id: string, payload: Partial<{ name: string; color: string }>) => apiRequest<import('../types').Label>(`/labels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  remove: (id: string) => apiRequest<void>(`/labels/${id}`, { method: 'DELETE' })
};

export const neighborhoodsApi = {
  list: () => apiRequest<import('../types').Neighborhood[]>('/neighborhoods')
};

export const citiesApi = {
  list: () => apiRequest<import('../types').City[]>('/cities')
};

export const teamApi = {
  list: () => apiRequest<Array<{ id: string; email: string | null; name: string }>>('/team')
};

export const templatesApi = {
  list: (active = false) => apiRequest<import('../types').MessageTemplate[]>(`/message-templates${active ? '?active=true' : ''}`),
  create: (payload: Omit<import('../types').MessageTemplate, 'id' | 'created_at'>) => apiRequest<import('../types').MessageTemplate>('/message-templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  update: (id: string, payload: Partial<Omit<import('../types').MessageTemplate, 'id' | 'created_at'>>) => apiRequest<import('../types').MessageTemplate>(`/message-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  remove: (id: string) => apiRequest<void>(`/message-templates/${id}`, { method: 'DELETE' })
};

export const birthdayAutomationApi = {
  get: () => apiRequest<import('../types').AutomationSettings>('/automation-settings/birthday'),
  update: (payload: import('../types').AutomationSettings) => apiRequest<import('../types').AutomationSettings>('/automation-settings/birthday', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  run: () => apiRequest<{ created: Array<{ id: string; contact_id: string; status: string }>; skipped: Array<{ contactId: string; reason: string }> }>('/automation-settings/birthday/run', {
    method: 'POST'
  })
};

export interface WhatsAppStatus {
  agent_id: string;
  state: 'INICIALIZANDO' | 'AGUARDANDO_AUTENTICACAO' | 'CONECTADO' | 'DESCONECTADO' | 'ERRO';
  version: string | null;
  last_seen_at: string | null;
  qr_code: string | null;
  phone_number: string | null;
}

export const whatsappApi = {
  status: () => apiRequest<WhatsAppStatus>('/whatsapp/status'),
  disconnect: () => apiRequest<{ requested: boolean }>('/whatsapp/disconnect', { method: 'POST' })
};

export const mediaApi = {
  upload: async (file: File) => {
    const token = await getAccessToken();
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': file.name
    });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${apiBaseUrl}/media`, { method: 'POST', headers, body: file });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiClientError(body?.error?.message || 'Não foi possível enviar o arquivo.', response.status, body?.error?.code);
    return body.data as { url: string; path: string; storagePath: string; fileName: string; mimeType: string; size: number };
  }
};

export async function uploadMediaWithProgress(file: File, onProgress?: (progress: number) => void) {
  const token = await getAccessToken();
  return new Promise<{ url: string; path: string; storagePath: string; fileName: string; mimeType: string; size: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBaseUrl}/media`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', file.name);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.onerror = () => reject(new ApiClientError('NÃ£o foi possÃ­vel enviar o arquivo.', 0, 'MEDIA_UPLOAD_FAILED'));
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || 'null') as { data?: unknown; error?: { message?: string; code?: string } } | null;
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiClientError(body?.error?.message || 'NÃ£o foi possÃ­vel enviar o arquivo.', xhr.status, body?.error?.code));
        return;
      }
      onProgress?.(100);
      resolve(body?.data as { url: string; path: string; storagePath: string; fileName: string; mimeType: string; size: number });
    };
    xhr.send(file);
  });
}

export const conversationsApi = {
  list: (params: { cityId?: string; neighborhoodId?: string; assignedTo?: string; subject?: string; status?: 'OPEN' | 'PENDING' | 'CLOSED' } = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, value); });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Array<Record<string, unknown>>>(`/conversations${suffix}`);
  },
  messages: (id: string, params: { after?: string } = {}) => {
    const query = params.after ? `?after=${encodeURIComponent(params.after)}` : '';
    return apiRequest<Array<Record<string, unknown>>>(`/conversations/${id}/messages${query}`);
  },
  update: (id: string, payload: { status?: 'OPEN' | 'PENDING' | 'CLOSED'; assignedTo?: string | null; subject?: string | null }) => apiRequest<Record<string, unknown>>(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
};

export const audioApi = {
  upload: async (file: File) => {
    const token = await getAccessToken();
    const headers = new Headers({ Accept: 'application/json', 'Content-Type': file.type || 'audio/ogg', 'X-File-Name': file.name });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${apiBaseUrl}/audio`, { method: 'POST', headers, body: file });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiClientError(body?.error?.message || 'Não foi possível enviar o áudio.', response.status, body?.error?.code);
    return body.data as { id: string; status: string; created_at: string };
  },
  get: (id: string) => apiRequest<{ id: string; status: string; file_name: string; mime_type: string; transcript: string | null; intent: unknown; error_code: string | null; error_message: string | null }>(`/audio/${id}`)
};

export const messagingPolicyApi = {
  get: () => apiRequest<Record<string, unknown>>('/messaging-policy'),
  update: (payload: Record<string, unknown>) => apiRequest<Record<string, unknown>>('/messaging-policy', { method: 'PATCH', body: JSON.stringify(payload) })
};

export const analyticsApi = {
  dashboard: (params: { from?: string; to?: string; cityId?: string; neighborhoodId?: string; assignedTo?: string; labelId?: string; subject?: string; status?: 'OPEN' | 'PENDING' | 'CLOSED' } = {}) => {
    const query = new URLSearchParams();
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.cityId) query.set('cityId', params.cityId);
    if (params.neighborhoodId) query.set('neighborhoodId', params.neighborhoodId);
    if (params.assignedTo) query.set('assignedTo', params.assignedTo);
    if (params.labelId) query.set('labelId', params.labelId);
    if (params.subject) query.set('subject', params.subject);
    if (params.status) query.set('status', params.status);
    return apiRequest<{
      totalContacts: number;
      pendingDemands: number;
      resolvedThisPeriod: number;
      birthdaysThisMonth: number;
      neighborhoods: Array<{ id: string; name: string; total: number }>;
      labels: Array<{ id: string; name: string; color: string; total: number }>;
      activitySeries: Array<{ date: string; total: number }>;
      conversationStatuses: Array<{ status: 'OPEN' | 'PENDING' | 'CLOSED'; total: number }>;
    }>(`/analytics/dashboard${query.toString() ? `?${query}` : ''}`);
  }
};

export const messageJobsApi = {
  preview: (jobs: Array<{ contactId: string; content: string; type: 'ANIVERSARIO' | 'CAMPANHA'; templateId?: string; media?: { url?: string; storagePath?: string; mimeType?: string; fileName?: string; caption?: string } }>) =>
    apiRequest<{ eligible: Array<{ contactId: string; availableAt: string; hasMedia: boolean; mediaMimeType: string | null }>; skipped: Array<{ contactId: string; reason: string }>; policy: Record<string, unknown>; remainingToday: number }>('/message-jobs/preview', {
      method: 'POST',
      body: JSON.stringify({ jobs })
    }),
  create: (jobs: Array<{ contactId: string; content: string; type: 'ANIVERSARIO' | 'CAMPANHA'; templateId?: string; media?: { url?: string; storagePath?: string; mimeType?: string; fileName?: string; caption?: string } }>) => apiRequest<{ created: Array<{ id: string; contact_id: string; status: string }>; skipped: Array<{ contactId: string; reason: string }> }>('/message-jobs', {
    method: 'POST',
    body: JSON.stringify({ jobs })
  }),
  list: (params: { page?: number; pageSize?: number; status?: string; type?: string; ids?: string[] } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.ids?.length) query.set('ids', params.ids.join(','));
    return apiRequest<{ items: Array<Record<string, unknown>>; page: number; pageSize: number; total: number; totalPages: number }>(`/message-jobs${query.toString() ? `?${query}` : ''}`);
  },
  metrics: () => apiRequest<Record<string, number>>('/message-jobs/metrics'),
  cancel: (id: string) => apiRequest<{ id: string; status: string }>(`/message-jobs/${id}/cancel`, { method: 'POST' }),
  retry: (id: string, confirmNotDelivered = false) => apiRequest<{ id: string; status: string }>(`/message-jobs/${id}/retry`, { method: 'POST', body: JSON.stringify(confirmNotDelivered ? { confirmNotDelivered: true } : {}) })
};

export const historyApi = {
  list: (contactId: string) => apiRequest<import('../types').HistoryItem[]>(`/contacts/${contactId}/history`),
  create: (contactId: string, payload: Pick<import('../types').HistoryItem, 'description' | 'type'> & Partial<Pick<import('../types').HistoryItem, 'demand' | 'status'>>) => apiRequest<import('../types').HistoryItem>(`/contacts/${contactId}/history`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  update: (contactId: string, historyId: string, payload: Partial<Pick<import('../types').HistoryItem, 'description' | 'demand' | 'status' | 'type'>>) => apiRequest<import('../types').HistoryItem>(`/contacts/${contactId}/history/${historyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  remove: (contactId: string, historyId: string) => apiRequest<void>(`/contacts/${contactId}/history/${historyId}`, { method: 'DELETE' })
};
