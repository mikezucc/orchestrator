import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { googleCloudApi, type GCPProject } from '../api/organizations';
import { useToast } from '../contexts/ToastContext';
import { X, Cloud, Check, Search, RefreshCw } from 'lucide-react';

interface ManageGCPProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  currentProjectIds: string[];
  isOwnerOrAdmin: boolean;
}

export default function ManageGCPProjectsModal({
  isOpen,
  onClose,
  organizationId,
  currentProjectIds,
  isOwnerOrAdmin,
}: ManageGCPProjectsModalProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch GCP projects
  const { data: gcpProjectsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['gcp-projects', organizationId],
    queryFn: googleCloudApi.getAvailableProjects,
    enabled: isOpen,
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

  // Update GCP projects mutation
  const updateProjectsMutation = useMutation({
    mutationFn: (projectIds: string[]) => googleCloudApi.updateProjects(projectIds),
    onSuccess: () => {
      showToast('GCP projects updated successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      onClose();
    },
    onError: () => {
      showToast('Failed to update GCP projects', 'error');
    },
  });

  if (!isOpen) return null;

  const filteredProjects = gcpProjectsData?.projects?.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.projectId.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const hasChanges = JSON.stringify(selectedProjects.sort()) !== 
    JSON.stringify(currentProjectIds.sort());

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-te-gray-950 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white dark:bg-te-gray-950 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Cloud className="w-6 h-6 text-te-gray-600 dark:text-te-gray-400" />
                <h3 className="text-lg font-medium text-te-gray-900 dark:text-te-gray-100">
                  Manage GCP Projects
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-te-gray-400 hover:text-te-gray-500 dark:hover:text-te-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mb-4">
              Select which Google Cloud projects this organization can access.
            </p>

            {/* Search and Refresh */}
            <div className="flex items-center space-x-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-te-gray-400" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-te-gray-300 dark:border-te-gray-700 rounded-md bg-white dark:bg-te-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-te-yellow focus:border-te-yellow"
                />
              </div>
              <button
                onClick={() => refetch()}
                disabled={isRefetching}
                className="p-2 text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-100 disabled:opacity-50"
                title="Refresh projects"
              >
                <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Projects List */}
            <div className="border border-te-gray-300 dark:border-te-gray-700 rounded-lg max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-te-gray-400 mb-2" />
                  <p className="text-sm text-te-gray-600 dark:text-te-gray-400">Loading projects...</p>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="p-8 text-center">
                  <Cloud className="w-8 h-8 mx-auto text-te-gray-300 dark:text-te-gray-700 mb-2" />
                  <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
                    {searchQuery ? 'No projects match your search' : 'No projects found'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
                  {filteredProjects.map((project) => (
                    <label
                      key={project.projectId}
                      className="flex items-start p-4 hover:bg-te-gray-50 dark:hover:bg-te-gray-900/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
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
                      <div className="ml-3 flex-1">
                        <div className="flex items-center">
                          <span className="font-medium text-te-gray-900 dark:text-te-gray-100">
                            {project.name}
                          </span>
                          {project.selected && !selectedProjects.includes(project.projectId) && (
                            <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                              (will be removed)
                            </span>
                          )}
                          {!project.selected && selectedProjects.includes(project.projectId) && (
                            <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                              (will be added)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-te-gray-600 dark:text-te-gray-400 font-mono mt-0.5">
                          {project.projectId}
                        </p>
                        <p className="text-xs text-te-gray-500 dark:text-te-gray-500 mt-0.5">
                          Created: {new Date(project.createTime).toLocaleDateString()}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Selection Summary */}
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-te-gray-600 dark:text-te-gray-400">
                {selectedProjects.length} project{selectedProjects.length !== 1 ? 's' : ''} selected
              </span>
              {hasChanges && (
                <span className="text-te-yellow">
                  • Unsaved changes
                </span>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="bg-te-gray-50 dark:bg-te-gray-900 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            {isOwnerOrAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => updateProjectsMutation.mutate(selectedProjects)}
                  disabled={updateProjectsMutation.isPending || !hasChanges}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-te-yellow text-black text-sm font-medium hover:bg-te-yellow/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-te-yellow sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateProjectsMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-te-gray-300 dark:border-te-gray-700 shadow-sm px-4 py-2 bg-white dark:bg-te-gray-800 text-sm font-medium text-te-gray-700 dark:text-te-gray-300 hover:bg-te-gray-50 dark:hover:bg-te-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-te-yellow sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex justify-center rounded-md border border-te-gray-300 dark:border-te-gray-700 shadow-sm px-4 py-2 bg-white dark:bg-te-gray-800 text-sm font-medium text-te-gray-700 dark:text-te-gray-300 hover:bg-te-gray-50 dark:hover:bg-te-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-te-yellow sm:w-auto sm:text-sm"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}