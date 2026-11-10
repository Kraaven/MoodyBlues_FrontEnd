import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage, RegisterPage } from './pages/auth/AuthPages';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { ScenePage } from './pages/scene/ScenePage';
import { ArchiveTab, SessionsTab, SettingsTab } from './pages/scene/SceneTabs';
import { StagePreloader } from './stage/StagePreloader';
import { debugEnabled } from './debug/enabled';
import { Logo } from './ui/Logo';

// three.js and the replay engine load only on these routes (DESIGN.md 12.3).
const SessionPlayerPage = lazy(() => import('./player/SessionPlayerPage'));
const SceneInspectorPage = lazy(() => import('./inspector/SceneInspectorPage'));
// The persistent Stage loads in its own chunk, after the shell has painted (DESIGN.md 4.5).
// Development tools, loaded only with ?debug.
const DebugPanel = lazy(() => import('./debug/DebugPanel'));
const StageHost = lazy(() => import('./stage/StageHost'));
// Development only: drives the Stage by hand. Tree-shaken out of production builds.
const StageLab = import.meta.env.DEV ? lazy(() => import('./stage/StageLab')) : null;

const debugOn = debugEnabled();

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Logo size={32} className="animate-pulse" />
    </div>
  );
}

/** `/.../view` was the old inspector route. */
function LegacyViewRedirect() {
  const { projectId, sceneId } = useParams();
  return <Navigate to={`/projects/${projectId}/scenes/${sceneId}/inspect`} replace />;
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
          {StageLab && <Route path="/_stage" element={<StageLab />} />}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="/projects/:projectId/scenes/:sceneId" element={<ScenePage />}>
              <Route index element={<SessionsTab />} />
              <Route path="archive" element={<ArchiveTab />} />
              <Route path="settings" element={<SettingsTab />} />
            </Route>
            <Route path="/projects/:projectId/scenes/:sceneId/inspect" element={<SceneInspectorPage />} />
            <Route path="/projects/:projectId/scenes/:sceneId/view" element={<LegacyViewRedirect />} />
            <Route path="/projects/:projectId/scenes/:sceneId/sessions/:sessionId" element={<SessionPlayerPage />} />
          </Route>

          <Route path="/dashboard" element={<Navigate to="/projects" replace />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
