import { Chip } from './ui/Chip';
import type { ChipTone } from './ui/Chip';
import type { SceneProcessingStatus, SessionStatus } from '../lib/types';

const STATUS_CONFIG: Record<SceneProcessingStatus, { label: string; tone: ChipTone }> = {
  Ready: { label: 'Optimized', tone: 'success' },
  Processing: { label: 'Optimizing', tone: 'warning' },
  Pending: { label: 'Queued', tone: 'neutral' },
  Failed: { label: 'Optimization failed', tone: 'danger' },
};

export function SceneStatusChip({ status }: { status: SceneProcessingStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.Pending;
  return (
    <Chip tone={config.tone} dot>
      {config.label}
    </Chip>
  );
}

const SESSION_STATUS_CONFIG: Record<SessionStatus, { label: string; tone: ChipTone }> = {
  Recording: { label: 'Recording', tone: 'warning' },
  Queued: { label: 'Queued', tone: 'neutral' },
  Compiling: { label: 'Compiling', tone: 'warning' },
  Ready: { label: 'Ready', tone: 'success' },
  Failed: { label: 'Failed', tone: 'danger' },
};

export function SessionStatusChip({ status }: { status: SessionStatus }) {
  const config = SESSION_STATUS_CONFIG[status] ?? SESSION_STATUS_CONFIG.Queued;
  return (
    <Chip tone={config.tone} dot>
      {config.label}
    </Chip>
  );
}
