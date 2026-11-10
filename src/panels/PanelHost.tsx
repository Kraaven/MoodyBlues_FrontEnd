import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronsLeft, ChevronsRight, PanelRightClose, PanelRightDashed, PanelRightOpen, X } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { SegmentTabs } from '../ui/Tabs';
import { cn } from '../ui/cn';
import { clampRect, type FloatRect } from './panelLayout';
import { panelActions, usePanelLayout } from './panelStore';

export interface PanelDef {
  id: string;
  title: string;
  /** A shorter name for the dock's tabs, where space is tight. */
  short?: string;
  icon: LucideIcon;
  /** Short text beside the title, such as a count. */
  badge?: string;
  /** Shown in the rail tooltip. */
  shortcut?: string;
  render: () => ReactNode;
}

/** The rail: one icon per panel, down the left edge of the viewport (DESIGN.md 9.1). */
export function PanelRail({ scope, panels }: { scope: string; panels: PanelDef[] }) {
  const layout = usePanelLayout(scope, panels.map((p) => p.id));
  const actions = panelActions(scope);

  return (
    <nav
      aria-label="Panels"
      className="glass elevated pointer-events-auto absolute left-3 top-3 z-20 flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-rule p-1"
    >
      {panels.map((p) => {
        const floating = Boolean(layout.floating[p.id]);
        const shown = floating || (layout.dockOpen && layout.active === p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-label={p.title}
            aria-pressed={shown}
            title={p.shortcut ? `${p.title} (${p.shortcut})` : p.title}
            onClick={() => (shown && !floating ? actions.setDockOpen(false) : actions.open(p.id))}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-[var(--radius-control)] px-2 text-[13px] transition-colors duration-[120ms]',
              shown ? 'bg-blue/18 text-blue-bright' : 'text-fg-2 hover:bg-ink-2 hover:text-fg',
            )}
          >
            <p.icon className="h-4 w-4 shrink-0" />
            {layout.railExpanded && <span className="pr-1">{p.title}</span>}
          </button>
        );
      })}
      <button
        type="button"
        aria-label={layout.railExpanded ? 'Collapse the rail' : 'Expand the rail'}
        aria-pressed={layout.railExpanded}
        title="Labels (P)"
        onClick={actions.toggleRail}
        className="mt-0.5 flex h-7 items-center justify-center rounded-[var(--radius-control)] text-fg-3 transition-colors hover:text-fg"
      >
        {layout.railExpanded ? <ChevronsLeft className="h-3.5 w-3.5" /> : <ChevronsRight className="h-3.5 w-3.5" />}
      </button>
    </nav>
  );
}

/** The docked column (DESIGN.md 9.2): tabs for the panels that are not floating. */
export function PanelDock({ scope, panels, bounds }: { scope: string; panels: PanelDef[]; bounds: () => { w: number; h: number } }) {
  const layout = usePanelLayout(scope, panels.map((p) => p.id));
  const actions = panelActions(scope);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const docked = panels.filter((p) => !layout.floating[p.id]);
  const active = docked.find((p) => p.id === layout.active) ?? docked[0];

  if (!layout.dockOpen || !active) return null;

  return (
    <aside
      aria-label="Panel dock"
      style={{ ['--dock-w' as string]: `${layout.dockWidth}px` }}
      className={cn(
        'glass relative flex shrink-0 flex-col border-rule',
        'max-md:h-[44dvh] max-md:w-full max-md:border-t',
        'md:w-[var(--dock-w)] md:border-l',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the dock"
        tabIndex={0}
        className="absolute -left-1 inset-y-0 z-10 hidden w-2 cursor-col-resize hover:bg-blue/30 focus-visible:bg-blue/30 md:block"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, width: layout.dockWidth };
        }}
        onPointerMove={(e) => drag.current && actions.setDockWidth(drag.current.width + (drag.current.x - e.clientX))}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') actions.setDockWidth(layout.dockWidth + 16);
          else if (e.key === 'ArrowRight') actions.setDockWidth(layout.dockWidth - 16);
          else return;
          e.preventDefault();
        }}
      />
      <div className="flex items-center gap-1.5 border-b border-rule p-2">
        <SegmentTabs
          className="min-w-0 flex-1 overflow-x-auto"
          value={active.id}
          onChange={actions.setActive}
          items={docked.map((p) => ({ id: p.id, label: p.short ?? p.title }))}
        />
        <IconButton label="Float this panel" size="sm" onClick={() => actions.float(active.id, bounds(), docked.map((p) => p.id))}>
          <PanelRightDashed className="h-4 w-4" />
        </IconButton>
        <IconButton label="Collapse the dock" shortcut="\" size="sm" onClick={() => actions.setDockOpen(false)}>
          <PanelRightClose className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{active.render()}</div>
    </aside>
  );
}

