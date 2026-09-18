import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// A real map cannot lay itself out in jsdom. Swapping it for plain elements
// keeps the component tree under test while still exercising App's own logic.
const { mapStub } = vi.hoisted(() => ({ mapStub: { fitBounds: vi.fn() } }));

vi.mock('react-leaflet', () => {
  const { createElement } = require('react');
  return {
    MapContainer: ({ children }) => createElement('div', { 'data-testid': 'map' }, children),
    TileLayer: () => null,
    Polyline: ({ children, eventHandlers }) =>
      createElement('button', { 'data-testid': 'track', onClick: () => eventHandlers?.click?.() }, children),
    Tooltip: ({ children }) => createElement('span', null, children),
    useMap: () => mapStub,
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

// A planned (not recorded) tour: Komoot reports duration 0 for these.
const TOUR_WITHOUT_DURATION = {
  ...TOUR,
  properties: { ...TOUR.properties, id: 756073732, name: 'Chriesiwanderung', duration: 0 },
};

const mockFetch = (files, tour) => {
  global.fetch = vi.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/files') ? files : tour),
    })
  );
};

afterEach(() => vi.resetAllMocks());

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
  global.fetch = vi.fn((url) =>
    String(url).includes('/files')
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(['broken.geojson']) })
      : Promise.resolve({ ok: false })
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<App />);
  expect(await screen.findByText(/0 hikes/)).toBeInTheDocument();
});

test('a tour with no recorded duration shows no speed instead of Infinity', async () => {
  mockFetch(['756073732.geojson'], TOUR_WITHOUT_DURATION);
  render(<App />);

  fireEvent.click(await screen.findByTestId('track'));

  // 18929 / 0 used to reach .toFixed(2) and render the string "Infinity".
  await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  expect(screen.queryByText('Infinity')).not.toBeInTheDocument();
});

test('time spent is rounded into hours and minutes', async () => {
  mockFetch(['1054539686.geojson'], TOUR);
  render(<App />);

  fireEvent.click(await screen.findByTestId('track'));

  // 13512 s is 225.2 min; the raw float used to be printed as-is.
  await waitFor(() => expect(screen.getByText('3 h 45 min')).toBeInTheDocument());
  expect(screen.queryByText(/225\.2/)).not.toBeInTheDocument();
});

test('the map fits the bounds of the loaded trails', async () => {
  mockFetch(['1054539686.geojson'], TOUR);
  render(<App />);

  await screen.findByTestId('track');
  await waitFor(() => expect(mapStub.fitBounds).toHaveBeenCalled());
  // [lng, lat] in the file, [lat, lng] on the map.
  expect(mapStub.fitBounds.mock.calls[0][0]).toEqual([[47.10, 8.55], [47.11, 8.56]]);
});

test('a sync already in progress is reported to the user', async () => {
  global.fetch = vi.fn((url) => {
    if (String(url).includes('/update')) return Promise.resolve({ ok: false, status: 409 });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/files') ? [] : null),
    });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Update/ }));

  // The 409 from the server-side sync lock used to reach console.error only.
  expect(await screen.findByText(/already running/i)).toBeInTheDocument();
});

test('a failed update is reported to the user', async () => {
  global.fetch = vi.fn((url) => {
    if (String(url).includes('/update')) return Promise.resolve({ ok: false, status: 500 });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/files') ? [] : null),
    });
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Update/ }));

  expect(await screen.findByText(/Update failed/i)).toBeInTheDocument();
});

test('trails that fail to load are counted in a warning', async () => {
  global.fetch = vi.fn((url) =>
    String(url).includes('/files')
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(['broken.geojson']) })
      : Promise.resolve({ ok: false })
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);
  expect(await screen.findByText(/1 of 1 trails could not be loaded/i)).toBeInTheDocument();
});
