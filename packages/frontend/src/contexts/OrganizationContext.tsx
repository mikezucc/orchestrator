import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { organizationApi } from '../api/organizations';
import type { Organization } from '../api/organizations';

interface OrganizationContextType {
  currentOrganization: Organization | null;
  organizations: Organization[];
  isLoading: boolean;
  switchOrganization: (organizationId: string) => void;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, userId } = useAuth();
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserOrganizations = async () => {
    if (!isAuthenticated || !userId) {
      setOrganizations([]);
      setCurrentOrganization(null);
      setIsLoading(false);
      return;
    }

    try {
      // Get user's organizations by fetching their memberships
      const memberships = await organizationApi.getUserMemberships();
      setOrganizations(memberships.map(m => m.organization));
      
      // Get the current organization ID from localStorage (set by AuthContext)
      const currentOrgId = localStorage.getItem('currentOrganizationId');
      if (currentOrgId) {
        const currentOrg = memberships.find(m => m.organization.id === currentOrgId)?.organization;
        if (currentOrg) {
          setCurrentOrganization(currentOrg);
        }
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserOrganizations();
  }, [isAuthenticated, userId]);

  const switchOrganization = (organizationId: string) => {
    const org = organizations.find(o => o.id === organizationId);
    if (org) {
      setCurrentOrganization(org);
      localStorage.setItem('selectedOrganizationId', organizationId);
      localStorage.setItem('currentOrganizationId', organizationId);
      // Reload the page to ensure all components use the new organization
      window.location.reload();
    }
  };

  const refreshOrganizations = async () => {
    await fetchUserOrganizations();
  };

  return (
    <OrganizationContext.Provider value={{
      currentOrganization,
      organizations,
      isLoading,
      switchOrganization,
      refreshOrganizations,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}