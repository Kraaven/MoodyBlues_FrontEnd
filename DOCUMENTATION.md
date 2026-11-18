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
2. **The replay file**: `GET /api/sessions/{sessionId}/replay`, brotli-encoded on the wire. Its
   layout is defined in the backend's `Compiler/ReplayFileWriter.cs` and parsed by
   `src/viewer/replay/replayFile.ts` (format 3 only).
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
| `/projects/:projectId/scenes/:sceneId` | Scene: title (the name given here, else the Unity name, else the GUID; long titles truncate), a version picker (`?version=N`, default the current one), its recordings with their glyphs (the row menu offers Share, Delete, and **Rebuild replay** for failed builds only), recordings waiting for a scene version, and a menu for rename (with **Reset to Unity name**), download, copy GUID, **Manage versions** and delete (`pages/scene/ScenePage.tsx`) |
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
- `useStagedScene` (`SceneContent.tsx`) has two effects with separate lifetimes. The first holds the
  master's lease and is keyed by the scene URL and the retry attempt only. The second picks,
  prepares, warms up and adds the scene, and re-runs when the replay (`variant`) changes. A replay
  that finishes before the scene therefore never cancels the download. An abort the hook did not
  cause is retried once, then shown as the scene's error. `prefetch/sceneFetch.ts` never joins a
  flight that has been aborted.
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

The studio's rail has a Debug tool (owners and share links alike). It toggles a
translucent, movable window (drag its header; it starts under the scene-name card) with frame
times, renderer memory, replay clock, scene and query caches, and wireframe/bounds/show-inactive/fog
toggles. Open/closed (`moodyblues.debug.open`) and its position (`moodyblues.debug.position`) are
kept in `localStorage`. Frame statistics are collected only while it is open, and its code
(`debug/DebugWindow.tsx`, `DebugEffects.tsx`) is a separate chunk never requested while it is closed.

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

