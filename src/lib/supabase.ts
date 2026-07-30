import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = supabaseUrl && supabaseUrl.startsWith('http');

if (!isConfigured) {
  console.warn(
    'Supabase environment variables are missing or invalid. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your secrets.'
  );
}

// Use a valid URL format for placeholder to satisfy Supabase client validation
export const supabase = createClient(
  isConfigured ? supabaseUrl : 'https://missing-url.supabase.co',
  supabaseAnonKey || 'missing-key'
);
