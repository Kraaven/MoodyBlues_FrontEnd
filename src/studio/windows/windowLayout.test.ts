import { describe, expect, it } from 'vitest';
import {
  clampDockWidth,
  clampRect,
  closeWindow,
  defaultLayout,
  dockWindow,
  floatWindow,
  isShown,
  openWindow,
  sanitize,
  toggleWindow,
  windowState,
} from './windowLayout';

const BOUNDS = { w: 1400, h: 900 };

describe('window layout', () => {
  it('opens a window floating beside the rail the first time, and remembers where it was', () => {
    let l = openWindow(defaultLayout(), 'materials', BOUNDS);
    expect(windowState(l, 'materials')).toBe('floating');
    const rect = l.rects.materials;
    expect(rect.x + rect.w).toBeLessThanOrEqual(BOUNDS.w - 88);
    l = closeWindow(l, 'materials');
    expect(windowState(l, 'materials')).toBe('closed');
    l = openWindow(l, 'materials', BOUNDS);
    expect(l.rects.materials).toEqual(rect);
  });

  it('toggles from the rail: hidden to shown and back, for floating and docked windows', () => {
    let l = toggleWindow(defaultLayout(), 'hierarchy', BOUNDS);
    expect(isShown(l, 'hierarchy')).toBe(true);
    l = toggleWindow(l, 'hierarchy', BOUNDS);
    expect(isShown(l, 'hierarchy')).toBe(false);

    l = dockWindow(l, 'events');
    expect(isShown(l, 'events')).toBe(true);
    l = toggleWindow(l, 'events', BOUNDS);
    expect(isShown(l, 'events')).toBe(false);
    expect(windowState(l, 'events')).toBe('docked');
    l = toggleWindow(l, 'events', BOUNDS);
    expect(isShown(l, 'events')).toBe(true);
  });

  it('moves windows between the dock and the view', () => {
    let l = openWindow(defaultLayout(), 'materials', BOUNDS);
    l = dockWindow(l, 'materials');
    expect(l.open).toEqual([]);
    expect(l.docked).toEqual(['materials']);
    expect(l.dockActive).toBe('materials');
    l = floatWindow(l, 'materials', BOUNDS);
    expect(l.docked).toEqual([]);
    expect(l.open).toEqual(['materials']);
    expect(l.dockOpen).toBe(false);
  });

  it('keeps a window reachable after the view shrinks', () => {
    const rect = clampRect({ x: 1300, y: 860, w: 380, h: 500 }, { w: 800, h: 600 });
    expect(rect.x).toBeLessThanOrEqual(800 - 72);
    expect(rect.y).toBeLessThanOrEqual(600 - 48);
    expect(rect.h).toBeLessThanOrEqual(600);
  });

  it('drops windows the view does not have', () => {
    const l = sanitize({ ...defaultLayout(['events', 'raw']), open: ['gone', 'materials'] }, ['materials', 'events']);
    expect(l.open).toEqual(['materials']);
    expect(l.docked).toEqual(['events']);
    expect(l.dockActive).toBe('events');
  });

  it('clamps the dock width', () => {
    expect(clampDockWidth(100)).toBe(320);
    expect(clampDockWidth(9000)).toBe(520);
  });
});
