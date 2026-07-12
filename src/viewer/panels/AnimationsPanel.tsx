import { Pause, Play } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

function formatTime(t: number): string {
  return `${t.toFixed(2)}s`;
}

export function AnimationsPanel() {
  const clips = useViewerStore((s) => s.clips);
  const currentClipIndex = useViewerStore((s) => s.currentClipIndex);
  const setClipIndex = useViewerStore((s) => s.setClipIndex);
  const isPlaying = useViewerStore((s) => s.isPlaying);
  const play = useViewerStore((s) => s.play);
  const pause = useViewerStore((s) => s.pause);
  const currentTime = useViewerStore((s) => s.currentTime);
  const duration = useViewerStore((s) => s.duration);
  const requestSeek = useViewerStore((s) => s.requestSeek);

  if (clips.length === 0) {
    return <p className="text-center text-sm text-zinc-500">This model has no animations.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-600">Clips ({clips.length})</p>
        <div className="space-y-1">
          {clips.map((clip, index) => (
            <button
              key={clip.uuid}
              type="button"
              onClick={() => setClipIndex(index)}
              className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition ${
                index === currentClipIndex ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              {clip.name || `Clip ${index + 1}`}
              <span className="ml-1.5 text-[10px] text-zinc-500">{formatTime(clip.duration)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => (isPlaying ? pause() : play())}
            className="flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-400"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <span className="text-[10px] text-zinc-500">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => requestSeek(Number(e.target.value))}
          className="w-full accent-violet-400"
        />
      </div>
    </div>
  );
}
