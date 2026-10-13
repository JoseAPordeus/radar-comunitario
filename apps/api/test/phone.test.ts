import { describe, expect, it } from 'vitest';
import { brazilPhoneVariants, normalizeBrazilPhone, normalizeOptionalBrazilPhone, sameBrazilianPhone } from '../src/lib/phone.js';

describe('normalizeBrazilPhone', () => {
  it('returns 55 + DDD + number without formatting', () => {
    expect(normalizeBrazilPhone('(83) 98744-7464')).toBe('5583987447464');
    expect(normalizeBrazilPhone('+55 83 98744-7464')).toBe('5583987447464');
  });

  it('accepts eight-digit landline numbers', () => {
    expect(normalizeBrazilPhone('83 3341-1234')).toBe('558333411234');
  });

  it('rejects invalid Brazilian numbers', () => {
    expect(() => normalizeBrazilPhone('123')).toThrow('Informe um telefone brasileiro válido com DDD');
  });
});

describe('normalizeOptionalBrazilPhone', () => {
  it('keeps undefined and converts empty values to null', () => {
    expect(normalizeOptionalBrazilPhone(undefined)).toBeUndefined();
    expect(normalizeOptionalBrazilPhone('')).toBeNull();
    expect(normalizeOptionalBrazilPhone(null)).toBeNull();
  });
});

describe('WhatsApp phone aliases', () => {
  it('matches mobile numbers with or without the ninth digit', () => {
    expect(brazilPhoneVariants('5583987447464')).toEqual(['5583987447464', '558387447464']);
    expect(sameBrazilianPhone('5583987447464', '558387447464')).toBe(true);
    expect(sameBrazilianPhone('5583987447464', '558388220281')).toBe(false);
  });
});
