import { useState, useEffect } from 'react';

const PROJECTS_KEY = 'gcp-projects';

export function useProjects() {
  const [projects, setProjects] = useState<string[]>(() => {
    const stored = localStorage.getItem(PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  const addProject = (projectId: string) => {
    if (!projects.includes(projectId)) {
      setProjects([...projects, projectId]);
    }
  };

  const removeProject = (projectId: string) => {
    setProjects(projects.filter(p => p !== projectId));
  };

  const clearProjects = () => {
    setProjects([]);
  };

  return {
    projects,
    addProject,
    removeProject,
    clearProjects,
  };
}