import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';
import { useToast } from '../contexts/ToastContext';
import type { AddProjectFavoritePortRequest } from '@gce-platform/types';

interface ProjectFavoritePortsProps {
  projectId: string;
  canEdit: boolean;
}

export default function ProjectFavoritePorts({ projectId, canEdit }: ProjectFavoritePortsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [port, setPort] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  const { data: favoritePorts, isLoading } = useQuery({
    queryKey: ['project-favorite-ports', projectId],
    queryFn: () => projectsApi.getFavoritePorts(projectId),
  });

  const addMutation = useMutation({
    mutationFn: (data: AddProjectFavoritePortRequest) => 
      projectsApi.addFavoritePort(projectId, data),
    onSuccess: () => {
      showSuccess('Favorite port added successfully');
      queryClient.invalidateQueries({ queryKey: ['project-favorite-ports', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowAddForm(false);
      setPort('');
      setName('');
      setDescription('');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to add favorite port');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (portId: string) => 
      projectsApi.removeFavoritePort(projectId, portId),
    onSuccess: () => {
      showSuccess('Favorite port removed successfully');
      queryClient.invalidateQueries({ queryKey: ['project-favorite-ports', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to remove favorite port');
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!port.trim()) {
      showError('Port is required');
      return;
    }

    const portNumber = parseInt(port);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
      showError('Port must be a valid number between 1 and 65535');
      return;
    }

    addMutation.mutate({
      port: portNumber,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading favorite ports...
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
            {showAddForm ? 'Cancel' : 'Add Favorite Port'}
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="border border-te-gray-300 dark:border-te-gray-800 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="port" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
                Port Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
                placeholder="8080"
              />
            </div>

            <div>
              <label htmlFor="name" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
                Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
                placeholder="Web Server"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Description
            </label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
              placeholder="Main application web server"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors disabled:opacity-50"
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? 'Adding...' : 'Add Port'}
            </button>
          </div>
        </form>
      )}

      {favoritePorts && favoritePorts.length === 0 ? (
        <div className="text-center py-8 border border-te-gray-300 dark:border-te-gray-800">
          <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
            No favorite ports saved for this project yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {favoritePorts?.map(({ port: favoritePort, addedBy }) => (
            <div
              key={favoritePort.id}
              className="border border-te-gray-300 dark:border-te-gray-800 p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-lg font-mono font-medium">{favoritePort.port}</p>
                  {favoritePort.name && (
                    <p className="text-sm font-medium mt-1">{favoritePort.name}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => removeMutation.mutate(favoritePort.id)}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 uppercase tracking-wider"
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </button>
                )}
              </div>

              {favoritePort.description && (
                <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mb-3">
                  {favoritePort.description}
                </p>
              )}

              <p className="text-2xs text-te-gray-500 dark:text-te-gray-600 pt-3 border-t border-te-gray-200 dark:border-te-gray-800">
                Added by {addedBy.name || addedBy.email}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}