/** A button that brings back a collapsed dock. */
export function DockReveal({ scope, panels }: { scope: string; panels: PanelDef[] }) {
  const layout = usePanelLayout(scope, panels.map((p) => p.id));
  const actions = panelActions(scope);
  const hasDocked = panels.some((p) => !layout.floating[p.id]);
  if (layout.dockOpen || !hasDocked) return null;
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-20">
      <IconButton label="Show the dock" shortcut="\" size="sm" className="glass elevated border border-rule" onClick={() => actions.setDockOpen(true)}>
        <PanelRightOpen className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

const STEP = 16;

/** Panels popped out of the dock, as windows over the viewport that can be moved and resized. */
export function FloatingPanels({ scope, panels }: { scope: string; panels: PanelDef[] }) {
  const layout = usePanelLayout(scope, panels.map((p) => p.id));
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBounds({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bounds.w > 0 &&
        layout.order.map((id, z) => {
          const panel = panels.find((p) => p.id === id);
          const rect = layout.floating[id];
          if (!panel || !rect) return null;
          return <FloatingWindow key={id} scope={scope} panel={panel} rect={clampRect(rect, bounds)} bounds={bounds} z={z} />;
        })}
    </div>
  );
}

function FloatingWindow({ scope, panel, rect, bounds, z }: { scope: string; panel: PanelDef; rect: FloatRect; bounds: { w: number; h: number }; z: number }) {
  const actions = panelActions(scope);
  const [live, setLive] = useState<FloatRect | null>(null);
  const gesture = useRef<{ kind: 'move' | 'resize'; x: number; y: number; start: FloatRect } | null>(null);
  const shown = live ?? rect;

  const begin = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind, x: e.clientX, y: e.clientY, start: rect };
    actions.focus(panel.id);
  };
  const track = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    setLive(clampRect(g.kind === 'move' ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy } : { ...g.start, w: g.start.w + dx, h: g.start.h + dy }, bounds));
  };
  const end = () => {
    if (gesture.current && live) actions.move(panel.id, live);
    gesture.current = null;
    setLive(null);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!e.altKey) return;
    const delta = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
    if (!delta) return;
    e.preventDefault();
    actions.move(panel.id, clampRect(e.shiftKey ? { ...rect, w: rect.w + delta[0], h: rect.h + delta[1] } : { ...rect, x: rect.x + delta[0], y: rect.y + delta[1] }, bounds));
  };

  return (
    <section
      aria-label={`${panel.title} window`}
      onPointerDown={() => actions.focus(panel.id)}
      className="glass elevated pointer-events-auto absolute flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-rule"
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: z + 1 }}
    >
      <header
        tabIndex={0}
        aria-label={`${panel.title}. Alt+arrows move this window, Alt+Shift+arrows resize it.`}
        onPointerDown={begin('move')}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        className="flex h-9 shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b border-rule px-3 active:cursor-grabbing"
      >
        <panel.icon className="h-4 w-4 text-fg-3" />
        <span className="flex-1 truncate text-[13px] font-medium text-fg">{panel.title}</span>
        <IconButton label="Dock this panel" size="sm" className="h-7 w-7" onClick={() => actions.dock(panel.id)}>
          <PanelRightOpen className="h-4 w-4" />
        </IconButton>
        <IconButton label="Close this panel" size="sm" className="h-7 w-7" onClick={() => actions.close(panel.id)}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{panel.render()}</div>
      <div
        role="presentation"
        onPointerDown={begin('resize')}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-fg-3" aria-hidden="true">
          <path d="M14 6L6 14M14 10l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </section>
  );
}
