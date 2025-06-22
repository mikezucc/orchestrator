import { api } from './client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  gcpRefreshToken?: string;
  gcpProjectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface TeamInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
  inviter?: {
    name?: string;
    email: string;
  };
}

export const organizationApi = {
  // Get current user's organization
  getMyOrganization: async (): Promise<Organization> => {
    const { data } = await api.get('/organizations/my-organization');
    return data;
  },

  // Get organization members
  getMembers: async (organizationId: string): Promise<OrganizationMember[]> => {
    const { data } = await api.get(`/organizations/${organizationId}/members`);
    return data;
  },

  // Update organization settings
  updateOrganization: async (organizationId: string, updates: Partial<Organization>): Promise<Organization> => {
    const { data } = await api.put(`/organizations/${organizationId}`, updates);
    return data;
  },

  // Configure GCP OAuth for organization
  configureGoogleAuth: async (organizationId: string): Promise<{ authUrl: string }> => {
    const { data } = await api.post(`/organizations/${organizationId}/configure-google`);
    return data;
  },

  // Remove member from organization
  removeMember: async (organizationId: string, userId: string): Promise<void> => {
    await api.delete(`/organizations/${organizationId}/members/${userId}`);
  },

  // Update member role
  updateMemberRole: async (organizationId: string, userId: string, role: 'admin' | 'member'): Promise<void> => {
    await api.put(`/organizations/${organizationId}/members/${userId}`, { role });
  },
};

export const invitationApi = {
  // Get pending invitations
  getPendingInvitations: async (organizationId: string): Promise<TeamInvitation[]> => {
    const { data } = await api.get(`/invitations/organization/${organizationId}`);
    return data;
  },

  // Send invitation
  sendInvitation: async (organizationId: string, email: string, role: 'admin' | 'member'): Promise<TeamInvitation> => {
    const { data } = await api.post('/invitations', {
      organizationId,
      email,
      role,
    });
    return data;
  },

  // Cancel invitation
  cancelInvitation: async (invitationId: string): Promise<void> => {
    await api.delete(`/invitations/${invitationId}`);
  },

  // Resend invitation
  resendInvitation: async (invitationId: string): Promise<void> => {
    await api.post(`/invitations/${invitationId}/resend`);
  },
};