const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

// Stub the Komoot client before index.js requires it: no network, no account,
// and no tours reported missing, so a sync writes nothing to the data dir.
const komootPath = require.resolve('../komootApi.js');
class StubApi {
  async login() { await new Promise(r => setTimeout(r, 400)); }   // slow enough for calls to overlap
  async fetchAllTours() { return []; }
  async fetchCoordinates() { return []; }
  convertToGeoJson() { return {}; }
}
require.cache[komootPath] = Object.assign(new Module(komootPath, null), {
  exports: StubApi,
  loaded: true,
});

process.env.KOMOOT_EMAIL = 'test@example.invalid';
process.env.KOMOOT_PASSWORD = 'test';
process.env.PORT = '5177';
const { server } = require('../index.js');

const BASE = 'http://127.0.0.1:5177';
const gpxDir = path.join(__dirname, '..', 'gpx');
const marker = path.join(gpxDir, 'ci-marker.geojson');
const decoy = path.join(gpxDir, 'ci-decoy.geojson.tmp');

before(async () => {
  fs.mkdirSync(gpxDir, { recursive: true });
  fs.writeFileSync(marker, '{}');
  fs.writeFileSync(decoy, '{partial');          // simulates a sync in flight
  await new Promise(r => setTimeout(r, 300));   // let the server bind
});

after(() => {
  for (const f of [marker, decoy]) if (fs.existsSync(f)) fs.unlinkSync(f);
  server.close();
});

test('GET /api/files lists completed tours', async () => {
  const files = await fetch(`${BASE}/api/files`).then(r => r.json());
  assert.ok(files.includes('ci-marker.geojson'), 'completed file should be listed');
});

test('GET /api/files hides a partially written .tmp file', async () => {
  const files = await fetch(`${BASE}/api/files`).then(r => r.json());
  assert.ok(files.every(f => f.endsWith('.geojson')), `unexpected entries: ${files.filter(f => !f.endsWith('.geojson'))}`);
  assert.ok(!files.some(f => f.endsWith('.tmp')), '.tmp must not be exposed');
});

test('concurrent /api/update calls do not both run', async () => {
  const [a, b] = await Promise.all([
    fetch(`${BASE}/api/update`).then(r => r.status),
    fetch(`${BASE}/api/update`).then(r => r.status),
  ]);
  assert.deepStrictEqual([a, b].sort(), [200, 409], `expected one 200 and one 409, got ${a} and ${b}`);
});

test('the lock is released after a sync finishes', async () => {
  const status = await fetch(`${BASE}/api/update`).then(r => r.status);
  assert.strictEqual(status, 200, 'endpoint should be usable again');
});
