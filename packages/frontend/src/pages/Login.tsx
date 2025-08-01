import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    console.log('Starting Google OAuth flow...');
    login();
  };

  return (
    <div className="min-h-screen flex flex-col graphite-bg paper-texture">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 py-8">
          {/* Left side - Platform info */}
          <div className="space-y-8">
            <div className="text-center lg:text-left">
              <h1 className="text-3xl font-bold uppercase tracking-wider mb-2 graphite-logo">
                Facet <span>Build</span>
              </h1>
              <p className="text-sm uppercase tracking-wider graphite-text-secondary mb-6">
                Cloud Development Platform
              </p>
            </div>

            <div className="space-y-6">
              <div className="graphite-card p-4 crosshatch-light">
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">Virtual Machines</h3>
                <p className="text-sm graphite-text-secondary">
                  Spin up powerful cloud VMs instantly. Full SSH access, custom environments, and flexible resource allocation.
                </p>
              </div>

              <div className="graphite-card p-4 crosshatch-light">
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">Collaborative Projects</h3>
                <p className="text-sm graphite-text-secondary">
                  Organize your work into projects with team members, repositories, and shared resources.
                </p>
              </div>

              <div className="graphite-card p-4 crosshatch-light">
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">Script Library</h3>
                <p className="text-sm graphite-text-secondary">
                  Build and share automation scripts. Execute them across your infrastructure with one click.
                </p>
              </div>

              <div className="graphite-card p-4 crosshatch-light">
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">Development Moments</h3>
                <p className="text-sm graphite-text-secondary">
                  Capture and share your development journey. Document progress, insights, and achievements.
                </p>
              </div>
            </div>
          </div>

          {/* Right side - Login */}
          <div className="flex items-center justify-center">
            <div className="max-w-md w-full space-y-8">
              <div className="graphite-card p-6 space-y-6 crosshatch-light">
                <div>
                  <h2 className="text-lg font-semibold mb-2 graphite-text-primary">Get Started</h2>
                  <p className="text-sm graphite-text-secondary">
                    Sign in with your Google account to access the platform
                  </p>
                </div>
                
                <button
                  onClick={handleLogin}
                  className="graphite-btn w-full flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4 graphite-icon" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </button>
                
                <div className="text-center">
                  <p className="text-2xs uppercase tracking-wider graphite-text-secondary">
                    Secure OAuth 2.0 Authentication
                  </p>
                </div>

                <div className="pt-4 border-t border-graphite-border">
                  <div className="flex items-center justify-center space-x-6 text-2xs uppercase tracking-wider graphite-text-secondary">
                    <span>Multi-tenant</span>
                    <span>•</span>
                    <span>Team Ready</span>
                    <span>•</span>
                    <span>Enterprise Scale</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <footer className="py-4 text-center">
        <p className="text-2xs uppercase tracking-wider graphite-text-secondary">
          Facet &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}