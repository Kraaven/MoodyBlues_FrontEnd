import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ExternalLink, GripHorizontal, PanelRight, X } from 'lucide-react';
import { IconButton } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { clampRect, isShown, type WindowRect } from './windowLayout';
import { useWindowLayout, useWindows, windowActions } from './windowStore';

export interface WindowDef {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Rail buttons are grouped; a rule separates the groups. */
  group: 'scene' | 'session';
  shortcut?: string;
  render: () => ReactNode;
}

/** The tool rail: one icon per window, floating at the right edge of the view. */
export function WindowRail({ scope, windows, className }: { scope: string; windows: WindowDef[]; className?: string }) {
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const actions = windowActions(scope);
  const phone = useMediaQuery('(max-width: 767px)');
  const groups = (['scene', 'session'] as const).map((g) => windows.filter((w) => w.group === g)).filter((g) => g.length > 0);

  return (
    <nav
      aria-label="Tools"
      className={cn(
        'glass elevated pointer-events-auto flex gap-1 rounded-[12px] border border-rule-strong/60 p-1.5',
        phone ? 'flex-row overflow-x-auto' : 'flex-col',
        className,
      )}
    >
      {groups.map((group, gi) => (
        <div key={gi} className={cn('flex gap-1', phone ? 'flex-row' : 'flex-col', gi > 0 && (phone ? 'border-l border-rule pl-1' : 'border-t border-rule pt-1'))}>
          {group.map((w) => {
            const shown = isShown(layout, w.id);
            return (
              <Tooltip key={w.id} side={phone ? 'top' : 'left'} content={w.shortcut ? `${w.title} (${w.shortcut})` : w.title}>
                <button
                  type="button"
                  aria-label={w.title}
                  aria-pressed={shown}
                  onClick={() => actions.toggle(w.id)}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-[140ms]',
                    shown ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg',
                  )}
                >
                  <w.icon className="h-[19px] w-[19px]" strokeWidth={1.6} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** The window chrome shared by floating windows and the dock: a title, a grip, and its controls. */
function WindowHeader({
  title,
  onClose,
  onToggleDock,
  docked,
  grip,
  dragProps,
}: {
  title: ReactNode;
  onClose: () => void;
  onToggleDock?: () => void;
  docked: boolean;
  grip: boolean;
  dragProps?: React.HTMLAttributes<HTMLElement>;
}) {
  return (
    <header
      {...dragProps}
      className={cn(
        'relative flex h-[52px] shrink-0 select-none items-center gap-2 border-b border-rule bg-ink-3/70 pl-5 pr-2',
        grip && 'cursor-grab touch-none active:cursor-grabbing',
      )}
    >
      <div className="min-w-0 flex-1 truncate text-[16px] font-medium text-fg">{title}</div>
      {grip && <GripHorizontal aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-fg-3/70" />}
      {onToggleDock && (
        <IconButton label={docked ? 'Float this window' : 'Dock to the side'} size="sm" onClick={onToggleDock}>
          {docked ? <ExternalLink className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
        </IconButton>
      )}
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X className="h-[18px] w-[18px]" />
      </IconButton>
    </header>
  );
}

/** Floating windows, over the 3D view. On a phone each is a sheet from the bottom instead. */
export function FloatingWindows({ scope, windows }: { scope: string; windows: WindowDef[] }) {
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const ref = useRef<HTMLDivElement>(null);
  const bounds = useWindows((s) => s.bounds);
  const phone = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => useWindows.getState().setBounds({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const open = layout.open.map((id) => windows.find((w) => w.id === id)).filter((w): w is WindowDef => Boolean(w));

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {phone
        ? open.slice(-1).map((w) => <PhoneSheet key={w.id} scope={scope} window={w} />)
        : open.map((w, z) => <FloatingWindow key={w.id} scope={scope} window={w} rect={clampRect(layout.rects[w.id] ?? { x: 24, y: 120, w: 380, h: 520 }, bounds)} bounds={bounds} z={z} />)}
    </div>
  );
}

const STEP = 16;

function FloatingWindow({ scope, window: w, rect, bounds, z }: { scope: string; window: WindowDef; rect: WindowRect; bounds: { w: number; h: number }; z: number }) {
  const actions = windowActions(scope);
  const [live, setLive] = useState<WindowRect | null>(null);
  const gesture = useRef<{ kind: 'move' | 'resize'; x: number; y: number; start: WindowRect } | null>(null);
  const shown = live ?? rect;

  const begin = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind, x: e.clientX, y: e.clientY, start: rect };
    actions.focus(w.id);
  };
  const track = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    setLive(clampRect(g.kind === 'move' ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy } : { ...g.start, w: g.start.w + dx, h: g.start.h + dy }, bounds));
  };
  const end = () => {
    if (gesture.current && live) actions.move(w.id, live);
    gesture.current = null;
    setLive(null);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!e.altKey) return;
    const delta = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
    if (!delta) return;
    e.preventDefault();
    actions.move(w.id, clampRect(e.shiftKey ? { ...rect, w: rect.w + delta[0], h: rect.h + delta[1] } : { ...rect, x: rect.x + delta[0], y: rect.y + delta[1] }, bounds));
  };

  return (
    <section
      aria-label={`${w.title} window`}
      onPointerDown={() => actions.focus(w.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'elevated pointer-events-auto absolute flex animate-[window-in_220ms_var(--ease-out-soft)] flex-col overflow-hidden rounded-[12px] border border-rule-strong/60 bg-ink-1',
        live && 'shadow-[0_30px_60px_-12px_rgb(0_0_0/0.7)]',
      )}
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: z + 1 }}
    >
      <WindowHeader
        title={w.title}
        grip
        docked={false}
        onClose={() => actions.close(w.id)}
        onToggleDock={() => actions.dock(w.id)}
        dragProps={{
          tabIndex: 0,
          'aria-label': `${w.title}. Alt+arrows move this window, Alt+Shift+arrows resize it.`,
          onPointerDown: begin('move'),
          onPointerMove: track,
          onPointerUp: end,
          onPointerCancel: end,
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col">{w.render()}</div>
      <div role="presentation" onPointerDown={begin('resize')} onPointerMove={track} onPointerUp={end} onPointerCancel={end} className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none">
        <svg viewBox="0 0 16 16" className="h-5 w-5 text-fg-3/70" aria-hidden="true">
          <path d="M13 7L7 13M13 10.5L10.5 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </section>
  );
}

function PhoneSheet({ scope, window: w }: { scope: string; window: WindowDef }) {
  const actions = windowActions(scope);
  return (
    <section aria-label={`${w.title} window`} className="pointer-events-auto absolute inset-x-0 bottom-0 flex h-[62%] animate-rise flex-col overflow-hidden rounded-t-[16px] border-t border-rule-strong bg-ink-1">
      <WindowHeader title={w.title} grip={false} docked={false} onClose={() => actions.close(w.id)} />
      <div className="flex min-h-0 flex-1 flex-col">{w.render()}</div>
    </section>
  );
}

/** The dock: a column at the right edge holding windows as tabs. */
export function WindowDock({ scope, windows }: { scope: string; windows: WindowDef[] }) {
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const actions = windowActions(scope);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const docked = layout.docked.map((id) => windows.find((w) => w.id === id)).filter((w): w is WindowDef => Boolean(w));
  const active = docked.find((w) => w.id === layout.dockActive) ?? docked[0];
  const open = layout.dockOpen && Boolean(active);

  return (
    <aside
      aria-label="Docked windows"
      aria-hidden={!open}
      style={{ width: open ? layout.dockWidth : 0 }}
      className={cn('relative h-full shrink-0 overflow-hidden transition-[width] duration-[320ms] ease-[var(--ease-out-soft)] max-md:hidden', !open && 'pointer-events-none')}
    >
      <div className="absolute inset-y-0 left-0 flex flex-col border-l border-rule-strong/60 bg-ink-1 backdrop-blur-md" style={{ width: layout.dockWidth }}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the dock"
          tabIndex={open ? 0 : -1}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/30 focus-visible:bg-accent/30"
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
        {active && (
          <>
            <WindowHeader
              docked
              grip={false}
              onClose={() => actions.close(active.id)}
              onToggleDock={() => actions.float(active.id)}
              title={
                docked.length === 1 ? (
                  active.title
                ) : (
                  <div role="tablist" className="-ml-1 flex gap-1 overflow-x-auto">
                    {docked.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        role="tab"
                        aria-selected={w.id === active.id}
                        onClick={() => actions.setDockActive(w.id)}
                        className={cn(
                          'h-8 shrink-0 rounded-[6px] px-2.5 text-[14px] transition-colors',
                          w.id === active.id ? 'bg-ink-4 text-fg' : 'text-fg-3 hover:text-fg',
                        )}
                      >
                        {w.title}
                      </button>
                    ))}
                  </div>
                )
              }
            />
            <div className="flex min-h-0 flex-1 flex-col">{active.render()}</div>
          </>
        )}
      </div>
    </aside>
  );
}
