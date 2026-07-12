import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Pencil, X } from 'lucide-react';
import type { ProjectScene } from '../lib/types';
import { formatDate } from '../lib/format';
import { SceneStatusChip } from './StatusChip';
import { IconButton } from './ui/Button';

interface SceneCardProps {
  projectId: string;
  scene: ProjectScene;
  onRename: (sceneId: string, displayName: string) => Promise<void>;
}

export function SceneCard({ projectId, scene, onRename }: SceneCardProps) {
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

  const cardContent = (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface px-4 py-3.5 transition hover:border-hairline-strong hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            autoFocus
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full rounded-lg border border-accent/40 bg-canvas-raised px-2 py-1 text-sm text-ink outline-none"
          />
        ) : (
          <div className="flex items-center gap-2.5">
            <p className="truncate text-sm font-medium text-ink">{scene.displayName ?? scene.sceneId}</p>
            <SceneStatusChip status={scene.processingStatus} />
          </div>
        )}
        {scene.displayName && !isEditing && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">{scene.sceneId}</p>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">Updated {formatDate(scene.updatedAtUtc)}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {isEditing ? (
          <>
            <IconButton
              size="sm"
              variant="accent"
              disabled={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                void save();
              }}
              title="Save"
            >
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(false);
              }}
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startEditing();
              }}
              title="Rename"
            >
              <Pencil className="h-4 w-4" />
            </IconButton>
            <ChevronRight className="h-4 w-4 text-ink-faint" />
          </>
        )}
      </div>
    </div>
  );

  if (isEditing) {
    return cardContent;
  }

  return <Link to={`/projects/${projectId}/scenes/${encodeURIComponent(scene.sceneId)}`}>{cardContent}</Link>;
}
