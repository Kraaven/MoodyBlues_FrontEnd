import { describe, expect, it } from 'vitest';
import { sceneTitle } from './format';

describe('sceneTitle', () => {
  const scene = { sceneId: 'guid-1', displayName: null as string | null, unityName: null as string | null };

  it('prefers the name given here, then the Unity name, then the GUID', () => {
    expect(sceneTitle({ ...scene, displayName: 'Mine', unityName: 'Playground' })).toBe('Mine');
    expect(sceneTitle({ ...scene, unityName: 'Playground' })).toBe('Playground');
    expect(sceneTitle(scene)).toBe('guid-1');
  });

  it('ignores blank names', () => {
    expect(sceneTitle({ ...scene, displayName: '  ', unityName: ' Playground ' })).toBe('Playground');
    expect(sceneTitle({ ...scene, displayName: ' ', unityName: '' })).toBe('guid-1');
  });
});
