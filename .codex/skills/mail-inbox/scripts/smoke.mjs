#!/usr/bin/env node
/**
 * Smoke test for fetch-mail.mjs. Uses fake Gmail OAuth env — no mailbox changes.
 * Run: node .codex/skills/mail-inbox/scripts/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FETCH = join(__dirname, 'fetch-mail.mjs');
const AUTH = join(__dirname, 'auth.mjs');
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

function run(script, args, { env: envExtra = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        GMAIL_CLIENT_ID: 'fake-client-id.apps.googleusercontent.com',
        GMAIL_CLIENT_SECRET: 'fake-secret',
        GMAIL_REFRESH_TOKEN: 'fake-refresh-token',
        ...envExtra,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
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
  });
}

async function main() {
  // Missing required key (whitespace overrides .env via trim)
  {
    const { code, stderr } = await run(FETCH, ['--dry-run'], {
      env: { GMAIL_CLIENT_ID: ' ', GMAIL_CLIENT_SECRET: 'x', GMAIL_REFRESH_TOKEN: 'x' },
    });
    assert(code !== 0, `missing GMAIL_CLIENT_ID exits non-zero (got ${code})`);
    assert(
      /GMAIL_CLIENT_ID is not set/i.test(stderr),
      `stderr names missing GMAIL_CLIENT_ID (got: ${stderr.trim().slice(0, 120)})`,
    );
  }

  // Fake refresh token → readable OAuth error
  {
    const { code, stderr } = await run(FETCH, ['--dry-run']);
    assert(code !== 0, `fake refresh token exits non-zero (got ${code})`);
    assert(
      /OAuth error/i.test(stderr),
      `stderr names OAuth error (got: ${stderr.trim().slice(0, 160)})`,
    );
  }

  // Unknown option
  {
    const { code, stderr } = await run(FETCH, ['--nope']);
    assert(code !== 0, 'unknown option exits non-zero');
    assert(
      /Unknown option/i.test(stderr),
      `stderr mentions Unknown option (got: ${stderr.trim().slice(0, 120)})`,
    );
  }

  // --help
  {
    const { code, stdout } = await run(FETCH, ['--help']);
    assert(code === 0, `--help exits 0 (got ${code})`);
    assert(/Usage:/.test(stdout), 'usage is printed on --help');
  }

  // Invalid --max
  {
    const { code, stderr } = await run(FETCH, ['--max', '0']);
    assert(code !== 0, 'invalid --max exits non-zero');
    assert(/--max/i.test(stderr), 'stderr mentions --max');
  }

  // auth.mjs missing secret (whitespace overrides .env via trim)
  {
    const { code, stderr } = await run(AUTH, [], {
      env: { GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: ' ' },
    });
    assert(code !== 0, 'auth without secret exits non-zero');
    assert(
      /GMAIL_CLIENT_SECRET is not set/i.test(stderr),
      `auth stderr names missing secret (got: ${stderr.trim().slice(0, 120)})`,
    );
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
