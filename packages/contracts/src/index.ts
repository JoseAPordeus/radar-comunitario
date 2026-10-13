export type MessageJobStatus =
  | 'PENDENTE'
  | 'PROCESSANDO'
  | 'ENVIADO'
  | 'ERRO'
  | 'INCERTO'
  | 'CANCELADO';

export type MessageJobType = 'ANIVERSARIO' | 'CAMPANHA';

export interface MessageJobMedia {
  url: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
}

export type AgentConnectionState =
  | 'INICIALIZANDO'
  | 'AGUARDANDO_AUTENTICACAO'
  | 'CONECTADO'
  | 'DESCONECTADO'
  | 'ERRO';

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  requestId: string;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CreateMessageJobInput {
  contactId: string;
  content: string;
  type: MessageJobType;
  templateId?: string;
  correlationId?: string;
  availableAt?: string;
  media?: MessageJobMedia;
}

export interface CreateMessageJobsInput {
  jobs: CreateMessageJobInput[];
}

export interface MessageJobSummary {
  id: string;
  contactId: string;
  type: MessageJobType;
  status: MessageJobStatus;
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimMessageJobInput {
  agentId: string;
  leaseSeconds?: number;
}

export interface ClaimMessageJobResponse {
  job: MessageJobSummary | null;
  leaseId?: string;
}

export interface AgentHeartbeatInput {
  agentId: string;
  state: AgentConnectionState;
  version: string;
}

export interface CompleteMessageJobInput {
  agentId: string;
  leaseId: string;
  externalMessageId?: string;
}

export interface FailMessageJobInput {
  agentId: string;
  leaseId: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}

export interface UncertainMessageJobInput {
  agentId: string;
  leaseId: string;
  reason: string;
}
