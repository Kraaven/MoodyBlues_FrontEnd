# MoodyBlues Dashboard and Replay Viewer

The frontend is where a team watches what was recorded. People sign in, create projects (each
with the connection string that goes into the Unity project's settings), manage scenes and their
versions, and play recorded sessions back in 3D with a timeline, logs and an object inspector. It
is a React 19 + Vite + TypeScript single-page app; 3D is three.js through React Three Fiber.

Companion documents: `MoodyBlues_Backend/README.md` (where the data comes from) and
`MoodyBlues_Unity/DOCUMENTATION.md` (how it is recorded). If this file and the code disagree, the
code is right.

---

## 1. Where it sits

```
 Unity game --(handshake, scene GLB, binary events)--> Backend --(REST + cookies)--> this app
                                                          |
                     compiles each session into a replay file (curves, events and logs)
```

The frontend only talks to the backend, over HTTPS. It never sees the Unity wire protocol. It
sees three things the backend derives from it:

1. **The scene GLB** of one scene version:
   `GET /api/projects/{projectId}/scenes/{sceneId}/file?hash={hash}`. Draco geometry and KTX2
   textures once the backend has optimized it; the decoders are self-hosted under
   `public/decoders/`. Each tracked node carries `extras.objectId` (three.js puts it in
   `userData.objectId`), and `extras.isHidden` for objects that were inactive at startup.
2. **The replay file**: `GET /api/sessions/{sessionId}/replay`, gzip-encoded on the wire. Its
   layout is defined in the backend's `Compiler/ReplayFileWriter.cs` and parsed by
   `src/viewer/replay/replayFile.ts` (format 2 only).
3. **Session records**, as JSON (`src/api/types.ts` mirrors them). Each carries `activity`, the
   session's glyph, computed by the backend when it compiles the replay (Section 2, "Session
   glyphs").

**One rule matters above all:** the replay file's transforms are already in **glTF space**, the
same space as the GLB's nodes, so the viewer applies them unchanged. If replays ever look
mirrored, the conversion belongs in the backend, not here.

**Sign-in** (`src/api/client.ts`, `src/auth/AuthContext.tsx`). The backend keeps the session in
two httpOnly cookies (a 15-minute access cookie and a refresh cookie scoped to `/auth`; backend
README "Dashboard sign-in"). Script cannot read them, and nothing about the session is kept in
`localStorage`.

- Every request is sent with `credentials: 'include'` and the header `X-MoodyBlues-Client:
  dashboard`, which the backend requires on every state-changing request as its CSRF check.
- On load, `GET /auth/me` tells whether a session exists (after one refresh if the access cookie
  has lapsed). It returns `{ userId, email }`, as do sign-in, registration and refresh.
- A 401 on any other request triggers one `POST /auth/refresh`, shared by every request that
  failed at the same moment (the backend rotates the refresh token on each use, so parallel
  refreshes would sign the user out), then retries once. If the refresh fails, the user is signed
  out with "Your session expired".
- **Returning after sign-in.** `ProtectedRoute` sends a signed-out visitor to `/login` with the
  page they wanted in the route state, and sign-in returns them there. `safeRedirect`
  (`src/auth/redirect.ts`) accepts only same-origin relative paths (not `//...` or with a
  backslash) and falls back to `/projects`.
- Sign out calls `POST /auth/logout`, which revokes the refresh token and clears both cookies.
- **Hosting.** When the dashboard is on a different site from the API (a `*.vercel.app` address
  and your own domain, say), the cookies are third-party cookies, which Safari blocks. Host the
  dashboard on a subdomain of the API's site, and set the backend's
  `MOODYBLUES_COOKIE_SAMESITE=Lax`.

Everything is keyed by the project's ID (a GUID): scene and session routes are
`/api/projects/{projectId}/scenes/{sceneId}/...` and `/api/sessions/{sessionId}/...`
(`src/api/queries.ts`; the full list is in the backend README).

## 2. Pages

The routes are those in `src/App.tsx`. Everything except sign-in and registration is behind
`ProtectedRoute`, which sends a signed-out visitor to `/login` and back afterwards. Any other URL
redirects to `/projects`.

| Route | Page |
|---|---|
| `/login`, `/register` | Sign in, create account (`pages/auth/AuthPage.tsx`) |
| `/projects` | The lobby: projects, with anything recording or broken above them (`LobbyPage`) |
| `/projects/new` | Create a project (`NewProjectPage`) |
| `/projects/:projectId` | A project's scenes; **Unity connection** opens the connection string dialog, and an empty project shows the setup steps. `?connect=1` opens the dialog on arrival (`ProjectPage`) |
| `/projects/:projectId/scenes/:sceneId` | Scene: title, a version picker (`?version=N`, default the current one), its recordings with their glyphs, recordings waiting for a scene version, and a menu for rename, download, copy GUID, **Manage versions** and delete (`pages/scene/ScenePage.tsx`) |
| `/projects/:projectId/scenes/:sceneId/view` | The 3D studio on a scene version, for inspecting it; `?version=N` picks an older one (`studio/StudioPage.tsx`) |
| `/projects/:projectId/scenes/:sceneId/sessions/:sessionId` | The same studio with a session playing; `?t=42.5` starts at a time |

The studio is a separate bundle, and the Stage (below) loads in its own chunk after the first
paint, so the list pages download three.js only when something draws.

### The Stage (`src/stage/`)

There is **one WebGL canvas for the whole app**, fixed behind the page (`StageHost`). It is
created the first time a view wants to draw (a phone on the sign-in or list pages never creates
it) and is never unmounted. A view directs it with `useStageView(view)`, where a `StageView` is
`{ id, content, pose, drift, dim, durationMs, scene, control, idleOrbit, zoom }`
(`stage/store.ts`):

- `content` is one of:
  - `none`: draws nothing. List pages use `idleView(id)`, which is this with the stage dimmed out;
  - `demo`: the abstract scene behind sign-in (`DemoScene`);
  - `scene`: a scene version, optionally with idle orbit (the preview under a waiting session);
  - `studio`: a scene version with the tool windows over it. With a session open it plays the
    replay (`studio/StudioContent.tsx`); without one it is the read-only inspector.
- The store (`stage/store.ts`) holds the view, camera pose, loading progress, scene state and
  stats. `CameraRig` flies the camera between poses; `transition.ts` is the shared clock.
- The canvas takes no pointer events. A view places a `StageSurface` element where the 3D should
  respond; orbit and picking listen on it. `useStageRegion` / `useStageInset` shift the camera's
  view offset so the 3D is centred in the part of the window the panels leave free.
- Scene GLBs go through `sceneAssets.ts`: one cache keyed by project, scene and hash,
  reference-counted, keeping the two most recent idle scenes. The replay animates a clone; the
  inspector shows the cached master read-only. Moving from the scene page to a session therefore
  costs no second download and keeps the camera (`framedKey`).
- Without WebGL, or after a lost context, the app shows a gradient and `StageNotice` in the
  studio; lists and panels keep working. `?stage=off` forces this, `?motion=reduce` forces reduced
  motion.
- **Scene thumbnails** (`snapshots.ts`, `snapshotCapture.ts`, `ui/SnapshotImage.tsx`) are rendered
  offscreen once per scene version and kept in the browser's IndexedDB (database
  `moodyblues-snapshots`) keyed by the version's hash. The backend stores none, so a scene nobody
  has opened on this machine shows a placeholder.
