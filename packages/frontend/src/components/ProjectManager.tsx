import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';

interface ProjectManagerProps {
  onClose: () => void;
}

export default function ProjectManager({ onClose }: ProjectManagerProps) {
  const { projects, addProject, removeProject } = useProjects();
  const [newProject, setNewProject] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProject.trim()) {
      addProject(newProject.trim());
      setNewProject('');
    }
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold uppercase tracking-wider">Manage GCP Projects</h2>
          <button
            onClick={onClose}
            className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Add Project IDs to sync VMs from
            </p>
            <form onSubmit={handleAdd} className="flex space-x-2">
              <input
                type="text"
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                placeholder="my-project-123456"
                className="flex-1"
              />
              <button type="submit" className="btn-primary">
                Add
              </button>
            </form>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Active Projects ({projects.length})
            </p>
            {projects.length === 0 ? (
              <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
                No projects configured. Add a project ID to sync VMs.
              </p>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project}
                    className="flex items-center justify-between p-2 bg-te-gray-100 dark:bg-te-gray-800"
                  >
                    <span className="font-mono text-sm">{project}</span>
                    <button
                      onClick={() => removeProject(project)}
                      className="text-xs uppercase tracking-wider text-red-600 dark:text-te-orange hover:text-red-700 dark:hover:text-te-yellow transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-te-gray-200 dark:border-te-gray-800">
            <button onClick={onClose} className="btn-secondary w-full">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}