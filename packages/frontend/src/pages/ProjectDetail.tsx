import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';
import { useToast } from '../contexts/ToastContext';
import ProjectRepositories from '../components/ProjectRepositories';
import ProjectVMs from '../components/ProjectVMs';
import ProjectMoments from '../components/ProjectMoments';
import ProjectMembers from '../components/ProjectMembers';
import ProjectFavoritePorts from '../components/ProjectFavoritePorts';
import EditProjectModal from '../components/EditProjectModal';

type TabType = 'overview' | 'repositories' | 'vms' | 'moments' | 'members' | 'ports';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showEditModal, setShowEditModal] = useState(false);

  const { data: projectData, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onSuccess: () => {
      showSuccess('Project deleted successfully');
      navigate('/projects');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to delete project');
    },
  });

  if (error) {
    showError((error as any).response?.data?.error || 'Failed to load project');
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading project...
        </p>
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
          Project not found
        </p>
      </div>
    );
  }

  const { project, memberRole, memberCount, repositoryCount, vmCount, momentCount, favoritePortCount, creator } = projectData;
  const canEdit = true; // memberRole === 'owner' || memberRole === 'admin';
  const canDelete = memberRole === 'owner';

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'repositories', label: 'Repositories', count: repositoryCount },
    { key: 'vms', label: 'VMs', count: vmCount },
    { key: 'moments', label: 'Moments', count: momentCount },
    { key: 'members', label: 'Members', count: memberCount },
    { key: 'ports', label: 'Favorite Ports', count: favoritePortCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-te-gray-600 dark:text-te-gray-500 mt-1">
              {project.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-te-gray-500 dark:text-te-gray-600">
              Created by {creator.name || creator.email}
            </span>
            {memberRole && (
              <span className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600 bg-te-gray-100 dark:bg-te-gray-900 px-2 py-1">
                {memberRole}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100 transition-colors"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-xs uppercase tracking-wider text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-te-gray-300 dark:border-te-gray-800">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-2 px-1 text-xs uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-te-gray-900 dark:border-te-yellow text-te-gray-900 dark:text-te-yellow'
                  : 'border-transparent text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 text-2xs text-te-gray-500 dark:text-te-gray-600">
                  ({tab.count})
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="border border-te-gray-300 dark:border-te-gray-800 p-4">
              <h3 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-3">
                Project Stats
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Repositories</span>
                  <span className="font-medium">{repositoryCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Virtual Machines</span>
                  <span className="font-medium">{vmCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Moments</span>
                  <span className="font-medium">{momentCount || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Members</span>
                  <span className="font-medium">{memberCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Favorite Ports</span>
                  <span className="font-medium">{favoritePortCount || 0}</span>
                </div>
              </div>
            </div>

            <div className="border border-te-gray-300 dark:border-te-gray-800 p-4">
              <h3 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-3">
                Project Info
              </h3>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Created</span>
                  <p className="font-medium">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-sm">
                  <span className="text-te-gray-600 dark:text-te-gray-500">Last Updated</span>
                  <p className="font-medium">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {project.tags && project.tags.length > 0 && (
              <div className="border border-te-gray-300 dark:border-te-gray-800 p-4">
                <h3 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-3">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="text-xs bg-te-gray-200 dark:bg-te-gray-800 text-te-gray-700 dark:text-te-gray-400 px-2 py-1"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'repositories' && (
          <ProjectRepositories projectId={project.id} canEdit={canEdit} />
        )}

        {activeTab === 'vms' && (
          <ProjectVMs projectId={project.id} canEdit={canEdit} />
        )}

        {activeTab === 'moments' && (
          <ProjectMoments projectId={project.id} />
        )}

        {activeTab === 'members' && (
          <ProjectMembers projectId={project.id} canEdit={canEdit} />
        )}

        {activeTab === 'ports' && (
          <ProjectFavoritePorts projectId={project.id} canEdit={canEdit} />
        )}
      </div>

      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            queryClient.invalidateQueries({ queryKey: ['project', id] });
          }}
        />
      )}
    </div>
  );
}