import React, { useEffect, useState } from 'react';
import {
  AppBar, Toolbar, Typography, FormControl, Select,
  MenuItem, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemText, Snackbar, Alert, Box
} from '@mui/material';
import { MapContainer, TileLayer, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import ResponsiveAppBar from './components/ResponsiveAppBar'
import { API_BASE_URL, GPX_BASE_URL } from './api';

function App() {
  const [tracks, setTracks] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedYear, setSelectedYear] = useState('All');
  const [snackbarOpen, setSnackbarOpen] = useState(false);


  const loadTrackFromFile = async (fileName) => {
    try {
      const res = await fetch(`${GPX_BASE_URL}/${fileName}`);
      if (!res.ok) throw new Error(`Failed to load ${fileName}`);
      const geojson = await res.json();

      return {
        name: geojson.properties.name,
        geojson,
        coordinates: geojson.geometry.coordinates.map(coord => [coord[1], coord[0]]),
        length: (geojson.properties.distance / 1000).toFixed(2),
        elevationGain: geojson.properties.elevationUp.toFixed(1),
        date: geojson.properties.date.split('T')[0],
        year: geojson.properties.date.slice(0, 4),
        timeSpent: geojson.properties.duration / 60,
        averageSpeed: geojson.properties.distance / geojson.properties.duration * 60 / 1000
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
        setTracks(results.filter(Boolean));
      } catch (err) {
        console.error("Fetch failed:", err);
      }
    };

    fetchTracks();
  }, []);

  const updateTracks = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/update`);
      if (!res.ok) throw new Error("Update failed");
      const result = await res.json();

      const newTrackPromises = result.tours.map(id =>
        loadTrackFromFile(`${id}.geojson`)
      );

      const newTracks = (await Promise.all(newTrackPromises)).filter(Boolean);
      setTracks(prev => [...prev, ...newTracks]);

      setTimeout(() => setSnackbarOpen(true), 0);
      console.log(`✅ Loaded ${newTracks.length} new tours`);
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  const years = [...new Set(tracks.map(t => t.year))].sort().reverse();
  const filteredTracks = selectedYear === 'All' ? tracks : tracks.filter(t => t.year === selectedYear);

  const total = filteredTracks.length;
  const totalDistance = filteredTracks.reduce((sum, t) => sum + parseFloat(t.length), 0).toFixed(2);
  const totalElevation = filteredTracks.reduce((sum, t) => sum + parseFloat(t.elevationGain), 0).toFixed(0);
  const totalTime = filteredTracks.reduce((sum, t) => sum + t.timeSpent, 0).toFixed(0);

  const handleClickOpen = (track) => {
    setSelectedTrack(track);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedTrack(null);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
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

      {/* Map with filtered tracks */}
      <MapContainer center={[47.3, 8.5]} zoom={11} style={{ height: 'calc(100vh - 64px)', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {filteredTracks.map((track, index) => (
          <Polyline
            key={index}
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
                <ListItemText primary="File Name" secondary={selectedTrack.name} />
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
                <ListItemText primary="Time Spent (min)" secondary={selectedTrack.timeSpent} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Average Speed (km/h)" secondary={selectedTrack.averageSpeed.toFixed(2)} />
              </ListItem>
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar on update */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={handleSnackbarClose}>
          ✅ Hikes updated successfully!
        </Alert>
      </Snackbar>
    </div>
  );
}

export default App;
