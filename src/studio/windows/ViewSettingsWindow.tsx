import { Keyboard, LayoutPanelLeft } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Field';
import { useStudio, type ViewSettings } from '../studioStore';
import { windowActions } from './windowStore';
import { Rule, SectionTitle, WindowBody, WindowFooter } from './parts';

const TOGGLES: { key: keyof Omit<ViewSettings, 'fov'>; label: string }[] = [
  { key: 'grid', label: 'Grid' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'wireframe', label: 'Wireframe' },
  { key: 'axes', label: 'Axis helper' },
];

/** How the scene is drawn here. Display only: none of it changes the scene's data. */
export function ViewSettingsWindow({ scope }: { scope: string }) {
  const settings = useStudio((s) => s.settings);
  const setSetting = useStudio((s) => s.setSetting);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WindowBody>
        <SectionTitle>Display</SectionTitle>
        <div className="space-y-1">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex h-12 cursor-pointer items-center justify-between">
              <span className="text-[15px] text-fg">{t.label}</span>
              <Toggle checked={settings[t.key]} onChange={(v) => setSetting(t.key, v)} label={t.label} />
            </label>
          ))}
        </div>
        <Rule />
        <SectionTitle>Camera</SectionTitle>
        <div className="flex h-12 items-center justify-between">
          <span className="text-[15px] text-fg-2">Projection</span>
          <span className="text-[15px] text-fg">Perspective</span>
        </div>
        <div className="flex h-12 items-center justify-between gap-6">
          <label htmlFor="fov" className="shrink-0 text-[15px] text-fg-2">
            Field of view
          </label>
          <input
            id="fov"
            type="range"
            min={20}
            max={90}
            step={1}
            value={settings.fov}
            onChange={(e) => setSetting('fov', Number(e.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="tabular w-10 text-right font-mono text-[14px] text-fg">{settings.fov}°</span>
        </div>
        <Rule />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => windowActions(scope).reset()}>
            <LayoutPanelLeft className="h-4 w-4" />
            Reset windows
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useStudio.getState().setShortcutsOpen(true)}>
            <Keyboard className="h-4 w-4" />
            Shortcuts
          </Button>
        </div>
      </WindowBody>
      <WindowFooter className="font-sans text-[13px]">Display only. Scene data is never changed.</WindowFooter>
    </div>
  );
}
