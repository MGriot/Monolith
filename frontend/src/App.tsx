import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./components/auth-provider";
import Layout from "./components/layout";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import CalendarPage from "./pages/calendar";
import RoadmapPage from "./pages/roadmap";
import ProjectDetailPage from "./pages/project-detail";
import UsersPage from "./pages/users";
import SettingsPage from "./pages/settings";
import AdminMetadataPage from "./pages/admin-metadata";
import TemplatesPage from "./pages/templates";

import DashboardPage from "./pages/dashboard";
import ProjectsListPage from "./pages/projects-list";

const queryClient = new QueryClient();

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
  return token ? <Layout>{children}</Layout> : <Navigate to="/login" />;
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
            {/* Placeholder routes for navigation */}
            <Route path="/projects" element={<PrivateRoute><ProjectsListPage /></PrivateRoute>} />
            <Route path="/projects/:id" element={<PrivateRoute><ProjectDetailPage /></PrivateRoute>} />
            <Route path="/calendar" element={<PrivateRoute><CalendarPage /></PrivateRoute>} />
            <Route path="/roadmap" element={<PrivateRoute><RoadmapPage /></PrivateRoute>} />
            <Route path="/templates" element={<PrivateRoute><TemplatesPage /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute><UsersPage /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
            <Route path="/admin/metadata" element={<PrivateRoute><AdminMetadataPage /></PrivateRoute>} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;