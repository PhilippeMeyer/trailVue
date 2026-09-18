const path = require('path');

// Resolve .env next to this file rather than relative to the working
// directory: pm2 restarts the process with whatever cwd it recorded at
// creation time, which is not necessarily the app directory.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const KomootApi = require('./komootApi');

const PORT = process.env.PORT || 5000;
const username = process.env.KOMOOT_EMAIL;
const password = process.env.KOMOOT_PASSWORD;

var app = express()

// A sync is a long, file-writing operation against a rate-limited third party.
// Two overlapping runs would list the same tours, find the same files missing
// and download them twice, so only one is allowed at a time.
let syncInProgress = false;

app.use(cors())

// GeoJSON is highly repetitive text and compresses by roughly two thirds.
app.use(compression())

const directoryPath = path.join(__dirname, 'gpx');
if (!fs.existsSync(directoryPath)) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

// Serve static files from the 'public' directory and from the react build
// Tour files are immutable: each is named after its Komoot tour id and is
// written once, never rewritten. Long-lived caching means a repeat visit
// re-fetches nothing. NB: if the stored format ever changes again (as it did
// when the files were compacted), cached copies survive until this expires.
app.use('/trailVue/gpx', express.static(path.join(__dirname, 'gpx'), {
  maxAge: '30d',
  immutable: true
}));

// Endpoint to get the list of files in the 'public' directory
app.get('/api/files', (req, res) => {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).json({ error: 'Failed to read directory' });
    }

    // Only completed tour files: a sync briefly leaves <id>.geojson.tmp in
    // place, and the client must not try to load one.
    res.json(files.filter(name => name.endsWith('.geojson')));
  });
});

// Endpoint to update the files vs Komoot
app.get('/api/update', async (req, res) => {
  if (!username || !password) {
    return res.status(500).send({ error: 'KOMOOT_EMAIL and KOMOOT_PASSWORD must be set (see .env.example)' });
  }

  if (syncInProgress) {
    return res.status(409).send({ error: 'A sync is already running' });
  }
  syncInProgress = true;

  try {
    const existingFiles = fs.readdirSync(directoryPath);

    const api = new KomootApi();
    await api.login(username, password);
    const tours = await api.fetchAllTours();
    const fileIds = new Set(existingFiles.map(name => name.match(/\d+/)?.[0]).filter(Boolean));
    const missingTours = tours.filter(tour => !fileIds.has(String(tour.id)));

    for (const tour of missingTours) {
      const coordinates = await api.fetchCoordinates(tour.id);
      const geojson = api.convertToGeoJson(tour, coordinates);
      const filename = `${tour.id}.geojson`;
      const target = path.join(directoryPath, filename);
      const tmp = `${target}.tmp`;

      // Write to a temporary file and rename it into place. rename(2) is
      // atomic within a filesystem, so a reader either sees the previous file
      // or the complete new one -- never a half-written one that fails to
      // parse and silently drops the trail from the map.
      fs.writeFileSync(tmp, JSON.stringify(geojson));
      fs.renameSync(tmp, target);
      console.log(`Saved ${filename}`);
    }

    res.status(200).send({success: 'tours updated', tours: missingTours.map(t => t.id )})

  } catch(e) {
    // An Error object serialises to {} in JSON, so send the message.
    console.error('[/api/update] failed:', e);
    res.status(500).send({error: e.message});
  } finally {
    syncInProgress = false;
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Exported so tests can shut the server down instead of forcing the process
// to exit while assertions are still running.
module.exports = { app, server };

