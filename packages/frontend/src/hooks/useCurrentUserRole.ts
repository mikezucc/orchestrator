import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '../api/organizations';

export function useCurrentUserRole() {
  const { userId } = useAuth();
  const { currentOrganization } = useOrganization();

  const { data: members = [] } = useQuery({
    queryKey: ['organization-members', currentOrganization?.id],
    queryFn: () => organizationApi.getMembers(currentOrganization!.id),
    enabled: !!currentOrganization?.id,
  });

  const currentUserMember = members.find(m => m.userId === userId);
  const isOwner = currentUserMember?.role === 'owner';
  const isAdmin = currentUserMember?.role === 'admin';
  const isOwnerOrAdmin = isOwner || isAdmin;

  return {
    role: currentUserMember?.role,
    isOwner,
    isAdmin,
    isOwnerOrAdmin,
  };
}