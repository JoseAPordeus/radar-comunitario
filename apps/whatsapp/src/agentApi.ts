import axios, { type AxiosInstance } from 'axios';
import { config } from './config.js';
import type { AgentConnectionState } from '@radar-comunitario/contracts';

export interface AgentJob {
  id: string;
  contactId: string;
  phone: string;
  content: string;
  type: 'ANIVERSARIO' | 'CAMPANHA';
  mediaUrl?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
  mediaCaption?: string | null;
}

export interface ClaimedJobResponse {
  job: AgentJob | null;
  leaseId?: string;
}

export interface IncomingMediaUpload {
  phone: string;
  mimeType: string;
  fileName: string;
  body: Buffer;
}

export class AgentApi {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.AGENT_API_URL.replace(/\/$/, ''),
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${config.AGENT_TOKEN}`,
        'x-agent-id': config.AGENT_ID,
        'Content-Type': 'application/json'
      }
    });
  }

  async heartbeat(state: AgentConnectionState, qrCode?: string | null, phoneNumber?: string | null): Promise<boolean> {
    const payload: Record<string, unknown> = {
      agentId: config.AGENT_ID,
      state,
      version: '0.1.0',
    };
    if (qrCode !== undefined) payload.qrCode = qrCode;
    if (phoneNumber !== undefined) payload.phoneNumber = phoneNumber;
    const response = await this.http.post<{ data: { disconnectRequested?: boolean } }>('/agent/heartbeat', payload);
    return response.data.data.disconnectRequested === true;
  }

  async claimJob(): Promise<ClaimedJobResponse> {
    const response = await this.http.post<{ data: ClaimedJobResponse }>('/agent/jobs/claim', {
      agentId: config.AGENT_ID,
      leaseSeconds: 120
    });
    return response.data.data;
  }

  async success(jobId: string, leaseId: string, externalMessageId?: string) {
    await this.http.post(`/agent/jobs/${jobId}/success`, {
      agentId: config.AGENT_ID,
      leaseId,
      externalMessageId
    });
  }

  async failure(jobId: string, leaseId: string, error: unknown) {
    await this.http.post(`/agent/jobs/${jobId}/failure`, {
      agentId: config.AGENT_ID,
      leaseId,
      errorCode: 'WHATSAPP_SEND_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Falha desconhecida no envio.',
      retryable: true
    });
  }

  async uncertain(jobId: string, leaseId: string, reason: string) {
    await this.http.post(`/agent/jobs/${jobId}/uncertain`, {
      agentId: config.AGENT_ID,
      leaseId,
      reason
    });
  }

  async uploadIncomingMedia(payload: IncomingMediaUpload) {
    const response = await this.http.post<{ data: { url: string; path: string; storagePath: string; fileName: string; mimeType: string; size: number } }>('/agent/media', payload.body, {
      headers: {
        'Content-Type': payload.mimeType,
        'X-Phone': payload.phone,
        'X-Media-Mime-Type': payload.mimeType,
        'X-File-Name': payload.fileName
      },
      maxBodyLength: config.WHATSAPP_MEDIA_MAX_BYTES,
      maxContentLength: config.WHATSAPP_MEDIA_MAX_BYTES
    });
    return response.data.data;
  }

  async listContactPhones() {
    const response = await this.http.get<{ data: string[] }>('/agent/contacts');
    return response.data.data;
  }

  async updateContactProfile(payload: { phone: string; whatsappChatId?: string | null; fullName?: string | null; avatarUrl?: string | null }) {
    await this.http.post('/agent/contacts/profile', payload);
  }

  async incomingMessage(payload: { messageId: string; phone: string; whatsappChatId?: string | null; direction: 'INBOUND' | 'OUTBOUND'; messageType: string; content: string; mediaUrl?: string | null; mediaStoragePath?: string | null; mediaMimeType?: string | null; quotedMessageId?: string | null; quotedContent?: string | null; senderDisplayName?: string | null; contactName?: string | null; contactAvatarUrl?: string | null; createdAt: string }) {
    await this.http.post('/agent/messages/incoming', { agentId: config.AGENT_ID, ...payload });
  }
}
