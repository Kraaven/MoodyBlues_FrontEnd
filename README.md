# Moody Blues Dashboard

React + Vite + TypeScript frontend for the MoodyBlues backend
([`MoodyBlues_Backend`](../MoodyBlues_Backend)). Lets you:

- Create an account and sign in (JWT-based).
- Create **Projects**, each with a generated **Developer ID** -- paste that ID into your Unity
  client's config, and scenes it uploads via the existing `/handshake` + `/scenes/{sceneId}` flow
  will show up under that project.
- Rename scenes for the dashboard only (the underlying `sceneId` Unity/the wire protocol use is
  never changed).
- View any uploaded scene in a full-featured, self-built GLB viewer (React Three Fiber) with scene
  hierarchy, material/texture inspection, geometry stats, animation playback, and skeleton
  visualization -- inspired by [glb-viewer-web](https://github.com/ohzinteractive/glb-viewer-web).

## Requirements

- [Node.js](https://nodejs.org/) 20+ and npm.
- The backend running locally (see `../MoodyBlues_Backend/README.md`) -- by default at
  `http://localhost:8765`.

## Running locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Configure the backend's CORS to allow this origin (it does by
default -- `MOODYBLUES_CORS_ORIGIN` defaults to `http://localhost:5173`).

Copy `.env.example` to `.env` if you need to point at a different backend URL:

```
VITE_API_BASE_URL=http://localhost:8765
```

## Build

```bash
npm run build   # type-checks then builds to dist/
npm run preview # serve the production build locally
```

## Deploying to Vercel

This is a static Vite SPA, so Vercel's defaults (build command `npm run build`, output directory
`dist`) work out of the box. `vercel.json` adds the rewrite Vercel needs so client-side routes like
`/projects/abc123` don't 404 on refresh.

1. In the Vercel project's settings, set the environment variable `VITE_API_BASE_URL` to the
   backend's public URL (e.g. `https://moodyblues.kraaven.net`) -- Vite bakes it in at build time,
   so it must be set *before* each deploy, not just in a local `.env`.
2. On the backend, add this Vercel deployment's origin(s) to `MOODYBLUES_CORS_ORIGIN` (comma-separated
   if you also want to keep allowing local dev -- see `../MoodyBlues_Backend/README.md`). Note that
   Vercel preview deployments get their own throwaway subdomain each time, so only your production
   domain (and whatever you're actively testing) needs to be listed.

## Project layout

```
src/
  lib/
    api.ts, types.ts          Fetch wrapper (adds Authorization header) + shared API types
  auth/
    AuthContext.tsx, useAuth.ts, ProtectedRoute.tsx   Token storage, /auth/me bootstrap, route guard
  components/
    Navbar.tsx, Modal.tsx, CopyableId.tsx, SceneRow.tsx
  pages/
    LoginPage.tsx, RegisterPage.tsx
    DashboardPage.tsx           Project list + create
    ProjectPage.tsx              Scene list, rename, links to the viewer
    ViewerPage.tsx                Full-screen GLB viewer shell
  viewer/
    ViewerCanvas.tsx              R3F <Canvas>, lighting, grid, orbit controls
    SceneLoader.tsx                Fetches the .glb (authenticated) and parses it
    loadScene.ts                    GLTFLoader wired to self-hosted Draco/KTX2 decoders
    ModelRoot.tsx                    Mounts the model, drives animation mixer, wireframe/skeleton/selection
    gltfInspection.ts                Walks the loaded scene to collect materials/textures/meshes
    viewerStore.ts                   zustand store shared between the canvas and the side panels
    ViewerSidebar.tsx                 Tab shell for the panels below
    panels/
      HierarchyPanel.tsx             Searchable scene-graph tree, click to select/highlight
      MaterialsPanel.tsx              Per-material properties (color, metalness/roughness, maps)
      TexturesPanel.tsx                Texture thumbnails + format/size metadata
      GeometryPanel.tsx                Per-mesh vertex/index counts, attributes, bounding box
      AnimationsPanel.tsx              Clip list, play/pause, scrub
      SettingsPanel.tsx                 Wireframe/skeleton/grid toggles, model stats
public/decoders/
  draco/, basis/                Self-hosted Draco (geometry) and KTX2/Basis Universal (texture)
                                  decoder files, copied from the installed `three` package
                                  (see package.json's `postinstall` note below if you upgrade three)
```

## Notes

- Auth is a JWT bearer token stored in `localStorage`; the API client (`src/lib/api.ts`) attaches
  it as `Authorization: Bearer <token>` on every request.
- The GLB viewer is a from-scratch rebuild (not a vendored copy of glb-viewer-web's build), using
  React Three Fiber/drei and the same Draco/KTX2 decoder files three.js ships, self-hosted under
  `public/decoders/`. If you upgrade the `three` package, re-copy those decoder files from
  `node_modules/three/examples/jsm/libs/{draco/gltf,basis}/` into `public/decoders/{draco,basis}/`.
