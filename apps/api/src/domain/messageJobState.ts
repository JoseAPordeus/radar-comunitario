export type MessageJobState =
  | 'PENDENTE'
  | 'PROCESSANDO'
  | 'ENVIADO'
  | 'ERRO'
  | 'INCERTO'
  | 'CANCELADO';

const transitions: Record<MessageJobState, readonly MessageJobState[]> = {
  PENDENTE: ['PROCESSANDO', 'CANCELADO'],
  PROCESSANDO: ['ENVIADO', 'ERRO', 'INCERTO', 'PENDENTE'],
  ENVIADO: [],
  ERRO: ['PENDENTE'],
  INCERTO: [],
  CANCELADO: []
};

export function canTransition(from: MessageJobState, to: MessageJobState) {
  return transitions[from].includes(to);
}

export function failureState(attempts: number, maxAttempts: number, retryable: boolean): MessageJobState {
  return retryable && attempts < maxAttempts ? 'PENDENTE' : 'ERRO';
}
