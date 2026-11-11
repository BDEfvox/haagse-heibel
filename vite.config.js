import { defineConfig } from 'vite';

// The site is static and needs nothing from other origins, so the built page ships a strict
// Content-Security-Policy. (Static hosts such as GitHub Pages cannot send it as a header; a
// meta tag covers everything except frame-ancestors.) Inline style attributes are used by the
// UI and by the map library, hence 'unsafe-inline' for styles only. child-src is kept for older
// Safari (which uses it for workers); frame-src 'none' stops it from also allowing frames.
const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "worker-src 'self'", "child-src 'self'", "frame-src 'none'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
const securityMeta = {
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml(html) {
    const anchor = '<meta charset="utf-8" />';
    // fail the build rather than silently ship a page without the policy
    if (!html.includes(anchor)) throw new Error('security-meta: could not find the charset tag to anchor the CSP on');
    return html.replace(anchor, `${anchor}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="same-origin" />`);
  },
};

export default defineConfig({
  base: './',
  plugins: [securityMeta],
  // HEIBEL_NO_HMR=1 serves the same dev site without pushing reloads on every saved file (the page takes new code on a
  // manual reload): for long scene audits while files are being edited. See the `heibel-audit` launch config.
  server: { port: 5183, strictPort: true, hmr: !process.env.HEIBEL_NO_HMR },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
    assetsInlineLimit: 0, // no data: URIs for fonts, so the policy can stay at font-src 'self'
    // serve the map worker as .js so every static host sends a JavaScript MIME type for it
    rollupOptions: { output: { assetFileNames: (a) => ((a.names?.[0] || a.name || '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') } },
  },
});
