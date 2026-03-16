#!/usr/bin/env node
/**
 * Utility: compute CSP sha256 hashes for inline <script> blocks in index.html.
 *
 * Note: This intentionally excludes:
 * - <script src="...">
 * - <script type="module">
 * - <script type="application/ld+json">
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

const html = fs.readFileSync('index.html', 'utf8');

const scripts = [];
const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  const body = m[2] || '';
  if (/type\s*=\s*['"]application\/ld\+json['"]/i.test(attrs)) continue;
  if (/type\s*=\s*['"]module['"]/i.test(attrs)) continue;
  scripts.push(body);
}

console.log(`Inline scripts found: ${scripts.length}`);
scripts.forEach((s, i) => {
  const hash = crypto.createHash('sha256').update(s, 'utf8').digest('base64');
  console.log(`${i + 1}. len=${s.length} sha256-${hash}`);
});

