#!/usr/bin/env node
/**
 * Build script: generate public/data/countries.geojson
 *
 * Source: Natural Earth 110m admin-0 countries dataset already present via
 * `globe.gl` examples in node_modules.
 *
 * Output schema is intentionally minimal and matches in-repo expectations:
 * - properties.name
 * - properties['ISO3166-1-Alpha-2']
 * - properties['ISO3166-1-Alpha-3']
 *
 * Usage:
 *   node scripts/build-countries-geojson.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join('node_modules', 'globe.gl', 'example', 'datasets', 'ne_110m_admin_0_countries.geojson');
const OUT_DIR = path.join('public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'countries.geojson');

function normalizeIso2(p, name) {
  const raw = p['ISO3166-1-Alpha-2'] ?? p.ISO_A2 ?? p.iso_a2 ?? '';
  let iso2 = String(raw).trim().toUpperCase();
  const wb2 = String(p.WB_A2 ?? '').trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(iso2) || iso2 === '-99') {
    if (/^[A-Z]{2}$/.test(wb2) && wb2 !== '-99') iso2 = wb2;
  }

  // Natural Earth edge-cases in the bundled dataset
  if (name === 'Norway') iso2 = 'NO';
  if (name === 'France') iso2 = 'FR';

  return iso2 || '-99';
}

function normalizeIso3(p, iso2) {
  const candidates = [
    p['ISO3166-1-Alpha-3'],
    p.ISO_A3,
    p.WB_A3,
    p.ADM0_A3,
    p.SOV_A3,
    p.BRK_A3,
    p.GU_A3,
    p.SU_A3,
  ];

  let iso3 = '';
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const v = c.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(v) && v !== '-99') {
      iso3 = v;
      break;
    }
  }

  // Kosovo: ISO_A2 is XK in NE, but ISO_A3 is -99. QADR expects XKX.
  if (iso2 === 'XK') iso3 = 'XKX';

  return iso3 || '-99';
}

function normalizeName(p) {
  return String(p.name ?? p.NAME ?? p.ADMIN ?? p.admin ?? '').trim();
}

function main() {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const features = Array.isArray(raw.features) ? raw.features : [];

  const out = {
    type: 'FeatureCollection',
    features: features.map((f) => {
      const p = f.properties ?? {};
      const name = normalizeName(p);
      const iso2 = normalizeIso2(p, name);
      const iso3 = normalizeIso3(p, iso2);
      return {
        type: 'Feature',
        properties: {
          name,
          'ISO3166-1-Alpha-2': iso2,
          'ISO3166-1-Alpha-3': iso3,
        },
        geometry: f.geometry,
      };
    }),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out) + '\n', 'utf8');
  console.log(`Wrote ${out.features.length} features -> ${OUT_FILE}`);
}

main();

