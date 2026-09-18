# trailVue

A web application to visualize past hiking trails on a map.

Recorded tours are imported from [Komoot](https://www.komoot.com/), stored as
GeoJSON files, and rendered by a React client using Leaflet.

## Architecture

| Part | Stack | Role |
| --- | --- | --- |
| `frontend/` | React 19, MUI, react-leaflet | Map UI, served as a static build |
| `backend/` | Node.js, Express 5 | Serves the GeoJSON files and syncs new tours from Komoot |

The backend keeps the tours in `backend/gpx/` (one `<tourId>.geojson` per tour)
and exposes:

| Endpoint | Description |
| --- | --- |
| `GET /api/files` | List the available GeoJSON files |
| `GET /api/update` | Log into Komoot and download any tour not yet stored |
| `GET /trailVue/gpx/<file>` | Serve a stored GeoJSON file |

### Data format

Each tour is stored as a single GeoJSON `Feature`, written minified:

```jsonc
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [[8.556191, 47.101974, 1075.5], ...]  // [lng, lat, altitude]
  },
  "properties": {
    "id": 1054539686,
    "name": "...", "date": "...",
    "distance": 12345, "duration": 6789,
    "elevationUp": 450, "elevationDown": 430,
    "timestamps": [0, 4000, ...]   // parallel to geometry.coordinates
  }
}
```

Files written before this format stored every point twice — once in
`geometry.coordinates` and again as raw objects in `properties.coordinates`.
`backend/scripts/compactGeojson.js` converts them losslessly (it cut a
116-tour collection from 13.1 MB to 2.8 MB):

```bash
cd backend
node scripts/compactGeojson.js --dry-run   # report only
node scripts/compactGeojson.js             # rewrite in place
```

It is idempotent, so re-running it on already-converted files is a no-op.

## Getting started

```bash
git clone https://github.com/PhilippeMeyer/trailVue.git
cd trailVue

# Backend
cd backend
npm install
cp .env.example .env     # then fill in your Komoot credentials
npm start                # http://localhost:5000

# Frontend (in another terminal)
cd frontend
npm install
npm start                # http://localhost:3000
```

### Configuration

The backend reads its configuration from `backend/.env` (see `.env.example`):

| Variable | Description |
| --- | --- |
| `KOMOOT_EMAIL` | Komoot account e-mail |
| `KOMOOT_PASSWORD` | Komoot account password |
| `PORT` | Port the API listens on (default `5000`) |

`.env` is git-ignored. Never commit real credentials.

## Deploying

`deploy.sh` builds the React client and pushes both the build and the server to
a remote host (originally a Raspberry Pi), then restarts the backend with pm2.

Copy `deploy.conf.example` to `deploy.conf` (git-ignored) and set your own
target:

```bash
cp deploy.conf.example deploy.conf
./deploy.sh
```

Files land in `$DEPLOY_DIR` (default `/srv/appservers/trailVue`):

```
/srv/appservers/trailVue
├── client-build/   # React build, served by Apache
├── gpx/            # downloaded tours — server-side state, never overwritten
├── .env            # the Pi's own credentials — never overwritten
└── index.js …      # Express server, run by pm2
```

Deploying replaces the code but leaves `gpx/` and `.env` alone. Tours fetched
on the server via `/api/update` live only there, so they are neither pushed
from your machine nor deleted by a deploy. That also means the Pi needs its own
`backend/.env` created once, by hand:

```bash
ssh <pi> 'sudo -u appservers tee /srv/appservers/trailVue/.env' < backend/.env
```

## Server configuration

The examples below use placeholder names — substitute your own host, domain and
subnets.

### Apache

Apache serves the React client and proxies `/trailVue/api` to the Node server on
port 5000. Because the app is reached both from the LAN and over a VPN, several
aliases point at the same vhost:

```apache
# /etc/apache2/sites-available/trailvue.conf

<VirtualHost *:80>
    ServerName myserver.local
    ServerAlias myserver.home
    ServerAlias 192.168.1.10

    Alias /trailVue /srv/appservers/trailVue/client-build
    <Directory /srv/appservers/trailVue/client-build>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require ip 192.168.0.0/16
        Require ip 10.0.0.0/8
        Require local
    </Directory>

    ProxyPreserveHost On

    <Proxy /trailVue/api>
        Require ip 192.168.0.0/16
        Require ip 10.0.0.0/8
        Require local
    </Proxy>
    ProxyPass /trailVue/api http://localhost:5000/api
    ProxyPassReverse /trailVue/api http://localhost:5000/api

    <Proxy /trailVue/gpx>
        Require ip 192.168.0.0/16
        Require ip 10.0.0.0/8
        Require local
    </Proxy>
    ProxyPass /trailVue/gpx http://localhost:5000/trailVue/gpx
    ProxyPassReverse /trailVue/gpx http://localhost:5000/trailVue/gpx
</VirtualHost>
```

Access is restricted to private subnets, so the app is not reachable from the
internet.

### Name resolution (LAN + VPN)

`myserver.local` is published by avahi and only resolves on the LAN. WireGuard
clients cannot resolve avahi names, so a lightweight DNS server (dnsmasq) runs
on the host and answers over the VPN interface:

```
# /etc/dnsmasq.conf

interface=wg0
listen-address=127.0.0.1,10.0.0.1
```

WireGuard hands that resolver to its clients:

```
# /etc/wireguard/wg0.conf

DNS = 192.168.1.10
```

VPN clients then resolve `myserver.home` through dnsmasq.

## License

ISC
