import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { navigationHints, POINTER_HINTS, TOUCH_HINTS } from '../studio/navigationHints';
import { combinedProgress, playLabel, railGroups } from './welcome';

describe('playLabel', () => {
  it('names the start time only when there is one', () => {
    expect(playLabel(0)).toBe('Play');
    expect(playLabel(83)).toBe('Play from 01:23');
  });
});

describe('combinedProgress', () => {
  const dl = (received: number, total: number | null) => ({ label: 'x', received, total });
  it('averages the parts, counting finished ones whole', () => {
    expect(combinedProgress([{ done: true, download: null }, { done: false, download: dl(50, 100) }])).toBe(0.75);
    expect(combinedProgress([{ done: false, download: dl(25, 100) }, { done: false, download: null }])).toBe(0.125);
  });
  it('is indeterminate while a running part has no size', () => {
    expect(combinedProgress([{ done: true, download: null }, { done: false, download: dl(10, null) }])).toBeNull();
  });
});

describe('railGroups', () => {
  const win = (id: string, group: string, description?: string) => ({ id, group, title: id, icon: Box, description });
  it('groups windows as the rail does, tools last, and skips undescribed entries', () => {
    const groups = railGroups(
      [win('hier', 'scene', 'a'), win('logs', 'recordings', 'b'), win('quiet', 'scene')],
      [
        { id: 'debug', label: 'Debug', icon: Box, description: 'd' },
        { id: 'frame', label: 'Frame', icon: Box, description: 'c' },
      ],
    );
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([['logs'], ['hier'], ['debug', 'frame']]);
  });
});

describe('navigationHints', () => {
  it('picks the list for the input', () => {
    expect(navigationHints(true)).toBe(TOUCH_HINTS);
    expect(navigationHints(false)).toBe(POINTER_HINTS);
  });
});
