/**
 * The panel system's layout rules (DESIGN.md 9.2), as pure functions so they can be tested alone.
 * A panel is either docked (a tab in the right-hand column) or floating (a window over the
 * viewport). Layouts are remembered per kind of view and must never leave a panel out of reach.
 */

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  w: number;
  h: number;
}

export interface ScopeLayout {
  /** The docked column is showing. */
  dockOpen: boolean;
  dockWidth: number;
  /** The docked tab in front. */
  active: string | null;
  floating: Record<string, FloatRect>;
  /** Floating windows, back to front. */
  order: string[];
  /** The rail shows labels as well as icons. */
  railExpanded: boolean;
}

export const DOCK_MIN = 320;
export const DOCK_MAX = 480;
export const FLOAT_MIN: Bounds = { w: 260, h: 180 };
/** How much of a window's header must stay inside the viewport so it can always be grabbed. */
const GRAB = 64;

export function defaultLayout(): ScopeLayout {
  return { dockOpen: true, dockWidth: 360, active: null, floating: {}, order: [], railExpanded: false };
}

export function clampDockWidth(width: number): number {
  return Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round(width || 360)));
}

/** Fits a window inside `bounds`: no bigger than it, and with its header always reachable. */
export function clampRect(rect: FloatRect, bounds: Bounds, min: Bounds = FLOAT_MIN): FloatRect {
  const w = Math.round(Math.min(Math.max(rect.w, Math.min(min.w, bounds.w)), Math.max(bounds.w, 1)));
  const h = Math.round(Math.min(Math.max(rect.h, Math.min(min.h, bounds.h)), Math.max(bounds.h, 1)));
  const x = Math.round(Math.min(Math.max(rect.x, GRAB - w), Math.max(bounds.w - GRAB, 0)));
  const y = Math.round(Math.min(Math.max(rect.y, 0), Math.max(bounds.h - 40, 0)));
  return { x, y, w, h };
}

/** Where a newly floated panel lands: near the right edge, each one a little lower and further left. */
export function defaultFloatRect(bounds: Bounds, existing: number): FloatRect {
  const w = Math.min(360, Math.max(FLOAT_MIN.w, bounds.w - 32));
  const h = Math.min(480, Math.max(FLOAT_MIN.h, bounds.h - 32));
  return clampRect({ x: bounds.w - w - 16 - existing * 24, y: 16 + existing * 24, w, h }, bounds);
}

function withoutId(list: string[], id: string): string[] {
  return list.filter((x) => x !== id);
}

/** Show a panel: bring a floating one to the front, or open the dock on a docked one. */
export function openPanel(layout: ScopeLayout, id: string): ScopeLayout {
  if (layout.floating[id]) return { ...layout, order: [...withoutId(layout.order, id), id] };
  return { ...layout, dockOpen: true, active: id };
}

/** Pop a docked panel out into a window. */
export function floatPanel(layout: ScopeLayout, id: string, bounds: Bounds, docked: string[]): ScopeLayout {
  if (layout.floating[id]) return layout;
  const rect = defaultFloatRect(bounds, layout.order.length);
  const remaining = docked.filter((d) => d !== id);
  return {
    ...layout,
    floating: { ...layout.floating, [id]: rect },
    order: [...layout.order, id],
    active: layout.active === id ? (remaining[0] ?? null) : layout.active,
  };
}

/** Put a floating panel back in the dock, in front. */
export function dockPanel(layout: ScopeLayout, id: string): ScopeLayout {
  if (!layout.floating[id]) return layout;
  const floating = { ...layout.floating };
  delete floating[id];
  return { ...layout, floating, order: withoutId(layout.order, id), active: id, dockOpen: true };
}

export function moveFloating(layout: ScopeLayout, id: string, rect: FloatRect): ScopeLayout {
  if (!layout.floating[id]) return layout;
  return { ...layout, floating: { ...layout.floating, [id]: rect } };
}

export function setDockWidth(layout: ScopeLayout, width: number): ScopeLayout {
  return { ...layout, dockWidth: clampDockWidth(width) };
}

/**
 * Drops panels this view no longer has, so a stale saved layout cannot point at nothing, and picks a
 * docked tab if the remembered one is gone.
 */
export function sanitize(layout: ScopeLayout, available: string[]): ScopeLayout {
  const known = new Set(available);
  const floating: Record<string, FloatRect> = {};
  for (const [id, rect] of Object.entries(layout.floating)) if (known.has(id)) floating[id] = rect;
  const order = layout.order.filter((id) => floating[id]);
  const docked = available.filter((id) => !floating[id]);
  const active = layout.active && docked.includes(layout.active) ? layout.active : (docked[0] ?? null);
  if (active === layout.active && order.length === layout.order.length && Object.keys(floating).length === Object.keys(layout.floating).length) return layout;
  return { ...layout, floating, order, active };
}
