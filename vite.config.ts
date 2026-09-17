import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleTronProxy } from './api/tron.ts'

// Serve the production security headers from vercel.json in `vite preview`,
// so the CSP is exercised locally before it ships.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const productionHeaders = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]))
delete productionHeaders['Strict-Transport-Security']

/** Runs the same /api/tron handler that Vercel deploys, for `vite dev` and `vite preview`. */
function tronProxy(apiKey: string | undefined): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/tron/')) return next()
    const url = `http://${req.headers.host}${req.url}`
    const body = req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined
    const request = new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body, duplex: 'half' } as RequestInit)
    const response = await handleTronProxy(request, apiKey)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
  return {
    name: 'tron-proxy',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix loads non-VITE_ variables too; they stay in this Node process and never reach the bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // Anything prefixed VITE_ is inlined into public JavaScript. Refuse to build if a secret is named that way.
  const exposedSecrets = Object.keys(env).filter((name) => /^VITE_.*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|MNEMONIC)/i.test(name))
  if (exposedSecrets.length) {
    throw new Error(`Refusing to bundle secrets into browser code: ${exposedSecrets.join(', ')}. Drop the VITE_ prefix and read them server side.`)
  }
  return {
    plugins: [react(), tronProxy(env.TRONGRID_API_KEY)],
    build: {
      // The lazy wallet chunk is dominated by TronWeb (~950 kB min, ~250 kB gzip).
      // It loads only after unlock; the onboarding and unlock screens stay near 110 kB gzip.
      chunkSizeWarningLimit: 1100,
    },
    preview: {
      headers: productionHeaders,
    },
  }
})
