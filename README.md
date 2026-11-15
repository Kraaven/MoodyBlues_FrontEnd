# MoodyBlues Dashboard

The web dashboard for MoodyBlues: projects (with the connection string for the Unity client), scenes and
their versions, and a 3D player for recorded play sessions with a timeline, logs and an object
inspector. One persistent 3D stage sits behind the whole app; the pages direct it.

- **[DESIGN.md](DESIGN.md)**: how it looks and behaves. The rule for every screen.
- **[DOCUMENTATION.md](DOCUMENTATION.md)**: how it works and how it connects to the backend and
  the Unity client.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
```

Set `VITE_API_BASE_URL` (see `.env.example`) if the backend is not at `http://localhost:8765`.

```bash
npm test        # Vitest
npm run lint    # oxlint
npm run build   # strict type-check + production build to dist/
npm run mock    # mock backend on :8765 to develop without the real one (any email/password)
```

Add `?debug` to any URL for the developer panel (`?debug=0` turns it off).

Deploy as a static site (e.g. Vercel). Set `VITE_API_BASE_URL` before building, add the
deployed origin to the backend's `MOODYBLUES_CORS_ORIGIN`, and make sure the API origin in
`vercel.json`'s Content-Security-Policy matches. Prefer a subdomain of the API's site: sign-in uses
cookies, which Safari blocks across sites (DOCUMENTATION.md Section 1).
