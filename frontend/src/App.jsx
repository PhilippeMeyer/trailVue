import React, { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemText, Snackbar, Alert
} from '@mui/material';
import { MapContainer, TileLayer, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import ResponsiveAppBar from './components/ResponsiveAppBar'
import { API_BASE_URL, GPX_BASE_URL } from './api';

// Minutes -> "3 h 45 min". The raw value has no natural precision (13512 s is
// 225.2 minutes, 437.28333333333336 for a longer walk), so it is never shown
// unrounded.
const formatDuration = (minutes) => {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
};

// Some Komoot tours - typically ones planned rather than recorded - carry
// duration 0. Dividing by it yields Infinity, which rendered literally as the
// average speed. There is no speed to report for those, so say so.
const averageSpeedOf = ({ distance, duration }) =>
  duration > 0 ? distance / duration * 3600 / 1000 : null;

// The map opens on whatever is currently drawn. The centre used to be hardcoded
// to Zurich, which left tours elsewhere - the Azores, for instance - off-screen
// with nothing to suggest they existed.
function FitBounds({ tracks, fitKey }) {
  const map = useMap();

  useEffect(() => {
    const points = tracks.flatMap(t => t.coordinates);
    if (points.length) map.fitBounds(points, { padding: [20, 20] });
    // fitKey, not tracks: the filtered array is rebuilt on every render, and
    // depending on it would fight the user for control of the viewport.
  }, [fitKey, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function App() {
  const [tracks, setTracks] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedYear, setSelectedYear] = useState('All');
  // { severity, message } or null. Failures used to reach console.error only,
  // so a dead-looking Update button was the only symptom.
  const [notice, setNotice] = useState(null);

  const loadTrackFromFile = async (fileName) => {
    try {
      const res = await fetch(`${GPX_BASE_URL}/${fileName}`);
      if (!res.ok) throw new Error(`Failed to load ${fileName}`);
      const geojson = await res.json();

      return {
        id: geojson.properties.id,
        name: geojson.properties.name,
        geojson,
        coordinates: geojson.geometry.coordinates.map(coord => [coord[1], coord[0]]),
        length: (geojson.properties.distance / 1000).toFixed(2),
        elevationGain: geojson.properties.elevationUp.toFixed(1),
        date: geojson.properties.date.split('T')[0],
        year: geojson.properties.date.slice(0, 4),
        timeSpent: geojson.properties.duration / 60,
        averageSpeed: averageSpeedOf(geojson.properties)
      };
    } catch (err) {
      console.error("Error loading file:", fileName, err);
      return null;
    }
  };

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/files`);
        if (!response.ok) throw new Error("Failed to load file list");
        const gpxFiles = await response.json();

        const trackPromises = gpxFiles.map(loadTrackFromFile);
        const results = await Promise.all(trackPromises);
        const loaded = results.filter(Boolean);
        setTracks(loaded);

        // A trail that fails to load simply vanishes from the map. Say how many.
        const failed = results.length - loaded.length;
        if (failed) {
          setNotice({
            severity: 'warning',
            message: `${failed} of ${results.length} trails could not be loaded.`
          });
        }
      } catch (err) {
        console.error("Fetch failed:", err);
        setNotice({ severity: 'error', message: 'Could not load the trail list from the server.' });
      }
    };

    fetchTracks();
  }, []);

  const updateTracks = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/update`);

      // The server allows one sync at a time; without this the button looks
      // broken for as long as a sync is running.
      if (res.status === 409) {
        setNotice({ severity: 'info', message: 'A sync is already running — try again shortly.' });
        return;
      }
      if (!res.ok) throw new Error(`Update failed (HTTP ${res.status})`);
      const result = await res.json();

      const newTrackPromises = result.tours.map(id =>
        loadTrackFromFile(`${id}.geojson`)
      );

      const newTracks = (await Promise.all(newTrackPromises)).filter(Boolean);
      setTracks(prev => [...prev, ...newTracks]);

      setNotice({
        severity: 'success',
        message: newTracks.length
          ? `✅ Loaded ${newTracks.length} new tours`
          : 'Already up to date — no new tours.'
      });
    } catch (err) {
      console.error("Update error:", err);
      setNotice({ severity: 'error', message: `Update failed: ${err.message}` });
    }
  };

  const years = [...new Set(tracks.map(t => t.year))].sort().reverse();
  const filteredTracks = selectedYear === 'All' ? tracks : tracks.filter(t => t.year === selectedYear);
  const fitKey = filteredTracks.map(t => t.id).join(',');

  const handleClickOpen = (track) => {
    setSelectedTrack(track);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedTrack(null);
  };

  const handleNoticeClose = () => {
    setNotice(null);
  };

  // Year → Color mapping
  const yearColors = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
    "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
    "#bcbd22", "#17becf"
  ];
  const yearColorMap = {};
  years.forEach((year, index) => {
    yearColorMap[year] = yearColors[index % yearColors.length];
  });

  return (
    <div>
      {/* Top bar with year filter, stats, and update button */}
      <ResponsiveAppBar
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        years={years}
        updateTracks={updateTracks}
        tracks={tracks}
      />

      {/* Map with filtered tracks. center/zoom only apply until the first
          trail loads, after which FitBounds takes over. */}
      <MapContainer center={[47.3, 8.5]} zoom={11} style={{ height: 'calc(100vh - 64px)', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <FitBounds tracks={filteredTracks} fitKey={fitKey} />
        {filteredTracks.map((track) => (
          <Polyline
            key={track.id}
            positions={track.coordinates}
            pathOptions={{ color: yearColorMap[track.year] || '#000' }}
            eventHandlers={{ click: () => handleClickOpen(track) }}
          >
            <Tooltip sticky>
              <strong>{track.name}</strong><br />
              {track.date} — {track.length} km
            </Tooltip>
          </Polyline>
        ))}
      </MapContainer>

      {/* Track detail popup */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Track Attributes</DialogTitle>
        <DialogContent>
          {selectedTrack && (
            <List>
              <ListItem>
                <ListItemText primary="Tour Name" secondary={selectedTrack.name} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Length (km)" secondary={selectedTrack.length} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Elevation Gain (m)" secondary={selectedTrack.elevationGain} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Date of Hike" secondary={selectedTrack.date} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Time Spent" secondary={formatDuration(selectedTrack.timeSpent)} />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Average Speed (km/h)"
                  secondary={selectedTrack.averageSpeed === null ? '—' : selectedTrack.averageSpeed.toFixed(2)}
                />
              </ListItem>
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Success and failure both surface here */}
      <Snackbar
        open={notice !== null}
        autoHideDuration={notice?.severity === 'error' ? null : 4000}
        onClose={handleNoticeClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={notice?.severity || 'info'} onClose={handleNoticeClose}>
          {notice?.message}
        </Alert>
      </Snackbar>
    </div>
  );
}

export default App;
