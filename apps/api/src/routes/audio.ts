import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../http/errors.js';
import { createAudioJob } from '../services/audioTranscription.js';

export const audioRouter = Router();

audioRouter.post('/', async (request, response, next) => {
  try {
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    const fileName = String(request.headers['x-file-name'] ?? 'audio.ogg');
    const data = await createAudioJob(request.user!.id, request.body as Buffer, contentType, fileName);
    response.status(202).json({ data, requestId: request.requestId });
  } catch (error) {
    if (error instanceof Error && error.message.includes(':')) { const [code = 'AUDIO_FAILED', ...parts] = error.message.split(':'); const status = code === 'AUDIO_TOO_LARGE' ? 413 : code === 'AUDIO_TYPE_NOT_ALLOWED' || code === 'AUDIO_SIGNATURE_INVALID' ? 415 : 400; next(new AppError(status, code, parts.join(':').trim())); return; }
    next(error);
  }
});

audioRouter.get('/:id', async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const { data, error } = await supabaseAdmin.from('audio_jobs').select('id, status, file_name, mime_type, size_bytes, transcript, intent, error_code, error_message, attempts, created_at, updated_at, completed_at').eq('id', id).eq('owner_id', request.user!.id).maybeSingle();
    if (error) throw new AppError(500, 'AUDIO_READ_FAILED', 'Não foi possível consultar o áudio.');
    if (!data) throw new AppError(404, 'AUDIO_NOT_FOUND', 'Áudio não encontrado.');
    response.json({ data, requestId: request.requestId });
  } catch (error) { next(error); }
});
