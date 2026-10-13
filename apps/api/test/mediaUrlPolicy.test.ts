import { describe, expect, it } from 'vitest';
import { isProjectSignedMediaUrl } from '../src/services/mediaUrlPolicy.js';

const project = 'https://example.supabase.co';

describe('isProjectSignedMediaUrl', () => {
  it('accepts a signed URL from the private project bucket', () => {
    expect(isProjectSignedMediaUrl(
      `${project}/storage/v1/object/sign/message-media/owner/outgoing/file.png?token=test`,
      project
    )).toBe(true);
  });

  it('rejects an external URL', () => {
    expect(isProjectSignedMediaUrl('https://example.com/file.png', project)).toBe(false);
  });

  it('rejects an unsigned or different bucket path', () => {
    expect(isProjectSignedMediaUrl(`${project}/storage/v1/object/public/message-media/file.png`, project)).toBe(false);
  });
});
