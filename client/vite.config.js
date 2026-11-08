import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The preview is served from a proxy host that changes per sandbox, so the
// allowlist is extended from the platform-provided variables instead of being
// hardcoded — and only while running in preview mode.
const previewMode = process.env.BASE44_PREVIEW_MODE === '1';
const allowedHosts = ['localhost', '127.0.0.1'];

if (previewMode) {
  if (process.env.BASE44_PUBLIC_HOST_SUFFIX) allowedHosts.push(`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`);
  if (process.env.BASE44_SANDBOX_HOST_DOMAIN) allowedHosts.push(`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`);
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts,
    hmr: previewMode ? { protocol: 'wss', clientPort: 443 } : undefined,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
