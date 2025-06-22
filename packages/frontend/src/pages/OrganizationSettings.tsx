import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationApi, invitationApi, googleCloudApi, type GCPProject } from '../api/organizations';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ThemeToggle from '../components/ThemeToggle';
import { ChevronLeft, Settings, Users, Key, Mail, UserPlus, Shield, Trash2, RefreshCw, ExternalLink, Cloud, Check } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'general' | 'gcp' | 'members'>('general');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  // Handle Google Cloud connection success
  useEffect(() => {
    if (searchParams.get('gcpConnected') === 'true') {
      showToast('Google Cloud account connected successfully', 'success');
      setActiveTab('gcp');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      // Clean up URL
      navigate('/organization/settings', { replace: true });
    } else if (searchParams.get('error')) {
      showToast('Failed to connect Google Cloud account', 'error');
      navigate('/organization/settings', { replace: true });
    }
  }, [searchParams, showToast, queryClient, navigate]);

  // Fetch organization data
  const { data: organization, isLoading: orgLoading } = useQuery({
    queryKey: ['organization'],
    queryFn: organizationApi.getMyOrganization,
  });

  // Fetch members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['organization-members', organization?.id],
    queryFn: () => organizationApi.getMembers(organization!.id),
    enabled: !!organization?.id,
  });

  // Fetch invitations
  const { data: invitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ['organization-invitations', organization?.id],
    queryFn: () => invitationApi.getPendingInvitations(organization!.id),
    enabled: !!organization?.id,
  });

  // Find current user's role
  const currentUserMember = members.find(m => m.userId === userId);
  const isOwnerOrAdmin = currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';

  // Fetch GCP projects when organization has GCP connected
  const { data: gcpProjectsData, isLoading: gcpProjectsLoading, refetch: refetchProjects } = useQuery({
    queryKey: ['gcp-projects', organization?.id],
    queryFn: googleCloudApi.getAvailableProjects,
    enabled: !!organization?.gcpRefreshToken,
  });

  // Initialize selected projects when data loads
  useEffect(() => {
    if (gcpProjectsData?.projects) {
      const selected = gcpProjectsData.projects
        .filter(p => p.selected)
        .map(p => p.projectId);
      setSelectedProjects(selected);
    }
  }, [gcpProjectsData]);

  // Configure GCP OAuth mutation
  const configureGoogleMutation = useMutation({
    mutationFn: () => organizationApi.configureGoogleAuth(organization!.id),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: () => {
      showToast('Failed to configure Google authentication', 'error');
    },
  });

  // Send invitation mutation
  const sendInvitationMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: 'admin' | 'member' }) =>
      invitationApi.sendInvitation(organization!.id, email, role),
    onSuccess: () => {
      showToast('Invitation sent successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['organization-invitations'] });
      setInviteEmail('');
      setShowInviteForm(false);
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to send invitation', 'error');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => organizationApi.removeMember(organization!.id, userId),
    onSuccess: () => {
      showToast('Member removed successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
    },
    onError: () => {
      showToast('Failed to remove member', 'error');
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      organizationApi.updateMemberRole(organization!.id, userId, role),
    onSuccess: () => {
      showToast('Role updated successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
    },
    onError: () => {
      showToast('Failed to update role', 'error');
    },
  });

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => invitationApi.cancelInvitation(invitationId),
    onSuccess: () => {
      showToast('Invitation cancelled', 'success');
      queryClient.invalidateQueries({ queryKey: ['organization-invitations'] });
    },
    onError: () => {
      showToast('Failed to cancel invitation', 'error');
    },
  });

  // Resend invitation mutation
  const resendInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => invitationApi.resendInvitation(invitationId),
    onSuccess: () => {
      showToast('Invitation resent successfully', 'success');
    },
    onError: () => {
      showToast('Failed to resend invitation', 'error');
    },
  });

  // Update GCP projects mutation
  const updateProjectsMutation = useMutation({
    mutationFn: (projectIds: string[]) => googleCloudApi.updateProjects(projectIds),
    onSuccess: () => {
      showToast('GCP projects updated successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      refetchProjects();
    },
    onError: () => {
      showToast('Failed to update GCP projects', 'error');
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !organization) return;
    sendInvitationMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-te-primary"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-te-gray-600 dark:text-te-gray-400">Organization not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-te-bg-light dark:bg-te-bg-dark">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-te-gray-100 dark:hover:bg-te-gray-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Organization Settings</h1>
              <p className="text-sm text-te-gray-600 dark:text-te-gray-400">{organization.name}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Tabs */}
        <div className="border-b border-te-gray-200 dark:border-te-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'general'
                  ? 'border-te-primary text-te-primary'
                  : 'border-transparent text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              General
            </button>
            <button
              onClick={() => setActiveTab('gcp')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'gcp'
                  ? 'border-te-primary text-te-primary'
                  : 'border-transparent text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300'
              }`}
            >
              <Key className="w-4 h-4 inline mr-2" />
              GCP Configuration
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'members'
                  ? 'border-te-primary text-te-primary'
                  : 'border-transparent text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Team Members
            </button>
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'general' && (
          <div className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">General Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Organization Name</label>
                  <input
                    type="text"
                    value={organization.name}
                    className="input w-full"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Organization Slug</label>
                  <input
                    type="text"
                    value={organization.slug}
                    className="input w-full"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Created</label>
                  <input
                    type="text"
                    value={new Date(organization.createdAt).toLocaleDateString()}
                    className="input w-full"
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gcp' && (
          <div className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Google Cloud Platform Configuration</h2>
              <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mb-6">
                Connect your Google Cloud account to allow team members to manage GCP resources through this platform.
              </p>
              
              {organization.gcpRefreshToken ? (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        Google Cloud account connected
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-medium">Google Cloud Projects</label>
                      {gcpProjectsLoading && (
                        <span className="text-xs text-te-gray-500">Loading projects...</span>
                      )}
                    </div>
                    
                    {gcpProjectsData?.projects && gcpProjectsData.projects.length > 0 ? (
                      <div className="space-y-4">
                        <div className="border border-te-gray-300 dark:border-te-gray-700 rounded-lg divide-y divide-te-gray-300 dark:divide-te-gray-700">
                          {gcpProjectsData.projects.map((project) => (
                            <div key={project.projectId} className="p-4 hover:bg-te-gray-50 dark:hover:bg-te-gray-900/50 transition-colors">
                              <div className="flex items-start space-x-3">
                                <input
                                  type="checkbox"
                                  id={`project-${project.projectId}`}
                                  checked={selectedProjects.includes(project.projectId)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProjects([...selectedProjects, project.projectId]);
                                    } else {
                                      setSelectedProjects(selectedProjects.filter(id => id !== project.projectId));
                                    }
                                  }}
                                  disabled={!isOwnerOrAdmin}
                                  className="mt-1 rounded border-te-gray-300 dark:border-te-gray-600 text-te-yellow focus:ring-te-yellow disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <label htmlFor={`project-${project.projectId}`} className="flex-1 cursor-pointer">
                                  <div className="flex items-center space-x-2">
                                    <Cloud className="w-4 h-4 text-te-gray-500" />
                                    <span className="font-medium">{project.name}</span>
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    <p className="text-xs text-te-gray-600 dark:text-te-gray-400 font-mono">{project.projectId}</p>
                                    <p className="text-xs text-te-gray-500 dark:text-te-gray-500">
                                      Created: {new Date(project.createTime).toLocaleDateString()}
                                    </p>
                                  </div>
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {isOwnerOrAdmin && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-te-gray-600 dark:text-te-gray-400">
                              {selectedProjects.length} project{selectedProjects.length !== 1 ? 's' : ''} selected
                            </p>
                            <button
                              onClick={() => updateProjectsMutation.mutate(selectedProjects)}
                              disabled={updateProjectsMutation.isPending || 
                                JSON.stringify(selectedProjects.sort()) === 
                                JSON.stringify(organization.gcpProjectIds?.sort() || [])}
                              className="btn-primary text-xs"
                            >
                              {updateProjectsMutation.isPending ? (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Save Selection
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : gcpProjectsData?.projects?.length === 0 ? (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          No Google Cloud projects found. Create a project in Google Cloud Console first.
                        </p>
                      </div>
                    ) : null}
                  </div>
                  
                  {isOwnerOrAdmin && (
                    <button
                      onClick={() => configureGoogleMutation.mutate()}
                      disabled={configureGoogleMutation.isPending}
                      className="btn-secondary"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reconfigure Google Account
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      No Google Cloud account connected. Connect your account to enable GCP resource management.
                    </p>
                  </div>
                  
                  {isOwnerOrAdmin ? (
                    <button
                      onClick={() => configureGoogleMutation.mutate()}
                      disabled={configureGoogleMutation.isPending}
                      className="btn-primary"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Connect Google Cloud Account
                    </button>
                  ) : (
                    <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
                      Only organization owners and admins can configure Google Cloud access.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Members List */}
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Team Members</h2>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="btn-primary btn-sm"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Member
                  </button>
                )}
              </div>

              {/* Invite Form */}
              {showInviteForm && isOwnerOrAdmin && (
                <form onSubmit={handleInviteSubmit} className="mb-6 p-4 bg-te-gray-50 dark:bg-te-gray-800 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@example.com"
                        className="input w-full"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                        className="input w-full"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowInviteForm(false)}
                      className="btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={sendInvitationMutation.isPending}
                      className="btn-primary btn-sm"
                    >
                      Send Invitation
                    </button>
                  </div>
                </form>
              )}

              {/* Members Table */}
              {membersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-te-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-te-gray-200 dark:border-te-gray-700">
                        <th className="text-left py-3 px-4 text-sm font-medium">Member</th>
                        <th className="text-left py-3 px-4 text-sm font-medium">Role</th>
                        <th className="text-left py-3 px-4 text-sm font-medium">Joined</th>
                        {isOwnerOrAdmin && <th className="text-right py-3 px-4 text-sm font-medium">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id} className="border-b border-te-gray-100 dark:border-te-gray-800">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{member.user.name || member.user.email}</p>
                              <p className="text-sm text-te-gray-600 dark:text-te-gray-400">{member.user.email}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              member.role === 'owner'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                                : member.role === 'admin'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                            }`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {new Date(member.joinedAt).toLocaleDateString()}
                          </td>
                          {isOwnerOrAdmin && (
                            <td className="py-3 px-4 text-right">
                              {member.role !== 'owner' && member.userId !== userId && (
                                <div className="flex items-center justify-end space-x-2">
                                  {currentUserMember?.role === 'owner' && (
                                    <select
                                      value={member.role}
                                      onChange={(e) => updateRoleMutation.mutate({
                                        userId: member.userId,
                                        role: e.target.value as 'admin' | 'member'
                                      })}
                                      className="input input-sm"
                                    >
                                      <option value="member">Member</option>
                                      <option value="admin">Admin</option>
                                    </select>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (confirm('Are you sure you want to remove this member?')) {
                                        removeMemberMutation.mutate(member.userId);
                                      }
                                    }}
                                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Pending Invitations</h3>
                <div className="space-y-3">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center justify-between p-4 bg-te-gray-50 dark:bg-te-gray-800 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Mail className="w-5 h-5 text-te-gray-400" />
                        <div>
                          <p className="font-medium">{invitation.email}</p>
                          <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
                            Invited as {invitation.role} • Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {isOwnerOrAdmin && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => resendInvitationMutation.mutate(invitation.id)}
                            className="p-1 text-te-primary hover:bg-te-primary/10 rounded transition-colors"
                            title="Resend invitation"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                            className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Cancel invitation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}