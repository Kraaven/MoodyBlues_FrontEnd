# MoodyBlues Dashboard

The web dashboard for MoodyBlues: projects (with the connection string for the Unity client),
scenes and their versions, and a 3D studio for recorded play sessions with a timeline, logs and an
object inspector. One persistent 3D stage sits behind the whole app; the pages direct it.

[DOCUMENTATION.md](DOCUMENTATION.md) explains how it works and how it connects to the backend and
the Unity client.

## Quick start

Node 20 or newer.

```bash
npm install
npm run dev     # http://localhost:5173
```

The backend is expected at `http://localhost:8765`. Set `VITE_API_BASE_URL` (see `.env.example`)
if it is somewhere else; Vite bakes the value in at build time. The backend must list the
dashboard's origin in `MOODYBLUES_CORS_ORIGIN` (`http://localhost:5173` is the backend's default).

```bash
npm test        # Vitest (src/**/*.test.ts)
npm run lint    # oxlint
npm run build   # strict type-check (tsc -b) + production build to dist/
npm run preview # serve dist/
```

Add `?debug` to any URL for the developer panel (`?debug=0` turns it off). `?stage=off` shows the
no-WebGL fallback, and `?motion=reduce` forces reduced motion.

## Deploying

A static site (Vercel, or any static host). Set `VITE_API_BASE_URL` before building, add the
deployed origin to the backend's `MOODYBLUES_CORS_ORIGIN`, and make sure the API origin in
`vercel.json`'s Content-Security-Policy matches. Prefer a subdomain of the API's site: sign-in
uses cookies, which Safari blocks across sites (DOCUMENTATION.md Section 1).
