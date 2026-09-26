#!/usr/bin/env node
/**
 * Fetch SEDO response PDFs from Gmail into inbox/, mark read, move to label.
 * Zero npm dependencies — Node 18+ fetch.
 *
 * Config: process.env first (Cloud Agent secrets), then repo .env (local).
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *   GMAIL_PROCESSED_LABEL (optional, default "Mos Responses. Processed")
 *
 * Usage:
 *   fetch-mail.mjs
 *   fetch-mail.mjs --dry-run
 *   fetch-mail.mjs --query '…' --max 10 --label 'Mos Responses. Processed'
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');
const INBOX_DIR = join(REPO_ROOT, 'inbox');

const DEFAULT_QUERY =
  'in:inbox ("на обращение гражданина") (from:sedo@mos.ru OR subject:Fwd OR subject:FW OR "sedo@mos.ru")';
const DEFAULT_LABEL = 'Mos Responses. Processed';
const SKIP_BASENAME = 'Направлен.pdf';
const FWD_RE = /^(Fwd|FW|Fw|Пересл|Пересылка):/i;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ─── .env ───────────────────────────────────────────────────────────────────

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

function requireConfig() {
  const clientId = env('GMAIL_CLIENT_ID').trim();
  const clientSecret = env('GMAIL_CLIENT_SECRET').trim();
  const refreshToken = env('GMAIL_REFRESH_TOKEN').trim();
  if (!clientId) {
    throw new Error('GMAIL_CLIENT_ID is not set (project .env locally, Secrets in Cloud Agents)');
  }
  if (!clientSecret) {
    throw new Error('GMAIL_CLIENT_SECRET is not set (project .env locally, Secrets in Cloud Agents)');
  }
  if (!refreshToken) {
    throw new Error('GMAIL_REFRESH_TOKEN is not set (project .env locally, Secrets in Cloud Agents)');
  }
  return {
    clientId,
    clientSecret,
    refreshToken,
    labelName: env('GMAIL_PROCESSED_LABEL').trim() || DEFAULT_LABEL,
  };
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
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
  if (!res.ok || !data.access_token) {
    const err = data.error || `HTTP ${res.status}`;
    const desc = data.error_description ? `: ${data.error_description}` : '';
    const hint =
      err === 'invalid_grant'
        ? ' — refresh token expired or revoked (Testing ≈7 days). Run: node .codex/skills/mail-inbox/scripts/auth.mjs'
        : '';
    throw new Error(`OAuth error: ${err}${desc}${hint}`);
  }
  if (data.refresh_token) {
    process.stderr.write(
      'Warning: Google returned a new refresh_token — update GMAIL_REFRESH_TOKEN in .env and Cloud Secrets\n',
    );
  }
  return data.access_token;
}

// ─── Gmail REST ─────────────────────────────────────────────────────────────

async function gmailFetch(accessToken, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gmail API: non-JSON response (HTTP ${res.status}) for ${path}`);
  }
  if (!res.ok) {
    const msg = data.error?.message || data.error || `HTTP ${res.status}`;
    throw new Error(`Gmail API error: ${msg}`);
  }
  return data;
}

function headerValue(headers, name) {
  const want = name.toLowerCase();
  const h = (headers || []).find((x) => (x.name || '').toLowerCase() === want);
  return h?.value || '';
}

function classifyMessage({ from, subject, snippet }) {
  if (/sedo@mos\.ru/i.test(from)) return 'original';
  if (FWD_RE.test(subject) || /sedo@mos\.ru/i.test(snippet || '')) return 'forward';
  return null;
}

function walkParts(part, out = []) {
  if (!part) return out;
  if (part.filename || part.body?.attachmentId) {
    out.push({
      filename: part.filename || '',
      mimeType: part.mimeType || '',
      attachmentId: part.body?.attachmentId || null,
      size: part.body?.size || 0,
    });
  }
  for (const child of part.parts || []) walkParts(child, out);
  return out;
}

function safeBasename(name) {
  const base = basename(name || '');
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new Error(`Unsafe attachment filename: ${JSON.stringify(name)}`);
  }
  if (base.includes('..')) {
    throw new Error(`Unsafe attachment filename: ${JSON.stringify(name)}`);
  }
  return base;
}

function isPdfPart(part) {
  const mime = (part.mimeType || '').toLowerCase();
  if (mime.startsWith('application/pdf')) return true;
  const name = (part.filename || '').toLowerCase();
  return name.endsWith('.pdf') && mime !== 'message/rfc822';
}

async function listMessageIds(accessToken, query, max) {
  const ids = [];
  let pageToken = '';
  while (ids.length < max) {
    const params = new URLSearchParams({ q: query, maxResults: String(Math.min(100, max - ids.length)) });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gmailFetch(accessToken, `/messages?${params}`);
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return ids;
}

async function resolveOrCreateLabel(accessToken, name) {
  const listed = await gmailFetch(accessToken, '/labels');
  const existing = (listed.labels || []).find((l) => l.name === name);
  if (existing) {
    return { name, id: existing.id, created: false };
  }
  const created = await gmailFetch(accessToken, '/labels', {
    method: 'POST',
    body: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  return { name, id: created.id, created: true };
}

async function downloadAttachment(accessToken, messageId, attachmentId) {
  const data = await gmailFetch(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  return Buffer.from(data.data, 'base64url');
}

async function processMessage(accessToken, messageId, { dryRun, inboxDir, label }) {
  const result = {
    id: messageId,
    from: '',
    subject: '',
    kind: null,
    downloaded: [],
    skipped: [],
    modified: false,
    error: null,
  };

  try {
    const msg = await gmailFetch(
      accessToken,
      `/messages/${encodeURIComponent(messageId)}?format=full`,
    );
    const headers = msg.payload?.headers || [];
    result.from = headerValue(headers, 'From');
    result.subject = headerValue(headers, 'Subject');
    result.kind = classifyMessage({
      from: result.from,
      subject: result.subject,
      snippet: msg.snippet || '',
    });

    if (!result.kind) {
      result.skipped.push({ reason: 'not_sedo' });
      return result;
    }

    if (dryRun) return result;

    const parts = walkParts(msg.payload);
    const pdfs = [];
    for (const part of parts) {
      if (!part.attachmentId || !isPdfPart(part)) continue;
      let fileName;
      try {
        fileName = safeBasename(part.filename);
      } catch {
        result.skipped.push({ reason: 'unsafe_name', filename: part.filename });
        continue;
      }
      if (fileName === SKIP_BASENAME) continue; // routine skip, silent
      pdfs.push({ ...part, fileName });
    }
    // Prefer mos.ru export (filename with идентификатор)
    pdfs.sort((a, b) => {
      const aMos = /идентификатор/i.test(a.fileName) ? 0 : 1;
      const bMos = /идентификатор/i.test(b.fileName) ? 0 : 1;
      return aMos - bMos;
    });

    if (!existsSync(inboxDir)) mkdirSync(inboxDir, { recursive: true });

    for (const part of pdfs) {
      const fileName = part.fileName;
      const dest = join(inboxDir, fileName);
      if (existsSync(dest)) {
        result.skipped.push({ reason: 'exists', file: fileName });
        continue;
      }
      const bytes = await downloadAttachment(accessToken, messageId, part.attachmentId);
      writeFileSync(dest, bytes);
      result.downloaded.push({ file: fileName, bytes: bytes.length, messageId });
    }

    if (label?.id) {
      await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/modify`, {
        method: 'POST',
        body: {
          addLabelIds: [label.id],
          removeLabelIds: ['INBOX', 'UNREAD'],
        },
      });
      result.modified = true;
    }
  } catch (err) {
    result.error = err.message || String(err);
  }

  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const USAGE = `Usage:
  fetch-mail.mjs                         Fetch SEDO PDFs into inbox/, mark processed
  fetch-mail.mjs --dry-run               Search + classify only (no download / modify)

Options:
  --query <q>    Gmail search query (default: SEDO responses in inbox)
  --max <n>      Max messages to inspect (default: 50)
  --label <name> Processed label name (default: Mos Responses. Processed)
  -h, --help     Show this help
`;

function parseArgs(argv) {
  const opts = { dryRun: false, max: 50, query: null, label: null };
  const takesValue = new Set(['--query', '--max', '--label']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (!takesValue.has(arg)) throw new Error(`Unknown option: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Option ${arg} requires a value`);
    if (arg === '--query') opts.query = value;
    else if (arg === '--max') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new Error(`--max must be a positive integer`);
      opts.max = n;
    } else if (arg === '--label') opts.label = value;
    i += 1;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Require config even for --help already exited; for dry-run / run we need creds.
  // Parsing with zero args is valid — run full fetch.
  const config = requireConfig();
  const query = opts.query || DEFAULT_QUERY;
  const labelName = opts.label || config.labelName;

  const accessToken = await getAccessToken(config);
  const ids = await listMessageIds(accessToken, query, opts.max);

  let label = null;
  if (!opts.dryRun && ids.length > 0) {
    label = await resolveOrCreateLabel(accessToken, labelName);
  }

  const accepted = [];
  const downloaded = [];
  const skipped = [];
  const errors = [];

  for (const id of ids) {
    const r = await processMessage(accessToken, id, {
      dryRun: opts.dryRun,
      inboxDir: INBOX_DIR,
      label,
    });
    if (r.error) {
      errors.push({ id: r.id, from: r.from, subject: r.subject, error: r.error });
      continue;
    }
    if (!r.kind) {
      skipped.push({ id: r.id, from: r.from, subject: r.subject, reason: 'not_sedo' });
      continue;
    }
    accepted.push({ id: r.id, from: r.from, subject: r.subject, kind: r.kind });
    for (const d of r.downloaded) downloaded.push(d);
    for (const s of r.skipped) {
      if (s.reason === 'not_sedo') continue;
      skipped.push({ id: r.id, ...s });
    }
  }

  const out = {
    query,
    dryRun: opts.dryRun,
    accepted,
    downloaded,
    skipped,
    label: label || { name: labelName, id: null, created: false },
    errors,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  if (errors.length > 0 && downloaded.length === 0 && accepted.length === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message || err}\n`);
  process.exit(1);
});
