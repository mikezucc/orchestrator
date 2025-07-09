import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';
import { useToast } from '../contexts/ToastContext';
import type { Project, UpdateProjectRequest } from '@gce-platform/types';

interface EditProjectModalProps {
  project: Project;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditProjectModal({ project, onClose, onSuccess }: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [tags, setTags] = useState(project.tags ? project.tags.join(', ') : '');
  const { showError, showSuccess } = useToast();

  const updateMutation = useMutation({
    mutationFn: (data: UpdateProjectRequest) => projectsApi.update(project.id, data),
    onSuccess: () => {
      showSuccess('Project updated successfully');
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to update project');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      showError('Project name is required');
      return;
    }

    const updateData: UpdateProjectRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };

    updateMutation.mutate(updateData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-te-gray-900 border border-te-gray-300 dark:border-te-gray-800 p-6 w-full max-w-md">
        <h2 className="text-base font-semibold mb-4">Edit Project</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
              placeholder="My Awesome Project"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
              placeholder="Brief description of your project..."
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="tags" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Tags
            </label>
            <input
              type="text"
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
              placeholder="web, api, frontend (comma-separated)"
            />
            <p className="text-2xs text-te-gray-500 dark:text-te-gray-600 mt-1">
              Separate tags with commas
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100 transition-colors"
              disabled={updateMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors disabled:opacity-50"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}