import { Router } from 'express';
import { AppError } from '../http/errors.js';
import { storeMedia } from '../services/mediaStorage.js';

export const mediaRouter = Router();

mediaRouter.post('/', async (request, response, next) => {
  try {
    const contentType = (String(request.headers['content-type'] ?? '').split(';')[0] ?? '').trim();
    const fileName = String(request.headers['x-file-name'] ?? 'arquivo');
    try {
      const stored = await storeMedia(request.user!.id, request.body as Buffer, contentType, fileName);
      response.status(201).json({ data: stored, requestId: request.requestId });
    } catch (error) {
      const code = error instanceof Error ? (error.message.split(':')[0] ?? 'MEDIA_UPLOAD_FAILED') : 'MEDIA_UPLOAD_FAILED';
      const status = code === 'MEDIA_TOO_LARGE' ? 413 : code === 'MEDIA_TYPE_NOT_ALLOWED' || code === 'MEDIA_SIGNATURE_INVALID' || code === 'MEDIA_EXTENSION_INVALID' ? 415 : 400;
      throw new AppError(status, code, 'Nao foi possivel validar ou armazenar o arquivo.');
    }
  } catch (error) {
    next(error);
  }
});
