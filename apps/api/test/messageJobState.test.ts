import { describe, expect, it } from 'vitest';
import { canTransition, failureState } from '../src/domain/messageJobState.js';

describe('message job state machine', () => {
  it('allows a pending job to be claimed or cancelled', () => {
    expect(canTransition('PENDENTE', 'PROCESSANDO')).toBe(true);
    expect(canTransition('PENDENTE', 'CANCELADO')).toBe(true);
  });

  it('does not allow a sent job to be processed again', () => {
    expect(canTransition('ENVIADO', 'PROCESSANDO')).toBe(false);
    expect(canTransition('ENVIADO', 'PENDENTE')).toBe(false);
  });

  it('retries only while the attempt budget remains', () => {
    expect(failureState(1, 3, true)).toBe('PENDENTE');
    expect(failureState(3, 3, true)).toBe('ERRO');
    expect(failureState(1, 3, false)).toBe('ERRO');
  });
});
