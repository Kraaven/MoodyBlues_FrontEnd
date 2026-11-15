import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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
            <Route path="/projects/:projectId/scenes/:sceneId/view" element={<StudioPage />} />
            <Route path="/projects/:projectId/scenes/:sceneId/sessions/:sessionId" element={<StudioPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
