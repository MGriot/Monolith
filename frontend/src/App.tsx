import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./components/auth-provider";
import { TitleProvider } from "./context/title-context";
import Layout from "./components/layout";
import { ErrorBoundary } from "./components/error-boundary";
import { PageSpinner } from "./components/page-spinner";

// Route-level code splitting: Excalidraw, xlsx, mammoth, katex, ... load only with the pages that use them.
const LoginPage = lazy(() => import("./pages/login"));
const RegisterPage = lazy(() => import("./pages/register"));
const ForgotPasswordPage = lazy(() => import("./pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("./pages/reset-password"));
const VerifyEmailPage = lazy(() => import("./pages/verify-email"));
const DashboardPage = lazy(() => import("./pages/dashboard"));
const UpdatesPage = lazy(() => import("./pages/updates"));
const NotificationsPage = lazy(() => import("./pages/notifications"));
const ProjectsListPage = lazy(() => import("./pages/projects-list"));
const ArchivePage = lazy(() => import("./pages/archive"));
const ProjectDetailPage = lazy(() => import("./pages/project-detail"));
const MyTasksPage = lazy(() => import("./pages/my-tasks"));
const IdeasPage = lazy(() => import("./pages/ideas"));
const SchedulePage = lazy(() => import("./pages/schedule"));
const TemplatesPage = lazy(() => import("./pages/templates"));
const TeamsPage = lazy(() => import("./pages/teams"));
const UsersPage = lazy(() => import("./pages/users"));
const SettingsPage = lazy(() => import("./pages/settings"));
const AdminMetadataPage = lazy(() => import("./pages/admin-metadata"));
const WorkflowsPage = lazy(() => import("./pages/workflows"));
const WhiteboardPage = lazy(() => import("./pages/whiteboard"));

const queryClient = new QueryClient();

/** Authenticated shell. Mounted once for all pages, so the sidebar, search and notification socket survive navigation. */
const PrivateLayout = () => {
  const { token, user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageSpinner fullScreen label="Authentication is loading..." />;
  if (!token) return <Navigate to="/login" replace />;
  if (user?.must_change_password && location.pathname !== "/settings") {
    return <Navigate to="/settings" replace />;
  }
  return (
    <TitleProvider>
      <Layout>
        {/* keyed by path: a crashed page recovers as soon as the user navigates elsewhere */}
        <ErrorBoundary inline key={location.pathname}>
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </TitleProvider>
  );
};

/** Authenticated but without the app chrome (full-screen whiteboard). */
const LayoutFreePrivate = () => {
  const { token, isLoading } = useAuth();
  if (isLoading) return <PageSpinner fullScreen label="Authentication is loading..." />;
  if (!token) return <Navigate to="/login" replace />;
  return (
    <TitleProvider>
      <ErrorBoundary>
        <Suspense fallback={<PageSpinner fullScreen />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </TitleProvider>
  );
};

/** Hidden from the sidebar for non-admins; the API enforces this too, this just avoids dead pages. */
const AdminOnly = () => {
  const { user } = useAuth();
  return user?.is_superuser ? <Outlet /> : <Navigate to="/" replace />;
};

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <Suspense fallback={<PageSpinner fullScreen />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />

                <Route element={<PrivateLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/updates" element={<UpdatesPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/projects" element={<ProjectsListPage />} />
                  <Route path="/archive" element={<ArchivePage />} />
                  <Route path="/projects/:id" element={<ProjectDetailPage />} />
                  <Route path="/tasks" element={<MyTasksPage />} />
                  <Route path="/ideas" element={<IdeasPage />} />
                  <Route path="/schedule" element={<SchedulePage />} />
                  <Route path="/calendar" element={<Navigate to="/schedule" replace />} />
                  <Route path="/roadmap" element={<Navigate to="/schedule" replace />} />
                  <Route path="/templates" element={<TemplatesPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/workflows" element={<WorkflowsPage />} />
                  <Route element={<AdminOnly />}>
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/admin/metadata" element={<AdminMetadataPage />} />
                  </Route>
                </Route>

                <Route element={<LayoutFreePrivate />}>
                  <Route path="/projects/:projectId/whiteboards/:whiteboardId" element={<WhiteboardPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
