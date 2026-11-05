# GLB/glTF Web Viewer — UI/UX Design Specification

**Purpose:** A browser-based tool for developers to drag-and-drop, view, and inspect GLB/glTF 3D models — scene hierarchy, materials, meshes, animations, and performance stats — without needing a 3D engine or DCC tool installed.

**Audience for this doc:** An engineering/AI build team. This document is the single source of truth for layout, components, states, interactions, and visual system. It assumes a Three.js-based renderer but the spec is engine-agnostic.

---

## 1. Research Summary — Competitive Landscape

| Tool | Strengths worth borrowing | Weaknesses to avoid |
|---|---|---|
| **glb.ohzi.io** (primary reference) | Minimal, single-purpose landing state ("Select → FileDrop → File/Folder"); example models as one-click starters; clean dark canvas; hierarchy tree + details/inspector panel pairing (as seen in the reference screenshot) with per-node Name/Type/Position/Rotation/Scale/Global Scale/User Data | Sparse public docs on advanced panels; small icon set may not scale to power-user features |
| **Babylon.js Sandbox** (sandbox.babylonjs.com) | Scene Explorer (hierarchy) + Inspector (properties) split; drag-and-drop of multi-file glTF (.bin + textures); environment map swapping; URL query params (`?asset=`, `&kiosk=true`, `&autorotate=true`, `&environment=`) for shareable/embeddable states; PWA installable | Inspector can be overwhelming/dense for casual users; visually utilitarian, not "designed" |
| **Google `<model-viewer>` / modelviewer.dev** | Extremely low-friction embed model; AR hand-off (WebXR/Quick Look/Scene Viewer); auto-generated **poster** image for progressive loading; annotations/hotspots anchored to 3D points; accessibility via `alt` text and screen-reader-tested AR button | Not really an "inspector" — built for embedding, not debugging; no hierarchy/material panel out of the box (that lives in the separate Space Opera editor) |
| **Three.js Editor** | Full scene graph tree with drag-to-reparent; outliner + properties + resources tabs; viewport gizmos (translate/rotate/scale) matching the reference screenshot's colored axis arrows | Editor-grade complexity; steep for a "quick look" use case |
| **Sketchfab viewer** | Polished orbit/zoom feel, soft-shadow ground plane, annotations, wireframe/AO toggles, download/embed panel | Closed ecosystem, account-gated features |
| **gltf-viewer (Don McCurdy) / glTF-Sample-Viewer** | Reference-accurate PBR rendering, tone-mapping & exposure controls, environment (IBL) picker, "debug output" channel switcher (Normals/Occlusion/Metallic/Roughness/UV) | Debug-first UI, not consumer-friendly |

### Synthesized takeaways for our design
1. **Zero-friction entry**: drag-and-drop anywhere, click-to-browse, and pre-loaded example models — no sign-up, no upload wait state confusion.
2. **Two symmetric side panels** (left = Hierarchy/Outliner, right = Details/Inspector) flanking a large central viewport is the dominant, proven pattern (OHZI, Babylon Sandbox, Three.js Editor all converge here).
3. **Progressive disclosure**: default view is clean (just the model); power-user data (vertex counts, transforms, raw JSON) lives one click away in the Details panel, matching OHZI's collapsed-by-default numeric fields.
4. **Shareable state via URL params** (asset URL, camera, kiosk mode, autorotate) is a recurring, high-value feature for developers who want to send a link, not a file.
5. **Multiple debug lenses** (wireframe, normals, UV checker, unlit) are expected by developers even if hidden behind a toggle.
6. **Dark theme is the norm** for 3D tools — it makes the model (usually the brightest/most saturated element) the visual focus, and matches the reference screenshot's near-black chrome with a neutral mid-gray viewport.

---

## 2. Design Goals & Non-Goals

