#!/usr/bin/env node
/**
 * Smoke test for send.mjs. Uses a fake bot token, so nothing reaches the channel.
 * Run: node .codex/skills/telegram/scripts/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEND = join(__dirname, 'send.mjs');
const REPO_ROOT = resolve(__dirname, '../../../..');

let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`ok: ${msg}`);
  } else {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  }
}

function run(args, { stdin = '', env: envExtra = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [SEND, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: '1:fake',
        TELEGRAM_CHAT_ID: '-100',
        TELEGRAM_CHANNEL_USERNAME: 'smoke_test',
        ...envExtra,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function main() {
  // Real network path: fake token must surface a readable Telegram error
  {
    const { code, stderr } = await run(['--text', 'smoke network path']);
    assert(code !== 0, `fake token exits non-zero (got ${code})`);
    assert(
      /Telegram API error/i.test(stderr),
      `stderr names the Telegram API error (got: ${stderr.trim().slice(0, 120)})`,
    );
  }

  // Caption from stdin reaches the same network path (no shell escaping needed)
  {
    const { code, stderr } = await run(['--text-file', '-'], {
      stdin: 'Цитата:\n<blockquote>Текст</blockquote>\n<a href="https://example.com">ссылка</a>',
    });
    assert(code !== 0, 'stdin text reaches Telegram and fails on fake token');
    assert(/Telegram API error/i.test(stderr), 'stdin text produces a Telegram error, not a parse crash');
  }

  // Local validation: photo outside the repository
  {
    const { code, stderr } = await run(['--photo', '/tmp/outside-repo-smoke.jpg']);
    assert(code !== 0, 'photo outside repo exits non-zero');
    assert(
      /inside the repository root/i.test(stderr),
      `stderr mentions repository root (got: ${stderr.trim().slice(0, 120)})`,
    );
  }

  // Local validation: missing file inside the repo
  {
    const { code, stderr } = await run([
      '--photo',
      join(REPO_ROOT, 'no-such-photo.jpg'),
    ]);
    assert(code !== 0, 'missing photo exits non-zero');
    assert(/not found/i.test(stderr), 'stderr mentions the missing file');
  }

  // Local validation: text over the Telegram limit
  {
    const { code, stderr } = await run(['--text-file', '-'], { stdin: 'x'.repeat(4097) });
    assert(code !== 0, 'oversized text exits non-zero');
    assert(
      /exceeds Telegram limit/i.test(stderr),
      `stderr mentions the limit (got: ${stderr.trim().slice(0, 120)})`,
    );
  }

  // No arguments: usage and exit code 2
  {
    const { code, stderr } = await run([]);
    assert(code === 2, `no arguments exits with 2 (got ${code})`);
    assert(/Usage:/.test(stderr), 'usage is printed to stderr');
  }

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nall smoke checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
