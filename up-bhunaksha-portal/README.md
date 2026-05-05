# UP Land Lookup — खसरा खोजें

Find any UP cadastral plot on Google Maps from its **district + tehsil + village + khasra number**. Fully driven by the public `upbhunaksha.gov.in` API — no scraping, no precomputed dataset, just a thin caching proxy.

```
Receipt -> 3 dropdowns + plot no -> 📍 marker on Google Maps satellite view
```

## What's inside

```
up-bhunaksha-portal/
├── backend/    Node.js + Express + SQLite — proxies UP API, caches results,
│               converts UTM Zone 44N → WGS-84 lat/lon
└── frontend/   Next.js 14 (App Router) + Tailwind + Google Maps
                Single-page form with searchable dropdowns
```

## Prerequisites

- **Node.js ≥ 20** (tested on 22.20)
- **A Google Maps API key** with the *Maps JavaScript API* enabled. Already configured in `frontend/.env.local`.

## ⚠️ Secure your Google Maps API key

The dev key sits in `frontend/.env.local` (which is git-ignored). **Before deploying anywhere or sharing this folder, do all three of these in [Google Cloud Console](https://console.cloud.google.com):**

1. **HTTP referrer restrictions**  
   APIs & Services → Credentials → click the key → *Application restrictions* → "HTTP referrers" → add:
   - `http://localhost:3000/*`
   - `http://localhost:3001/*`
   - your production domain
2. **API restrictions** → select only "Maps JavaScript API"
3. **Quota cap** on Maps JavaScript API (e.g. 1000/day) so abuse is bounded

The current key was pasted in chat earlier — consider rotating it once you've set up restrictions.

## Run it

Two terminals.

**Terminal 1 — backend (port 4000):**

```bash
cd backend
npm install
node src/server.js
```

You should see:

```
[backend] listening on http://localhost:4000
[backend] CORS origins allowed: http://localhost:3000, http://localhost:3001
```

**Terminal 2 — frontend (port 3000, falls back to 3001 if busy):**

```bash
cd frontend
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) (or 3001 if Next moves it).

## How it works

```
Browser  ──>  Next frontend  ──>  Express backend  ──>  upbhunaksha.gov.in
                  │                      │
                  └─── Google Maps API ──┘
                       (lat/lon marker + bbox)
```

### Backend endpoints (`http://localhost:4000`)

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | liveness check |
| `/api/districts` | GET | List all 75 UP districts |
| `/api/tehsils?district=193` | GET | List tehsils in a district |
| `/api/villages?district=193&tehsil=00978` | GET | List villages in a tehsil |
| `/api/plot` | POST | Body: `{district, tehsil, village, plotNo}` → plot details + lat/lon |

District/tehsil/village lists are cached in SQLite for 7 days (configurable via `LEVEL_TTL_SECONDS` env var). Plot lookups are cached forever (geometry doesn't change). All cache lives in `backend/data/up_cache.sqlite` — delete the file to reset.

### Coordinate handling

UP cadastre stores everything in **UTM Zone 44N (EPSG:32644)** because most of UP sits between longitudes 78°E–84°E. The backend converts to **WGS-84 (EPSG:4326)** via `proj4` before sending lat/lon to the frontend. (Bihar uses UTM 45N — see the sibling `bihar_land_geocoords.py` script.)

### Plot polygon as a real geofence

Each successful lookup returns a `polygon` field — an array of `{lat, lng}` vertices that traces the **actual plot boundary** (not just a bounding rectangle). The frontend draws this as a translucent red Google Maps `<Polygon>` over the satellite imagery, looking like a geofenced area.

Because the upstream API only exposes plot geometry through raster WMS (no GeoJSON / WFS), the backend extracts vector coordinates by:

1. Requesting a high-resolution `PLOT_LIST` WMS PNG of the plot
2. Building a binary alpha mask from the rendered red fill
3. Running marching squares to extract the iso-contour
4. Picking the largest closed loop, simplifying with Douglas-Peucker
5. Converting pixel coords back to UTM Zone 44N, then to WGS-84 lat/lon

Net result: usually 15-60 vertices that match the BhuNaksha shape within a few centimetres at common plot scales. The polygon is cached in SQLite so subsequent lookups for the same plot skip the trace.

## Try a known-good plot

To verify everything is wired correctly:

```
District:  बलिया  (193)
Tehsil:    बलिया सदर  (00978)
Village:   अख्तियार पुर  (198786)
Khasra:    1
```

Should pin around `25.776611° N, 83.964334° E` (eastern UP).

## Things to know

### "Plot not found" can mean two different things

1. **Khasra doesn't exist in this village** — typo in the receipt, fractional plot like `176/1` requires the slash, etc.
2. **The village isn't digitised yet.** UP marks villages with `hasData: true` even when the GIS layer is empty. The backend detects this (extent comes back as `0,0,0,0`) and returns a clear error.

The Bhu-Sarvekshan resurvey is ongoing through July 2026; coverage is improving weekly.

### Cache behaviour

- District list — 7 days
- Tehsils — 7 days per district
- Villages — 7 days per tehsil
- Plots — forever (delete `backend/data/up_cache.sqlite` to refresh)

For ad-hoc cache invalidation: `rm backend/data/up_cache.sqlite` and restart the backend.

### Searchable dropdowns

UP has up to ~800 villages per tehsil; a plain `<select>` is unusable. The dropdowns are typeaheads — start typing the village name (Hindi or its first few letters) to filter.

## Production deploy (sketch)

- **Frontend** → Vercel (auto-detects Next.js, free tier)
- **Backend** → Railway, Render, or Fly.io free tier
- Set `NEXT_PUBLIC_API_BASE` on the frontend to your deployed backend URL
- Set `CORS_ORIGIN` on the backend to your deployed frontend URL
- Restrict the Google Maps API key to your production domain (see top of README)

## Troubleshooting

**"EMFILE: too many open files" warnings during `next dev`**  
Cosmetic noise from macOS file watchers. Page still loads.

**Backend says "CORS: origin ... not allowed"**  
Update `CORS_ORIGIN` in `backend/.env` to include your frontend's actual port.

**"Could not load Google Maps. Check your API key restrictions."**  
Either the key is missing/wrong in `frontend/.env.local`, or the HTTP referrer restriction in Google Cloud Console doesn't include your current origin.

**Plot lookup returns 502 "Upstream call failed"**  
Means `upbhunaksha.gov.in` itself is down or rate-limiting. Try again in a minute.

## Architecture decisions worth knowing

- **Why a backend at all** when CORS is open on UP? To cache (faster + reduces upstream load), to hide the form-encoding quirks, and to do the UTM→WGS84 conversion server-side so the frontend bundle stays small.
- **Why SQLite, not Postgres?** Single-user, single-file, zero ops. Swap for Postgres later if multi-user.
- **Why JavaScript, not TypeScript?** As requested. The structure is type-discoverable; you can `tsc --init && rename` if you change your mind.
- **Why no auth?** Receipt lookup is read-only with no PII concerns. Add Clerk/NextAuth later if you want a "My Plots" feature.
