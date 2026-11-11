# MoodyBlues Dashboard and Replay Viewer

The frontend is where a team watches what was recorded. People sign in, create projects (each
with the connection string that goes into the Unity project's settings), manage scenes and their versions,
and play recorded sessions back in 3D with a timeline, logs and an object inspector. It is a
React 19 + Vite + TypeScript single-page app; 3D is three.js through React Three Fiber.

`DESIGN.md` is the rule for how everything looks and behaves. Companion documents:
`MoodyBlues_Backend/README.md` (where the data comes from) and `MoodyBlues_Unity/DOCUMENTATION.md`
(how it is recorded).

---

## 1. Where it sits

```
 Unity game ──(handshake, scene GLB, binary events)──▶ Backend ──(REST + cookies)──▶ this app
                                                          │
                     compiles each session into a replay file (curves, events and logs)
```

The frontend only talks to the backend, over HTTPS. It never sees the Unity wire protocol. It sees
two artifacts the backend derives from it:

1. **The scene GLB** of one scene version:
   `GET /api/scenes/{developerId}/{sceneId}/file?hash={hash}`. Draco geometry and KTX2 textures
   once the backend has optimized it; the decoders are self-hosted under `public/decoders/`. Each
   tracked node carries `extras.objectId` (three.js puts it in `userData.objectId`), and
   `extras.isHidden` for objects that were inactive at startup.
2. **The replay file**: `GET /api/sessions/{id}/replay`, gzip-encoded on the wire. Its layout is
   defined in the backend's `Compiler/ReplayFileWriter.cs` and parsed by
   `src/viewer/replay/replayFile.ts` (format 2 only).

**One rule matters above all:** the replay file's transforms are already in **glTF space**, the
same space as the GLB's nodes, so the viewer applies them unchanged. If replays ever look
mirrored, the conversion belongs in the backend, not here.

**Sign-in** (`src/api/client.ts`, `src/auth/AuthContext.tsx`). The backend keeps the session in two
httpOnly cookies (a 15-minute access cookie and a refresh cookie scoped to `/auth`; backend README
"Dashboard sign-in"). Script cannot read them, and nothing is kept in `localStorage`.

- Every request is sent with `credentials: 'include'` and the header `X-MoodyBlues-Client:
  dashboard`, which the backend requires on every state-changing request as its CSRF check.
- On load, `GET /auth/me` tells whether a session exists (after one refresh if the access cookie
  has lapsed).
- A 401 on any other request triggers one `POST /auth/refresh`, shared by every request that
  failed at the same moment (the backend rotates the refresh token on each use, so parallel
  refreshes would sign the user out), then retries once. If the refresh fails, the user is signed
  out with "Your session expired".
- Sign out calls `POST /auth/logout`, which revokes the refresh token and clears both cookies.
- **Hosting.** When the dashboard is on a different site from the API (a `*.vercel.app` address and
  your own domain, say), the cookies are third-party cookies, which Safari blocks. Host the
  dashboard on a subdomain of the API's site, and set the backend's
  `MOODYBLUES_COOKIE_SAMESITE=Lax`.

## 2. Pages

| Route | Page |
|---|---|
| `/login`, `/register` | Sign in, create account |
| `/projects` | Projects, with their creation date; a project without a key is flagged |
| `/projects/:projectId` | A project's scenes, its connection string (copy, Rotate), and the Unity setup steps |
| `/projects/:projectId/scenes/:sceneId` | Scene: header with a live 3D preview, **Sessions** tab |
| `.../archive`, `.../settings` | Scene: older versions with their sessions; name, GUID, storage, delete |
| `.../inspect?version=N` | Scene inspector: hierarchy, materials, textures, geometries, stats, raw glTF of one version |
| `.../sessions/:sessionId?t=42.5` | Session player, optionally starting at a time |

Old routes (`/dashboard`, `.../view`) redirect. The player and the inspector are separate bundles,
and the Stage (below) loads in its own chunk after the first paint, so the list pages download
three.js only when something draws.

### The Stage (`src/stage/`)

There is **one WebGL canvas for the whole app**, fixed behind the page (`StageHost`). It is created the
first time a view wants to draw (a phone on the sign-in or list pages never creates it) and is never
unmounted. A view directs it with `useStageView({ id, content, scene, pose, control, dim })`:

- `content` is `trace` (the abstract "recording" figure used on auth and empty states), `scene`
  (a scene version, with idle orbit), `replay` (the player) or `inspect` (the inspector).
- The store (`stage/store.ts`) holds the view, camera pose, loading progress, scene state and stats.
  `CameraRig` flies the camera between poses; `transition.ts` is the shared clock.
- The canvas takes no pointer events. A view places a `StageSurface` element where the 3D should
  respond; orbit and picking listen on it. `useStageRegion` / `useStageInset` shift the camera's view
  offset so the 3D is centred in the part of the window the panels leave free.
- Scene GLBs go through `sceneAssets.ts`: one cache, reference-counted, keeping the two most recent idle
  scenes. The replay animates a clone; the inspector shows the cached master read-only. Moving from the
  scene page to a session therefore costs no second download and keeps the camera (`framedKey`).
- Without WebGL, or after a lost context, the app shows a gradient and `StageNotice` in the tool
  views; lists and panels keep working. `?stage=off` forces this, `?motion=reduce` forces reduced
  motion.
- Scene thumbnails (`snapshots.ts`, `snapshotCapture.ts`) are rendered offscreen once per scene
  version and kept in the browser's IndexedDB keyed by the version's hash. The backend stores none, so a
  scene nobody has opened on this machine shows a placeholder.
- Session activity glyphs (`src/pages/scene/glyphs.ts`, `viewer/replay/glyphTimeline.ts`): the list shows a
  summary glyph from the session record; a true timeline glyph is computed from the replay once it has
  been read in this browser (or by "Index sessions") and cached in IndexedDB.

`?debug` turns on the Debug panel (frame times, renderer memory, replay clock, scene and query
caches, wireframe/axes/bounds/show-inactive/fog toggles). It is remembered; `?debug=0` turns it off.
Its code is a separate chunk and is never requested while it is off.

Lists refresh themselves: every 5 s while something can change (a session recording, building or
waiting, a version optimizing), every 30 s otherwise, and never in a hidden tab. A 401 that a
refresh cannot fix signs the user out with "Your session expired".

**Connection string** (`src/pages/Connection.tsx`). Unity needs one value per project, pasted once
into *MoodyBlues > Settings*: `https://mbk_<key>@<server>`. The project page always shows it, masked
(`https://mbk_Q7xZ2a…@moodyblues.kraaven.net`), with a button that copies it in full; the setup
steps repeat it. **Rotate** (a destructive confirm, since every build with the old key is locked
out) replaces the key, and the page shows the new string. A project with no key shows a warning
and **Create**; one whose key predates stored keys says to rotate.

Deletes show what goes before and after: a session needs a plain confirm; an archived version, the
whole archive and the scene need the scene name typed. The toast afterwards reports the backend's
counts.

## 3. How a replay plays (`src/viewer/replay/`, `src/player/`)

### `replayFile.ts`: parsing

Reads the header, object table, event table, log table and time blocks. Every offset and count is
checked against the file size, so a damaged file fails with a `ReplayFormatError` that says so.
Blocks repeat the previous key of each live track as a "lead-in"; this parser loads the whole file,
drops lead-ins and joins the blocks into one continuous track per object and property.

### `replayTracks.ts`: curves to three.js tracks

Each Hermite segment is converted exactly into a cubic Bezier with control points one third of the
way along the interval, and fed to three.js's `InterpolateBezier` mode. Rotations use a small
`BezierInterpolant` subclass that normalizes its result, which is how the backend measured the
fitting error. Times become float32, nudged to stay strictly increasing in long sessions. Two parts
lean on three.js internals (the `settings` field on tracks, and overriding `createInterpolant`):
pin `three` and re-run a replay after upgrading it.

### `ReplayPlayer.ts`: playback

- **One `AnimationMixer`, one clip per recorded object.** Time is absolute: playback and scrubbing
  both end in `mixer.setTime(t)`.
- **Spawns** (kind 1) are clones of their template node, created when the playhead enters their
  lifetime and returned to a per-template pool when it leaves.
- **Spawned parts** (kind 2, protocol v3) are the clone's copies of the template's descendants. The
  player walks template and clone in parallel to find each part's node, binds its clip there, and
  restores the template pose when the clone goes back to the pool.
- **Skinned meshes.** Bones are ordinary recorded objects (scene objects, or parts of a spawn), so
  their tracks drive the skeleton. Templates with skinned meshes are cloned with
  `SkeletonUtils.clone`, which binds each clone to its own bones (a plain `clone()` would leave it
  on the template's skeleton) and keeps the hierarchy, so the parallel walk still works. If a
  skeleton reaches outside its template, the plain clone is used. Skinned meshes have
  `frustumCulled = false`, because their bounding sphere is computed once and the animated mesh
  leaves it.
- **Reparenting**: each frame, objects with Reparent events are moved under the parent they have at
  time `t` (`add()`, because tracks hold local transforms).
- **Visibility**: scene objects start as the GLB says, spawns start visible, parts as their template
  node is; Show and Hide set the object's own flag, deletes hide for good.

### The player UI

`Playback` (`src/player/playback.ts`) is the clock, outside React: the viewport advances it each
frame, and the playhead, time readout and live transforms subscribe to it and write to the DOM
directly. React re-renders on user actions and, for the current log row, about 8 times a second.

- **Viewport**: the root Stage (gradient sky, distance fog that follows the camera, fading grid,
  selection outline via `@react-three/postprocessing`, only while something is selected), frame all /
  frame selected, follow camera.
- **Panels** (`src/panels/`): Logs, Objects, Details and Raw data are docked tabs, floating windows or a
  collapsed rail. The layout is remembered per view kind in `localStorage` (`moodyblues.panels.v1`);
  the pure layout logic is in `panelLayout.ts`. On a phone the dock stacks above the timeline.
- **Timeline**: transport, speeds 0.25-4×, previous/next log, the rail with log markers (line =
  info, dot = warning, cross = error, in the log's Unity colour; clustered when closer than 3 px),
  disconnected spans, data gaps, and a spawn/delete activity strip.
- **Panels' content**: Logs (filters, search, virtualized, follows the playhead while playing), Objects
  (the hierarchy at the current time, selection, live local and world transform, jump to spawn or
  delete), Details (recording health, session facts, rebuild, download, delete), Raw data (the selected
  object at this moment, or the session record, as collapsible JSON).
- **Keyboard**: `src/player/shortcuts.tsx`, the list in DESIGN.md Section 12; `?` shows it.

### The scene inspector (`src/inspector/`)

Same layout as the player without a timeline. `InspectContent` puts the cached scene on the Stage and
takes clicks; `inspection.ts` reads it (counts, materials with every texture channel, de-duplicated
textures with estimated GPU memory, geometries and their sharing meshes, vertex statistics).
Panels: Hierarchy, Materials, Textures, Geometries, Stats (including draw calls and the "meshes left
out of this export" notice) and Raw (the selection, or the file's glTF JSON). Texture previews are drawn
from the decoded image; textures the browser cannot draw (KTX2) are rendered through the Stage's
renderer (`?thumbnails=gpu` forces that path). The approach to materials, textures, geometry and
statistics is adapted from OHZI's glb-viewer-core (MIT) and re-implemented here; it is not a dependency.

## 4. Code layout

```
src/
  api/          client.ts (fetch with cookies, CSRF header, refresh and retry on 401), types.ts (contracts), queries.ts (TanStack Query hooks, polling, mutations)
  auth/         AuthProvider, ProtectedRoute
  ui/           the component kit on Radix (Button, Dialog, ConfirmDialog, Menu, Tabs, Toast, Chip, ...)
  stage/        the root canvas: store, StageHost, CameraRig, Trace, scene cache, snapshots, Chrome (top line)
  panels/       dock / floating / rail panel system, JsonView
  shell/        ViewShell (page frame for list views)
  pages/        auth, projects, project, scene/ (header, tabs, session reel and glyphs)
  player/       session player: playback clock, replay content, timeline, panels, shortcuts
  inspector/    scene inspector: page, Stage content, inspection, panels/
  debug/        the ?debug panel and its scene effects (lazy)
  viewer/       core/ (gltf, palette, atmosphere, outline; imports nothing from the app), replay/ (parser, tracks, player, glyph timeline)
  styles/       tokens.css (DESIGN.md Section 5)
dev/            mock backend (dev/mock), Playwright check scripts (dev/*-shots.mjs); outputs in dev/out (git-ignored)
public/decoders/  self-hosted Draco and Basis decoders, copied from three's examples/jsm/libs
design/brand/     the logo options; B ("Night play") was chosen
```

## 5. Running it

Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173, talks to VITE_API_BASE_URL (default http://localhost:8765)
npm test           # Vitest: replay parser and log navigation
npm run lint       # oxlint
npm run build      # type-check (strict) + production build
npm run mock       # a mock backend on :8765 (any email and password work), with a fixture scene and replay
npm run shots      # screenshots of every page into dev/out/<set>
```

The check scripts (`dev/auth-flow.mjs`, `browse-shots.mjs`, `player-shots.mjs`, `glyph-shots.mjs`,
`inspector-shots.mjs`, `phase7-checks.mjs`) need the mock, `npm run dev`, and `CHROME` set to a
Chromium executable. They use software WebGL, so they cannot measure GPU frame times.

Deploying (Vercel or any static host): set `VITE_API_BASE_URL` before building, since Vite bakes it
in. Add the deployed origin to the backend's `MOODYBLUES_CORS_ORIGIN`. `vercel.json` rewrites all
routes to `index.html` and sets the security headers. Its Content-Security-Policy names the API
origin in `connect-src` (`https://moodyblues.kraaven.net`); **change it there if the API moves**, or
every request is blocked. The policy allows `'wasm-unsafe-eval'` and `blob:` workers for the Draco
and Basis decoders, and `blob:` fetches for GLB textures. Another static host needs the same
headers. After upgrading `three`, re-copy the decoders from
`node_modules/three/examples/jsm/libs/{draco/gltf,basis}/` into `public/decoders/`.

## 6. Known limits

- **Whole-file loading.** The replay is downloaded and parsed in full before playback. The block
  layout allows streaming later without a format change.
- **No instancing.** Spawned objects are full clones, so very spawn-heavy sessions cost what they
  would cost in the game.
- **Skinned meshes** whose bones were stripped in Unity (*Optimize Game Objects*) replay in bind
  pose; the Unity client's *Validate Scenes* warns about them.
- **Log counts** in the session list are filled when a session compiles; sessions compiled before
  that show none until rebuilt.
- **Frontend-only consequences.** Scene thumbnails and true timeline glyphs live in each browser's
  IndexedDB, not on the server. The lobby's "recent activity" is bounded to 13 requests (the four newest
  projects, each with its most recently updated scene).
- **Not measured.** Frame times on a real GPU, KTX2 textures from a real optimized scene, and screen-reader
  behaviour were not verified; the automated checks run on software WebGL.
