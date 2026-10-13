import { describe, expect, it } from 'vitest';
import { allowedMediaMime, allowedOutboundMessageMime, hasCompatibleFileExtension, hasExpectedMediaSignature, MAX_MEDIA_BYTES } from '../src/services/mediaValidation.js';

describe('media validation', () => {
  it('accepts the supported image, document and audio types', () => {
    expect(allowedMediaMime.test('image/png')).toBe(true);
    expect(allowedMediaMime.test('application/pdf')).toBe(true);
    expect(allowedMediaMime.test('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(allowedMediaMime.test('audio/ogg')).toBe(true);
    expect(allowedMediaMime.test('application/x-executable')).toBe(false);
  });

  it('checks file signatures instead of trusting only the browser mime type', () => {
    expect(hasExpectedMediaSignature('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(hasExpectedMediaSignature('image/png', Buffer.from('not-a-png'))).toBe(false);
    expect(hasExpectedMediaSignature('application/pdf', Buffer.from('%PDF-1.7'))).toBe(true);
    expect(hasExpectedMediaSignature('audio/ogg', Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00]))).toBe(true);
    expect(hasExpectedMediaSignature('audio/mpeg', Buffer.from('ID3test'))).toBe(true);
    expect(hasExpectedMediaSignature('audio/wav', Buffer.from('RIFF1234WAVE'))).toBe(true);
    expect(hasExpectedMediaSignature('audio/mp4', Buffer.from('xxxxftyp'))).toBe(true);
    expect(hasExpectedMediaSignature('audio/webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).toBe(true);
    expect(hasExpectedMediaSignature('audio/ogg', Buffer.from('not-audio'))).toBe(false);
  });

  it('keeps the 15 MB storage limit explicit', () => {
    expect(MAX_MEDIA_BYTES).toBe(15_000_000);
  });

  it('allows supported outbound image, document and audio types', () => {
    expect(allowedOutboundMessageMime.test('image/png')).toBe(true);
    expect(allowedOutboundMessageMime.test('application/pdf')).toBe(true);
    expect(allowedOutboundMessageMime.test('audio/ogg')).toBe(true);
    expect(allowedOutboundMessageMime.test('audio/mpeg')).toBe(true);
    expect(allowedOutboundMessageMime.test('video/mp4')).toBe(false);
  });

  it('requires an extension compatible with the declared MIME', () => {
    expect(hasCompatibleFileExtension('image/png', 'foto.png')).toBe(true);
    expect(hasCompatibleFileExtension('application/pdf', 'arquivo.exe')).toBe(false);
    expect(hasCompatibleFileExtension('application/pdf', 'arquivo')).toBe(false);
  });
});
