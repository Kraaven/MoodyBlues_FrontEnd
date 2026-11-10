import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCount, plural } from '../../lib/format';
import { collectGeometries } from '../inspection';
import { useInspector } from '../inspectorStore';
import { EmptyNote, Rows } from './shared';

/** Every geometry once, largest first, with its attributes and the meshes that share it. */
export function GeometriesPanel() {
  const root = useInspector((s) => s.root);
  const select = useInspector((s) => s.select);
  const geometries = useMemo(() => (root ? collectGeometries(root) : null), [root]);
  const [open, setOpen] = useState<string | null>(null);

  if (!geometries) return <EmptyNote>The scene is still loading.</EmptyNote>;
  if (geometries.length === 0) return <EmptyNote>This scene has no geometry.</EmptyNote>;

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
      {geometries.map((g) => {
        const isOpen = open === g.id;
        return (
          <div key={g.id} className="rounded-[var(--radius-card)] border border-rule bg-ink-2/50">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{g.name}</span>
                <span className="tabular text-[12px] text-fg-3">
                  {formatCount(g.vertexCount)} vertices · {formatCount(g.triangleCount)} triangles · {plural(g.meshes.length, 'mesh', 'meshes')}
                </span>
              </span>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-fg-3" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-3" />}
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-rule px-3 py-3">
                <Rows
                  rows={[
                    ['Indexed', g.indexed ? 'Yes' : 'No'],
                    ['Instanced', g.instanced ? 'Yes' : 'No'],
                    ...g.attributes.map((a): [string, string] => [a.name, `${a.itemSize} × ${formatCount(a.count)}`]),
                  ]}
                />
                <div className="flex flex-wrap gap-1.5">
                  {g.meshes.slice(0, 12).map((mesh) => (
                    <button
                      key={mesh.uuid}
                      type="button"
                      onClick={() => select(mesh)}
                      className="max-w-full truncate rounded-[5px] border border-rule-strong px-1.5 py-0.5 text-[11px] text-fg-2 hover:border-blue-bright/60 hover:text-fg"
                    >
                      {mesh.name || 'mesh'}
                    </button>
                  ))}
                  {g.meshes.length > 12 && <span className="text-[11px] text-fg-3">and {g.meshes.length - 12} more</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
