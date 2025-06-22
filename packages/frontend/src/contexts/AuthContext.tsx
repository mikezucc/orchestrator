import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { GCPAuthResponse } from '@gce-platform/types';
import { fetchClient } from '../api/fetchClient';

interface AuthContextType {
  auth: GCPAuthResponse | null;
  userId: string | null;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  setIsAuthenticated: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<GCPAuthResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check for OTP auth token first
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
      const userData = JSON.parse(user);
      setUserId(userData.id);
      setIsAuthenticated(true);
    } else {
      // Fall back to Google auth
      const storedAuth = localStorage.getItem('auth');
      const storedUserId = localStorage.getItem('userId');
      
      if (storedAuth && storedUserId) {
        setAuth(JSON.parse(storedAuth));
        setUserId(storedUserId);
        setIsAuthenticated(true);
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = () => {
    const apiURL = process.env.NODE_ENV === 'production' 
      ? '/api/auth/google'
      : 'http://localhost:3000/api/auth/google';
    window.location.href = apiURL;
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    
    if (token) {
      // OTP auth logout
      try {
        await fetchClient.post('/auth/otp/logout');
      } catch (error) {
        console.error('Logout error:', error);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    
    // Clear Google auth
    setAuth(null);
    setUserId(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth');
    localStorage.removeItem('userId');
  };

  return (
    <AuthContext.Provider value={{
      auth,
      userId,
      login,
      logout,
      isAuthenticated,
      isLoading,
      setIsAuthenticated,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}