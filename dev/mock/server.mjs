// A stand-in for the MoodyBlues backend, only for developing and screenshotting the dashboard.
// It speaks just enough of the real API (see MoodyBlues_Backend/README.md) and keeps its state in
// memory, so create, rename, rotate, recompile and delete all behave. Any email and password work.
//
//   npm run mock        listens on http://localhost:8765 (the dashboard's default API address)
import http from 'node:http';
import zlib from 'node:zlib';
import { makeGlb } from './glb.mjs';
import { FIXTURE_DURATION, FIXTURE_LOG_COUNTS, makeFixtureReplay } from './fixture.ts';

const PORT = Number(process.env.MOCK_PORT ?? 8765);
const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
const DAY = 60 * 24;

const GLB = makeGlb();
const REPLAY_GZ = zlib.gzipSync(Buffer.from(makeFixtureReplay()));
const HOST = 'moodyblues.kraaven.net';

// ---- State -----------------------------------------------------------------------------------

const version = (n, current, minutesAgo, sessions, extra = {}) => ({
  version: n,
  hash: `${n.toString(16).padStart(2, '0')}${'ab'.repeat(31)}`,
  uploadedAtUtc: iso(minutesAgo),
  isCurrent: current,
  sizeBytes: 18_400_000 - n * 900_000,
  processingStatus: 'Ready',
  errorMessage: null,
  skippedMeshCount: current ? 12 : 0,
  trackedObjectCount: 412 + n * 9,
  sessionCount: sessions,
  sessionBytes: sessions * 640_000,
  ...extra,
});

const fixtureLogs = { infoLogCount: FIXTURE_LOG_COUNTS.info, warningLogCount: FIXTURE_LOG_COUNTS.warning, errorLogCount: FIXTURE_LOG_COUNTS.error };
const session = (id, minutesAgo, status, extra = {}) => ({
  id,
  sceneId: 'scene-forest',
  sceneHash: `03${'ab'.repeat(31)}`,
  createdAtUtc: iso(minutesAgo),
  status,
  endedCleanly: true,
  durationSeconds: FIXTURE_DURATION,
  objectCount: 8,
  spawnCount: 1,
  keyframeCount: 1100,
  replaySizeBytes: REPLAY_GZ.length,
  rawLogSizeBytes: 2_100_000,
  sceneVersion: 3,
  errorMessage: null,
  ...fixtureLogs,
  ...extra,
});

const state = {
  projects: [
    { id: 'p1', name: 'Hollow Forest VR', developerId: 'dev1', createdAtUtc: iso(DAY * 12), ingestKeyPrefix: 'mbk_Q7xZ2a', ingestKeyCreatedAtUtc: iso(DAY * 12), key: 'mbk_Q7xZ2aLk9WmN3pRtV8yBc4dFh6JsUe1o' },
    { id: 'p2', name: 'Orbital Courier', developerId: 'dev1', createdAtUtc: iso(DAY * 4), ingestKeyPrefix: null, ingestKeyCreatedAtUtc: null, key: null },
    { id: 'p3', name: 'QA sandbox', developerId: 'dev1', createdAtUtc: iso(DAY * 30), ingestKeyPrefix: 'mbk_A1b2C3', ingestKeyCreatedAtUtc: iso(DAY * 30), key: 'mbk_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6' },
  ],
  // sceneId -> { projectId, detail }
  scenes: new Map(),
  sessions: [
    session('s1', 2, 'Recording', { durationSeconds: 95, endedCleanly: false, replaySizeBytes: 0, infoLogCount: 0, warningLogCount: 0, errorLogCount: 0 }),
    session('s2', 20, 'Compiling', { replaySizeBytes: 0 }),
    session('s3', 140, 'Ready'),
    session('s4', 1500, 'Ready', { errorLogCount: 0, warningLogCount: 0, endedCleanly: false }),
    session('s5', 3000, 'Failed', { errorMessage: 'The raw log ended before the first BeginSession.', replaySizeBytes: 0, infoLogCount: 0, warningLogCount: 0, errorLogCount: 0 }),
    session('s6', 5000, 'Ready', { spawnCount: 0 }),
    session('s7', 9, 'WaitingForScene', { sceneVersion: null, replaySizeBytes: 0, infoLogCount: 0, warningLogCount: 0, errorLogCount: 0 }),
  ],
};

