import React from 'react';
import {
  AppBar, Toolbar, Typography, Box, Button, Menu, MenuItem, IconButton, FormControl, Select
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useTheme, useMediaQuery } from '@mui/material';

export default function ResponsiveAppBar({
  selectedYear,
  setSelectedYear,
  years,
  updateTracks,
  tracks
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // === 🧮 Compute stats from tracks
  const filteredTracks = selectedYear === 'All'
    ? tracks
    : tracks.filter(t => new Date(t.geojson.properties.date).getFullYear().toString() === selectedYear);

  const total = filteredTracks.length;
  const totalDistance = filteredTracks.reduce((sum, t) => sum + parseFloat(t.length), 0).toFixed(2);
  const totalElevation = filteredTracks.reduce((sum, t) => sum + parseFloat(t.elevationGain), 0).toFixed(0);
  const totalTime = (filteredTracks.reduce((sum, t) => sum + t.timeSpent, 0).toFixed(0) / 60).toFixed(2);

  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);
  const handleYearSelect = (year) => {
    setSelectedYear(year);
    handleMenuClose();
  };

  if (isMobile) {
    return (
      <Box sx={{ position: 'absolute', top: 100, left: 8, zIndex: 1000 }}>
        <IconButton
          color="primary"
          onClick={handleMenuOpen}
          sx={{
            backgroundColor: 'white',
            boxShadow: 1,
            '&:hover': { backgroundColor: '#f0f0f0' }
          }}
        >
          <MenuIcon />
        </IconButton>
        <Menu anchorEl={anchorEl} open={open} onClose={handleMenuClose}>
          <MenuItem onClick={updateTracks}>🔄 Update</MenuItem>
          <MenuItem onClick={() => handleYearSelect('All')}>All</MenuItem>
          {years.map((year) => (
            <MenuItem key={year} onClick={() => handleYearSelect(year)}>
              {year}
            </MenuItem>
          ))}
        </Menu>
      </Box>
    );
  }

  return (
    <AppBar position="static" color="default">
      <Toolbar>
        <Box
          component="img"
          src={`${import.meta.env.BASE_URL}trailVueBar.png`}
          alt="TrailVue Logo"
          sx={{ height: 40, mr: 2, borderRadius: 1, mx: 10 }}
        />
        <FormControl size="small" sx={{ mr: 2, minWidth: 120 }}>
          <Select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
          >
            <MenuItem value="All">All</MenuItem>
            {years.map(year => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" sx={{ flexGrow: 1 }}>
          {total} hikes — {totalDistance} km — {totalTime} h — {totalElevation} m ↑
        </Typography>
        <Button variant="outlined" onClick={updateTracks}>
          🔄 Update
        </Button>
      </Toolbar>
    </AppBar>
  );
}
