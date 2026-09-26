#!/usr/bin/env node
/**
 * Loopback OAuth for Gmail (Testing ≈7-day refresh tokens).
 * Prints a fresh GMAIL_REFRESH_TOKEN=… line for .env / Cloud Secrets.
 *
 * Config: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (process.env then repo .env).
 * Redirect URI must match the OAuth client (default: http://localhost:44000/oauth2callback).
 *
 * Usage:
 *   node .codex/skills/mail-inbox/scripts/auth.mjs
 *   node .codex/skills/mail-inbox/scripts/auth.mjs --port 44000
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
].join(' ');

const DEFAULT_PORT = 44000;
const DEFAULT_PATH = '/oauth2callback';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile(join(REPO_ROOT, '.env'));

function env(key) {
  const fromProc = process.env[key];
  if (fromProc !== undefined && fromProc !== '') return fromProc;
  const fromFile = fileEnv[key];
  if (fromFile !== undefined && fromFile !== '') return fromFile;
  return '';
}

function requireClient() {
  const clientId = env('GMAIL_CLIENT_ID').trim();
  const clientSecret = env('GMAIL_CLIENT_SECRET').trim();
  if (!clientId) {
    throw new Error('GMAIL_CLIENT_ID is not set (project .env locally, Secrets in Cloud Agents)');
  }
  if (!clientSecret) {
    throw new Error('GMAIL_CLIENT_SECRET is not set (project .env locally, Secrets in Cloud Agents)');
  }
  return { clientId, clientSecret };
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? `open ${JSON.stringify(url)}` :
    platform === 'win32' ? `start "" ${JSON.stringify(url)}` :
    `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, () => {});
}

function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, path: DEFAULT_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(`Usage: auth.mjs [--port ${DEFAULT_PORT}] [--path ${DEFAULT_PATH}]\n`);
      process.exit(0);
    }
    if (arg === '--port') {
      const value = argv[++i];
      if (!value) throw new Error('--port requires a value');
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new Error('--port must be a positive integer');
      opts.port = n;
      continue;
    }
    if (arg === '--path') {
      const value = argv[++i];
      if (!value) throw new Error('--path requires a value');
      opts.path = value.startsWith('/') ? value : `/${value}`;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

function waitForCode(port, path) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== path) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        const err = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<p>OAuth error: ${err}</p><p>Можно закрыть вкладку.</p>`);
          server.close();
          reject(new Error(`OAuth error: ${err}`));
          return;
        }
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Missing code');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p>Готово. Можно закрыть вкладку и вернуться в терминал.</p>');
        server.close();
        resolvePromise(code);
      } catch (e) {
        server.close();
        reject(e);
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`OAuth token endpoint: non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || !data.refresh_token) {
    const err = data.error || `HTTP ${res.status}`;
    const desc = data.error_description ? `: ${data.error_description}` : '';
    const hint = !data.refresh_token && data.access_token
      ? ' (no refresh_token — revoke prior access at https://myaccount.google.com/permissions and retry with prompt=consent)'
      : '';
    throw new Error(`OAuth error: ${err}${desc}${hint}`);
  }
  return data.refresh_token;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { clientId, clientSecret } = requireClient();
  const redirectUri = `http://localhost:${opts.port}${opts.path}`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  process.stderr.write(`Listening on ${redirectUri}\n`);
  process.stderr.write('Opening browser for Google consent…\n');
  process.stderr.write(`If it does not open, visit:\n${authUrl.href}\n`);

  const codePromise = waitForCode(opts.port, opts.path);
  openBrowser(authUrl.href);
  const code = await codePromise;
  const refreshToken = await exchangeCode({
    clientId,
    clientSecret,
    code,
    redirectUri,
  });

  process.stdout.write('\n# Paste into .env and Cloud Agents → Secrets:\n');
  process.stdout.write(`GMAIL_REFRESH_TOKEN=${refreshToken}\n`);
  process.stderr.write(
    '\nDone. Update GMAIL_REFRESH_TOKEN in .env and in cursor.com → Cloud Agents → Secrets.\n',
  );
}

main().catch((err) => {
  process.stderr.write(`${err.message || err}\n`);
  process.exit(1);
});
