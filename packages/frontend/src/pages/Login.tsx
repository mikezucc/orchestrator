import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { fetchClient } from '../api/fetchClient';

// Email validation function
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default function Login() {
  const navigate = useNavigate();
  const { setIsAuthenticated, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if email is valid
  const isEmailValid = useMemo(() => validateEmail(email), [email]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) return;

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

      // Store token in localStorage
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      localStorage.setItem('userData', JSON.stringify(response.user));
      
      // Update auth context
      setIsAuthenticated(true);

      // Redirect based on organization status
      if (response.hasOrganization) {
        navigate('/');
      } else {
        navigate('/create-organization');
      }
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
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">GCE Virtual Machines</h3>
                <p className="text-sm graphite-text-secondary">
                  Full SSH, Firewall config, and SSL config.
                </p>
              </div>

              <div className="graphite-card p-4 crosshatch-light">
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">Claude Code Browser (Coming Soon)</h3>
                <p className="text-sm graphite-text-secondary">
                  Downloadable Browser with integrated Claude Code experience.
                </p>
              </div>

              <div className="graphite-card p-4 crosshatch-light">
                <h3 className="font-semibold mb-2 graphite-text-primary text-sm uppercase tracking-wider">Script Library</h3>
                <p className="text-sm graphite-text-secondary">
                  Build and share automation scripts. Execute with one click.
                </p>
              </div>
            </div>
          </div>

          {/* Right side - Login */}
          <div className="flex items-center justify-center">
            <div className="max-w-md w-full space-y-8">
              <div className="graphite-card p-6 space-y-6 crosshatch-light">
                <div>
                  <h2 className="text-lg font-semibold mb-2 graphite-text-primary">
                    {step === 'email' ? 'Sign In / Sign Up' : 'Enter Verification Code'}
                  </h2>
                  <p className="text-sm graphite-text-secondary">
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
                  <form onSubmit={handleRequestOTP} className="space-y-6">
                    <div>
                      <label htmlFor="email" className="block text-xs font-medium mb-3 uppercase tracking-wider graphite-text-primary">
                        Email Address
                      </label>
                      <div className="relative">
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="graphite-input w-full"
                          placeholder="you@example.com"
                          required
                          autoFocus
                        />
                        {/* Email validation indicator */}
                        <div className={`absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-300 ${email ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                          {isEmailValid ? (
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : email ? (
                            <svg className="w-5 h-5 graphite-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      type="submit"
                      className="graphite-btn w-full"
                      disabled={loading || !isEmailValid}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending...
                        </span>
                      ) : (
                        'Send Login Code'
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOTP} className="space-y-4">
                    <div>
                      <label htmlFor="otp" className="block text-sm font-medium mb-2 graphite-text-primary">
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
                        className="graphite-input w-full text-center text-2xl tracking-widest font-mono"
                        placeholder="000000"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        required
                        autoFocus
                      />
                      <p className="text-xs graphite-text-secondary mt-2 text-center">
                        Code expires in 5 minutes
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <button
                        type="submit"
                        className="graphite-btn w-full"
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
                        className="graphite-btn-secondary w-full"
                        disabled={loading}
                      >
                        Back
                      </button>
                    </div>
                  </form>
                )}
                
                <div className="text-center">
                  <p className="text-2xs uppercase tracking-wider graphite-text-secondary">
                    Secure Email-Based Authentication
                  </p>
                </div>

                <div className="pt-4 border-t border-graphite-border">
                  <div className="flex items-center justify-center space-x-6 text-2xs uppercase tracking-wider graphite-text-secondary">
                    <span>Not Cheeks</span>
                    <span>•</span>
                    <span>Yolo Deploy</span>
                    <span>•</span>
                    <span>Slop Code</span>
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