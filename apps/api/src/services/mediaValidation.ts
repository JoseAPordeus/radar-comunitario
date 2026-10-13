export const MAX_MEDIA_BYTES = 15_000_000;
export const allowedMediaMime = /^(image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/(plain|csv)|audio\/(ogg|mpeg|wav|mp4|webm))$/i;
export const allowedOutboundMessageMime = /^(image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/(plain|csv)|audio\/(ogg|mpeg|wav|mp4|webm))$/i;

const extensionsByMime: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'audio/ogg': ['ogg'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/mp4': ['mp4', 'm4a'],
  'audio/webm': ['webm']
};

export function hasCompatibleFileExtension(contentType: string, fileName: string) {
  const extension = fileName.trim().toLowerCase().split('.').pop() ?? '';
  return Boolean(extension && extensionsByMime[contentType.toLowerCase()]?.includes(extension));
}

export function hasExpectedMediaSignature(contentType: string, body: Buffer) {
  if (contentType === 'text/plain' || contentType === 'text/csv') return true;
  if (contentType === 'image/jpeg') return body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (contentType === 'image/png') return body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/gif') return body.subarray(0, 4).toString('ascii') === 'GIF8';
  if (contentType === 'image/webp') return body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
  if (contentType === 'application/pdf') return body.subarray(0, 5).toString('ascii') === '%PDF-';
  if (contentType === 'audio/ogg') return body.subarray(0, 4).toString('ascii') === 'OggS';
  if (contentType === 'audio/mpeg') {
    const hasId3 = body.subarray(0, 3).toString('ascii') === 'ID3';
    const hasMpegFrame = body.length >= 2 && body[0] === 0xff && (body[1]! & 0xe0) === 0xe0;
    return hasId3 || hasMpegFrame;
  }
  if (contentType === 'audio/wav') return body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WAVE';
  if (contentType === 'audio/mp4') return body.subarray(4, 8).toString('ascii') === 'ftyp';
  if (contentType === 'audio/webm') return body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (contentType.startsWith('application/vnd.openxmlformats') || contentType === 'application/msword' || contentType === 'application/vnd.ms-excel' || contentType === 'application/vnd.ms-powerpoint') {
    const zip = body.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const ole = body.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    return zip || ole;
  }
  return false;
}
