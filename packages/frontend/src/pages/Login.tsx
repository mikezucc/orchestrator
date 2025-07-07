import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import '../styles/graphite.css';

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
    <div className="min-h-screen graphite-bg paper-texture">
      <div className="absolute top-6 right-6 z-10">
        <div className="graphite-card p-2">
          <ThemeToggle />
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold uppercase tracking-wider mb-3 graphite-logo">
              Facet <span>Build</span>
            </h1>
            <div className="graphite-divider max-w-xs mx-auto" />
            <p className="text-xs uppercase tracking-widest graphite-text-secondary mt-4">
              Build for the Future
            </p>
          </div>
          
          <div className="graphite-card p-8 space-y-8 crosshatch-light">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-3 graphite-text-primary">Authentication Required</h2>
              <p className="text-sm graphite-text-secondary">
                Sign in with your Google account
              </p>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 stipple-effect opacity-5" />
              <button
                onClick={handleLogin}
                className="graphite-btn w-full flex items-center justify-center space-x-3 relative z-10"
              >
                <svg className="w-5 h-5 graphite-icon" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-semibold text-sm">Sign in with Google</span>
              </button>
            </div>
            
            <div className="text-center">
              <div className="graphite-divider max-w-xs mx-auto mb-4" />
              <p className="text-2xs uppercase tracking-widest graphite-text-secondary opacity-70">
                Secure OAuth 2.0 Authentication
              </p>
            </div>
          </div>
          
          <div className="text-center">
            <div className="inline-block graphite-card px-6 py-3">
              <p className="text-2xs uppercase tracking-widest graphite-text-secondary">
                <span className="font-semibold">Facet</span> &copy; {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}