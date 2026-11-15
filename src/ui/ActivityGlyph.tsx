import type { SessionActivity, SessionSummary } from '../api/types';
import { plural } from '../lib/format';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

const GLYPH_WIDTH = 160;
const GLYPH_HEIGHT = 22;

interface Props {
  session: SessionSummary;
  className?: string;
}

/**
 * A strip that is the miniature timeline of one session, drawn from the activity the backend
 * computed when it built the replay: keyframe activity over time, with errors, warnings, spawns
 * and gaps where they occurred. A session with no replay (or none yet) shows its state instead.
 */
export function ActivityGlyph({ session, className }: Props) {
  const activity = session.status === 'Ready' ? session.activity : null;
  const label = activity ? describeActivity(session) : describeUnavailable(session);

  return (
    <Tooltip content={label}>
      <svg
        role="img"
        aria-label={label}
        width={GLYPH_WIDTH}
        height={GLYPH_HEIGHT}
        viewBox={`0 0 ${GLYPH_WIDTH} ${GLYPH_HEIGHT}`}
        className={cn('shrink-0 overflow-visible', className)}
      >
        <rect x="0" y="0" width={GLYPH_WIDTH} height={GLYPH_HEIGHT} rx="3" className="fill-ink-0/70" />
        {activity ? <Timeline activity={activity} /> : <Unavailable status={session.status} />}
      </svg>
    </Tooltip>
  );
}

function describeActivity(s: SessionSummary): string {
  return `Timeline of the whole session: ${plural(s.errorLogCount, 'error')}, ${plural(s.warningLogCount, 'warning')}, ${plural(s.spawnCount, 'spawn')}.`;
}

function describeUnavailable(s: SessionSummary): string {
  switch (s.status) {
    case 'Recording':
      return 'Still being recorded.';
    case 'Failed':
      return 'No replay: the build failed.';
    case 'WaitingForScene':
      return 'No replay yet: waiting for its scene version.';
    default:
      return 'Building the replay.';
  }
}

function Unavailable({ status }: { status: SessionSummary['status'] }) {
  const colour = status === 'Recording' ? 'stroke-live' : status === 'Failed' ? 'stroke-danger' : status === 'WaitingForScene' ? 'stroke-wait' : 'stroke-work';
  return (
    <line
      x1="6"
      y1={GLYPH_HEIGHT / 2}
      x2={GLYPH_WIDTH - 6}
      y2={GLYPH_HEIGHT / 2}
      strokeWidth="1.5"
      strokeDasharray={status === 'Recording' ? '2 3' : '1 4'}
      strokeLinecap="round"
      className={cn(colour, 'opacity-70', status === 'Recording' && 'animate-pulse')}
    />
  );
}

function Timeline({ activity: t }: { activity: SessionActivity }) {
  const inner = GLYPH_WIDTH - 4;
  const bars = t.bins.length;
  const barW = inner / bars;
  const x = (fraction: number) => 2 + fraction * inner;

  return (
    <g>
      {t.gaps.map(([a, b], i) => (
        <rect key={`g${i}`} x={x(a)} y="2" width={Math.max(1.5, (b - a) * inner)} height={GLYPH_HEIGHT - 4} className="fill-wait" opacity="0.28" />
      ))}
      {t.bins.map((v, i) => {
        const h = 2 + v * (GLYPH_HEIGHT - 10);
        return <rect key={i} x={2 + i * barW + 0.4} y={GLYPH_HEIGHT - 3 - h} width={Math.max(1, barW - 0.8)} height={h} className="fill-fg-2" opacity={0.35 + v * 0.55} />;
      })}
      {t.spawns.map((p, i) => (
        <line key={`s${i}`} x1={x(p)} x2={x(p)} y1="2" y2="6" strokeWidth="1" className="stroke-accent" />
      ))}
      {t.warnings.map((p, i) => (
        <circle key={`w${i}`} cx={x(p)} cy="5" r="2" className="fill-caution" />
      ))}
      {t.errors.map((p, i) => (
        <path key={`e${i}`} d={`M${x(p) - 2.2} 2.8 L${x(p) + 2.2} 7.2 M${x(p) + 2.2} 2.8 L${x(p) - 2.2} 7.2`} strokeWidth="1.5" strokeLinecap="round" className="stroke-danger" />
      ))}
    </g>
  );
}
