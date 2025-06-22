import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import VMs from './pages/VMs';
import VMDetail from './pages/VMDetail';
import Login from './pages/Login';
import LoginOTP from './pages/LoginOTP';
import AuthCallback from './pages/AuthCallback';
import OrganizationSettings from './pages/OrganizationSettings';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<LoginOTP />} />
                <Route path="/login-google" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/" element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="vms" element={<VMs />} />
                  <Route path="vms/:id" element={<VMDetail />} />
                  <Route path="organization/settings" element={<OrganizationSettings />} />
                </Route>
              </Routes>
            </Router>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;