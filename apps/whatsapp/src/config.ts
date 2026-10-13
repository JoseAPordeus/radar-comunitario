import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AGENT_API_URL: z.string().url(),
  AGENT_ID: z.string().trim().min(1).max(100),
  AGENT_TOKEN: z.string().trim().min(1),
  WHATSAPP_SESSION_PATH: z.string().trim().min(1).default('./.wwebjs_auth'),
  WHATSAPP_CLIENT_ID: z.string().trim().min(1).max(80).default('radar-comunitario-v2'),
  WHATSAPP_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  WHATSAPP_SEND_DELAY_MS: z.coerce.number().int().min(0).default(1500),
  WHATSAPP_SEND_TIMEOUT_MS: z.coerce.number().int().min(5000).max(110000).default(45000),
  WHATSAPP_RECONNECT_DELAY_MS: z.coerce.number().int().min(1000).max(120000).default(5000),
  WHATSAPP_MEDIA_MAX_BYTES: z.coerce.number().int().min(1024).max(50_000_000).default(15_000_000),
  WHATSAPP_HEADLESS: z.enum(['true', 'false']).default('true'),
  CHROMIUM_PATH: z.string().trim().default('/usr/bin/chromium')
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Configuração do agente WhatsApp inválida: ${issues}`);
}

export const config = {
  ...parsed.data,
  headless: parsed.data.WHATSAPP_HEADLESS === 'true'
};

if (config.NODE_ENV === 'production' && (config.AGENT_TOKEN === 'replace-with-a-revocable-agent-token' || config.AGENT_TOKEN.length < 32)) {
  throw new Error('Configuração do agente inválida: AGENT_TOKEN deve ter pelo menos 32 caracteres em produção.');
}
