import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBytes, plural } from '../../lib/format';
import { collectTextures, TEXTURE_CHANNELS } from '../inspection';
import { useInspector } from '../inspectorStore';
import { EmptyNote, Rows, TextureThumb } from './shared';

const channelLabel = (key: string) => TEXTURE_CHANNELS.find((c) => c.key === key)?.label ?? key;

/** Every texture once, largest first, with where it is used and what it costs in GPU memory. */
export function TexturesPanel() {
  const root = useInspector((s) => s.root);
  const select = useInspector((s) => s.select);
  const textures = useMemo(() => (root ? collectTextures(root) : null), [root]);
  const [open, setOpen] = useState<string | null>(null);

  if (!textures) return <EmptyNote>The scene is still loading.</EmptyNote>;
  if (textures.length === 0) return <EmptyNote>This scene has no textures.</EmptyNote>;
  const total = textures.reduce((n, t) => n + t.bytes, 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="border-b border-rule px-3 py-2 text-[12px] text-fg-3">
        {plural(textures.length, 'texture')} · about {formatBytes(total)} on the GPU
      </p>
      <div className="space-y-1.5 p-3">
        {textures.map((t) => {
          const isOpen = open === t.id;
          return (
            <div key={t.id} className="rounded-[var(--radius-card)] border border-rule bg-ink-2/50">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                <TextureThumb texture={t.texture} size={40} label={`${t.name} preview`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{t.name}</span>
                  <span className="tabular text-[12px] text-fg-3">
                    {t.width > 0 ? `${t.width}×${t.height}` : 'size unknown'} · {formatBytes(t.bytes)}
                  </span>
                </span>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-fg-3" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-3" />}
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-rule px-3 py-3">
                  <Rows
                    rows={[
                      ['Format', t.compressed ? 'Compressed (GPU)' : 'Decoded image'],
                      ['Color space', t.colorSpace],
                      ['Wrap', `${t.texture.wrapS === 1000 ? 'repeat' : 'clamp/mirror'}`],
                    ]}
                  />
                  <ul className="space-y-1 text-[12px]">
                    {t.uses.slice(0, 10).map((use, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => select(use.mesh)} className="text-left text-fg-2 hover:text-fg">
                          <span className="text-fg-3">{channelLabel(use.channel)}</span> · {use.materialName} · {use.mesh.name || 'mesh'}
                        </button>
                      </li>
                    ))}
                    {t.uses.length > 10 && <li className="text-fg-3">and {t.uses.length - 10} more</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
