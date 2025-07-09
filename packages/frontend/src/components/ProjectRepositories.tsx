import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';
import { githubAuthApi, type GitHubRepo } from '../api/github-auth';
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
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [repoPage, setRepoPage] = useState(1);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  const { data: repositories, isLoading } = useQuery({
    queryKey: ['project-repositories', projectId],
    queryFn: () => projectsApi.getRepositories(projectId),
  });

  // Check GitHub connection status
  const { data: githubStatus } = useQuery({
    queryKey: ['github-status'],
    queryFn: githubAuthApi.getStatus,
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setRepoPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch GitHub repositories
  const { data: reposData, isLoading: loadingRepos, isFetching: isFetchingNextPage } = useQuery({
    queryKey: ['github-repos', debouncedSearchQuery, repoPage],
    queryFn: () => githubAuthApi.getRepositories(repoPage, 30, debouncedSearchQuery || undefined),
    enabled: !!githubStatus?.connected && showRepoDropdown,
    placeholderData: (previousData) => previousData,
  });

  // Accumulate repos for pagination
  const [allRepos, setAllRepos] = useState<GitHubRepo[]>([]);
  
  useEffect(() => {
    if (reposData?.repositories) {
      if (repoPage === 1) {
        setAllRepos(reposData.repositories);
      } else {
        setAllRepos(prev => [...prev, ...reposData.repositories]);
      }
    }
  }, [reposData, repoPage]);

  const loadMoreRepos = () => {
    if (!loadingRepos && !isFetchingNextPage && reposData?.pagination?.hasMore) {
      setRepoPage(prev => prev + 1);
    }
  };

  const addMutation = useMutation({
    mutationFn: (data: AddProjectRepositoryRequest) => 
      projectsApi.addRepository(projectId, data),
    onSuccess: () => {
      showSuccess('Repository added successfully');
      queryClient.invalidateQueries({ queryKey: ['project-repositories', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      resetForm();
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
    
    let repoUrl = '';
    
    if (useManualEntry) {
      if (!repositoryUrl.trim()) {
        showError('Repository URL is required');
        return;
      }
      repoUrl = repositoryUrl.trim();
    } else {
      if (!selectedRepo) {
        showError('Please select a repository');
        return;
      }
      repoUrl = selectedRepo.full_name;
    }

    addMutation.mutate({
      repositoryUrl: repoUrl,
      branch: branch.trim() || 'main',
    });
  };

  // Reset form when closing
  const resetForm = () => {
    setShowAddForm(false);
    setRepositoryUrl('');
    setBranch('main');
    setSelectedRepo(null);
    setSearchQuery('');
    setRepoPage(1);
    setAllRepos([]);
    setShowRepoDropdown(false);
    setUseManualEntry(false);
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
            onClick={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setShowAddForm(true);
              }
            }}
            className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors"
          >
            {showAddForm ? 'Cancel' : 'Add Repository'}
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="border border-te-gray-300 dark:border-te-gray-800 p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
                Repository <span className="text-red-500">*</span>
              </label>
              {githubStatus?.connected && (
                <button
                  type="button"
                  onClick={() => {
                    setUseManualEntry(!useManualEntry);
                    setSelectedRepo(null);
                    setRepositoryUrl('');
                    setShowRepoDropdown(false);
                  }}
                  className="text-xs text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow"
                >
                  {useManualEntry ? 'Select from GitHub' : 'Enter URL manually'}
                </button>
              )}
            </div>

            {!githubStatus?.connected || useManualEntry ? (
              <input
                type="text"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
                placeholder="https://github.com/username/repo.git"
              />
            ) : (
              <>
                {selectedRepo ? (
                  <div 
                    onClick={() => setShowRepoDropdown(true)}
                    className="border border-te-gray-300 dark:border-te-gray-700 rounded p-3 cursor-pointer hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm">{selectedRepo.name}</span>
                          {selectedRepo.private && (
                            <span className="text-2xs px-1.5 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded">
                              Private
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-te-gray-600 dark:text-te-gray-400">
                          {selectedRepo.full_name}
                        </span>
                      </div>
                      <svg className="w-4 h-4 text-te-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search repositories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowRepoDropdown(true)}
                        className="w-full pl-10 px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
                      />
                      <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-te-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    {showRepoDropdown && (
                      <div className="border border-te-gray-300 dark:border-te-gray-700 rounded max-h-64 overflow-y-auto">
                        {loadingRepos && allRepos.length === 0 ? (
                          <div className="p-4 text-center text-sm text-te-gray-600 dark:text-te-gray-400">
                            Loading repositories...
                          </div>
                        ) : allRepos.length === 0 ? (
                          <div className="p-4 text-center text-sm text-te-gray-600 dark:text-te-gray-400">
                            No repositories found
                          </div>
                        ) : (
                          <>
                            {allRepos.map((repo) => (
                              <div
                                key={repo.id}
                                onClick={() => {
                                  setSelectedRepo(repo);
                                  setShowRepoDropdown(false);
                                }}
                                className={`p-3 cursor-pointer hover:bg-te-gray-100 dark:hover:bg-te-gray-800 border-b border-te-gray-200 dark:border-te-gray-800 last:border-b-0 ${
                                  selectedRepo?.id === repo.id ? 'bg-te-gray-100 dark:bg-te-gray-800' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-medium text-sm">{repo.name}</span>
                                      {repo.private && (
                                        <span className="text-2xs px-1.5 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded">
                                          Private
                                        </span>
                                      )}
                                    </div>
                                    {repo.description && (
                                      <p className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1">
                                        {repo.description}
                                      </p>
                                    )}
                                    <div className="flex items-center space-x-3 mt-1">
                                      {repo.language && (
                                        <span className="text-2xs text-te-gray-600 dark:text-te-gray-400">
                                          {repo.language}
                                        </span>
                                      )}
                                      <span className="text-2xs text-te-gray-600 dark:text-te-gray-400">
                                        ⭐ {repo.stargazers_count}
                                      </span>
                                      <span className="text-2xs text-te-gray-600 dark:text-te-gray-400">
                                        Updated {new Date(repo.updated_at).toLocaleDateString()}
                                      </span>
                                    </div>
                                  </div>
                                  {selectedRepo?.id === repo.id && (
                                    <svg className="w-5 h-5 text-te-yellow ml-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            ))}
                            
                            {reposData?.pagination?.hasMore && (
                              <button
                                type="button"
                                onClick={loadMoreRepos}
                                disabled={loadingRepos || isFetchingNextPage}
                                className="w-full p-3 text-sm text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                              >
                                {loadingRepos || isFetchingNextPage ? 'Loading...' : 'Load more repositories'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {!githubStatus?.connected && !useManualEntry && (
            <div className="border border-te-gray-200 dark:border-te-gray-700 rounded-lg p-3 bg-te-gray-50 dark:bg-te-gray-800">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-te-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="text-sm text-te-gray-600 dark:text-te-gray-400">
                  GitHub not connected. Enter URL manually or <a href="/settings" className="text-te-yellow hover:underline">connect GitHub</a>
                </span>
              </div>
            </div>
          )}

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