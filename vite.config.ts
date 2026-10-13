import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  if (mode === 'production') {
    const missing = [
      ['VITE_API_BASE_URL', env.VITE_API_BASE_URL],
      ['VITE_SUPABASE_URL', env.VITE_SUPABASE_URL],
      ['VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY]
    ].filter(([, value]) => !value || value.includes('seu-projeto.supabase.co') || value.includes('sua-chave-publicavel')).map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`Configuração do frontend incompleta. Defina: ${missing.join(', ')}`);
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR pode ser desativado via DISABLE_HMR para reduzir o consumo de CPU.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-charts': ['recharts'],
            'vendor-motion': ['motion']
          }
        }
      }
    }
  };
});
