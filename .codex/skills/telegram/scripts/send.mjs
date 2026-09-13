#!/usr/bin/env node
/**
 * Post a message or a photo to the project Telegram channel via Bot API.
 * HTML parse_mode. Zero npm dependencies — Node 18+ fetch / FormData / Blob.
 *
 * Config: process.env first (Cloud Agent secrets), then repo .env (local).
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_CHANNEL_USERNAME
 *
 * Usage:
 *   send.mjs --text "Короткий текст"
 *   send.mjs --text-file draft.html
 *   send.mjs --photo <abs-path> --caption-file caption.html
 *   cat caption.html | send.mjs --photo <abs-path> --caption-file -
 */

import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, basename, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

const TEXT_MAX = 4096;
const CAPTION_MAX = 1024;

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
  // process.env (Cloud Agent secrets / shell) wins over .env
  const fromProc = process.env[key];
  if (fromProc !== undefined && fromProc !== '') return fromProc;
  const fromFile = fileEnv[key];
  if (fromFile !== undefined && fromFile !== '') return fromFile;
  return '';
}

function requireConfig() {
  const token = env('TELEGRAM_BOT_TOKEN');
  const chatId = env('TELEGRAM_CHAT_ID');
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set (project .env locally, Secrets in Cloud Agents)');
  }
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID is not set (project .env locally, Secrets in Cloud Agents)');
  }
  return { token, chatId, channelUsername: env('TELEGRAM_CHANNEL_USERNAME').replace(/^@/, '') };
}

// ─── Telegram API ───────────────────────────────────────────────────────────

async function telegramApi(token, method, body, isForm = false) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Telegram API: non-JSON response (HTTP ${res.status})`);
  }
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || `HTTP ${res.status}`}`);
  }
  return data.result;
}

function successResult(result, channelUsername) {
  const messageId = result.message_id;
  return {
    message_id: messageId,
    chat_id: result.chat?.id ?? null,
    link: channelUsername && messageId != null ? `https://t.me/${channelUsername}/${messageId}` : null,
  };
}

// ─── Local file handling ────────────────────────────────────────────────────

function assertPathInsideRepo(absPath) {
  const rel = relative(REPO_ROOT, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Photo path must be inside the repository root (${REPO_ROOT})`);
  }
}

function mimeFromPath(p) {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read stdin: ${err.message}`);
  }
}

function readTextSource(pathOrDash, label) {
  if (pathOrDash === '-') return readStdin();
  const abs = resolve(pathOrDash);
  if (!existsSync(abs)) throw new Error(`${label} file not found: ${abs}`);
  return readFileSync(abs, 'utf8');
}

// ─── Send ───────────────────────────────────────────────────────────────────

async function sendMessage({ text, chatId, preview, silent }) {
  const { token, chatId: defaultChatId, channelUsername } = requireConfig();
  if (!text || !text.trim()) throw new Error('Message text is empty');
  if (text.length > TEXT_MAX) {
    throw new Error(`text exceeds Telegram limit (${text.length} > ${TEXT_MAX})`);
  }
  const body = {
    chat_id: chatId || defaultChatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: !preview,
  };
  if (silent) body.disable_notification = true;
  return successResult(await telegramApi(token, 'sendMessage', body), channelUsername);
}

async function sendPhoto({ photo, caption, chatId, silent }) {
  const { token, chatId: defaultChatId, channelUsername } = requireConfig();
  if (!photo || !photo.trim()) throw new Error('Photo path, URL or file_id is required');
  if (caption && caption.length > CAPTION_MAX) {
    throw new Error(`caption exceeds Telegram limit (${caption.length} > ${CAPTION_MAX})`);
  }
  const target = chatId || defaultChatId;

  const isUrl = /^https?:\/\//i.test(photo);
  const looksLocal = !isUrl && (photo.includes('/') || photo.includes('\\'));

  if (looksLocal) {
    const abs = resolve(photo);
    assertPathInsideRepo(abs);
    if (!existsSync(abs)) throw new Error(`Photo file not found: ${abs}`);
    const bytes = await readFile(abs);
    const form = new FormData();
    form.append('chat_id', String(target));
    form.append('photo', new Blob([bytes], { type: mimeFromPath(abs) }), basename(abs));
    form.append('parse_mode', 'HTML');
    if (caption) form.append('caption', caption);
    if (silent) form.append('disable_notification', 'true');
    return successResult(await telegramApi(token, 'sendPhoto', form, true), channelUsername);
  }

  const body = { chat_id: target, photo, parse_mode: 'HTML' };
  if (caption) body.caption = caption;
  if (silent) body.disable_notification = true;
  return successResult(await telegramApi(token, 'sendPhoto', body), channelUsername);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const USAGE = `Usage:
  send.mjs --text "Текст"                       Post an HTML message
  send.mjs --text-file <path|->                 Same, text from file or stdin
  send.mjs --photo <path|url|file_id> [--caption "…" | --caption-file <path|->]

Options:
  --chat-id <id>   Override TELEGRAM_CHAT_ID
  --preview        Keep link previews (off by default)
  --silent         Send without notification
`;

function parseArgs(argv) {
  const opts = { preview: false, silent: false };
  const takesValue = new Set([
    '--text',
    '--text-file',
    '--photo',
    '--caption',
    '--caption-file',
    '--chat-id',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg === '--preview') {
      opts.preview = true;
      continue;
    }
    if (arg === '--silent') {
      opts.silent = true;
      continue;
    }
    if (!takesValue.has(arg)) throw new Error(`Unknown option: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Option ${arg} requires a value`);
    opts[arg.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = value;
    i += 1;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.text && opts.textFile) throw new Error('Use either --text or --text-file, not both');
  if (opts.caption && opts.captionFile) {
    throw new Error('Use either --caption or --caption-file, not both');
  }

  let result;
  if (opts.photo) {
    const caption = opts.captionFile
      ? readTextSource(opts.captionFile, 'Caption')
      : opts.caption;
    result = await sendPhoto({
      photo: opts.photo,
      caption: caption ? caption.trimEnd() : undefined,
      chatId: opts.chatId,
      silent: opts.silent,
    });
  } else if (opts.text || opts.textFile) {
    const text = opts.textFile ? readTextSource(opts.textFile, 'Text') : opts.text;
    result = await sendMessage({
      text: text.trimEnd(),
      chatId: opts.chatId,
      preview: opts.preview,
      silent: opts.silent,
    });
  } else {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`${err.message || err}\n`);
  process.exit(1);
});
