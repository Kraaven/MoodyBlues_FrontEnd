import { describe, expect, it } from 'vitest';
import {
  clampDockWidth,
  clampRect,
  closeWindow,
  defaultLayout,
  dockWindow,
  floatWindow,
  fromFrame,
  isShown,
  openWindow,
  sanitize,
  toFrame,
  toggleWindow,
  windowState,
} from './windowLayout';

const BOUNDS = { w: 1400, h: 900 };

describe('window layout', () => {
  it('opens a window floating beside the rail the first time, and remembers where it was', () => {
    let l = openWindow(defaultLayout(), 'materials', BOUNDS);
    expect(windowState(l, 'materials')).toBe('floating');
    const rect = l.rects.materials;
    expect(rect.anchor).toBe('right');
    const frame = toFrame(rect, BOUNDS);
    expect(frame.x + frame.w).toBeLessThanOrEqual(BOUNDS.w - 88);
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
    const frame = toFrame({ anchor: 'left', offset: 1300, y: 860, w: 380, h: 500 }, { w: 800, h: 600 });
    expect(frame.x).toBeLessThanOrEqual(800 - 72);
    expect(frame.y).toBeLessThanOrEqual(600 - 48);
    expect(frame.h).toBeLessThanOrEqual(600);
    expect(clampRect({ x: -900, y: -5, w: 380, h: 300 }, BOUNDS).x).toBeGreaterThanOrEqual(72 - 380);
  });

  it('a right-anchored window follows the right edge when the view shrinks', () => {
    const rect = openWindow(defaultLayout(), 'materials', BOUNDS).rects.materials;
    const wide = toFrame(rect, BOUNDS);
    const narrow = toFrame(rect, { w: BOUNDS.w - 380, h: BOUNDS.h });
    expect(BOUNDS.w - (wide.x + wide.w)).toBe(rect.offset);
    expect(BOUNDS.w - 380 - (narrow.x + narrow.w)).toBe(rect.offset);
  });

  it('a left-anchored window stays put when the view shrinks', () => {
    const rect = { anchor: 'left' as const, offset: 40, y: 100, w: 300, h: 400 };
    expect(toFrame(rect, BOUNDS).x).toBe(40);
    expect(toFrame(rect, { w: 900, h: 900 }).x).toBe(40);
  });

  it('anchors to the edge nearer the window centre when a drag ends', () => {
    const left = fromFrame({ x: 100, y: 50, w: 300, h: 400 }, BOUNDS);
    expect(left).toMatchObject({ anchor: 'left', offset: 100 });
    const right = fromFrame({ x: 1000, y: 50, w: 300, h: 400 }, BOUNDS);
    expect(right).toMatchObject({ anchor: 'right', offset: 100 });
    expect(toFrame(right, BOUNDS).x).toBe(1000);
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
