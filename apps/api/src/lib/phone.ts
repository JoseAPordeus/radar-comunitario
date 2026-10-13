import { AppError } from '../http/errors.js';

/** Retorna o telefone brasileiro no formato E.164 sem máscara: 55 + DDD + número. */
export function normalizeBrazilPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits.replace(/^0+/, '');
  const normalized = `55${national}`;

  // Brasil: 55 + DDD + 8/9 dígitos (10 ou 11 dígitos após o código do país).
  if (!/^55[1-9][0-9]{9,10}$/.test(normalized)) {
    throw new AppError(400, 'INVALID_PHONE', 'Informe um telefone brasileiro válido com DDD. Exemplo: 5583999999999.');
  }

  return normalized;
}

export function normalizeOptionalBrazilPhone(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  return normalizeBrazilPhone(value);
}

/** Retorna as formas com e sem o nono dígito que o WhatsApp pode usar. */
export function brazilPhoneVariants(value: string): string[] {
  const digits = value.replace(/\D/g, '');
  const variants = new Set<string>([digits]);
  if (!/^55[1-9][0-9]{9,10}$/.test(digits)) return [...variants];
  const prefix = digits.slice(0, 4);
  const local = digits.slice(4);
  if (local.length === 9 && local.startsWith('9')) variants.add(`${prefix}${local.slice(1)}`);
  if (local.length === 8) variants.add(`${prefix}9${local}`);
  return [...variants];
}

export function sameBrazilianPhone(left: string, right: string): boolean {
  const rightVariants = new Set(brazilPhoneVariants(right));
  return brazilPhoneVariants(left).some(value => rightVariants.has(value));
}
