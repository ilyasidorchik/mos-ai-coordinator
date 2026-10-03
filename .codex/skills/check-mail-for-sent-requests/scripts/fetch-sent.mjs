#!/usr/bin/env node
/**
 * Fetch mos.ru «обращение отправлено» confirmation emails from Gmail,
 * parse appeal fields to JSON. Optionally archive (remove INBOX+UNREAD)
 * specific message IDs — no custom processed label.
 *
 * Zero npm dependencies — Node 18+ fetch.
 *
 * Config: process.env first (Cloud Agent secrets), then repo .env (local).
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *
 * Usage:
 *   fetch-sent.mjs
 *   fetch-sent.mjs --dry-run
 *   fetch-sent.mjs --archive-ids <id>[,<id>…]
 *   fetch-sent.mjs --query '…' --max 10
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

const DEFAULT_QUERY =
  'in:inbox (' +
  '"обращение отправлено" ' +
  '(from:noreply@mos.ru OR subject:Fwd OR subject:FW OR subject:Пересл OR subject:Пересылка OR "noreply@mos.ru" OR "Mos.Ru")' +
  ')';
const FWD_RE = /^(Fwd|FW|Fw|Пересл|Пересылка):/i;
const SENT_SUBJECT_RE = /обращение отправлено/i;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const AGENCY_SHORT = [
  [/департамент транспорта/i, 'Дептранс'],
  [/департамент капитального ремонта/i, 'ДКР'],
  [/центр организации дорожного движения/i, 'ЦОДД'],
  [/департамент жилищно-коммунального/i, 'ДЖКХ'],
  [/правительство москвы/i, 'Правительство Москвы'],
];

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
  return { clientId, clientSecret, refreshToken };
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

function decodeBodyData(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Prefer text/html (mos.ru templates); fall back to text/plain.
 * @returns {{ html: string, plain: string }}
 */
function extractBodies(part) {
  let plain = '';
  let html = '';

  function visit(p) {
    if (!p) return;
    const mime = (p.mimeType || '').toLowerCase();
    if (mime === 'text/plain' && p.body?.data && !plain) {
      plain = decodeBodyData(p.body.data);
    } else if (mime === 'text/html' && p.body?.data && !html) {
      html = decodeBodyData(p.body.data);
    }
    for (const child of p.parts || []) visit(child);
  }

  visit(part);
  return { html, plain };
}

function shortAgency(recipient) {
  if (!recipient) return '';
  for (const [re, short] of AGENCY_SHORT) {
    if (re.test(recipient)) return short;
  }
  return recipient.replace(/\s+/g, ' ').trim();
}

