import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import CreateProjectModal from '../components/CreateProjectModal';
import type { ProjectWithStats } from '@gce-platform/types';
import { projectsApi } from '../api/projects';

export default function Projects() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showSuccess('Project deleted successfully');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to delete project');
    },
  });

  if (error) {
    showError((error as any).response?.data?.error || 'Failed to load projects');
  }

  const handleDelete = (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate(projectId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mt-1">
            Organize your repositories, VMs, and moments into projects
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors"
        >
          Create Project
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
            Loading projects...
          </p>
        </div>
      ) : projects && projects.length === 0 ? (
        <div className="text-center py-12 border border-te-gray-300 dark:border-te-gray-800 bg-te-gray-50 dark:bg-te-gray-900">
          <p className="text-sm text-te-gray-600 dark:text-te-gray-500 mb-4">
            No projects yet. Create your first project to get started.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((item: ProjectWithStats) => {
            const { project, memberRole, memberCount, repositoryCount, vmCount, creator } = item;
            
            return (
              <div
                key={project.id}
                className="border border-te-gray-300 dark:border-te-gray-800 p-4 hover:border-te-gray-400 dark:hover:border-te-gray-700 transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <Link
                    to={`/projects/${project.id}`}
                    className="text-sm font-medium hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors"
                  >
                    {project.name}
                  </Link>
                  {memberRole && (
                    <span className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600 bg-te-gray-100 dark:bg-te-gray-900 px-2 py-1">
                      {memberRole}
                    </span>
                  )}
                </div>

                {project.description && (
                  <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mb-3 line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-2xs">
                    <span className="text-te-gray-500 dark:text-te-gray-600">Repositories</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">{repositoryCount}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-te-gray-500 dark:text-te-gray-600">VMs</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">{vmCount}</span>
                  </div>
                  <div className="flex justify-between text-2xs">
                    <span className="text-te-gray-500 dark:text-te-gray-600">Members</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">{memberCount}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-te-gray-200 dark:border-te-gray-800">
                  <span className="text-2xs text-te-gray-500 dark:text-te-gray-600">
                    Created by {creator.name || creator.email}
                  </span>
                  {memberRole === 'owner' && (
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="text-2xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 uppercase tracking-wider"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {project.tags && project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {project.tags.map((tag: string, index: number) => (
                      <span
                        key={index}
                        className="text-2xs bg-te-gray-200 dark:bg-te-gray-800 text-te-gray-700 dark:text-te-gray-400 px-2 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}
    </div>
  );
}