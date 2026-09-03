#!/usr/bin/env node
/**
 * Apply Russian typography to a text file in place.
 * Uses typograf (ru) + post-pass for multi-word street names after ул./пр./…
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function usage() {
  console.error("Usage: typograf.mjs <path-to-file>");
  process.exit(1);
}

function loadConfig() {
  const raw = readFileSync(join(__dirname, "typograf.config.json"), "utf8");
  return JSON.parse(raw);
}

/**
 * After street abbreviations, glue Title-Case name words with NBSP.
 * typograf ru/nbsp/addr only inserts NBSP right after «ул.» etc.
 */
function glueStreetNameWords(text) {
  const nbsp = "\u00A0";
  const abbr =
    "(?:ул|пр|пер|ш|б-р|наб|пл|просп|пр-т|бул)\\.";
  const word = "[А-ЯЁA-Z][а-яёa-zA-ZА-ЯЁ-]*";
  const pattern = new RegExp(
    `(${abbr})([ \\u00A0]+)(${word}(?:[ \\u00A0]+${word})*)`,
    "g",
  );
  return text.replace(pattern, (_m, a, _sp, rest) => {
    return a + nbsp + rest.replace(/[ \u00A0]+/g, nbsp);
  });
}

function main() {
  const targetArg = process.argv[2];
  if (!targetArg || targetArg === "-h" || targetArg === "--help") {
    usage();
  }

  const targetPath = resolve(targetArg);
  let Typograf;
  try {
    Typograf = require("typograf");
  } catch {
    console.error(
      "typograf package not found. Run: npm install --prefix .codex/skills/typograf/scripts",
    );
    process.exit(1);
  }

  const config = loadConfig();
  const tp = new Typograf({
    locale: config.locale || ["ru"],
    htmlEntity: config.htmlEntity || { type: "default" },
  });
  for (const rule of config.disableRule || []) {
    tp.disableRule(rule);
  }
  for (const rule of config.enableRule || []) {
    tp.enableRule(rule);
  }

  const original = readFileSync(targetPath, "utf8");
  let result = tp.execute(original);
  result = glueStreetNameWords(result);

  if (result === original) {
    console.error(`unchanged: ${targetPath}`);
    return;
  }

  const tmpPath = join(
    tmpdir(),
    `typograf-${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmpPath, result, "utf8");
    renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }

  console.error(`updated: ${targetPath}`);
}

main();
