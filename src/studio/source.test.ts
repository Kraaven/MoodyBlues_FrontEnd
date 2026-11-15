import { describe, expect, it } from 'vitest';
import { isAnonymousPath } from '../api/client';
import { replayPath, sceneRef, type StudioSource } from './source';

const owner: StudioSource = { kind: 'owner', projectId: 'p1', sceneId: 'Main Scene', sessionId: 's1' };
const bare: StudioSource = { kind: 'owner', projectId: 'p1', sceneId: 'Main Scene', sessionId: null };
const share: StudioSource = { kind: 'share', token: 'tok-en_1' };

describe('studio source', () => {
  it('derives owner paths from ids', () => {
    expect(replayPath(owner)).toBe('/api/sessions/s1/replay');
    expect(sceneRef(owner, 'Main Scene', 'abc')).toEqual({ url: '/api/projects/p1/scenes/Main%20Scene/file?hash=abc', hash: 'abc' });
  });
  it('has no replay without a session', () => {
    expect(replayPath(bare)).toBeNull();
  });
  it('derives share paths from the token alone', () => {
    expect(replayPath(share)).toBe('/api/share/tok-en_1/replay');
    expect(sceneRef(share, 'ignored', 'abc')).toEqual({ url: '/api/share/tok-en_1/scene', hash: 'abc' });
  });
  it('treats only share paths as anonymous', () => {
    expect(isAnonymousPath(replayPath(share)!)).toBe(true);
    expect(isAnonymousPath(replayPath(owner)!)).toBe(false);
  });
});
