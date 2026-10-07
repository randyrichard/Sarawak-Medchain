#!/usr/bin/env node
/**
 * Builds the public offline demo: the web app with its in-browser sample backend and no
 * server, for the Cloudflare demo site (docs/CLOUDFLARE.md, "The public demo").
 *
 *   npm run build:demo        then  npx wrangler deploy   (wrangler.jsonc beside this)
 *
 * What makes it a demo, all fixed here so the Cloudflare build command is one word:
 * - no API address, even if .env.local sets one (process env wins over .env files);
 * - VITE_OFFLINE_DEMO, which is the only thing that lets a production build sign in
 *   without a server (api/authApi.ts);
 * - the demo accounts and sign-in shortcuts compiled in, with a password of the demo's
 *   own, not the one the API seed uses.
 *
 * It also writes dist/_headers, so Cloudflare sends the same security headers and
 * Content-Security-Policy as nginx does for a real deployment. The policy is read from
 * nginx.conf.template rather than copied, so the two cannot drift; with no API, the page
 * may connect only to itself.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const DEMO_ENV = {
  VITE_API_BASE_URL: '',
  VITE_OFFLINE_DEMO: 'true',
  VITE_DEMO_LOGINS: 'true',
  VITE_DEMO_PASSWORD: 'SafeOps-Demo-2026',
}

/** The security headers nginx sends on every page, for Cloudflare's _headers file. */
export function demoHeaders(nginxConf) {
  const want = ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']
  const found = new Map()
  for (const m of nginxConf.matchAll(/add_header\s+([\w-]+)\s+"([^"]*)"\s+always;/g)) {
    if (want.includes(m[1]) && !found.has(m[1])) found.set(m[1], m[2])
  }
  for (const h of want) {
    if (!found.has(h)) throw new Error(`nginx.conf.template has no ${h} header to copy`)
  }
  const csp = found.get('Content-Security-Policy')
  if (!csp.includes('${CSP_CONNECT_SRC}')) throw new Error('CSP no longer has ${CSP_CONNECT_SRC}; update build-demo.mjs')
  found.set('Content-Security-Policy', csp.replace(' ${CSP_CONNECT_SRC}', ''))
  return ['/*', ...want.map((h) => `  ${h}: ${found.get(h)}`), ''].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = { ...process.env, ...DEMO_ENV }
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  run('npx', ['tsc', '-b', 'tsconfig.build.json'])
  run('npx', ['vite', 'build'])
  writeFileSync(join(root, 'dist', '_headers'), demoHeaders(readFileSync(join(root, 'nginx.conf.template'), 'utf8')))
  console.log('\nOffline demo built in dist/ with _headers. Deploy with: npx wrangler deploy')
}