- **Session glyphs** (`ui/ActivityGlyph.tsx`) come from the backend: each session summary and
  detail has `activity`, null until the session is Ready, with `bins` (48 numbers, keyframe
  activity over time) and the positions, as fractions of the session, of `errors`, `warnings`,
  `spawns` and `gaps` (backend README, "activity"). The glyph only draws it. A session without
  `activity` shows its state instead (recording, waiting for its scene, failed, building). Nothing
  is computed in the browser or cached there.

`?debug` turns on the Debug panel (frame times, renderer memory, replay clock, scene and query
caches, wireframe/axes/bounds/show-inactive/fog toggles). It is remembered in `localStorage`;
`?debug=0` turns it off. Its code is a separate chunk and is never requested while it is off.

Lists refresh themselves: every 5 s while something can change (a session recording, building or
waiting, a version optimizing), every 30 s otherwise (a project page every 15 s), and never in a
hidden tab. A 401 that a refresh cannot fix signs the user out with "Your session expired". The
lobby's "recent activity" is bounded to 13 requests (the four newest projects, each with its most
recently updated scene; `pages/useRecentActivity.ts`).

**Connection string** (`src/shell/ConnectionDialog.tsx`). Unity needs one value per project,
pasted once into *MoodyBlues > Settings*: `https://mbk_<key>@<server>`. The dialog shows it masked
(`https://mbk_Q7xZ2a...@moodyblues.kraaven.net`), with a button that copies it in full, and the
setup steps (`shell/SetupGuide.tsx`) one click away. **Rotate** (a destructive confirm, since
every build with the old key is locked out) replaces the key, and the dialog shows the new
string. Every project has a key; the backend returns `connectionString: null` only when it can no
longer decrypt the stored key (its JWT secret changed), and then the dialog says to rotate.

