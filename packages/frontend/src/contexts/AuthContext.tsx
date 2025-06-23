import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { GCPAuthResponse } from '@gce-platform/types';
import { fetchClient } from '../api/fetchClient';
import { organizationApi } from '../api/organizations';

interface AuthContextType {
  auth: GCPAuthResponse | null;
  userId: string | null;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  setIsAuthenticated: (value: boolean) => void;
  currentOrganizationId: string | null;
  hasOrganizations: boolean | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<GCPAuthResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const [hasOrganizations, setHasOrganizations] = useState<boolean | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      // Check for OTP auth token first
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      
      if (token && user) {
        const userData = JSON.parse(user);
        setUserId(userData.id);
        setIsAuthenticated(true);
        
        // Fetch user's organizations
        try {
          const memberships = await organizationApi.getUserMemberships();
          if (memberships.length > 0) {
            setHasOrganizations(true);
            
            // Check if we have a saved organization ID
            const savedOrgId = localStorage.getItem('selectedOrganizationId');
            if (savedOrgId && memberships.find(m => m.organization.id === savedOrgId)) {
              setCurrentOrganizationId(savedOrgId);
              localStorage.setItem('currentOrganizationId', savedOrgId);
            } else {
              // Use first organization as default
              const defaultOrgId = memberships[0].organization.id;
              setCurrentOrganizationId(defaultOrgId);
              localStorage.setItem('selectedOrganizationId', defaultOrgId);
              localStorage.setItem('currentOrganizationId', defaultOrgId);
            }
          } else {
            setHasOrganizations(false);
          }
        } catch (error) {
          console.error('Failed to fetch organizations:', error);
        }
      } else {
        // Fall back to Google auth
        const storedAuth = localStorage.getItem('auth');
        const storedUserId = localStorage.getItem('userId');
        
        if (storedAuth && storedUserId) {
          setAuth(JSON.parse(storedAuth));
          setUserId(storedUserId);
          setIsAuthenticated(true);
          
          // Fetch user's organizations for Google auth too
          try {
            const memberships = await organizationApi.getUserMemberships();
            if (memberships.length > 0) {
              setHasOrganizations(true);
              
              const savedOrgId = localStorage.getItem('selectedOrganizationId');
              if (savedOrgId && memberships.find(m => m.organization.id === savedOrgId)) {
                setCurrentOrganizationId(savedOrgId);
                localStorage.setItem('currentOrganizationId', savedOrgId);
              } else {
                const defaultOrgId = memberships[0].organization.id;
                setCurrentOrganizationId(defaultOrgId);
                localStorage.setItem('selectedOrganizationId', defaultOrgId);
                localStorage.setItem('currentOrganizationId', defaultOrgId);
              }
            } else {
              setHasOrganizations(false);
            }
          } catch (error) {
            console.error('Failed to fetch organizations:', error);
          }
        }
      }
      
      setIsLoading(false);
    };

    initAuth();
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
    setCurrentOrganizationId(null);
    setHasOrganizations(null);
    localStorage.removeItem('auth');
    localStorage.removeItem('userId');
    localStorage.removeItem('selectedOrganizationId');
    localStorage.removeItem('currentOrganizationId');
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
      currentOrganizationId,
      hasOrganizations,
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