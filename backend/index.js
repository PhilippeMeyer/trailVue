require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const KomootApi = require('./komootApi');

const PORT = process.env.PORT || 5000;
const username = process.env.KOMOOT_EMAIL;
const password = process.env.KOMOOT_PASSWORD;

var app = express()

app.use(cors())

const directoryPath = path.join(__dirname, 'gpx');
if (!fs.existsSync(directoryPath)) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

// Serve static files from the 'public' directory and from the react build
app.use('/trailVue/gpx', express.static(path.join(__dirname, 'gpx')));

// Endpoint to get the list of files in the 'public' directory
app.get('/api/files', (req, res) => {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).json({ error: 'Failed to read directory' });
    }

    res.json(files);
  });
});

// Endpoint to update the files vs Komoot
app.get('/api/update', async (req, res) => {
  try {
    if (!username || !password) {
      return res.status(500).send({ error: 'KOMOOT_EMAIL and KOMOOT_PASSWORD must be set (see .env.example)' });
    }

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
      fs.writeFileSync(path.join(directoryPath, filename), JSON.stringify(geojson, null, 2));
      console.log(`Saved ${filename}`);
    }

    res.status(200).send({success: 'tours updated', tours: missingTours.map(t => t.id )})

  } catch(e) {
    console.log('error: ', e);
    res.status(500).send({error: e});
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

