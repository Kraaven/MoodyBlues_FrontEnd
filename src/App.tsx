import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AuthPage } from './pages/auth/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { NewProjectPage } from './pages/NewProjectPage';
import { ProjectPage } from './pages/ProjectPage';
import { ScenePage } from './pages/scene/ScenePage';
import { StagePreloader } from './stage/StagePreloader';
import { debugEnabled } from './debug/enabled';
import { Mark } from './ui/Logo';

// three.js, the replay engine and the studio load only when something is opened in 3D.
const StudioPage = lazy(() => import('./studio/StudioPage'));
// The persistent Stage loads in its own chunk, after the shell has painted.
const StageHost = lazy(() => import('./stage/StageHost'));
// Development tools, loaded only with ?debug.
const DebugPanel = lazy(() => import('./debug/DebugPanel'));
const debugOn = debugEnabled();

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Mark className="animate-pulse text-[40px]" />
    </div>
  );
}

/** Old addresses of the inspector. */
function LegacyInspectRedirect() {
  const { projectId, sceneId } = useParams();
  const version = new URLSearchParams(window.location.search).get('version');
  return <Navigate to={`/projects/${projectId}/scenes/${sceneId}/view${version ? `?version=${version}` : ''}`} replace />;
}

/** The scene page used to have History and Settings tabs; both now live on the page itself. */
function LegacySceneRedirect() {
  const { projectId, sceneId } = useParams();
  return <Navigate to={`/projects/${projectId}/scenes/${sceneId}`} replace />;
}

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <StageHost />
      </Suspense>
      <StagePreloader />
      {debugOn && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/projects" element={<LobbyPage />} />
            <Route path="/projects/new" element={<NewProjectPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="/projects/:projectId/scenes/:sceneId" element={<ScenePage />} />
            <Route path="/projects/:projectId/scenes/:sceneId/history" element={<LegacySceneRedirect />} />
            <Route path="/projects/:projectId/scenes/:sceneId/settings" element={<LegacySceneRedirect />} />
            <Route path="/projects/:projectId/scenes/:sceneId/archive" element={<LegacySceneRedirect />} />
            <Route path="/projects/:projectId/scenes/:sceneId/view" element={<StudioPage />} />
            <Route path="/projects/:projectId/scenes/:sceneId/sessions/:sessionId" element={<StudioPage />} />
            <Route path="/projects/:projectId/scenes/:sceneId/inspect" element={<LegacyInspectRedirect />} />
          </Route>

          <Route path="/dashboard" element={<Navigate to="/projects" replace />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
