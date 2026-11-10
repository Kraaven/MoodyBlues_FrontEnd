import type { SessionSummary } from '../api/types';
import { formatCount, plural } from '../lib/format';
import type { GlyphTimeline } from '../viewer/replay/glyphTimeline';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

export const GLYPH_WIDTH = 160;
export const GLYPH_HEIGHT = 20;

interface Props {
  session: SessionSummary;
  /** The longest session in the list, so widths compare. */
  longestSeconds: number;
  /** When known, the glyph is a true miniature timeline. */
  timeline?: GlyphTimeline | null;
  className?: string;
}

/**
 * A strip that is the shape of one session. It has two honest forms:
 *
 * - **Summary** (from the list data alone): width is the duration against the longest session,
 *   with a density fill from keyframes per second and the log counts as a stripe along the bottom.
 *   It carries no positions, so it never claims to say when anything happened.
 * - **Timeline** (once the session's replay has been read in this browser): the actual miniature,
 *   with errors, warnings, spawns and gaps where they occurred.
 */
export function ActivityGlyph({ session, longestSeconds, timeline, className }: Props) {
  const ready = session.status === 'Ready';
  const label = ready ? (timeline ? describeTimeline(session) : describeSummary(session)) : describeUnavailable(session);

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
        <rect x="0" y="0" width={GLYPH_WIDTH} height={GLYPH_HEIGHT} rx="3" className="fill-ink-2" />
        {!ready ? <Unavailable status={session.status} /> : timeline ? <TimelineForm timeline={timeline} /> : <SummaryForm session={session} longestSeconds={longestSeconds} />}
      </svg>
    </Tooltip>
  );
}

function describeSummary(s: SessionSummary): string {
  const parts = [`${formatCount(s.keyframeCount)} keyframes`];
  if (s.errorLogCount) parts.push(plural(s.errorLogCount, 'error'));
  if (s.warningLogCount) parts.push(plural(s.warningLogCount, 'warning'));
  return `Summary: ${parts.join(', ')}. Open the session to see when.`;
}

function describeTimeline(s: SessionSummary): string {
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
  const colour = status === 'Recording' ? 'stroke-live' : status === 'Failed' ? 'stroke-danger' : status === 'WaitingForScene' ? 'stroke-wait' : 'stroke-blue-bright';
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

function SummaryForm({ session: s, longestSeconds }: { session: SessionSummary; longestSeconds: number }) {
  const share = longestSeconds > 0 ? Math.max(0.14, Math.min(1, s.durationSeconds / longestSeconds)) : 1;
  const width = Math.round((GLYPH_WIDTH - 4) * share);
  // Keyframes per second, mapped so a typical busy scene reads as solid and an idle one as faint.
  const density = s.durationSeconds > 0 ? Math.min(1, Math.max(0.2, s.keyframeCount / s.durationSeconds / 60)) : 0.2;

  const logs = s.errorLogCount + s.warningLogCount + s.infoLogCount;
  const errorW = logs ? (width * s.errorLogCount) / logs : 0;
  const warnW = logs ? (width * s.warningLogCount) / logs : 0;

  return (
    <g>
      <rect x="2" y="2" width={width} height={GLYPH_HEIGHT - 8} rx="2" className="fill-blue" opacity={0.25 + density * 0.6} />
      <rect x="2" y={GLYPH_HEIGHT - 5} width={width} height="3" rx="1.5" className="fill-ink-3" />
      {errorW > 0 && <rect x="2" y={GLYPH_HEIGHT - 5} width={Math.max(2, errorW)} height="3" rx="1.5" className="fill-danger" />}
      {warnW > 0 && <rect x={2 + errorW} y={GLYPH_HEIGHT - 5} width={Math.max(2, warnW)} height="3" rx="1.5" className="fill-caution" />}
    </g>
  );
}

function TimelineForm({ timeline: t }: { timeline: GlyphTimeline }) {
  const inner = GLYPH_WIDTH - 4;
  const bars = t.activity.length;
  const barW = inner / bars;
  const x = (fraction: number) => 2 + fraction * inner;

  return (
    <g>
      {t.gaps.map(([a, b], i) => (
        <rect key={`g${i}`} x={x(a)} y="2" width={Math.max(1.5, (b - a) * inner)} height={GLYPH_HEIGHT - 4} className="fill-wait" opacity="0.28" />
      ))}
      {t.activity.map((v, i) => {
        const h = 2 + v * (GLYPH_HEIGHT - 10);
        return <rect key={i} x={2 + i * barW + 0.4} y={GLYPH_HEIGHT - 3 - h} width={Math.max(1, barW - 0.8)} height={h} className="fill-blue" opacity={0.35 + v * 0.55} />;
      })}
      {t.spawns.map((p, i) => (
        <line key={`s${i}`} x1={x(p)} x2={x(p)} y1="2" y2="6" strokeWidth="1" className="stroke-blue-bright" />
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
