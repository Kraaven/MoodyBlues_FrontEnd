import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { plural } from '../../lib/format';
import { colorHex, inspectScene, materialRows, type MaterialRow } from '../inspection';
import { useInspector } from '../inspectorStore';
import { EmptyNote, Rows, Swatch, TextureThumb } from './shared';

function rowValue(row: MaterialRow): React.ReactNode {
  if (row.texture) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className="truncate">{row.value}</span>
        <TextureThumb texture={row.texture} size={28} label={`${row.label} preview`} />
      </span>
    );
  }
  if (row.swatch) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Swatch color={row.swatch} />
        {row.value}
      </span>
    );
  }
  return row.value;
}

/** Every material, with its properties; a row opens to show them and the meshes that use it. */
export function MaterialsPanel() {
  const root = useInspector((s) => s.root);
  const select = useInspector((s) => s.select);
  const inspection = useMemo(() => (root ? inspectScene(root) : null), [root]);
  const [open, setOpen] = useState<string | null>(null);

  if (!inspection) return <EmptyNote>The scene is still loading.</EmptyNote>;
  if (inspection.materials.length === 0) return <EmptyNote>This scene has no materials.</EmptyNote>;

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
      {inspection.materials.map(({ material, users }) => {
        const color = colorHex(material, 'color');
        const isOpen = open === material.uuid;
        return (
          <div key={material.uuid} className="rounded-[var(--radius-card)] border border-rule bg-ink-2/50">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : material.uuid)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
              <span
                className="h-7 w-7 shrink-0 rounded-full border border-white/15"
                style={{ background: color ?? 'repeating-conic-gradient(#273866 0% 25%, #151e36 0% 50%) 50% / 8px 8px' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{material.name || '(unnamed material)'}</span>
                <span className="text-[12px] text-fg-3">
                  {material.type.replace('Mesh', '').replace('Material', '')} · used by {plural(users.length, 'mesh', 'meshes')}
                </span>
              </span>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-fg-3" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-3" />}
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-rule px-3 py-3">
                <Rows
                  rows={materialRows(material).map((row): [string, React.ReactNode] => [row.label, rowValue(row)])}
                />
                <div className="flex flex-wrap gap-1.5">
                  {users.slice(0, 12).map((mesh) => (
                    <button
                      key={mesh.uuid}
                      type="button"
                      onClick={() => select(mesh)}
                      className="max-w-full truncate rounded-[5px] border border-rule-strong px-1.5 py-0.5 text-[11px] text-fg-2 hover:border-blue-bright/60 hover:text-fg"
                    >
                      {mesh.name || 'mesh'}
                    </button>
                  ))}
                  {users.length > 12 && <span className="text-[11px] text-fg-3">and {users.length - 12} more</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
