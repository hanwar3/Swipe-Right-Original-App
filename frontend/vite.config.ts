import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * Content-Security-Policy for production builds. Scripts may only come from
 * this origin, which is what keeps an injected script from reading the session
 * token. Dev builds skip it: Vite's hot reload relies on inline scripts.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'swiperight-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const target = process.env.VITE_CLIENT_TARGET
      const api = target ? ` ${new URL(target).origin}` : ''
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
        "font-src 'self' https://cdn.fontshare.com data:",
        "img-src 'self' data: blob: https:",
        `connect-src 'self'${api}`,
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '~backend/client': path.resolve(__dirname, './client'),
      '~backend': path.resolve(__dirname, '../backend'),
    },
  },
  plugins: [tailwindcss(), react(), contentSecurityPolicy()],
})
