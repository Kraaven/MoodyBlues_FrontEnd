import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  closeWindow,
  defaultLayout,
  dockWindow,
  floatWindow,
  focusWindow,
  moveWindow,
  openWindow,
  sanitize,
  setDockWidth,
  toggleWindow,
  type Bounds,
  type ScopeLayout,
  type WindowRect,
} from './windowLayout';

/** Storage that never throws: private mode or a full disk just means the layout is not remembered. */
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not remembered */
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
  },
};

interface WindowsState {
  /** One layout per kind of view ('scene', 'session'), remembered between visits. */
  scopes: Record<string, ScopeLayout>;
  /** The size of the area windows float in, kept by the host so actions from anywhere can place windows. */
  bounds: Bounds;
  update: (scope: string, change: (layout: ScopeLayout) => ScopeLayout) => void;
  setBounds: (bounds: Bounds) => void;
}

export const useWindows = create<WindowsState>()(
  persist(
    (set) => ({
      scopes: {},
      bounds: { w: 1200, h: 800 },
      update: (scope, change) =>
        set((state) => {
          const current = state.scopes[scope] ?? defaultLayout(DEFAULT_DOCKED[scope]);
          const next = change(current);
          return next === current ? state : { scopes: { ...state.scopes, [scope]: next } };
        }),
      setBounds: (bounds) => set({ bounds }),
    }),
    { name: 'moodyblues.windows.v2', version: 2, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ scopes: s.scopes }) },
  ),
);

/** What is docked the first time a kind of view is opened: a session starts with its events beside it. */
const DEFAULT_DOCKED: Record<string, string[]> = { session: ['events'] };

/** The layout for a scope, cleaned against the windows this view actually has. */
export function useWindowLayout(scope: string, available: string[]): ScopeLayout {
  const saved = useWindows((s) => s.scopes[scope]);
  return sanitize(saved ?? defaultLayout(DEFAULT_DOCKED[scope]), available);
}

/** Actions on a scope's layout. */
export function windowActions(scope: string) {
  const { update } = useWindows.getState();
  const bounds = () => useWindows.getState().bounds;
  return {
    open: (id: string) => update(scope, (l) => openWindow(l, id, bounds())),
    toggle: (id: string) => update(scope, (l) => toggleWindow(l, id, bounds())),
    close: (id: string) => update(scope, (l) => closeWindow(l, id)),
    dock: (id: string) => update(scope, (l) => dockWindow(l, id)),
    float: (id: string) => update(scope, (l) => floatWindow(l, id, bounds())),
    move: (id: string, rect: WindowRect) => update(scope, (l) => moveWindow(l, id, rect)),
    focus: (id: string) => update(scope, (l) => focusWindow(l, id)),
    setDockOpen: (dockOpen: boolean) => update(scope, (l) => ({ ...l, dockOpen: dockOpen && l.docked.length > 0 })),
    toggleDock: () => update(scope, (l) => ({ ...l, dockOpen: !l.dockOpen && l.docked.length > 0 })),
    setDockActive: (id: string) => update(scope, (l) => ({ ...l, dockActive: id, dockOpen: true })),
    setDockWidth: (width: number) => update(scope, (l) => setDockWidth(l, width)),
    reset: () => update(scope, () => defaultLayout(DEFAULT_DOCKED[scope])),
  };
}