Deletes show what goes before and after: a session needs a plain confirm; an archived version,
the whole archive and the scene need the scene name typed. The toast afterwards reports the
backend's counts (`{ deletedVersions, deletedSessions, freedBytes }`).

## 3. How a replay plays (`src/viewer/replay/`, `src/studio/`)

### `replayFile.ts`: parsing

Reads the header, object table, event table, log table and time blocks. Every offset and count is
checked against the file size, so a damaged file fails with a `ReplayFormatError` that says so.
Blocks repeat the previous key of each live track as a "lead-in"; this parser loads the whole
file, drops lead-ins and joins the blocks into one continuous track per object and property.

### `replayTracks.ts`: curves to three.js tracks

Each Hermite segment is converted exactly into a cubic Bezier with control points one third of
the way along the interval, and fed to three.js's `InterpolateBezier` mode. Rotations use a small
`BezierInterpolant` subclass that normalizes its result, which is how the backend measured the
fitting error. Times become float32, nudged to stay strictly increasing in long sessions. Two
parts lean on three.js internals (the `settings` field on tracks, and overriding
`createInterpolant`): pin `three` and re-run a replay after upgrading it.

### `ReplayPlayer.ts`: playback

- **One `AnimationMixer`, one clip per recorded object.** Time is absolute: playback and
  scrubbing both end in `mixer.setTime(t)`.
- **Spawns** (kind 1) are clones of their template node, created when the playhead enters their
  lifetime and returned to a per-template pool when it leaves.
- **Spawned parts** (kind 2, protocol v3) are the clone's copies of the template's descendants.
  The player walks template and clone in parallel to find each part's node, binds its clip there,
  and restores the template pose when the clone goes back to the pool.
