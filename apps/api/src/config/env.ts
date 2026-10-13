import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AGENT_ID: z.string().trim().min(1).max(100),
  AGENT_TOKEN: z.string().trim().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  API_BODY_LIMIT: z.string().default('1mb'),
  REDIS_URL: z.string().url().default('redis://redis:6379'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  AUDIO_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  AUDIO_PROCESSING_STALE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  AUDIO_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  AUDIO_TRANSCRIPTION_TIMEOUT_SECONDS: z.coerce.number().int().min(15).max(600).default(90)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Configuração da API inválida: ${issues}`);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
};

if (env.NODE_ENV === 'production') {
  const insecureOrigins = env.corsOrigins.filter(origin => !origin.startsWith('https://'));
  if (insecureOrigins.length > 0) {
    throw new Error(`ConfiguraÃ§Ã£o invÃ¡lida: CORS_ORIGINS deve usar HTTPS em produÃ§Ã£o (${insecureOrigins.join(', ')}).`);
  }
  if (env.SUPABASE_URL.startsWith('http://')) {
    throw new Error('ConfiguraÃ§Ã£o invÃ¡lida: SUPABASE_URL deve usar HTTPS em produÃ§Ã£o.');
  }
  if (env.AGENT_TOKEN === 'replace-with-a-revocable-agent-token') {
    throw new Error('ConfiguraÃ§Ã£o invÃ¡lida: substitua AGENT_TOKEN antes de iniciar em produÃ§Ã£o.');
  }
  if (env.AGENT_TOKEN.length < 32) {
    throw new Error('Configuração inválida: AGENT_TOKEN deve ter pelo menos 32 caracteres em produção.');
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY === 'sua-chave-secreta-apenas-no-backend' || env.SUPABASE_SERVICE_ROLE_KEY === 'replace-with-a-service-role-key') {
    throw new Error('ConfiguraÃ§Ã£o invÃ¡lida: substitua SUPABASE_SERVICE_ROLE_KEY antes de iniciar em produÃ§Ã£o.');
  }
}
