import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';
import { useToast } from '../contexts/ToastContext';
import type { AddProjectRepositoryRequest } from '@gce-platform/types';

interface ProjectRepositoriesProps {
  projectId: string;
  canEdit: boolean;
}

export default function ProjectRepositories({ projectId, canEdit }: ProjectRepositoriesProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  const { data: repositories, isLoading } = useQuery({
    queryKey: ['project-repositories', projectId],
    queryFn: () => projectsApi.getRepositories(projectId),
  });

  const addMutation = useMutation({
    mutationFn: (data: AddProjectRepositoryRequest) => 
      projectsApi.addRepository(projectId, data),
    onSuccess: () => {
      showSuccess('Repository added successfully');
      queryClient.invalidateQueries({ queryKey: ['project-repositories', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowAddForm(false);
      setRepositoryUrl('');
      setBranch('main');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to add repository');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (repositoryId: string) => 
      projectsApi.removeRepository(projectId, repositoryId),
    onSuccess: () => {
      showSuccess('Repository removed successfully');
      queryClient.invalidateQueries({ queryKey: ['project-repositories', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to remove repository');
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!repositoryUrl.trim()) {
      showError('Repository URL is required');
      return;
    }

    addMutation.mutate({
      repositoryUrl: repositoryUrl.trim(),
      branch: branch.trim() || 'main',
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading repositories...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors"
          >
            {showAddForm ? 'Cancel' : 'Add Repository'}
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="border border-te-gray-300 dark:border-te-gray-800 p-4 space-y-4">
          <div>
            <label htmlFor="repo-url" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Repository URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="repo-url"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
              placeholder="https://github.com/username/repo.git"
            />
          </div>

          <div>
            <label htmlFor="branch" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Branch
            </label>
            <input
              type="text"
              id="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
              placeholder="main"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors disabled:opacity-50"
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? 'Adding...' : 'Add Repository'}
            </button>
          </div>
        </form>
      )}

      {repositories && repositories.length === 0 ? (
        <div className="text-center py-8 border border-te-gray-300 dark:border-te-gray-800">
          <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
            No repositories linked to this project yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {repositories?.map(({ repository, addedBy }) => (
            <div
              key={repository.id}
              className="border border-te-gray-300 dark:border-te-gray-800 p-4 flex justify-between items-start"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <a
                    href={repository.repositoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors"
                  >
                    {repository.repositoryUrl}
                  </a>
                  <span className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600 bg-te-gray-100 dark:bg-te-gray-900 px-2 py-1">
                    {repository.branch || 'main'}
                  </span>
                </div>
                <p className="text-xs text-te-gray-500 dark:text-te-gray-600">
                  Added by {addedBy.name || addedBy.email} on {new Date(repository.addedAt).toLocaleDateString()}
                </p>
                {repository.wormholeDaemonId && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Wormhole daemon active
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => removeMutation.mutate(repository.id)}
                  className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 uppercase tracking-wider"
                  disabled={removeMutation.isPending}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}