function cleanField(s) {
  return (s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract labeled cell from mos.ru HTML table rows.
 */
function htmlLabeledField(html, label) {
  const re = new RegExp(
    `<strong[^>]*>\\s*${label}\\s*:?\\s*</strong>\\s*([\\s\\S]*?)(?=<strong|</td>|</tr>)`,
    'i',
  );
  const m = html.match(re);
  if (!m) return '';
  return cleanField(stripHtml(m[1]));
}

function htmlBodyField(html) {
  const re =
    /<strong[^>]*>\s*Текст обращения\s*:?\s*<\/strong>\s*([\s\S]*?)(?=<strong[^>]*>\s*Приложенные файлы|<strong[^>]*>\s*Благодарим|В соответствии с Федеральным законом|<\/tbody>|$)/i;
  const m = html.match(re);
  if (!m) return '';
  return cleanField(
    decodeEntities(
      m[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    ),
  );
}

function htmlAttachments(html) {
  const re =
    /<strong[^>]*>\s*Приложенные файлы\s*:?\s*<\/strong>\s*([\s\S]*?)(?=<strong|<\/td>|<\/tr>)/i;
  const m = html.match(re);
  if (!m) return [];
  const chunk = m[1];
  const names = [];
  for (const sm of chunk.matchAll(
    /<strong[^>]*style="[^"]*font-weight:\s*normal[^"]*"[^>]*>([^<]+)/gi,
  )) {
    const name = cleanField(decodeEntities(sm[1]));
    if (name) names.push(name);
  }
  if (names.length) return names;
  const stripped = cleanField(stripHtml(chunk));
  if (!stripped) return [];
  return stripped
    .split(/\s{2,}|\u2003|\t/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function textLabeledField(text, label) {
  const re = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i');
  const m = text.match(re);
  return m ? cleanField(m[1]) : '';
}

function textBodyField(text) {
  const re =
    /Текст обращения\s*:\s*([\s\S]*?)(?:\n\s*Приложенные файлы\s*:|\n\s*Благодарим за|\n\s*В соответствии с Федеральным законом|$)/i;
  const m = text.match(re);
  return m ? cleanField(m[1]) : '';
}

function textAttachments(text) {
  const re = /Приложенные файлы\s*:\s*([^\n]+)/i;
  const m = text.match(re);
  if (!m) return [];
  return cleanField(m[1])
    .split(/\s{2,}|\u2003|\t/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAppeal({ html, plain }) {
  const text = plain.trim() || (html ? stripHtml(html) : '');
  const sourceHtml = html || '';

  const mosId =
    (sourceHtml.match(/ID\s*=\s*(\d+)/i) || text.match(/ID\s*=\s*(\d+)/i) || [])[1] ||
    (text.match(/идентификатор[：:\s]+(\d+)/i) || [])[1] ||
    null;

  const sentDate =
    (
      sourceHtml.match(/отправлено\s+(\d{2}\.\d{2}\.\d{4})/i) ||
      text.match(/отправлено\s+(\d{2}\.\d{2}\.\d{4})/i) ||
      []
    )[1] || null;

  const recipient =
    htmlLabeledField(sourceHtml, 'Адресат') || textLabeledField(text, 'Адресат');
  const title =
    htmlLabeledField(sourceHtml, 'Тема обращения') ||
    textLabeledField(text, 'Тема обращения');
  const body = htmlBodyField(sourceHtml) || textBodyField(text);
  const fromHtml = htmlAttachments(sourceHtml);
  const attachments = fromHtml.length > 0 ? fromHtml : textAttachments(text);

  return {
    mos_id: mosId,
    sent_date: sentDate,
    recipient: recipient || null,
    agency: shortAgency(recipient) || null,
    title: title || null,
    body: body || null,
    attachments,
  };
}

/**
 * @returns {{ kind: 'original'|'forward' } | null}
 */
function classifyMessage({ from, subject, snippet, html, plain }) {
  const blob = `${from}\n${snippet || ''}\n${html || ''}\n${plain || ''}`;
  const hasSentPhrase =
    SENT_SUBJECT_RE.test(subject) ||
    SENT_SUBJECT_RE.test(snippet || '') ||
    SENT_SUBJECT_RE.test(blob);
  const hasId = /ID\s*=\s*\d+/i.test(blob);

  if (!hasSentPhrase && !hasId) return null;

  const mosHint =
    /noreply@mos\.ru/i.test(blob) ||
    /портал[ае]?\s+Правительства\s+Москвы/i.test(blob) ||
    /www\.mos\.ru/i.test(blob) ||
    /электронн\w+\s+приемн/i.test(blob);

  if (!mosHint && !SENT_SUBJECT_RE.test(subject)) return null;

  if (/noreply@mos\.ru/i.test(from)) return { kind: 'original' };
  if (FWD_RE.test(subject) || mosHint) return { kind: 'forward' };
  if (SENT_SUBJECT_RE.test(subject)) return { kind: 'original' };
  return null;
}

async function listMessageIds(accessToken, query, max) {
  const ids = [];
  let pageToken = '';
  while (ids.length < max) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, max - ids.length)),
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gmailFetch(accessToken, `/messages?${params}`);
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return ids;
}

async function archiveMessage(accessToken, messageId) {
  await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/modify`, {
    method: 'POST',
    body: {
      removeLabelIds: ['INBOX', 'UNREAD'],
    },
  });
}

async function processMessage(accessToken, messageId) {
  const result = {
    id: messageId,
    from: '',
    subject: '',
    kind: null,
    appeal: null,
    skipped: null,
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
    const { html, plain } = extractBodies(msg.payload);

    const classified = classifyMessage({
      from: result.from,
      subject: result.subject,
      snippet: msg.snippet || '',
      html,
      plain,
    });

    if (!classified) {
      result.skipped = 'not_sent_confirmation';
      return result;
    }
    result.kind = classified.kind;

    const appeal = parseAppeal({ html, plain });
    if (!appeal.mos_id || !appeal.title || !appeal.body) {
      result.skipped = 'parse_incomplete';
      result.appeal = appeal;
      return result;
    }
    result.appeal = appeal;
  } catch (err) {
    result.error = err.message || String(err);
  }

  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const USAGE = `Usage:
  fetch-sent.mjs                         Fetch + parse mos.ru «обращение отправлено» from inbox
  fetch-sent.mjs --dry-run               Same as default (no Gmail modify); kept for symmetry
  fetch-sent.mjs --archive-ids <ids>     Archive only: remove INBOX+UNREAD for comma-separated ids

Options:
  --query <q>           Gmail search query (default: sent-confirmation in inbox)
  --max <n>             Max messages to inspect (default: 50)
  --archive-ids <ids>   Comma-separated Gmail message ids to archive (no fetch)
  -h, --help            Show this help
`;

function parseArgs(argv) {
  const opts = { dryRun: false, max: 50, query: null, archiveIds: null };
  const takesValue = new Set(['--query', '--max', '--archive-ids']);
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
    } else if (arg === '--archive-ids') {
      opts.archiveIds = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (opts.archiveIds.length === 0) {
        throw new Error(`--archive-ids requires at least one id`);
      }
    }
    i += 1;
  }
  return opts;
}

async function runArchive(accessToken, ids) {
  const archived = [];
  const errors = [];
  for (const id of ids) {
    try {
      await archiveMessage(accessToken, id);
      archived.push(id);
    } catch (err) {
      errors.push({ id, error: err.message || String(err) });
    }
  }
  process.stdout.write(
    JSON.stringify({ mode: 'archive', archived, errors }, null, 2) + '\n',
  );
  if (errors.length > 0 && archived.length === 0) process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = requireConfig();
  const accessToken = await getAccessToken(config);

  if (opts.archiveIds) {
    await runArchive(accessToken, opts.archiveIds);
    return;
  }

  const query = opts.query || DEFAULT_QUERY;
  const ids = await listMessageIds(accessToken, query, opts.max);

  const accepted = [];
  const skipped = [];
  const errors = [];

  for (const id of ids) {
    const r = await processMessage(accessToken, id);
    if (r.error) {
      errors.push({
        id: r.id,
        from: r.from,
        subject: r.subject,
        error: r.error,
      });
      continue;
    }
    if (r.skipped) {
      skipped.push({
        id: r.id,
        from: r.from,
        subject: r.subject,
        reason: r.skipped,
        appeal: r.appeal,
      });
      continue;
    }
    accepted.push({
      id: r.id,
      from: r.from,
      subject: r.subject,
      kind: r.kind,
      appeal: r.appeal,
    });
  }

  const out = {
    query,
    dryRun: opts.dryRun,
    accepted,
    skipped,
    errors,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  if (errors.length > 0 && accepted.length === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message || err}\n`);
  process.exit(1);
});