state.scenes.set('scene-forest', {
  projectId: 'p1',
  detail: {
    developerId: 'dev1',
    sceneId: 'scene-forest',
    displayName: 'ForestLevel',
    createdAtUtc: iso(DAY * 10),
    updatedAtUtc: iso(300),
    current: version(3, true, 300, 6),
    archived: [version(2, false, 3000, 14), version(1, false, 9000, 3)],
    awaitingSceneSessionCount: 1,
    totalBytes: 61_000_000,
  },
});
state.scenes.set('6f1c2b9e4d0a47a2b1c3d4e5f6a7b8c9', {
  projectId: 'p1',
  detail: { developerId: 'dev1', sceneId: '6f1c2b9e4d0a47a2b1c3d4e5f6a7b8c9', displayName: null, createdAtUtc: iso(DAY * 9), updatedAtUtc: iso(9000), current: version(1, true, 9000, 0, { skippedMeshCount: 0, sizeBytes: 3_100_000 }), archived: [], awaitingSceneSessionCount: 0, totalBytes: 3_100_000 },
});
['Harbor', 'Cavern', 'Rooftops', 'Menu', 'Tutorial'].forEach((name, i) => {
  const id = `qa-${name.toLowerCase()}`;
  state.scenes.set(id, {
    projectId: 'p3',
    detail: { developerId: 'dev1', sceneId: id, displayName: name, createdAtUtc: iso(DAY * 20), updatedAtUtc: iso(500 + i * 700), current: version(1 + (i % 3), true, 500 + i * 700, 0, { skippedMeshCount: 0 }), archived: [], awaitingSceneSessionCount: 0, totalBytes: 9_000_000 },
  });
});

// ---- Helpers ---------------------------------------------------------------------------------

const projectSummary = (p) => ({
  id: p.id,
  name: p.name,
  developerId: p.developerId,
  createdAtUtc: p.createdAtUtc,
  sceneCount: [...state.scenes.values()].filter((s) => s.projectId === p.id).length,
  ingestKeyPrefix: p.ingestKeyPrefix,
  ingestKeyCreatedAtUtc: p.ingestKeyCreatedAtUtc,
});

const sceneRow = ({ detail }) => ({
  sceneId: detail.sceneId,
  displayName: detail.displayName,
  updatedAtUtc: detail.updatedAtUtc,
  latestHash: detail.current?.hash ?? '',
  sizeBytes: detail.current?.sizeBytes ?? 0,
  processingStatus: detail.current?.processingStatus ?? 'Ready',
  revisionCount: 1 + detail.archived.length,
  currentVersion: detail.current?.version ?? 0,
});

const projectDetail = (p) => ({
  ...projectSummary(p),
  scenes: [...state.scenes.values()].filter((s) => s.projectId === p.id).map(sceneRow).sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc)),
  connectionString: p.key ? `https://${p.key}@${HOST}` : null,
});

const sessionDetail = (s) => ({
  ...s,
  developerId: 'dev1',
  lastActivityUtc: iso(1),
  connectionCount: 2,
  rawEventCount: 1_200_000,
  deltaPromotions: 3,
  hardClamps: 0,
  droppedEvents: 0,
  compilerVersion: 3,
  compiledAtUtc: s.status === 'Ready' ? iso(100) : null,
});

const sessionsFor = (url) => {
  if (url.searchParams.get('awaitingScene')) return state.sessions.filter((s) => s.status === 'WaitingForScene');
  const v = Number(url.searchParams.get('version'));
  if (v === 3) return state.sessions.filter((s) => s.sceneVersion === 3);
  return state.sessions.slice(2, 5).map((s, i) => ({ ...s, id: `old-${v}-${i}`, sceneVersion: v }));
};

function send(res, code, body, headers = {}) {
  const isJson = body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string';
  res.writeHead(code, { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers });
  res.end(body === undefined ? undefined : isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    return {};
  }
}

// ---- Routes ----------------------------------------------------------------------------------

