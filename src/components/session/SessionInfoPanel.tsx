import { X } from 'lucide-react';

interface SessionInfoPanelProps {
  objectId: number;
  name: string;
  posX: number;
  posY: number;
  posZ: number;
  onClose: () => void;
}

function formatFloat(f: number): string {
  return f.toFixed(3);
}

export function SessionInfoPanel({ objectId, name, posX, posY, posZ, onClose }: SessionInfoPanelProps) {
  return (
    <div className="absolute right-4 top-4 z-20 w-56 rounded-2xl border border-white/10 bg-block-navy/90 p-4 shadow-2xl backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">Object info</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-0.5 text-white/30 transition hover:bg-white/5 hover:text-white/70"
          aria-label="Close info panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wide text-white/30">Object ID</p>
          <p className="font-mono text-xs text-white/80">{objectId}</p>
        </div>
        {name && (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wide text-white/30">Name</p>
            <p className="truncate text-xs text-white/70">{name}</p>
          </div>
        )}
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wide text-white/30">Position</p>
          <p className="font-mono text-[11px] tabular-nums text-white/60">
            [{formatFloat(posX)}, {formatFloat(posY)}, {formatFloat(posZ)}]
          </p>
        </div>
      </div>
    </div>
  );
}
