import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { fetchClient } from '../api/fetchClient';

export default function LoginOTP() {
  const navigate = useNavigate();
  const { setIsAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');
    
    try {
      const response = await fetchClient.post('/auth/otp/request-otp', { email }, { skipAuth: true });
      
      if (!response || response.error) {
        throw new Error(response.error || 'Failed to send OTP');
      }

      setStep('otp');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  console.log('email', email);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) return;

    setLoading(true);
    setError('');
    
    try {
      const response = await fetchClient.post('/auth/otp/verify-otp', { email, otp }, { skipAuth: true });
      
      if (!response || response.error) {
        throw new Error(response.error || 'Failed to verify OTP');
      }

      console.log('response', response);

      // Store token in localStorage
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      localStorage.setItem('userData', JSON.stringify(response.user));
      
      // Update auth context
      setIsAuthenticated(true);

      // Redirect to dashboard
      navigate('/');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to verify OTP');
      // Clear OTP on error
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setOtp('');
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold uppercase tracking-wider mb-2">
              Facet <span className="text-te-gray-500 dark:text-te-gray-600">Build</span>
            </h1>
            <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
              Fast Teams Only
            </p>
          </div>
          
          <div className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-2">
                {step === 'email' ? 'Sign In / Sign Up' : 'Enter Verification Code'}
              </h2>
              <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
                {step === 'email' 
                  ? 'Enter your email to receive a one-time login code' 
                  : `We've sent a 6-digit code to ${email}`}
              </p>
            </div>
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            
            {step === 'email' ? (
              <form onSubmit={handleRequestOTP} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input w-full"
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={loading || !email}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending Code...
                    </span>
                  ) : (
                    'Send Login Code'
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium mb-2">
                    Verification Code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtp(value);
                    }}
                    className="input w-full text-center text-2xl tracking-widest font-mono"
                    placeholder="000000"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-te-gray-500 dark:text-te-gray-600 mt-2 text-center">
                    Code expires in 5 minutes
                  </p>
                </div>
                
                <div className="space-y-2">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={loading || otp.length !== 6}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verifying...
                      </span>
                    ) : (
                      'Verify & Sign In'
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleBack}
                    className="btn-secondary w-full"
                    disabled={loading}
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
            
            <div className="text-center">
              <p className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
                Secure Email-Based Authentication
              </p>
            </div>
          </div>
          
          <div className="text-center">
            <a 
              href="/login-google" 
              className="text-sm text-te-primary hover:underline"
            >
              Sign in with Google instead
            </a>
          </div>
        </div>
      </div>
      
      <footer className="py-4 text-center">
        <p className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Facet &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}