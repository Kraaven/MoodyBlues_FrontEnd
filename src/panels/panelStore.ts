import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  defaultLayout,
  dockPanel,
  floatPanel,
  moveFloating,
  openPanel,
  sanitize,
  setDockWidth,
  type Bounds,
  type FloatRect,
  type ScopeLayout,
} from './panelLayout';

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

interface PanelsState {
  /** One layout per kind of view ('player', 'inspector'), remembered between visits. */
  scopes: Record<string, ScopeLayout>;
  update: (scope: string, change: (layout: ScopeLayout) => ScopeLayout) => void;
}

export const usePanels = create<PanelsState>()(
  persist(
    (set) => ({
      scopes: {},
      update: (scope, change) =>
        set((state) => {
          const current = state.scopes[scope] ?? defaultLayout();
          const next = change(current);
          return next === current ? state : { scopes: { ...state.scopes, [scope]: next } };
        }),
    }),
    { name: 'moodyblues.panels.v1', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ scopes: s.scopes }) },
  ),
);

const FALLBACK = defaultLayout();

/** The layout for a scope, cleaned against the panels this view actually has. */
export function usePanelLayout(scope: string, available: string[]): ScopeLayout {
  const saved = usePanels((s) => s.scopes[scope]) ?? FALLBACK;
  return sanitize(saved, available);
}

/** Actions on a scope's layout. */
export function panelActions(scope: string) {
  const update = usePanels.getState().update;
  return {
    open: (id: string) => update(scope, (l) => openPanel(l, id)),
    float: (id: string, bounds: Bounds, docked: string[]) => update(scope, (l) => floatPanel(l, id, bounds, docked)),
    dock: (id: string) => update(scope, (l) => dockPanel(l, id)),
    close: (id: string) => update(scope, (l) => ({ ...dockPanel(l, id), dockOpen: l.dockOpen })),
    move: (id: string, rect: FloatRect) => update(scope, (l) => moveFloating(l, id, rect)),
    focus: (id: string) => update(scope, (l) => openPanel(l, id)),
    setDockOpen: (dockOpen: boolean) => update(scope, (l) => ({ ...l, dockOpen })),
    toggleDock: () => update(scope, (l) => ({ ...l, dockOpen: !l.dockOpen })),
    setDockWidth: (width: number) => update(scope, (l) => setDockWidth(l, width)),
    setActive: (active: string) => update(scope, (l) => ({ ...l, active, dockOpen: true })),
    toggleRail: () => update(scope, (l) => ({ ...l, railExpanded: !l.railExpanded })),
    reset: () => update(scope, () => defaultLayout()),
  };
}
