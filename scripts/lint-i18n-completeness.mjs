#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const localesDir = path.resolve('src/locales');
const baseLocale = process.argv[2] ?? 'en';
const targetLocale = process.argv[3] ?? 'fa';

const basePath = path.join(localesDir, `${baseLocale}.json`);
const targetPath = path.join(localesDir, `${targetLocale}.json`);

if (!fs.existsSync(basePath) || !fs.existsSync(targetPath)) {
  console.error(`Locale file not found. base=${basePath} target=${targetPath}`);
  process.exit(2);
}

const base = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
const target = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

const ignoreUntranslatedPatterns = [
  /^app\.title$/,
  /\bAPI\b/i,
  /\bURL\b/i,
  /\bRSS\b/i,
  /\bAI\b/i,
  /\bCII\b/i,
  /\bGPS\b/i,
  /\bAIS\b/i,
  /\bADSB\b/i,
  /\bNOTAM\b/i,
  /\bGDELT\b/i,
  /\bOSINT\b/i,
  /\bGitHub\b/i,
  /\bTelegram\b/i,
  /\{\{\s*[^}]+\s*\}\}/,
];

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, nextKey, out);
    } else {
      out.set(nextKey, value);
    }
  }
  return out;
}

const baseFlat = flatten(base);
const targetFlat = flatten(target);

const missing = [];
const unexpectedFallback = [];

for (const [key, baseValue] of baseFlat.entries()) {
  if (!targetFlat.has(key)) {
    missing.push(key);
    continue;
  }

  const targetValue = targetFlat.get(key);
  if (typeof baseValue !== 'string' || typeof targetValue !== 'string') continue;

  const ignored = ignoreUntranslatedPatterns.some((pattern) => pattern.test(key) || pattern.test(baseValue));
  if (!ignored && baseValue.trim() === targetValue.trim()) {
    unexpectedFallback.push(key);
  }
}

const extra = [...targetFlat.keys()].filter((key) => !baseFlat.has(key));

if (missing.length || unexpectedFallback.length || extra.length) {
  console.error(`i18n completeness lint failed for ${targetLocale} against ${baseLocale}.`);
  if (missing.length) {
    console.error(`\nMissing keys (${missing.length}):`);
    missing.forEach((key) => console.error(`  - ${key}`));
  }
  if (unexpectedFallback.length) {
    console.error(`\nPotential fallback/untranslated keys (${unexpectedFallback.length}):`);
    unexpectedFallback.forEach((key) => console.error(`  - ${key}`));
  }
  if (extra.length) {
    console.error(`\nExtra keys (${extra.length}):`);
    extra.forEach((key) => console.error(`  - ${key}`));
  }
  process.exit(1);
}

console.log(`i18n completeness lint passed for ${targetLocale} against ${baseLocale}.`);