Reads the header, object table, event table, log table and the track section. Every offset and
count is checked against the file size, so a damaged file fails with a `ReplayFormatError` that
says so. The track section holds one run per object and property: LEB128 varints of quantized,
delta-coded times and values (1e-4 s; 1e-4 position/scale, 1/32768 rotation) and tangents stored as
slope times segment length on the same grid (the reader divides by the segment length, and a
segment of zero length is an error). Tracks must be strictly ascending by (object, property).
Varints are decoded with arithmetic, not bitwise operators, because values reach 2^48.
The whole file is decoded in a single pass into typed arrays.

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
  Alt+0 for the tenth). A phone has none of this (see Phone mode below). Where each floating
  window sits is remembered per kind of view (`scene` or `session`) in `localStorage`
  (`moodyblues.windows.v3`); a shared link's layout is not remembered, it comes from its owner's
  settings every time. A remembered place is a `WindowRect { anchor, offset, y, w, h }`
  (`windowLayout.ts`): horizontally the window is anchored to the nearer edge, `offset` being the
  gap to that edge, and `toFrame` / `fromFrame` convert to and from pixels. A right-anchored
  window therefore follows the rail when the dock opens. The layout rules are pure functions, with
  tests. The owner's view settings (grid, shadows,
  scene lights, camera lines, field of view, follow style, near clip) are kept under
  `moodyblues.view.v1`; a share page neither reads nor writes them.

  | Window | Content |
  |---|---|
  | Recordings | The sessions of the version on screen; choosing one plays it on this scene |
  | Logs (`LogsWindow.tsx`) | The session's logs only, in time order, each in its own Unity colour; All / Info / Warnings / Errors filters, search, virtualized, follows the playhead; every row is a seek. Only with a session |
  | Session details | Recording health (the client's counters, including rotation widenings), session facts. Read only, for owners and shared views alike. Only with a session |
  | Hierarchy | The scene's tree, searchable; during a replay the recorded objects as they are now |
  | Inspector | The selected object: name, ObjectID, live local and world transform, Unity path |
  | Materials, Textures, Geometry | Read from the loaded GLB by `inspector/inspection.ts`: materials with every texture channel, de-duplicated textures with estimated GPU memory, geometries and what shares them, vertex statistics |
  | Viewpoint (`ViewpointWindow.tsx`) | The cameras the Unity scene exported (a node's `extras.camera` = `{ index, tag }`, index 0 the MainCamera) with a 1st person / Follow pair per camera (Follow has a Behind / Front style), Free camera, Frame the scene, Replay intro (with a recording), and the display toggles and field of view; display only |
  | Raw data | The selection, the session record from the server, or the file's glTF JSON, as collapsible JSON |

- **Cameras** (`studio/cameras.ts`, `CameraGizmos.tsx`, `intro.ts`): focusing a camera
  (`focusCameraId`, an ObjectID; `V` cycles, `Shift+V` frees) flies the view to frame it, then each
  frame the orbit target and the viewer move by the camera's movement, so the user still orbits
  and zooms around it. It is exclusive with follow-selected (`F`). A camera's look direction is its
  node's own world -Z: UnityGLTF turns Camera nodes 180 degrees about Y (`invertLook`) so that -Z is
  Unity's forward, the replay's rotations include the turn, and the `<name>-flipped` child is not
  used. The gizmos are lines in the Stage scene beside the loaded one (never in the shared graph),
  copying each camera node's world pose every frame. Opening a recording runs the intro: paused,
  the whole scene, a 0.7 s hold, a 1.6 s flight to the main camera, then play. Any pointer, wheel or
  key input, or reduced motion, jumps to the end; a scene without cameras is framed and played.
  Scenes exported before the camera extras show no cameras (re-export from Unity).

- **Timeline** (`studio/Timeline.tsx`, only with a session): transport, speeds 0.25-4x,
  previous/next log, and the rail with the Info, Warning and Error logs marked. Markers are
  binned by pixel (`studio/logMarkers.ts`, one bin per 5 px, so the DOM holds a bounded number),
  a bin is shown as its most severe log in that log's colour (`logColorHex(log.color)`), and a
  marker can be hovered for a tip and clicked to seek there.
- **Keyboard**: `studio/shortcuts.tsx` holds the table; `?` shows it. Alt+1...9 and Alt+0 match
  `e.code` (the physical key, so Option+digit works on a Mac), and shortcuts are ignored while a
  menu or dialog is open.
- **Phone mode** (`lib/usePhoneLayout.ts`, `studio/PhoneSettings.tsx`). `usePhoneLayout()` is
  `(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)`: a touch
  screen that is narrow (portrait) or short (landscape). It is the one phone test in the studio and
  share code, for owners and share links alike. A touch tablet is not a phone, and neither is a
  narrow desktop window: they keep the studio. A phone gets a deliberately simple viewer: the 3D
  view, a top bar (the title, truncated, and one Settings icon button), the timeline and nothing
  else. There is no tool rail, no floating window and no dock. Settings opens a bottom sheet (not
  modal, so the view stays usable behind it; at most 70% of the height; closed by its button, Esc
  or by dragging its header down) with the camera (targets, 1st person / follow, follow style),
  playback speed, the display switches and, when the logs panel is available and there is a
  session, a read-only log list (a tap seeks). The controls are the ones the Viewpoint and Logs
  windows use (`windows/viewpointControls.tsx`, `LogList` in `LogsWindow.tsx`) and go through the
  same guarded store actions, so a share link's locks hold: a locked value shows the lock badge
  and is disabled. Panel availability hides only Logs; the Viewpoint panel being unavailable does
  not hide the camera settings, because the camera is the core of viewing (its locks still apply).
  The sheet's footer points to a laptop for the full studio, and carries Share (owners) or Sign in
  (visitors) since the bar has room for one button. Held sideways the timeline is one row (the
  rail beside play, time and speed). `index.html` has `viewport-fit=cover`, and the phone's top,
  bottom and side margins are `max(env(safe-area-inset-*), n)`. On a share link the welcome card
  stays a bottom sheet; on a phone its navigation help lists the touch gestures and the Settings
  button instead of the rail, and sideways it drops the wordmark and some padding so Play stays
  in view.
- **Layout rules** (all sizes). The studio's chrome is built so it cannot overlap: the top bar is
  one flex row (title card, which shrinks and truncates, then the buttons); the timeline sits beside
  the tool rail, never under it, and is a container query (the skip buttons and total length appear
  by the bar's own width, not the screen's, so it never wraps even beside a docked window); the rail
  runs the full height beside the view and its buttons are 36 px (not 40) on screens under 720 px
  tall, and it scrolls only if that is still not enough. The dock takes at most 30% of the
  window width (`dockWidthFor`, never under 280 px, the narrowest a window gets), so the 3D keeps about two thirds on a tablet or
  a half-screen window. The 3D is centred in the room the chrome leaves (the stage region follows
  the measured timeline height). The render resolution cap is unchanged. These are checked by
  a Playwright sweep over phones, tablets and desktops (no overlap, no clipping, no horizontal
  scroll, no wrapped timeline).
- **Share** (top right). With a session open it opens the ShareDialog (next section); on a bare
  scene it copies the owner-only link to that version, `<scene>/view?version=N`, which reopens the
  same version.

### Public share links (`src/share/`, `src/studio/source.ts`)

Each recording is **Private** (the default) or **Public**. The ShareDialog
(`share/ShareDialog.tsx`, opened from the studio's share button and the recordings table) has a
Public toggle, the link in a copy field, **Reset link**, which replaces the token so the old link
stops working at once, and, while the link is public, the **Viewer settings** (below). A Public badge marks public recordings in the recordings table and the Recordings window.

- `PUT /api/sessions/{id}/sharing` (`{ isPublic }`) and `POST /api/sessions/{id}/sharing/reset`
  both answer `{ isPublic, shareToken }`, which is written into the cached session detail.
- `/share/:token` is a public route (not behind `ProtectedRoute`): the same `StudioPage`, for an
  anonymous visitor, read only. It loads `GET /api/share/{token}` (session, project and scene
  names, scene version), then `/api/share/{token}/replay` and `/api/share/{token}/scene`. A
  visitor sees the logs, details, hierarchy and inspection windows, but no Recordings window, and
  can change nothing. A 401 or 404 on `/api/share/` paths is an answer, never a session expiry; an
  unknown or revoked token shows "link unavailable". `?t=` starts the replay at that time and
  wins over the start time in the link's settings. The response has no project id, sharing flag or
  token (`SharedSessionDetail`), and carries the settings already resolved by the server.
- `StudioSource` (`studio/source.ts`) is where the studio's data comes from: `owner` (project,
  scene and session ids, with the signed-in paths) or `share` (a token). It builds the replay path
  and the scene file reference for either. Link builders are in `lib/shareLink.ts`.

#### Share settings (`src/share/shareSettings.ts`)

The owner of a recording decides how visitors of its link see it, for example a game with a
first-person camera that visitors should start in, and perhaps never leave. Every value a visitor
can touch has a starting value and a **lock**: a locked value is shown, disabled, with a lock icon
and the tooltip "Set by the owner". The owner's own studio is never restricted; everything below
applies only on `/share/:token`.

- **Schema** (`ShareSettings`, `version: 1`): `camera` (target, mode, follow style, first-person
  near clip, field of view), `display` (grid, shadows, scene lights, camera lines), `playback`
  (start time, speed, `seeking.locked`), `panels` (per panel: `available` and `openAtStart`) and
  `interaction.selectObjects`. A camera target is `main` (the camera tagged MainCamera, else the
  free camera), `free`, `named` (the first exported camera with that node name) or `id` (one
  camera by ObjectID, then by name). A target that is not found falls back to `main`.
- **The backend stores it as opaque JSON** (an object, at most 16 KB); the frontend owns the
  meaning. `parseShareSettings` reads whatever is stored defensively: missing keys take
  `DEFAULT_SHARE_SETTINGS`, unknown keys are ignored, numbers are clamped (field of view 20 to 90,
  speed to the nearest Timeline step, near clip above zero or null, start time at zero or later),
  and a panel that is not available is never open at the start. It never throws.
- **Project defaults ("share defaults") and links.** Each project has a template, edited from the
  project page ("Share defaults"; camera by name, no start time) through
  `PUT /api/projects/{id}/share-defaults`. When a recording is first made public the server copies
  the template into the link; after that the link is edited on its own through
  `PUT /api/sessions/{id}/share-settings`, and later template edits do not touch it. After
  toggling Public the session detail is refetched to pick up the copy. The share dialog can
  **Save as project default** (`toTemplate`: a camera by id becomes a camera by name, and the start
  time is dropped, being a moment in one recording) and **Reset to project default** (the project's
  current template becomes this link's settings, after a confirmation).
- **The editor** (`ShareSettingsEditor`) is one controlled component with the sections Camera,
  Display, Playback, Panels and Interaction, each value with a lock toggle. The share dialog saves
  edits after about 500 ms (`useAutosave`, with a "Saving…" and "Saved" state, a toast on error, and
  a flush when the dialog closes). Opened from the studio it lists the scene's cameras and offers
  "Start at current time"; from the recordings table (no scene loaded) it offers Main, Free and the
  camera already chosen.
- **Enforcement** is in the studio store, not in the buttons. `useStudio().share` holds the
  settings on a share page (null for an owner), `isLocked(share, key)` is the one test, and the
  store's actions (`setFocusCamera`, `setCameraMode`, `setFollow`, `setSetting`, `select`,
  `selectId`, `frameAll`, `frameSelected`, `replayIntro`) do nothing for a locked value, so
  shortcuts and windows cannot bypass them. The clock's user-facing moves (`studio/userActions.ts`:
  `seekByUser`, `setSpeedByUser`) check the speed and seeking locks; the page's own moves (the
  intro, the start time) do not. With the camera target locked a visitor cannot pick another camera
  or the free one, nor follow the selection; with seeking locked scrubbing, skipping, clicking a
  log, the seek keys and Replay intro are off, and play and pause still work. Locked rows are
  also left out of the shortcut table, and unavailable panels are absent from the rail, the
  welcome card, the shortcut table and Alt+N. With `selectObjects` off clicks and hierarchy rows
  select nothing, and the hierarchy only opens and closes.
