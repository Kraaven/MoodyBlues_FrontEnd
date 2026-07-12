import { Chip } from './ui/Chip';
import type { ChipTone } from './ui/Chip';
import type { SceneProcessingStatus } from '../lib/types';

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
