import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';

// A service role fica restrita ao backend. Toda consulta de negócio deve
// aplicar explicitamente o owner_id do usuário autenticado.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  realtime: {
    // A tipagem do ws e a assinatura esperada pelo realtime-js divergem no Node 20.
    transport: WebSocket as never
  }
});
