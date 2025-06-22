import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { organizationApi } from '../api/organizations';
import type { Organization, OrganizationMember } from '../api/organizations';

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
      
      // Check if we have a saved organization ID
      const savedOrgId = localStorage.getItem('selectedOrganizationId');
      if (savedOrgId) {
        const savedOrg = memberships.find(m => m.organization.id === savedOrgId)?.organization;
        if (savedOrg) {
          setCurrentOrganization(savedOrg);
          // Update the auth headers to include this organization
          localStorage.setItem('currentOrganizationId', savedOrg.id);
        } else if (memberships.length > 0) {
          // Saved org not found, use first available
          setCurrentOrganization(memberships[0].organization);
          localStorage.setItem('selectedOrganizationId', memberships[0].organization.id);
          localStorage.setItem('currentOrganizationId', memberships[0].organization.id);
        }
      } else if (memberships.length > 0) {
        // No saved org, use first available
        setCurrentOrganization(memberships[0].organization);
        localStorage.setItem('selectedOrganizationId', memberships[0].organization.id);
        localStorage.setItem('currentOrganizationId', memberships[0].organization.id);
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