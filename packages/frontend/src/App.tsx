import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import Layout from './components/Layout';
import VMs from './pages/VMs';
import VMDetail from './pages/VMDetail';
import Scripts from './pages/Scripts';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Login from './pages/Login';
import LoginOTP from './pages/LoginOTP';
import AuthCallback from './pages/AuthCallback';
import OrganizationSettings from './pages/OrganizationSettings';
import CreateOrganization from './pages/CreateOrganization';
import UserSettings from './pages/UserSettings';
import Moments from './pages/Moments';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <OrganizationProvider>
              <Router>
                <Routes>
                  <Route path="/login" element={<LoginOTP />} />
                  <Route path="/login-google" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/create-organization" element={<ProtectedRoute><CreateOrganization /></ProtectedRoute>} />
                  <Route path="/" element={<Layout />}>
                    <Route index element={<VMs />} />
                    <Route path="vms" element={<VMs />} />
                    <Route path="vms/:id" element={<VMDetail />} />
                    <Route path="projects" element={<Projects />} />
                    <Route path="projects/:id" element={<ProjectDetail />} />
                    <Route path="scripts" element={<Scripts />} />
                    <Route path="moments" element={<Moments />} />
                    <Route path="organization/settings" element={<OrganizationSettings />} />
                    <Route path="user/settings" element={<UserSettings />} />
                  </Route>
                </Routes>
              </Router>
            </OrganizationProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;