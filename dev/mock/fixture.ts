/**
 * A synthetic recording for the dev mock backend. It matches the scene GLB in glb.mjs (object ids
 * 1 to 7) and exercises every feature of the player: smooth moving objects, a rotation, a spawn and
 * its delete, logs of every level and colour, a disconnect span and a data gap.
 *
 * Run by Node directly (type stripping), so it uses erasable syntax only.
 */
import { buildReplay } from '../../src/viewer/replay/testReplay.ts';
import type { TestTrack } from '../../src/viewer/replay/testReplay.ts';

export const FIXTURE_DURATION = 180;

const LOGS = [
  { time: 0.4, level: 1, color: 0, text: 'Scene loaded: Arena' },
  { time: 3.2, level: 1, color: 9, text: 'Player spawned at (0, 0, 0)' },
  { time: 12.0, level: 1, color: 0, text: 'Checkpoint 1 reached' },
  { time: 19.9, level: 1, color: 12, text: 'Beacon requested' },
  { time: 31.5, level: 2, color: 4, text: 'Frame time above 22 ms for 40 frames' },
  { time: 47.0, level: 1, color: 6, text: 'Crate_B pushed by player' },
  { time: 62.4, level: 3, color: 2, text: 'NullReferenceException: Crate_C.target is not set' },
  { time: 77.0, level: 1, color: 0, text: 'Checkpoint 2 reached' },
  { time: 98.6, level: 2, color: 4, text: 'Network latency high: 480 ms' },
  { time: 121.0, level: 1, color: 14, text: 'Boss phase 2 started' },
  { time: 133.7, level: 3, color: 2, text: 'Fell out of the world: Crate_A y = -41.2' },
  { time: 164.0, level: 1, color: 0, text: 'Session complete' },
];

function circle(): TestTrack {
  const times: number[] = [];
  const values: number[] = [];
  const slopes: number[] = [];
  const w = 0.5;
  for (let t = 0; t <= FIXTURE_DURATION; t += 0.5) {
    times.push(t);
    values.push(2.5 * Math.cos(w * t), 0.6 + 0.2 * Math.sin(2 * w * t), 2.5 * Math.sin(w * t));
    slopes.push(-2.5 * w * Math.sin(w * t), 0.4 * w * Math.cos(2 * w * t), 2.5 * w * Math.cos(w * t));
  }
  return { objectId: 3, channel: 0, times, values, inTangents: slopes, outTangents: slopes };
}

function slide(): TestTrack {
  const times: number[] = [];
  const values: number[] = [];
  const slopes: number[] = [];
  for (let t = 0; t <= FIXTURE_DURATION; t += 0.5) {
    times.push(t);
    values.push(-3 + 1.5 * Math.sin(0.3 * t), 0.5, 1.5);
    slopes.push(0.45 * Math.cos(0.3 * t), 0, 0);
  }
  return { objectId: 4, channel: 0, times, values, inTangents: slopes, outTangents: slopes };
}

function spin(): TestTrack {
  const times: number[] = [];
  const values: number[] = [];
  const slopes: number[] = [];
  const rate = 0.8;
  for (let t = 0; t <= FIXTURE_DURATION; t += 0.5) {
    const a = rate * t;
    times.push(t);
    values.push(0, Math.sin(a / 2), 0, Math.cos(a / 2));
    slopes.push(0, 0.5 * rate * Math.cos(a / 2), 0, -0.5 * rate * Math.sin(a / 2));
  }
  return { objectId: 5, channel: 1, times, values, inTangents: slopes, outTangents: slopes };
}

/** The spawned beacon drops in at 20 s, settles, and is deleted at 60 s. */
function beacon(): TestTrack {
  return {
    objectId: 8,
    channel: 0,
    times: [20, 22, 40, 60],
    values: [1, 7, -1, 1, 0.6, -1, 1, 0.6, 1, 1, 0.6, 1],
    inTangents: [0, 0, 0, 0, -3, 0, 0, 0, 0.1, 0, 0, 0],
    outTangents: [0, -3, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0],
  };
}

export function makeFixtureReplay(): ArrayBuffer {
  return buildReplay({
    duration: FIXTURE_DURATION,
    objects: [
      { id: 1, kind: 0 },
      { id: 2, kind: 0 },
      { id: 3, kind: 0 },
      { id: 4, kind: 0 },
      { id: 5, kind: 0 },
      { id: 6, kind: 0 },
      { id: 7, kind: 0 },
      { id: 8, kind: 1, template: 7, parent: 0, spawn: 20, del: 60 },
    ],
    events: [
      { time: 0, type: 16, objectId: 0, a: 0 },
      { time: 20, type: 1, objectId: 8, a: 7 },
      { time: 60, type: 2, objectId: 8 },
      { time: 100, type: 17, objectId: 0 },
      { time: 108, type: 16, objectId: 0, a: 1 },
      { time: 140, type: 19, objectId: 0 },
      { time: 180, type: 18, objectId: 0 },
    ],
    logs: LOGS,
    blocks: [{ start: 0, tracks: [circle(), slide(), spin(), beacon()] }],
  });
}

export const FIXTURE_LOG_COUNTS = {
  info: LOGS.filter((l) => l.level === 1).length,
  warning: LOGS.filter((l) => l.level === 2).length,
  error: LOGS.filter((l) => l.level === 3).length,
};
