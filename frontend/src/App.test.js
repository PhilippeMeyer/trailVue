import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// react-leaflet ships ESM that CRA's jest setup will not transform, and a real
// map cannot lay itself out in jsdom anyway. Swapping it for plain elements
// keeps the component tree under test while still exercising App's own logic.
jest.mock('react-leaflet', () => {
  const { createElement } = require('react');
  return {
    MapContainer: ({ children }) => createElement('div', { 'data-testid': 'map' }, children),
    TileLayer: () => null,
    Polyline: ({ children, eventHandlers }) =>
      createElement('button', { 'data-testid': 'track', onClick: () => eventHandlers?.click?.() }, children),
    Tooltip: ({ children }) => createElement('span', null, children),
  };
});

// A real tour: 13347 m covered in 13512 s (3h45m).
const TOUR = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[8.55, 47.10, 1075], [8.56, 47.11, 1090]] },
  properties: {
    id: 1054539686,
    name: 'Randonnée test',
    date: '2025-07-23T08:00:00.000Z',
    distance: 13347,
    duration: 13512,
    elevationUp: 450,
    elevationDown: 430,
    timestamps: [0, 4000],
  },
};

const mockFetch = (files, tour) => {
  global.fetch = jest.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/files') ? files : tour),
    })
  );
};

afterEach(() => jest.resetAllMocks());

test('renders the toolbar with no tours', async () => {
  mockFetch([], null);
  render(<App />);
  expect(await screen.findByText(/0 hikes/)).toBeInTheDocument();
});

test('aggregates distance, time and elevation from a loaded tour', async () => {
  mockFetch(['1054539686.geojson'], TOUR);
  render(<App />);
  // 13347 m -> 13.35 km, 13512 s -> 3.75 h, 450 m climbed
  expect(await screen.findByText(/1 hikes — 13\.35 km — 3\.75 h — 450 m/)).toBeInTheDocument();
});

test('average speed is km/h, not km/min', async () => {
  mockFetch(['1054539686.geojson'], TOUR);
  render(<App />);

  const track = await screen.findByTestId('track');
  fireEvent.click(track);

  // 13.347 km in 3.753 h = 3.56 km/h. The earlier formula used 60 instead of
  // 3600 and reported 0.06 under a km/h label.
  await waitFor(() => expect(screen.getByText('3.56')).toBeInTheDocument());
  expect(screen.queryByText('0.06')).not.toBeInTheDocument();
});

test('a tour that fails to load is skipped rather than breaking the map', async () => {
  global.fetch = jest.fn((url) =>
    String(url).includes('/files')
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(['broken.geojson']) })
      : Promise.resolve({ ok: false })
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<App />);
  expect(await screen.findByText(/0 hikes/)).toBeInTheDocument();
});
