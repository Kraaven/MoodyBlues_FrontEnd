import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, Pencil, X } from 'lucide-react';
import type { ProjectScene } from '../lib/types';

interface SceneRowProps {
  projectId: string;
  scene: ProjectScene;
  onRename: (sceneId: string, displayName: string) => Promise<void>;
}

export function SceneRow({ projectId, scene, onRename }: SceneRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(scene.displayName ?? scene.sceneId);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setValue(scene.displayName ?? scene.sceneId);
    setIsEditing(true);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await onRename(scene.sceneId, value.trim());
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void save();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#131317] px-4 py-3">
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full rounded-md border border-violet-400/50 bg-black/30 px-2 py-1 text-sm text-white outline-none"
          />
        ) : (
          <>
            <p className="truncate font-medium text-white">{scene.displayName ?? scene.sceneId}</p>
            {scene.displayName && <p className="truncate text-xs text-zinc-500">Original: {scene.sceneId}</p>}
          </>
        )}
        <p className="mt-0.5 text-xs text-zinc-500">Updated {new Date(scene.updatedAtUtc).toLocaleString()}</p>
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              disabled={isSaving}
              onClick={save}
              className="rounded-md p-2 text-emerald-400 transition hover:bg-white/10 disabled:opacity-50"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startEditing}
              className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              title="Rename"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <Link
              to={`/projects/${projectId}/scenes/${encodeURIComponent(scene.sceneId)}/view`}
              className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              title="View"
            >
              <Eye className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
