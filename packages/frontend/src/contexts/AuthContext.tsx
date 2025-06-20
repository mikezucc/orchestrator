import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { GCPAuthResponse } from '@gce-platform/types';

interface AuthContextType {
  auth: GCPAuthResponse | null;
  userId: string | null;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<GCPAuthResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedAuth = localStorage.getItem('auth');
    const storedUserId = localStorage.getItem('userId');
    
    if (storedAuth && storedUserId) {
      setAuth(JSON.parse(storedAuth));
      setUserId(storedUserId);
    }
    
    setIsLoading(false);
  }, []);

  const login = () => {
    window.location.href = 'http://localhost:3000/api/auth/google';
  };

  const logout = () => {
    setAuth(null);
    setUserId(null);
    localStorage.removeItem('auth');
    localStorage.removeItem('userId');
  };

  return (
    <AuthContext.Provider value={{
      auth,
      userId,
      login,
      logout,
      isAuthenticated: !!auth,
      isLoading,
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