- **Skinned meshes.** Bones are ordinary recorded objects (scene objects, or parts of a spawn),
  so their tracks drive the skeleton. Templates with skinned meshes are cloned with
  `SkeletonUtils.clone`, which binds each clone to its own bones (a plain `clone()` would leave it
  on the template's skeleton) and keeps the hierarchy, so the parallel walk still works. If a
  skeleton reaches outside its template, the plain clone is used. Skinned meshes have
  `frustumCulled = false`, because their bounding sphere is computed once and the animated mesh
  leaves it.
- **Reparenting**: each frame, objects with Reparent events are moved under the parent they have
  at time `t` (`add()`, because tracks hold local transforms).
- **Visibility**: scene objects start as the GLB says, spawns start visible, parts as their
  template node is; Show and Hide set the object's own flag, deletes hide for good.

### The studio UI (`src/studio/`)

`StudioPage` is both the scene inspector and the session player, so moving between them is a
camera move over the same loaded scene, never a reload.

`Playback` (`studio/playback.ts`) is the clock, outside React: the viewport advances it each
frame, and the playhead, time readout and live transforms subscribe to it and write to the DOM
directly. React re-renders on user actions and, for the current log row, about 8 times a second.
`studio/binding.ts` hands the parsed replay and the clock from the page to the Stage's content;
`studio/studioStore.ts` holds the selection and the view settings.

- **Viewport**: the root Stage (gradient sky, distance fog that follows the camera, fading grid,
  selection outline via `@react-three/postprocessing`, only while something is selected), frame
  all / frame selected, follow camera.
- **Windows** (`src/studio/windows/`): each tool is a window that is closed, floating over the 3D
  view, or a tab in the dock at the right edge; the rail of icons opens them (Alt+1 to Alt+9, and
  Alt+0 for the tenth). On a phone each opens as a sheet from the bottom. Where each floating
  window sits is remembered per kind of view (`scene`, `session` or `share`) in `localStorage`
  (`moodyblues.windows.v3`). A remembered place is a `WindowRect { anchor, offset, y, w, h }`
  (`windowLayout.ts`): horizontally the window is anchored to the nearer edge, `offset` being the
  gap to that edge, and `toFrame` / `fromFrame` convert to and from pixels. A right-anchored
  window therefore follows the rail when the dock opens. The layout rules are pure functions, with
  tests. The view settings (grid, shadows,
  wireframe, axes, field of view) are kept under `moodyblues.view.v1`.

  | Window | Content |
  |---|---|
  | Recordings | The sessions of the version on screen; choosing one plays it on this scene |
  | Logs (`LogsWindow.tsx`) | The session's logs only, in time order, each in its own Unity colour; All / Info / Warnings / Errors filters, search, virtualized, follows the playhead; every row is a seek. Only with a session |
  | Session details | Recording health (the client's counters, including rotation widenings), session facts, rebuild, download, delete. Only with a session |
  | Hierarchy | The scene's tree, searchable; during a replay the recorded objects as they are now |
  | Inspector | The selected object: name, ObjectID, live local and world transform, Unity path |
  | Materials, Textures, Geometry | Read from the loaded GLB by `inspector/inspection.ts`: materials with every texture channel, de-duplicated textures with estimated GPU memory, geometries and what shares them, vertex statistics |
  | View settings | How the scene is drawn here; display only |
  | Raw data | The selection, the session record from the server, or the file's glTF JSON, as collapsible JSON |

- **Timeline** (`studio/Timeline.tsx`, only with a session): transport, speeds 0.25-4x,
  previous/next log, and the rail with the Info, Warning and Error logs marked. Markers are
  binned by pixel (`studio/logMarkers.ts`, one bin per 5 px, so the DOM holds a bounded number),
  a bin is shown as its most severe log in that log's colour (`logColorHex(log.color)`), and a
  marker can be hovered for a tip and clicked to seek there.
- **Keyboard**: `studio/shortcuts.tsx` holds the table; `?` shows it. Alt+1...9 and Alt+0 match
  `e.code` (the physical key, so Option+digit works on a Mac), and shortcuts are ignored while a
  menu or dialog is open.
- **Share** (top right). With a session open it opens the ShareDialog (next section); on a bare
  scene it copies the owner-only link to that version, `<scene>/view?version=N`, which reopens the
  same version.

### Public share links (`src/share/`, `src/studio/source.ts`)

Each recording is **Private** (the default) or **Public**. The ShareDialog
(`share/ShareDialog.tsx`, opened from the studio's share button and the recordings table) has a
Public toggle, the link in a copy field, an optional "Start at mm:ss" that appends `?t=<seconds>`
to the link, and **Reset link**, which replaces the token so the old link stops working at once.
A Public badge marks public recordings in the recordings table and the Recordings window.

- `PUT /api/sessions/{id}/sharing` (`{ isPublic }`) and `POST /api/sessions/{id}/sharing/reset`
  both answer `{ isPublic, shareToken }`, which is written into the cached session detail.
- `/share/:token` is a public route (not behind `ProtectedRoute`): the same `StudioPage`, for an
  anonymous visitor, read only. It loads `GET /api/share/{token}` (session, project and scene
  names, scene version), then `/api/share/{token}/replay` and `/api/share/{token}/scene`. A
  visitor sees the logs, details, hierarchy and inspection windows, but no Recordings window, and
  can change nothing. A 401 or 404 on `/api/share/` paths is an answer, never a session expiry; an
  unknown or revoked token shows "link unavailable". `?t=` starts the replay at that time.
- `StudioSource` (`studio/source.ts`) is where the studio's data comes from: `owner` (project,
  scene and session ids, with the signed-in paths) or `share` (a token). It builds the replay path
  and the scene file reference for either. Link builders are in `lib/shareLink.ts`.

Texture previews are drawn from the decoded image; textures the browser cannot draw (KTX2) are
rendered through the Stage's renderer (`inspector/thumbnails.ts`; `?thumbnails=gpu` forces that
path). The approach to materials, textures, geometry and statistics is adapted from OHZI's
glb-viewer-core (MIT) and re-implemented here; it is not a dependency.

## 4. Code layout

```
src/
  api/          client.ts (fetch with cookies, CSRF header, refresh and retry on 401), types.ts (contracts),
                queries.ts (TanStack Query hooks, polling, mutations, scene file download)
  auth/         AuthProvider, ProtectedRoute, useAuth, redirect.ts (safeRedirect)
  share/        ShareDialog
  ui/           the component kit on Radix (Button, Dialog, Menu, Tabs, Toast, Chip, ...), ActivityGlyph, SnapshotImage
  stage/        the root canvas: store (views, content types, camera), StageHost, CameraRig, DemoScene,
                scene cache (sceneAssets, sceneSource), snapshots, StageSurface, StagePreloader
  studio/       the 3D studio: page, Stage content, playback clock, replay binding, timeline, logMarkers, source (StudioSource), shortcuts,
                logNav, unityPath, studioStore, windows/ (the tool windows and their layout)
  inspector/    inspection.ts (reads a loaded scene), thumbnails.ts
  shell/        WorkspaceLayout and TopBar (page frame), ConnectionDialog, SetupGuide
  pages/        auth/, lobby, new project, project, scene/ (page, recordings table, versions dialog)
  debug/        the ?debug panel and its scene effects (lazy)
  viewer/       core/ (gltf, palette, atmosphere, outline; imports nothing from the app, which
                boundary.test.ts checks), replay/ (parser, tracks, player)
  lib/          formatting and small hooks
  styles/       tokens.css (the design tokens)
public/decoders/  self-hosted Draco and Basis decoders, copied from three's examples/jsm/libs
design/brand/     the logo options; "Night play" was chosen
```

## 5. Running it

Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173, talks to VITE_API_BASE_URL (default http://localhost:8765)
npm test           # Vitest: replay parser, palette, Unity paths, window layout, stage transition, inspection, viewer boundary
npm run lint       # oxlint
npm run build      # type-check (strict) + production build
```

It needs the real backend (backend README, "Running locally without Docker").

Deploying (Vercel or any static host): set `VITE_API_BASE_URL` before building, since Vite bakes
it in. Add the deployed origin to the backend's `MOODYBLUES_CORS_ORIGIN`. `vercel.json` rewrites
all routes to `index.html` and sets the security headers. Its Content-Security-Policy names the
API origin in `connect-src` (`https://moodyblues.kraaven.net`); **change it there if the API
moves**, or every request is blocked. The policy allows `'wasm-unsafe-eval'` and `blob:` workers
for the Draco and Basis decoders, and `blob:` fetches for GLB textures. Another static host needs
the same headers. After upgrading `three`, re-copy the decoders from
`node_modules/three/examples/jsm/libs/{draco/gltf,basis}/` into `public/decoders/`.

## 6. Known limits

- **Whole-file loading.** The replay is downloaded and parsed in full before playback. The block
  layout allows streaming later without a format change.
- **No instancing.** Spawned objects are full clones, so very spawn-heavy sessions cost what they
  would cost in the game.
- **Skinned meshes** whose bones were stripped in Unity (*Optimize Game Objects*) replay in bind
  pose; the Unity client's *Validate Scenes* warns about them.
- **Scene thumbnails** live in each browser's IndexedDB, not on the server.
- **Not measured.** Frame times on a real GPU, KTX2 textures from a real optimized scene, and
  screen-reader behaviour were not verified.
