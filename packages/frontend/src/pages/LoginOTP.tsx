import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { fetchClient } from '../api/fetchClient';

// Animated geometric background component
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-te-gray-50 via-te-gray-100 to-te-gray-200 dark:from-te-gray-950 dark:via-te-gray-900 dark:to-te-gray-800" />
      
      {/* Animated geometric shapes */}
      <div className="absolute inset-0">
        {/* Large rotating circle */}
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 rounded-full border border-te-gray-300/20 dark:border-te-gray-700/20 animate-[spin_20s_linear_infinite]" />
        
        {/* Medium floating square */}
        <div className="absolute top-1/2 right-1/4 w-64 h-64 border border-te-gray-400/10 dark:border-te-gray-600/10 rotate-45 animate-[float_15s_ease-in-out_infinite]" />
        
        {/* Small triangle */}
        <div className="absolute bottom-1/4 left-1/3 w-0 h-0 border-l-[50px] border-l-transparent border-b-[86px] border-b-te-gray-300/10 dark:border-b-te-gray-700/10 border-r-[50px] border-r-transparent animate-[float_10s_ease-in-out_infinite_reverse]" />
        
        {/* Floating dots */}
        <div className="absolute top-1/3 right-1/3 w-4 h-4 bg-te-gray-400/20 dark:bg-te-gray-600/20 rounded-full animate-[pulse_4s_ease-in-out_infinite]" />
        <div className="absolute bottom-1/3 left-1/4 w-6 h-6 bg-te-gray-300/20 dark:bg-te-gray-700/20 rounded-full animate-[pulse_5s_ease-in-out_infinite_1s]" />
        
        {/* Hexagon */}
        <div className="absolute top-3/4 right-1/2 w-32 h-32 animate-[float_12s_ease-in-out_infinite]">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <polygon
              points="50,10 85,30 85,70 50,90 15,70 15,30"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-te-gray-300/20 dark:text-te-gray-700/20"
            />
          </svg>
        </div>
        
        {/* Moving lines */}
        <div className="absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-te-gray-300/20 dark:via-te-gray-700/20 to-transparent animate-[slideDown_8s_linear_infinite]" />
        <div className="absolute left-0 top-1/2 w-full h-px bg-gradient-to-r from-transparent via-te-gray-300/20 dark:via-te-gray-700/20 to-transparent animate-[slideRight_10s_linear_infinite]" />
      </div>
      
      {/* Blur overlay */}
      <div className="absolute inset-0 backdrop-blur-[1px] animate-[blur_3s_ease-in-out_infinite]" />
    </div>
  );
}

// Email validation function
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default function LoginOTP() {
  const navigate = useNavigate();
  const { setIsAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Check if email is valid
  const isEmailValid = useMemo(() => validateEmail(email), [email]);

  // Trigger mount animation
  useEffect(() => {
    setMounted(true);
  }, []);

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
    <div className="relative min-h-screen flex flex-col">
      {/* Animated background */}
      <AnimatedBackground />
      
      {/* Theme toggle with fade-in */}
      <div className={`absolute top-4 right-4 z-10 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <ThemeToggle />
      </div>
      
      <div className="relative flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          {/* Logo with staggered fade-in */}
          <div className={`text-center transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}>
            <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-te-gray-900 to-te-gray-600 dark:from-te-gray-100 dark:to-te-gray-400">
                Facet
              </span>
              <span className="ml-2 text-te-gray-500 dark:text-te-gray-600">Build</span>
            </h1>
            <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
              Fast Teams Only
            </p>
          </div>
          
          {/* Card with fade-in and scale animation */}
          <div className={`card space-y-6 backdrop-blur-md bg-white/80 dark:bg-te-gray-900/80 border-te-gray-200/50 dark:border-te-gray-800/50 transition-all duration-1000 delay-400 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
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
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 animate-fadeIn">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            
            {step === 'email' ? (
              <form onSubmit={handleRequestOTP} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium mb-3 uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      className={`
                        w-full px-4 py-3 bg-transparent border-2 rounded-lg
                        transition-all duration-300 outline-none
                        placeholder:text-te-gray-400 dark:placeholder:text-te-gray-600
                        ${emailFocused || email 
                          ? 'border-te-gray-400 dark:border-te-gray-600' 
                          : 'border-te-gray-300 dark:border-te-gray-700'
                        }
                        ${isEmailValid && email ? 'border-green-500 dark:border-green-600' : ''}
                        focus:border-te-gray-900 dark:focus:border-te-gray-100
                      `}
                      placeholder="you@example.com"
                      required
                      autoFocus
                    />
                    {/* Email validation indicator */}
                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-300 ${email ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                      {isEmailValid ? (
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-te-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Show button only when email is valid */}
                <div className={`transition-all duration-500 ${isEmailValid ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                  <button
                    type="submit"
                    className="btn-primary w-full relative overflow-hidden group"
                    disabled={loading || !isEmailValid}
                  >
                    <span className={`flex items-center justify-center transition-transform duration-300 ${loading ? 'scale-0' : 'scale-100'}`}>
                      Send Login Code
                    </span>
                    {loading && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </span>
                    )}
                  </button>
                </div>
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
          
          {/* Alternative login with fade-in */}
          <div className={`text-center transition-all duration-1000 delay-600 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <a 
              href="/login-google" 
              className="text-sm text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-100 transition-colors"
            >
              Sign in with Google instead
            </a>
          </div>
        </div>
      </div>
      
      {/* Footer with fade-in */}
      <footer className={`relative py-4 text-center transition-all duration-1000 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Facet &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}