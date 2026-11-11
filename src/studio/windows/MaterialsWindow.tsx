import { useMemo } from 'react';
import * as THREE from 'three';
import { colorHex, inspectScene, materialRows } from '../../inspector/inspection';
import { cn } from '../../ui/cn';
import { plural } from '../../lib/format';
import { useStudio } from '../studioStore';
import { EmptyNote, Row, TextureThumb, WindowContext } from './parts';

function shaderName(material: THREE.Material): string {
  if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return 'Physical / PBR';
  if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return 'Standard / PBR';
  if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) return 'Unlit';
  return material.type.replace('Mesh', '').replace('Material', '');
}

/** Every material in the scene, most used first; the chosen one's properties below the list. */
export function MaterialsWindow({ sceneName }: { sceneName: string }) {
  const master = useStudio((s) => s.master);
  const materialId = useStudio((s) => s.materialId);
  const setMaterial = useStudio((s) => s.setMaterial);
  const inspection = useMemo(() => (master ? inspectScene(master) : null), [master]);

  if (!inspection) return <EmptyNote>The scene is still loading.</EmptyNote>;
  if (inspection.materials.length === 0) return <EmptyNote>This scene has no materials.</EmptyNote>;

  const chosen = inspection.materials.find((m) => m.material.uuid === materialId) ?? inspection.materials[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-5">
        <div className="px-2">
          <WindowContext left={plural(inspection.materials.length, 'material')} right={`Scene / ${sceneName}`} />
        </div>
        <ul className="space-y-1">
          {inspection.materials.map(({ material, users }) => {
            const color = colorHex(material, 'color');
            const map = (material as THREE.MeshStandardMaterial).map;
            const active = material === chosen.material;
            return (
              <li key={material.uuid}>
                <button
                  type="button"
                  onClick={() => setMaterial(material.uuid)}
                  onDoubleClick={() => users[0] && useStudio.getState().select(users[0])}
                  aria-pressed={active}
                  className={cn('flex w-full items-center gap-4 rounded-[8px] px-3 py-3 text-left transition-colors duration-[120ms]', active ? 'bg-accent/16' : 'hover:bg-ink-3')}
                >
                  {map ? (
                    <TextureThumb texture={map} size={44} className="rounded-[6px]" />
                  ) : (
                    <span className="h-11 w-11 shrink-0 rounded-[6px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]" style={{ background: color ?? '#555' }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[15px]', active ? 'text-accent' : 'text-fg')}>{material.name || '(unnamed material)'}</span>
                    <span className="block text-[13px] text-fg-3">{plural(users.length, 'object')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-rule px-6 py-5">
        <p className="mb-3 truncate text-[17px] text-fg">{chosen.material.name || '(unnamed material)'}</p>
        <dl>
          <Row label="Shader">{shaderName(chosen.material)}</Row>
          {materialRows(chosen.material)
            .filter((r) => r.label !== 'Name' && r.label !== 'Type')
            .map((row) => (
              <Row key={row.label} label={row.label}>
                <span className="inline-flex items-center justify-end gap-2">
                  {row.swatch && <span className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]" style={{ background: row.swatch }} />}
                  {row.texture && <TextureThumb texture={row.texture} size={20} max={64} className="rounded-[4px]" />}
                  <span className="truncate">{row.value}</span>
                </span>
              </Row>
            ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {chosen.users.slice(0, 10).map((mesh) => (
            <button
              key={mesh.uuid}
              type="button"
              onClick={() => useStudio.getState().select(mesh)}
              className="max-w-full truncate rounded-[5px] border border-rule-strong px-2 py-0.5 text-[12px] text-fg-2 transition-colors hover:border-accent/60 hover:text-fg"
            >
              {mesh.name || 'mesh'}
            </button>
          ))}
          {chosen.users.length > 10 && <span className="py-0.5 text-[12px] text-fg-3">and {chosen.users.length - 10} more</span>}
        </div>
      </div>
    </div>
  );
}