http
  .createServer(async (req, res) => {
    const origin = req.headers.origin || 'http://localhost:5173';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-MoodyBlues-Client',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    };
    if (req.method === 'OPTIONS') return send(res, 204, undefined, cors);

    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const m = req.method;
    const authed = (req.headers.cookie || '').includes('mb=1');
    const ok = (body, extra = {}) => send(res, 200, body, { ...cors, ...extra });
    const noContent = () => send(res, 204, undefined, cors);
    const notFound = () => send(res, 404, 'Not found.', { ...cors, 'Content-Type': 'application/json' });

    if (p === '/auth/login' || p === '/auth/register') {
      // Like the real backend: generic failures that do not say which part was wrong.
      const { email, password } = await readBody(req);
      const json = { ...cors, 'Content-Type': 'application/json' };
      if (p === '/auth/login' && password === 'wrong-password') return send(res, 401, '"Wrong email or password."', json);
      if (p === '/auth/register' && email === 'taken@studio.dev') return send(res, 400, '"Could not create the account."', json);
      return ok({ userId: 'u1', email: email || 'ada@studio.dev' }, { 'Set-Cookie': 'mb=1; Path=/; SameSite=Lax' });
    }
    if (p === '/auth/me') return authed ? ok({ userId: 'u1', email: 'ada@studio.dev' }) : send(res, 401, '"no"', { ...cors, 'Content-Type': 'application/json' });
    if (p === '/auth/refresh') return send(res, 401, '"no"', { ...cors, 'Content-Type': 'application/json' });
    if (p === '/auth/logout') return send(res, 204, undefined, { ...cors, 'Set-Cookie': 'mb=; Path=/; Max-Age=0' });
    if (!authed) return send(res, 401, '"no"', { ...cors, 'Content-Type': 'application/json' });

    // Projects
    if (p === '/api/projects' && m === 'GET') return ok(state.projects.map(projectSummary));
    if (p === '/api/projects' && m === 'POST') {
      const { name } = await readBody(req);
      const id = `p${state.projects.length + 1}`;
      const project = { id, name: String(name ?? 'Untitled'), developerId: 'dev1', createdAtUtc: new Date().toISOString(), ingestKeyPrefix: 'mbk_New123', ingestKeyCreatedAtUtc: new Date().toISOString(), key: 'mbk_New123' + 'q'.repeat(26) };
      state.projects.push(project);
      return ok(projectSummary(project));
    }
    let match = p.match(/^\/api\/projects\/([\w-]+)$/);
    if (match && m === 'GET') {
      const project = state.projects.find((x) => x.id === match[1]);
      return project ? ok(projectDetail(project)) : notFound();
    }
    match = p.match(/^\/api\/projects\/([\w-]+)\/ingest-key$/);
    if (match && m === 'POST') {
      const project = state.projects.find((x) => x.id === match[1]);
      if (!project) return notFound();
      project.key = `mbk_${Math.random().toString(36).slice(2, 8)}${'k'.repeat(26)}`;
      project.ingestKeyPrefix = project.key.slice(0, 10);
      project.ingestKeyCreatedAtUtc = new Date().toISOString();
      return ok({ connectionString: `https://${project.key}@${HOST}`, ingestKeyPrefix: project.ingestKeyPrefix, ingestKeyCreatedAtUtc: project.ingestKeyCreatedAtUtc });
    }

    // Scenes
    match = p.match(/^\/api\/scenes\/dev1\/([^/]+)(\/.*)?$/);
    if (match) {
      const sceneId = decodeURIComponent(match[1]);
      const rest = match[2] ?? '';
      const scene = state.scenes.get(sceneId);
      if (!scene) return notFound();
      const d = scene.detail;
      if (rest === '' && m === 'GET') return ok(d);
      if (rest === '' && m === 'PATCH') {
        const { displayName } = await readBody(req);
        d.displayName = displayName || null;
        return ok(d);
      }
      if (rest === '' && m === 'DELETE') {
        state.scenes.delete(sceneId);
        return ok({ deletedVersions: 1 + d.archived.length, deletedSessions: d.totalBytes ? 6 : 0, freedBytes: d.totalBytes });
      }
      if (rest === '/archive' && m === 'DELETE') {
        const out = { deletedVersions: d.archived.length, deletedSessions: d.archived.reduce((n, v) => n + v.sessionCount, 0), freedBytes: d.archived.reduce((n, v) => n + v.sizeBytes + v.sessionBytes, 0) };
        d.archived = [];
        return ok(out);
      }
      const v = rest.match(/^\/versions\/(\d+)$/);
      if (v && m === 'DELETE') {
        const target = d.archived.find((x) => x.version === Number(v[1]));
        if (!target) return notFound();
        d.archived = d.archived.filter((x) => x !== target);
        return ok({ deletedVersions: 1, deletedSessions: target.sessionCount, freedBytes: target.sizeBytes + target.sessionBytes });
      }
      if (rest === '/file') return send(res, 200, GLB, { ...cors, 'Content-Type': 'model/gltf-binary', 'Content-Length': GLB.length });
      if (rest === '/sessions') return ok(sessionsFor(url));
      return notFound();
    }

    // Sessions
    match = p.match(/^\/api\/sessions\/([\w-]+)(\/replay|\/recompile)?$/);
    if (match) {
      const id = match[1];
      const s = state.sessions.find((x) => x.id === id) ?? (id.startsWith('old-') ? { ...state.sessions[2], id } : null);
      if (!s) return notFound();
      if (match[2] === '/replay') return send(res, 200, REPLAY_GZ, { ...cors, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip', 'Content-Length': REPLAY_GZ.length });
      if (match[2] === '/recompile' && m === 'POST') {
        s.status = 'Compiling';
        setTimeout(() => (s.status = 'Ready'), 8000);
        return noContent();
      }
      if (m === 'DELETE') {
        state.sessions = state.sessions.filter((x) => x.id !== id);
        return noContent();
      }
      return ok(sessionDetail(s));
    }

    notFound();
  })
  .listen(PORT, () => console.log(`MoodyBlues dev mock on http://localhost:${PORT}  (any email and password work)`));
