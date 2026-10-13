import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabase.js';
import { allowedMediaMime, hasCompatibleFileExtension, hasExpectedMediaSignature, MAX_MEDIA_BYTES } from './mediaValidation.js';

export type StoredMedia = {
  url: string;
  path: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export async function storeMedia(ownerId: string, body: Buffer, contentType: string, originalFileName: string, folder = 'outgoing'): Promise<StoredMedia> {
  const normalizedContentType = contentType.trim().toLowerCase();
  if (!Buffer.isBuffer(body) || body.length === 0) throw new Error('MEDIA_EMPTY');
  if (body.length > MAX_MEDIA_BYTES) throw new Error('MEDIA_TOO_LARGE');
  if (!allowedMediaMime.test(normalizedContentType)) throw new Error('MEDIA_TYPE_NOT_ALLOWED');
  if (!hasExpectedMediaSignature(normalizedContentType, body)) throw new Error('MEDIA_SIGNATURE_INVALID');
  if (folder === 'outgoing' && !hasCompatibleFileExtension(normalizedContentType, originalFileName)) throw new Error('MEDIA_EXTENSION_INVALID');
  const fileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'arquivo';
  const path = `${ownerId}/${folder}/${randomUUID()}-${fileName}`;
  const { error: uploadError } = await supabaseAdmin.storage.from('message-media').upload(path, body, { contentType: normalizedContentType, cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error(`MEDIA_UPLOAD_FAILED:${uploadError.message}`);
  const { data: signed, error: signedError } = await supabaseAdmin.storage.from('message-media').createSignedUrl(path, 300);
  if (signedError || !signed?.signedUrl) {
    await supabaseAdmin.storage.from('message-media').remove([path]);
    throw new Error('MEDIA_URL_FAILED');
  }
  return { url: signed.signedUrl, path, storagePath: path, fileName, mimeType: normalizedContentType, size: body.length };
}

export async function createMediaSignedUrl(storagePath: string) {
  const { data, error } = await supabaseAdmin.storage.from('message-media').createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) throw new Error('MEDIA_URL_FAILED');
  return data.signedUrl;
}