**Goals**
- Load a `.glb`/`.gltf` in under 2 seconds for typical (<20MB) assets, with visible progress for larger ones.
- Let a developer answer, within 10 seconds of opening a file: *How many draw calls/vertices? What's in the scene graph? Are materials/textures correct? Are there animations?*
- Be fully usable via **URL alone** (`?url=`) for embedding in bug reports, PRs, Slack links, and CI artifact previews.
- Work equally well as a **standalone hosted tool** and as an **embeddable component** (iframe or web component) inside another app.
- Never block the render thread with UI (panels are virtualized/lazy where needed for huge scenes).

**Non-goals**
- Not a scene editor (no adding lights/meshes, no saving edits back to the file) — v1 is read-only inspection. (Optionally reversible in a "v2" roadmap section, see §11.)
- Not a full material/shader authoring tool (no node graphs).
- Not an asset management/versioning system.

---

## 3. Information Architecture & Layout

### 3.1 Overall shell (desktop, ≥1200px)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Top Bar: [Logo/Title]   [Open File ▾] [Share] [Settings]     [⚙ gear]    │
├───────────┬───────────────────────────────────────────────┬───────────────┤
│           │                                               │               │
│ Hierarchy │                                               │   Details /   │
│  Panel    │                 3D Viewport                   │   Inspector   │
│ (280px,   │           (fills remaining space)              │   Panel       │
│ collapsible)│         grid floor + gizmo + model            │  (320px,      │
│           │                                               │  collapsible) │
│           │                                               │               │
├───────────┴───────────────────────────────────────────────┴───────────────┤
│  Bottom Bar: [Play ▶ Animation dropdown | timeline scrubber]  [Stats: FPS · Tris · Draw calls · Textures]  │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Left rail (icon dock, 48px)**: matches the reference screenshot's vertical icon strip — Scene/Hierarchy toggle, Materials toggle, Transform/Gizmo mode toggle, Info/Stats toggle. Always visible; acts as the master show/hide switch for panels so the viewport can go edge-to-edge.
- **Viewport** is the only element that must never be fully obscured; panels float above it with `X` close controls (as in the reference screenshot's panel headers) rather than pushing/reflowing it, OR dock and resize it — pick **dock-and-resize** for the primary desktop layout (more predictable for repeated use) and reserve floating/overlay panels for the embedded/compact mode (§7).

### 3.2 Empty / landing state
- Full-bleed dark viewport with centered content (mirrors glb.ohzi.io):
  1. App icon/mark
  2. H1: "GLB / glTF Viewer"
  3. Subtext: "Drag a file, click to browse, or paste a URL."
  4. A single dashed-border **Dropzone** button: "Select File → or Drop File/Folder"
  5. Row of 3–4 **example model** thumbnail cards (name + rendered thumbnail) that load instantly on click — reduces the "what do I even do with this" moment for first-time visitors.
  6. Small text link: "Or load from URL" → inline text input + Go button, enabling the `?url=` deep-link flow.
- Accepts: `.glb`, `.gltf` (+ sibling `.bin`/textures dropped together), and a `.zip`/folder containing a `.gltf` and its dependencies.

### 3.3 Loaded state
- Dropzone/example cards fade out; viewport frames the model (auto-fit camera to bounding box with ~20% padding).
- Hierarchy panel populates with the scene tree; Details panel shows the root scene node by default (or the first selected mesh).
- A **toast**/inline banner appears once per session on first load: filename, file size, load time (e.g., "Toy_Car.glb loaded — 4.2MB — 312ms") then auto-dismisses after 4s (also viewable via a persistent icon in the top bar).

---

## 4. Component Specifications

### 4.1 Top Bar
| Element | Behavior |
|---|---|
| Logo / product name (left) | Click → return to landing/empty state (with confirm if a model is loaded and unsaved camera bookmarks exist) |
| **Open File ▾** | Split button: primary click opens file picker; caret opens menu with "Open File…", "Open Folder…", "Load from URL…", "Recent files" (last 5, stored client-side) |
| **Share** | Generates a shareable link. If the source was a URL, link = `?url=<encoded>` plus current camera/animation state as query params. If the source was a local file, prompt to either (a) copy a "state snippet" others can paste with their own file, or (b) upload to a temp CDN slot (explicit opt-in, show expiry) |
| **Settings (gear icon, far right)** | Opens a settings panel: theme (dark/light/system), units, tone-mapping mode, background (solid/gradient/HDRI/transparent-checkerboard), grid on/off, performance mode (auto-throttle heavy scenes) |
| Breadcrumb / filename (center-left, when loaded) | Shows current filename, dirty-state indicator not needed (read-only tool) |

### 4.2 Left Icon Dock (48px fixed)
Matches the four icons visible in the reference screenshot:
1. **Hierarchy** (list icon) — toggles Hierarchy panel
2. **Materials/Shading** (sphere icon) — toggles a Materials panel or shading-mode quick menu (Lit / Unlit / Wireframe / Normals / UV Checker)
3. **Transform/Select** (bounding-box icon) — toggles gizmo mode: Select / Move / Rotate / Scale (also reachable via `Q W E R` hotkeys, Blender/Unity convention developers already know)
4. **Info/Stats** (circled-i icon) — toggles a persistent on-canvas stats overlay (FPS, triangle count, draw calls, memory) independent of the Details panel
5. *(bottom, pinned)* **Collapse/expand all panels** (arrow icon, as in screenshot's bottom-left arrow) — one-click "focus mode" that hides all chrome except the viewport and bottom bar; press `Tab` or `.` to toggle, mirroring common 3D-tool conventions

### 4.3 Hierarchy Panel
- **Header**: title "Hierarchy", search input (filters tree by name, live, debounced 150ms), close (`×`) button.
- **Tree rows**, each with:
  - Disclosure triangle (only if node has children) — click or `←/→` arrow keys to collapse/expand
  - Type icon (mesh, light, camera, empty/group, skinned mesh, bone) — color-coded per type (e.g., cyan wireframe icon for meshes, amber for lights, as in screenshot)
  - Node name (editable label only in a future "edit mode"; read-only in v1 — single click selects, does not rename)
  - Instance/child count badge for groups, e.g. "Directional_Light (1)"
  - Eye icon (right-aligned) toggling per-node visibility, matching the screenshot exactly
  - Row states: default / hover (subtle lighten) / selected (accent-colored background + left border accent bar)
- **Root row** shows the scene name + total node count, e.g. "SampleScene (5)".
- Selecting a row: highlights the node in the viewport (outline/glow shader on the mesh, not just a bounding box, so it reads clearly against similarly colored geometry), frames-to-selection available via `F` hotkey, and updates the Details panel.
- Multi-select (Cmd/Ctrl+click, Shift+click range) supported for bulk visibility toggling and comparing transforms.
- Drag reordering is **disabled** (read-only viewer) — no drag affordance shown.
- Right-click context menu: "Isolate" (hide all siblings), "Focus camera", "Copy node path", "Copy transform as JSON".

### 4.4 Details / Inspector Panel
Directly modeled on the reference screenshot's field set, extended with tabs for depth:

**Header**: title "Details", edit-pencil icon (disabled/hidden in read-only mode, or opens a "live tweak" sandbox mode that never mutates the source file — see §11), close (`×`).

**Tab strip** (new, since screenshot shows only one view — we split into tabs to avoid an overlong single panel):
- **Properties** (default) — the fields from the screenshot:
  - Name
  - Type (e.g., "InstancedMesh (24 vertices)" + "Instance count: 8 (192 vertices)" — always show both per-instance and total counts when instancing is detected)
  - Position (x, y, z — monospace numeric, 2 decimal places, click to reveal full precision on focus)
  - Rotation (Euler XYZ in degrees, with a small toggle to view as quaternion)
  - Scale (local) and **Global scale** (world-space, computed through parent hierarchy) — both shown, exactly as in the screenshot, since local vs. world scale mismatches are a common developer debugging need
  - User data — raw custom `extras`/`userData` JSON, rendered as a collapsible, syntax-highlighted, read-only JSON viewer (`{}` shown when empty, as in screenshot)
  - **"Open material details"** button (full-width, bottom) → switches to Material tab pre-scoped to this node's material(s)
- **Material** — for the selected mesh: base color (swatch + hex), metallic/roughness sliders (display-only, with values), texture maps thumbnail grid (baseColor, normal, MR, emissive, AO) with resolution badges (e.g. "2048×2048"), alpha mode (Opaque/Blend/Mask), double-sided flag, and any KHR material extensions detected (e.g. `KHR_materials_transmission`, `KHR_materials_clearcoat`) listed as chips.
- **Geometry** — vertex/triangle/index count, bounding box dimensions, UV set count, morph target list (if any), skin/bone count for skinned meshes.
- **Animations** — list of clips found in the file with duration, affected node count; each has an inline "preview" play button that also drives the bottom bar's transport.
- **Raw glTF** — collapsed by default; a searchable, read-only JSON tree of the node's underlying glTF definition, for developers who want ground truth without opening the file in a text editor.

### 4.5 Viewport
- Grid floor (subtle, fades with distance) — toggle in Settings.
- Transform gizmo on selected node (colored X/Y/Z arrows exactly as in screenshot: red/green/blue) shown only when Transform tool is active; otherwise a lightweight outline highlight only.
- Camera: orbit (drag), pan (right-drag or two-finger), zoom (scroll/pinch); "Frame All" (`A`) and "Frame Selected" (`F`) hotkeys; reset view button (small compass/home icon, bottom-right corner of viewport).
- On-canvas **stats overlay** (toggleable): FPS, resolution, triangle count, draw calls, texture memory — top-right corner, small monospace, semi-transparent chip.
- Loading state: skeleton/shimmer of a bounding-box wireframe + percentage bar for downloads >2MB; indeterminate spinner for parsing step.
- Error state (bad file / unsupported extension): centered card with icon, short human-readable reason ("This file references a texture that couldn't be found: `basecolor.jpg`"), and a "View details" expandable with the raw parser error for bug-report copy-paste.
- Drag-over state: entire viewport gets a dashed accent-colored border + translucent overlay reading "Drop to load".

### 4.6 Bottom Bar (Animation & Global Stats)
- Only appears/expands when the file has ≥1 animation clip; otherwise collapses to just the stats strip.
- Transport controls: Play/Pause, loop toggle, playback speed (0.25×–2×), clip dropdown (multi-clip files), scrub timeline with current-time readout.
- Global stats strip (always visible, right-aligned): total triangles, materials, textures, file size, FPS — same data family as the per-node Details panel but scene-wide.

### 4.7 Settings Panel (from gear icon)
- Background: Solid color / Gradient / Studio HDRI presets (3–5 built-in) / Custom HDRI upload / Transparent (checkerboard, useful for asset QA)
- Tone mapping: None / ACES Filmic / Khronos PBR Neutral / Commerce (flat, faithful color — matches `<model-viewer>`'s finding that commerce use cases want undistorted color)
- Exposure slider
- Shading mode quick-switch (duplicated from left dock for discoverability): Lit / Unlit / Wireframe / Normals / UV Checker
- Grid on/off, ground shadow on/off
- Units (meters/cm/inches) — affects only labels, not the model
- Auto-rotate toggle + speed
- Performance: cap FPS, disable shadows on low-end devices (auto-detected via a quick GPU/benchmark heuristic)

---

## 5. Visual Design System

### 5.1 Color tokens (dark theme, default)
| Token | Hex | Usage |
|---|---|---|
| `--bg-canvas` | `#3a3a3a` (mid-neutral gray) | Viewport background (matches reference screenshot's viewport gray, distinct from near-black chrome so the model — often lighter — pops) |
| `--bg-panel` | `#1a1a1a` | Panel backgrounds (Hierarchy, Details, Top bar) |
| `--bg-panel-raised` | `#242424` | Panel headers, hovered rows, dropdown menus |
| `--border-subtle` | `#333333` | Panel borders, dividers |
| `--text-primary` | `#eaeaea` | Titles, primary labels |
| `--text-secondary` | `#9c9c9c` | Field labels (e.g., "Position:", "Rotation:") — lower emphasis than values |
| `--text-value` | `#f2f2f2` | Field values, monospace numerics |
| `--accent-primary` | `#5ec9c0` (teal/cyan) | Selection highlight, active tab, primary buttons, mesh-type icons — echoes the cyan wireframe cube icons in the reference screenshot |
| `--accent-warn` | `#e0a03c` | Warnings (missing textures, degenerate geometry) |
| `--accent-error` | `#e05c5c` | Load errors, invalid file |
| `--axis-x` | `#e0524a` (red) | Gizmo X axis |
| `--axis-y` | `#8fce4f` (green) | Gizmo Y axis |
| `--axis-z` | `#4a90e0` (blue) | Gizmo Z axis |

Light theme: invert panel/canvas luminance but keep accent/axis colors identical for muscle-memory consistency with other 3D tools.

### 5.2 Typography
- **UI font**: Inter or system-ui sans-serif, 13px base for panel body text, 12px for secondary labels, 15px semibold for panel titles.
- **Data/monospace font**: JetBrains Mono or ui-monospace, 12.5px, used for all numeric transform values, JSON viewers, and stats — sets developer-tool tone (as reflected in the reference screenshot's monospace field values and even its own UI chrome font).

### 5.3 Iconography
- Line-style, 1.5px stroke, 16–20px, consistent corner radius. Reuse a single icon set (e.g., Lucide/Feather-style) across dock, panel headers, and buttons — avoid mixing filled and outline styles.
- Type-specific node icons in Hierarchy: mesh (cube outline), light (sun/bulb), camera (camera body), group/empty (dashed cube), bone (small skeleton/joint glyph), skinned mesh (cube + joint dot).

### 5.4 Spacing & layout grid
- 8px base spacing unit. Panel padding 16px. Row height in trees/lists: 28px (compact) with 32px hit target for touch.
- Panel default widths: Hierarchy 280px (min 220 / max 420, resizable via drag handle), Details 320px (min 260 / max 480).
- Corner radius: 6px for panels/cards, 4px for buttons/inputs, 999px (pill) for chips/badges.

### 5.5 Elevation & motion
- Panels: flat, no drop shadow against the near-black chrome (avoids muddiness); a 1px `--border-subtle` separates panel from canvas.
- Modals/menus (Open File ▾, context menus): 8px blur drop shadow, 4px radius, fade+scale-in 120ms ease-out.
- Selection highlight in viewport: pulsing outline glow, 600ms ease-in-out loop, subtle (not distracting) — settle to steady glow after 1.2s.
- Panel collapse/expand: 180ms width transition, ease-in-out; viewport resizes in the same transition (no pop).

---

## 6. Interaction & Keyboard Shortcut Reference

| Action | Shortcut |
|---|---|
| Orbit camera | Left-drag |
| Pan camera | Right-drag / Shift+drag / two-finger drag |
| Zoom | Scroll / pinch |
| Frame all | `A` |
| Frame selected | `F` |
| Select tool | `Q` |
| Move/translate gizmo | `W` |
| Rotate gizmo | `E` |
| Scale gizmo | `R` |
| Toggle wireframe | `Z` |
| Toggle stats overlay | `I` |
| Toggle hierarchy panel | `H` |
| Toggle details panel | `D` |
| Focus mode (hide all panels) | `Tab` |
| Play/pause animation | `Space` (when timeline focused) |
| Deselect | `Esc` |
| Open file dialog | `Cmd/Ctrl+O` |
| Copy shareable link | `Cmd/Ctrl+Shift+C` |

---

## 7. Responsive & Embedded Modes

### 7.1 Tablet (768–1199px)
- Hierarchy and Details panels become **overlay drawers** (slide in from left/right over the viewport, with a scrim) rather than docked columns, since there's not enough width for three-way split.
- Left icon dock persists as the trigger for each drawer.
- Bottom bar collapses animation controls into a single floating pill button; tapping expands the full transport inline.

### 7.2 Mobile (<768px)
- Viewport is full-screen by default.
- Bottom sheet (swipe-up) replaces both side panels — a single tabbed sheet: Hierarchy / Details / Settings, so only one is ever open, reachable via a bottom-right FAB (stacked-layers icon).
- Pinch-zoom/one-finger-orbit/two-finger-pan gesture set; no right-click pan equivalent needed since two-finger drag covers it.
- Example-model cards on landing screen become a horizontally scrollable row instead of a grid.

### 7.3 Embedded / iframe / "kiosk" mode
Query-param driven, inspired directly by Babylon Sandbox's `?asset=`, `&kiosk=true`, `&autorotate=true`, `&environment=` pattern:

| Param | Effect |
|---|---|
| `?url=<encoded model URL>` | Auto-loads model on page load |
| `&kiosk=true` | Hides all chrome (top bar, panels, dock) — pure viewport, for embedding in docs/marketing pages |
| `&autorotate=true` | Slow auto-orbit until first user interaction |
| `&background=transparent` | Transparent canvas so it composites over host page background |
| `&hdri=<url>` | Custom environment lighting |
| `&camera=<az>,<el>,<dist>` | Deep-link a specific camera framing |
| `&ui=minimal` | Shows only a small "Open in full viewer ↗" pill, no other chrome — good for embeds that still want an escape hatch |

This makes the same codebase serve three audiences: the full inspector tool, a lightweight embeddable `<iframe>`, and (optionally) a packaged web component (`<glb-viewer src="...">`) wrapping the same renderer, mirroring `<model-viewer>`'s distribution model.

---

## 8. Functional / Technical Requirements

### 8.1 File support
- `.glb` (binary, single file) — primary path, drag-drop or file-picker.
- `.gltf` + `.bin` + texture files — must accept a **folder drop** or **multi-file selection** so all references resolve (mirrors Babylon Sandbox's explicit requirement).
- Draco and Meshopt compressed geometry, KTX2/Basis compressed textures — decode via lazy-loaded worker modules (don't bundle decoders into the main chunk).
- Max recommended file size for smooth in-browser handling: soft warning above 100MB with an option to proceed anyway.

### 8.2 Rendering
- PBR metallic-roughness pipeline as baseline; support common Khronos extensions: `KHR_materials_emissive_strength`, `KHR_materials_transmission`, `KHR_materials_clearcoat`, `KHR_materials_ior`, `KHR_texture_transform`, `KHR_lights_punctual`, `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu`.
- Instancing support (`EXT_mesh_gpu_instancing`) surfaced explicitly in the Details panel exactly as shown in the reference screenshot ("InstancedMesh (24 vertices) / Instance count: 8 (192 vertices)").
- Skinned mesh + skeletal animation playback; morph target (blend shape) playback with per-target weight display in the Geometry tab.
- Tone-mapping/exposure controls as listed in §4.7.

### 8.3 Performance
- Target 60fps for typical assets (<100k triangles) on mid-tier laptops/phones.
- Automatic LOD/quality step-down (shadow resolution, sample count) if measured frame time exceeds budget for 2+ consecutive seconds; show a small "Performance mode enabled" toast, dismissible, with a Settings link to override.
- Hierarchy tree virtualization required for scenes with 1,000+ nodes.

### 8.4 State & sharing
- All viewer state (selected node, camera position, active shading mode, animation clip/time) serializable to URL query params for shareable links per §7.3.
- Local-only "Recent files" list (filename + last-opened timestamp) in browser storage — never uploads local files anywhere unless the user explicitly chooses "Upload to share".

### 8.5 Error handling
- Missing texture/buffer reference → render mesh anyway (magenta/checkerboard fallback material) + non-blocking warning chip listing the missing asset paths, so partial inspection is still possible.
- Malformed/corrupt file → block load, show the Viewport error card (§4.5) with a "Copy error details" button (formats a markdown code block suitable for pasting into a GitHub issue).
- Network failure loading a `?url=` model → retry button + CORS troubleshooting hint if the failure looks CORS-related.

---

## 9. Accessibility

- All panels and the top bar are keyboard-navigable (`Tab`/`Shift+Tab`); tree rows navigable with arrow keys, `Enter`/`Space` to select.
- Color is never the sole indicator of state — selection also gets a border/outline change, not just accent color, for color-blind users.
- Sufficient contrast: body text ≥4.5:1 against panel backgrounds; `--text-secondary` (#9c9c9c) against `--bg-panel` (#1a1a1a) meets AA for normal text.
- Every icon-only button has an `aria-label` and a native tooltip on hover/focus (e.g., "Toggle Hierarchy panel (H)").
- Respect `prefers-reduced-motion`: disable auto-rotate, pulsing selection glow, and panel slide transitions (replace with instant show/hide) when set.
- File-drop zone is also a real `<input type="file">` reachable by keyboard/screen reader, not a div-only drop target.

---

## 10. Content & Microcopy Reference

| Context | Copy |
|---|---|
| Landing subtitle | "Drag a file, click to browse, or paste a URL." |
| Dropzone button | "Select File — or drop a file/folder" |
| Example section label | "Or try one of these:" |
| Load toast | "`{filename}` loaded — {size} — {ms}ms" |
| Missing texture warning | "Missing texture: `{path}` — showing placeholder" |
| Corrupt file error title | "Couldn't read this file" |
| Corrupt file error body | "This doesn't look like a valid glTF/GLB. {parser reason}." |
| Large file warning | "This file is {size} — large scenes may load slowly on some devices. Continue?" |
| Share tooltip | "Copy a link to this exact view" |
| Empty user data field | `{}` |

---

## 11. Roadmap / Deferred (v2+, not required for v1 build)
- Optional non-destructive "Live Tweak" sandbox: adjust material/transform values in-session (never mutates the source file) and export a diff/patch or a re-baked `.glb`.
- Scene diffing: load two GLBs side-by-side and highlight structural/material differences (useful for CI regression checks on exported assets).
- AR hand-off button (WebXR/Quick Look) per `<model-viewer>`, gated behind a feature flag since it changes the mobile toolbar footprint.
- Annotation/hotspot authoring (click a point on the mesh, attach a note) for design-review workflows.
- Automated validation report (glTF Validator integration) surfaced as a dedicated panel/tab listing spec warnings and errors per node.

---

## 12. Build Checklist (for the implementing team)

- [ ] Renderer core (Three.js or equivalent) with GLTFLoader + Draco/Meshopt/KTX2 decoder wiring
- [ ] App shell: top bar, left icon dock, resizable docked panels, bottom bar
- [ ] Landing/empty state with dropzone, example models, URL-load field
- [ ] Hierarchy panel: virtualized tree, search, visibility toggles, selection sync
- [ ] Details panel: tabbed (Properties / Material / Geometry / Animations / Raw glTF), local + global transform math including instancing counts
- [ ] Viewport: orbit/pan/zoom camera, transform gizmo, grid, stats overlay, drag-over + error + loading states
- [ ] Bottom bar animation transport + global stats strip
- [ ] Settings panel: background, tone-mapping, shading modes, units, performance toggles
- [ ] URL query-param state (load, kiosk, autorotate, camera, background, ui=minimal)
- [ ] Responsive breakpoints: docked (desktop) → drawer (tablet) → bottom-sheet (mobile)
- [ ] Keyboard shortcuts per §6 + full keyboard navigation for accessibility
- [ ] Error/edge-case handling per §8.5
- [ ] Design tokens implemented as CSS variables per §5.1–5.4, dark theme default, light theme optional
