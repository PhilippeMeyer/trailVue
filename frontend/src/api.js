const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

export const API_BASE_URL = isDev
  ? 'http://localhost:5000/api' // dev server
  : '/trailVue/api';            // production server behind Apache proxy

  export const GPX_BASE_URL = isDev
  ? 'http://localhost:5000/trailVue/gpx'
  : '/trailVue/gpx';
