const axios = require("axios");

class KomootApi {
  constructor() {
    this.userId = '';
    this.token = '';
  }

  /**
   * Generate Basic Auth header config
   */
  getAuthConfig() {
    if (!this.userId || !this.token) return {};
    const authStr = Buffer.from(`${this.userId}:${this.token}`, 'utf8').toString('base64');
    return {
      headers: {
        Authorization: `Basic ${authStr}`
      }
    };
  }

  /**
   * Centralized GET request with error handling
   */
  static async sendRequest(url, config = {}, critical = true) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      const detail = err.response ? `HTTP ${err.response.status}` : err.message;
      console.error(`[KomootApi] Request failed (${detail}): ${url}`);
      if (critical) throw new Error(`Komoot request failed: ${detail}`);
      return null;
    }
  }

  /**
   * Perform login using email/password to get userId/token
   */
  async login(email, password) {
    console.log(`[KomootApi] Logging in as ${email}...`);
    const authHeader = {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`
      }
    };

    const url = `https://api.komoot.de/v006/account/email/${email}/`;
    const res = await KomootApi.sendRequest(url, authHeader);

    const data = res.data;
    this.userId = data.username;
    this.token = data.password;

    console.log(`[KomootApi] Logged in as '${data.user.displayname}'`);
  }

  /**
   * Fetch detailed tour data by ID
   */
  async fetchTour(tourId) {
    console.log(`[KomootApi] Fetching tour ${tourId}...`);
    const url = `https://api.komoot.de/v007/tours/${tourId}?` +
      `_embedded=coordinates,way_types,surfaces,directions,participants,timeline` +
      `&directions=v2&fields=timeline&format=coordinate_array` +
      `&timeline_highlights_fields=tips,recommenders`;

    const res = await KomootApi.sendRequest(url, this.getAuthConfig());
    return res?.data || null;
  }

  /**
   * Fetch all hiking tours of a specific user
   */
  async fetchAllTours(userId = this.userId) {
    console.log(`[KomootApi] Fetching all tours for user ${userId}...`);
    const baseUrl = `https://api.komoot.de/v007/users/${userId}/tours/?` +
      `sport_types=hike&type=tour_recorded&sort_field=date&sort_direction=desc&hl=fr&page=`;

    const allTours = [];
    let page = 0;

    while (true) {
      const url = baseUrl + page;
      const res = await KomootApi.sendRequest(url, this.getAuthConfig());
      if (!res) break;

      const tours = res.data._embedded?.tours || [];
      allTours.push(...tours);

      if (!res.data._links?.next) break;
      page++;
    }

    return allTours;
  }

  /**
   * Fetch GPS coordinates of a specific tour
   */
  async fetchCoordinates(tourId) {
    console.log(`[KomootApi] Fetching coordinates for tour ${tourId}...`);
    const url = `https://api.komoot.de/v007/tours/${tourId}/coordinates/`;
    const res = await KomootApi.sendRequest(url, this.getAuthConfig());
    return res?.data?.items || [];
  }

  /**
   * Convert Komoot tour and coordinates to GeoJSON
   */
  convertToGeoJson(tour, coords) {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        // GeoJSON position: [lng, lat, altitude]
        coordinates: coords.map(p => [p.lng, p.lat, p.alt])
      },
      properties: {
        id: tour.id,
        name: tour.name,
        date: tour.date,
        startPoint: tour.start_point,
        distance: tour.distance,
        duration: tour.duration,
        elevationUp: tour.elevation_up,
        elevationDown: tour.elevation_down,
        timeInMotion: tour.time_in_motion,
        // Offsets in ms from the start of the tour, parallel to geometry.coordinates
        timestamps: coords.map(p => p.t)
      }
    };
  }
}

module.exports = KomootApi;