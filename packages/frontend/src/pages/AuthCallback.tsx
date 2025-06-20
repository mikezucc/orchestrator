import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // Handle OAuth callback
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        console.error('OAuth error:', error);
        navigate('/login');
        return;
      }

      if (code) {
        try {
          // The backend handles the OAuth flow, we just need to check if we're authenticated
          // after the redirect from Google
          const urlParams = new URLSearchParams(window.location.search);
          const userId = urlParams.get('userId');
          const accessToken = urlParams.get('accessToken');
          const refreshToken = urlParams.get('refreshToken');
          const expiresIn = urlParams.get('expiresIn');

          if (userId && accessToken && refreshToken) {
            localStorage.setItem('userId', userId);
            localStorage.setItem('auth', JSON.stringify({
              accessToken,
              refreshToken,
              expiresIn: parseInt(expiresIn || '3600'),
            }));

            // Redirect to dashboard
            window.location.href = '/';
          } else {
            // If we don't have the tokens in URL params, the backend might handle it differently
            navigate('/');
          }
        } catch (err) {
          console.error('Failed to handle OAuth callback:', err);
          navigate('/login');
        }
      } else {
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate, searchParams, isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
        Authenticating...
      </div>
    </div>
  );
}