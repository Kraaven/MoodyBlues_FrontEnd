import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage, RegisterPage } from './pages/auth/AuthPages';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { ScenePage } from './pages/scene/ScenePage';
import { ArchiveTab, SessionsTab, SettingsTab } from './pages/scene/SceneTabs';
import { Logo } from './ui/Logo';

// three.js and the replay engine load only on these routes (DESIGN.md 15).
const SessionPlayerPage = lazy(() => import('./player/SessionPlayerPage'));
const SceneInspectorPage = lazy(() => import('./inspector/SceneInspectorPage'));

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
    <Suspense fallback={<RouteFallback />}>
      <Routes>
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
  );
}
