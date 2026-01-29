import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  return token ? <>{children}</> : <Navigate to="/login" />;
};

function Dashboard() {
  const { logout } = useAuth();
  return (
    <div className="p-8 flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Monolith Planner</h1>
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Welcome to Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>You are logged in.</p>
          <Button onClick={logout} variant="outline">Logout</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;