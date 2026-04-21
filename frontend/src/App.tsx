import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./components/auth-provider";
import Layout from "./components/layout";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import SchedulePage from "./pages/schedule";
import ProjectDetailPage from "./pages/project-detail";
import UsersPage from "./pages/users";
import SettingsPage from "./pages/settings";
import AdminMetadataPage from "./pages/admin-metadata";
import TemplatesPage from "./pages/templates";
import MyTasksPage from "./pages/my-tasks";
import TeamsPage from "./pages/teams";
import WorkflowsPage from "./pages/workflows";
import WhiteboardPage from "./pages/whiteboard";
import IdeasPage from "./pages/ideas";
import UpdatesPage from "./pages/updates";

import DashboardPage from "./pages/dashboard";
import ProjectsListPage from "./pages/projects-list";
import ArchivePage from "./pages/archive";

const queryClient = new QueryClient();

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-screen text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
      <p>Authentication is loading...</p>
    </div>
  );
  return token ? <Layout>{children}</Layout> : <Navigate to="/login" />;
};

const LayoutFreePrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-screen text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
      <p>Authentication is loading...</p>
    </div>
  );
  return token ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DashboardPage />
                </PrivateRoute>
              }
            />
            <Route path="/updates" element={<PrivateRoute><UpdatesPage /></PrivateRoute>} />
            {/* Placeholder routes for navigation */}
            <Route path="/projects" element={<PrivateRoute><ProjectsListPage /></PrivateRoute>} />
            <Route path="/archive" element={<PrivateRoute><ArchivePage /></PrivateRoute>} />
            <Route path="/projects/:id" element={<PrivateRoute><ProjectDetailPage /></PrivateRoute>} />
            <Route path="/tasks" element={<PrivateRoute><MyTasksPage /></PrivateRoute>} />
            <Route path="/ideas" element={<PrivateRoute><IdeasPage /></PrivateRoute>} />
            <Route path="/schedule" element={<PrivateRoute><SchedulePage /></PrivateRoute>} />
            <Route path="/calendar" element={<Navigate to="/schedule" replace />} />
            <Route path="/roadmap" element={<Navigate to="/schedule" replace />} />
            <Route path="/templates" element={<PrivateRoute><TemplatesPage /></PrivateRoute>} />
            <Route path="/teams" element={<PrivateRoute><TeamsPage /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute><UsersPage /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
            <Route path="/admin/metadata" element={<PrivateRoute><AdminMetadataPage /></PrivateRoute>} />
            <Route path="/workflows" element={<PrivateRoute><WorkflowsPage /></PrivateRoute>} />
            <Route path="/projects/:projectId/whiteboards/:whiteboardId" element={<LayoutFreePrivateRoute><WhiteboardPage /></LayoutFreePrivateRoute>} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;