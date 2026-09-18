#!/usr/bin/env node
/**
 * One-off migration for GeoJSON files written before the compact format.
 *
 * Older files stored every point twice: once in `geometry.coordinates` as
 * [lng, lat], and again in `properties.coordinates` as the raw Komoot objects
 * {lat, lng, alt, t}. This rewrites them to the current format, which keeps the
 * same information in a third of the space:
 *
 *   geometry.coordinates   [lng, lat, alt]
 *   properties.timestamps  parallel array of time offsets
 *
 * Output is written minified: these files are served to the browser, not read
 * by hand, and pretty-printing them costs several MB across the collection.
 *
 * No data is lost. The script is idempotent: files already in the new format
 * are skipped, so it is safe to re-run.
 *
 *   node scripts/compactGeojson.js            # rewrite in place
 *   node scripts/compactGeojson.js --dry-run  # report only, change nothing
 */

const fs = require('fs');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const dir = path.join(__dirname, '..', 'gpx');

let migrated = 0;
let skipped = 0;
let before = 0;
let after = 0;

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.geojson'))) {
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full, 'utf8');
  const geojson = JSON.parse(raw);
  const coords = geojson.properties?.coordinates;

  if (!Array.isArray(coords)) {
    skipped++;
    continue;
  }

  geojson.geometry.coordinates = coords.map(p => [p.lng, p.lat, p.alt]);
  geojson.properties.timestamps = coords.map(p => p.t);
  delete geojson.properties.coordinates;

  const out = JSON.stringify(geojson);
  before += Buffer.byteLength(raw);
  after += Buffer.byteLength(out);
  migrated++;

  if (!dryRun) fs.writeFileSync(full, out);
}

const mb = n => (n / 1024 / 1024).toFixed(2);
console.log(`${dryRun ? '[dry run] ' : ''}migrated ${migrated} file(s), skipped ${skipped} already compact`);
if (migrated) {
  console.log(`${mb(before)} MB -> ${mb(after)} MB (${(100 - (after / before) * 100).toFixed(0)}% smaller)`);
}
