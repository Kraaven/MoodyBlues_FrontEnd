/**
 * The window system's layout rules, as pure functions so they can be tested alone.
 *
 * A tool window is closed, floating (a window over the 3D view that can be moved and resized) or
 * docked (a tab in the column at the right edge). Where each floating window was is remembered even
 * while it is closed, per kind of view, and must never leave a window out of reach.
 */

export interface WindowRect {
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
  /** Floating windows that are open, back to front. */
  open: string[];
  /** Last place of every window that has floated. */
  rects: Record<string, WindowRect>;
  /** Windows in the dock, in tab order. */
  docked: string[];
  /** The dock tab in front. */
  dockActive: string | null;
  /** The dock column is showing (it can be collapsed while it still holds tabs). */
  dockOpen: boolean;
  dockWidth: number;
}

export const DOCK_MIN = 320;
export const DOCK_MAX = 520;
export const WINDOW_MIN: Bounds = { w: 280, h: 200 };
export const WINDOW_DEFAULT: Bounds = { w: 380, h: 540 };
/** How much of a window's header must stay inside the view so it can always be grabbed. */
const GRAB = 72;
/** Room kept free on the right for the tool rail. */
export const RAIL_ROOM = 88;

export function defaultLayout(docked: string[] = []): ScopeLayout {
  return { open: [], rects: {}, docked, dockActive: docked[0] ?? null, dockOpen: docked.length > 0, dockWidth: 380 };
}

export function clampDockWidth(width: number): number {
  return Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round(width || 380)));
}

/** Fits a window inside `bounds`: no bigger than it, and with its header always reachable. */
export function clampRect(rect: WindowRect, bounds: Bounds, min: Bounds = WINDOW_MIN): WindowRect {
  const w = Math.round(Math.min(Math.max(rect.w, Math.min(min.w, bounds.w)), Math.max(bounds.w, 1)));
  const h = Math.round(Math.min(Math.max(rect.h, Math.min(min.h, bounds.h)), Math.max(bounds.h, 1)));
  const x = Math.round(Math.min(Math.max(rect.x, GRAB - w), Math.max(bounds.w - GRAB, 0)));
  const y = Math.round(Math.min(Math.max(rect.y, 0), Math.max(bounds.h - 48, 0)));
  return { x, y, w, h };
}

/** Where a window opens the first time: beside the rail, each further one a little lower and to the left. */
export function defaultRect(bounds: Bounds, existing: number): WindowRect {
  const w = Math.min(WINDOW_DEFAULT.w, Math.max(WINDOW_MIN.w, bounds.w - RAIL_ROOM - 32));
  const h = Math.min(WINDOW_DEFAULT.h, Math.max(WINDOW_MIN.h, bounds.h - 140));
  return clampRect({ x: bounds.w - RAIL_ROOM - w - 16 - existing * 28, y: 112 + existing * 28, w, h }, bounds);
}

const without = (list: string[], id: string) => list.filter((x) => x !== id);

export type WindowState = 'closed' | 'floating' | 'docked';

export function windowState(layout: ScopeLayout, id: string): WindowState {
  if (layout.open.includes(id)) return 'floating';
  if (layout.docked.includes(id)) return 'docked';
  return 'closed';
}

/** Whether a window can be seen right now (floating, or the front tab of an open dock). */
export function isShown(layout: ScopeLayout, id: string): boolean {
  if (layout.open.includes(id)) return true;
  return layout.dockOpen && layout.dockActive === id && layout.docked.includes(id);
}

/** Open a window where it was last: floating at its remembered place, or as the dock's front tab. */
export function openWindow(layout: ScopeLayout, id: string, bounds: Bounds): ScopeLayout {
  if (layout.docked.includes(id)) return { ...layout, dockOpen: true, dockActive: id };
  if (layout.open.includes(id)) return { ...layout, open: [...without(layout.open, id), id] };
  const rect = clampRect(layout.rects[id] ?? defaultRect(bounds, layout.open.length), bounds);
  return { ...layout, open: [...layout.open, id], rects: { ...layout.rects, [id]: rect } };
}

/** What a rail button does: show a hidden window, or hide a shown one. */
export function toggleWindow(layout: ScopeLayout, id: string, bounds: Bounds): ScopeLayout {
  if (layout.open.includes(id)) return closeWindow(layout, id);
  if (isShown(layout, id)) return { ...layout, dockOpen: false };
  return openWindow(layout, id, bounds);
}

export function closeWindow(layout: ScopeLayout, id: string): ScopeLayout {
  if (layout.open.includes(id)) return { ...layout, open: without(layout.open, id) };
  if (!layout.docked.includes(id)) return layout;
  const docked = without(layout.docked, id);
  const dockActive = layout.dockActive === id ? (docked[0] ?? null) : layout.dockActive;
  return { ...layout, docked, dockActive, dockOpen: layout.dockOpen && docked.length > 0 };
}

/** Move a floating (or closed) window into the dock, in front. */
export function dockWindow(layout: ScopeLayout, id: string): ScopeLayout {
  const docked = layout.docked.includes(id) ? layout.docked : [...layout.docked, id];
  return { ...layout, open: without(layout.open, id), docked, dockActive: id, dockOpen: true };
}

/** Pop a docked window out into a window over the view. */
export function floatWindow(layout: ScopeLayout, id: string, bounds: Bounds): ScopeLayout {
  const removed = closeWindow(layout, id);
  const rect = clampRect(layout.rects[id] ?? defaultRect(bounds, removed.open.length), bounds);
  return { ...removed, open: [...removed.open, id], rects: { ...removed.rects, [id]: rect } };
}

export function moveWindow(layout: ScopeLayout, id: string, rect: WindowRect): ScopeLayout {
  return { ...layout, rects: { ...layout.rects, [id]: rect } };
}

export function focusWindow(layout: ScopeLayout, id: string): ScopeLayout {
  if (!layout.open.includes(id) || layout.open[layout.open.length - 1] === id) return layout;
  return { ...layout, open: [...without(layout.open, id), id] };
}

export function setDockWidth(layout: ScopeLayout, width: number): ScopeLayout {
  return { ...layout, dockWidth: clampDockWidth(width) };
}

/**
 * Drops windows this view does not have, so a stale saved layout cannot point at nothing, and keeps
 * the dock's front tab valid.
 */
export function sanitize(layout: ScopeLayout, available: string[]): ScopeLayout {
  const known = new Set(available);
  const open = layout.open.filter((id) => known.has(id));
  const docked = layout.docked.filter((id) => known.has(id) && !open.includes(id));
  const dockActive = layout.dockActive && docked.includes(layout.dockActive) ? layout.dockActive : (docked[0] ?? null);
  const dockOpen = layout.dockOpen && docked.length > 0;
  if (open.length === layout.open.length && docked.length === layout.docked.length && dockActive === layout.dockActive && dockOpen === layout.dockOpen) return layout;
  return { ...layout, open, docked, dockActive, dockOpen };
}
