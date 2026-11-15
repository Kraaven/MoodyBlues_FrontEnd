import { useStage } from './store';
import { cn } from '../ui/cn';

/**
 * The element that takes the pointer for the Stage (DESIGN.md 4.1). The canvas sits behind the page,
 * so a view puts one of these where the 3D should respond to dragging and clicking, and the orbit
 * controls and object picking listen on it. The default fills the window behind the view's content,
 * so the content above it should leave `pointer-events: none` wherever the 3D should show through.
 */
export function StageSurface({ className }: { className?: string }) {
  const setSurface = useStage((s) => s.setSurface);
  return <div ref={setSurface} aria-hidden="true" className={cn('touch-none', className ?? 'fixed inset-0 z-0')} />;
}