- **Initial state** is applied once per link. When the response arrives the page calls
  `enterShare` (the view settings, replacing the owner's remembered ones, and nothing written back
  to `localStorage`) and lays the window dock out from the panels open at the start. The start
  time (a `?t=` wins) and the speed are set on the clock before the replay attaches. When the
  scene and the replay are ready the intro (`StudioContent`) resolves the camera target and flies
  to it in the resolved mode (first person flies to the lens, follow to the chase pose); a free
  target, or a scene with no cameras, frames the scene and stays on the free camera.

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
  share/        ShareDialog, ShareDefaultsDialog, ShareSettingsEditor, shareSettings (schema, parse, lock tests), shareLayout, useAutosave
  ui/           the component kit on Radix (Button, Dialog, Menu, Tabs, Toast, Chip, ...), ActivityGlyph, SnapshotImage
  stage/        the root canvas: store (views, content types, camera), StageHost, CameraRig, DemoScene,
                scene cache (sceneAssets, sceneSource), snapshots, StageSurface, StagePreloader
  studio/       the 3D studio: page, PhoneSettings (the phone's sheet), Stage content, playback clock, replay binding, timeline, logMarkers, source (StudioSource), shortcuts,
                logNav, unityPath, studioStore, windows/ (the tool windows and their layout)
  inspector/    inspection.ts (reads a loaded scene), thumbnails.ts
  shell/        WorkspaceLayout and TopBar (page frame), ConnectionDialog, SetupGuide
  pages/        auth/, lobby, new project, project, scene/ (page, recordings table, versions dialog)
  debug/        the studio's Debug window and its scene effects (lazy)
  viewer/       core/ (gltf, palette, atmosphere, outline; imports nothing from the app, which
                boundary.test.ts checks), replay/ (parser, tracks, player)
  lib/          formatting and small hooks (usePhoneLayout, useMediaQuery, useElementHeight, useWindowWidth)
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
moves**, or every request is blocked. The policy allows `'wasm-unsafe-eval'` and `blob:` workers for the Draco and Basis decoders, and
`blob:` fetches for GLB textures. It also needs `'unsafe-eval'`: the Basis transcoder (an Emscripten
build) creates functions with `Function(...)`, and without it a KTX2 texture never finishes
decoding, so the scene download completes but the scene never appears and no error is raised. Another static host needs
the same headers. After upgrading `three`, re-copy the decoders from
`node_modules/three/examples/jsm/libs/{draco/gltf,basis}/` into `public/decoders/`.

## 6. Known limits

- **Whole-file loading.** The replay is downloaded and parsed in full before playback.
- **No instancing.** Spawned objects are full clones, so very spawn-heavy sessions cost what they
  would cost in the game.
- **Skinned meshes** whose bones were stripped in Unity (*Optimize Game Objects*) replay in bind
  pose; the Unity client's *Validate Scenes* warns about them.
- **Scene thumbnails** live in each browser's IndexedDB, not on the server.
- **Not measured.** Frame times on a real GPU and screen-reader behaviour were not verified. A real
  optimized scene (Draco and KTX2) was parsed in Firefox under this CSP; other browsers were not
  tried.
