import { describe, expect, it } from 'vitest';
import {
  clampDockWidth,
  clampRect,
  defaultFloatRect,
  defaultLayout,
  dockPanel,
  floatPanel,
  moveFloating,
  openPanel,
  sanitize,
  type ScopeLayout,
} from './panelLayout';

const bounds = { w: 1000, h: 600 };

describe('clampRect', () => {
  it('leaves a window that already fits alone', () => {
    expect(clampRect({ x: 100, y: 50, w: 300, h: 300 }, bounds)).toEqual({ x: 100, y: 50, w: 300, h: 300 });
  });

  it('pulls a window back when the viewport shrank beneath it', () => {
    const r = clampRect({ x: 900, y: 500, w: 300, h: 300 }, { w: 600, h: 400 });
    expect(r.x).toBeLessThan(600);
    expect(r.y).toBeLessThan(400);
  });

  it('keeps part of the header reachable even when dragged far off', () => {
    const left = clampRect({ x: -5000, y: -5000, w: 300, h: 300 }, bounds);
    expect(left.x + left.w).toBeGreaterThanOrEqual(60);
    expect(left.y).toBe(0);
    const right = clampRect({ x: 5000, y: 5000, w: 300, h: 300 }, bounds);
    expect(right.x).toBeLessThanOrEqual(bounds.w - 60);
    expect(right.y).toBeLessThanOrEqual(bounds.h - 40);
  });

  it('never makes a window bigger than the viewport, or smaller than the minimum', () => {
    const big = clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, bounds);
    expect(big.w).toBeLessThanOrEqual(bounds.w);
    expect(big.h).toBeLessThanOrEqual(bounds.h);
    const small = clampRect({ x: 0, y: 0, w: 10, h: 10 }, bounds);
    expect(small.w).toBeGreaterThanOrEqual(260);
    expect(small.h).toBeGreaterThanOrEqual(180);
  });

  it('copes with a viewport smaller than the minimum window', () => {
    const r = clampRect({ x: 0, y: 0, w: 400, h: 400 }, { w: 120, h: 90 });
    expect(r.w).toBeLessThanOrEqual(120);
    expect(r.h).toBeLessThanOrEqual(90);
  });
});

describe('defaultFloatRect', () => {
  it('lands inside the viewport and staggers each new window', () => {
    const a = defaultFloatRect(bounds, 0);
    const b = defaultFloatRect(bounds, 1);
    expect(a.x + a.w).toBeLessThanOrEqual(bounds.w);
    expect(b.x).toBeLessThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe('layout transitions', () => {
  const docked = ['logs', 'objects', 'details'];

  it('opening a docked panel opens the dock on it', () => {
    const next = openPanel({ ...defaultLayout(), dockOpen: false }, 'objects');
    expect(next.dockOpen).toBe(true);
    expect(next.active).toBe('objects');
  });

  it('floating the front tab hands the front to another tab', () => {
    const start: ScopeLayout = { ...defaultLayout(), active: 'logs' };
    const next = floatPanel(start, 'logs', bounds, docked);
    expect(next.floating.logs).toBeDefined();
    expect(next.active).toBe('objects');
    expect(next.order).toEqual(['logs']);
  });

  it('floating the last docked tab leaves none in front', () => {
    const start: ScopeLayout = { ...defaultLayout(), active: 'logs' };
    expect(floatPanel(start, 'logs', bounds, ['logs']).active).toBeNull();
  });

  it('opening a floating panel brings it to the front instead of docking it', () => {
    let layout = floatPanel({ ...defaultLayout(), active: 'logs' }, 'logs', bounds, docked);
    layout = floatPanel(layout, 'objects', bounds, ['objects', 'details']);
    expect(layout.order).toEqual(['logs', 'objects']);
    const next = openPanel(layout, 'logs');
    expect(next.order).toEqual(['objects', 'logs']);
    expect(next.floating.logs).toBeDefined();
  });

  it('docking a floating panel returns it to the dock, in front', () => {
    const floated = floatPanel({ ...defaultLayout(), active: 'logs', dockOpen: false }, 'logs', bounds, docked);
    const next = dockPanel(floated, 'logs');
    expect(next.floating.logs).toBeUndefined();
    expect(next.order).toEqual([]);
    expect(next.active).toBe('logs');
    expect(next.dockOpen).toBe(true);
  });

  it('moving a window only changes that window', () => {
    const floated = floatPanel({ ...defaultLayout(), active: 'logs' }, 'logs', bounds, docked);
    const next = moveFloating(floated, 'logs', { x: 1, y: 2, w: 300, h: 300 });
    expect(next.floating.logs).toEqual({ x: 1, y: 2, w: 300, h: 300 });
    expect(moveFloating(floated, 'details', { x: 9, y: 9, w: 300, h: 300 })).toBe(floated);
  });
});

describe('sanitize', () => {
  it('drops panels the view no longer has', () => {
    const stale: ScopeLayout = {
      ...defaultLayout(),
      active: 'gone',
      floating: { gone: { x: 0, y: 0, w: 300, h: 300 }, logs: { x: 0, y: 0, w: 300, h: 300 } },
      order: ['gone', 'logs'],
    };
    const next = sanitize(stale, ['logs', 'objects']);
    expect(Object.keys(next.floating)).toEqual(['logs']);
    expect(next.order).toEqual(['logs']);
    expect(next.active).toBe('objects');
  });

  it('returns the same object when nothing needed fixing', () => {
    const layout: ScopeLayout = { ...defaultLayout(), active: 'logs' };
    expect(sanitize(layout, ['logs', 'objects'])).toBe(layout);
  });
});

describe('clampDockWidth', () => {
  it('keeps the dock between 320 and 480 and survives nonsense', () => {
    expect(clampDockWidth(100)).toBe(320);
    expect(clampDockWidth(900)).toBe(480);
    expect(clampDockWidth(400)).toBe(400);
    expect(clampDockWidth(Number.NaN)).toBe(360);
  });
});
