import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Handle OAuth callback
    const handleCallback = () => {
      const userId = searchParams.get('userId');
      const accessToken = searchParams.get('accessToken');
      const refreshToken = searchParams.get('refreshToken');
      const expiresIn = searchParams.get('expiresIn');
      const error = searchParams.get('error');

      if (error) {
        console.error('OAuth error:', error);
        window.location.href = '/login';
        return;
      }

      if (userId && accessToken && refreshToken) {
        // Store auth data
        localStorage.setItem('userId', userId);
        localStorage.setItem('auth', JSON.stringify({
          accessToken,
          refreshToken,
          expiresIn: parseInt(expiresIn || '3600'),
        }));

        // Force a full page reload to reinitialize auth context
        window.location.href = '/';
      } else {
        console.error('Missing auth data in callback');
        window.location.href = '/login';
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
        Authenticating...
      </div>
    </div>
  );
}