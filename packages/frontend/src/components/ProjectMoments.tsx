import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';

interface ProjectMomentsProps {
  projectId: string;
}

export default function ProjectMoments({ projectId }: ProjectMomentsProps) {
  const { data: moments, isLoading } = useQuery({
    queryKey: ['project-moments', projectId],
    queryFn: () => projectsApi.getMoments(projectId),
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading moments...
        </p>
      </div>
    );
  }

  if (!moments || moments.length === 0) {
    return (
      <div className="text-center py-8 border border-te-gray-300 dark:border-te-gray-800">
        <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
          No moments associated with this project yet.
        </p>
        <p className="text-xs text-te-gray-500 dark:text-te-gray-600 mt-2">
          Moments from linked repositories will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {moments.map(({ projectMoment, moment, assetCount, addedBy }) => (
        <div
          key={projectMoment.id}
          className="border border-te-gray-300 dark:border-te-gray-800 p-4"
        >
          <h3 className="text-sm font-medium mb-2">{moment.title}</h3>
          
          {moment.description && (
            <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mb-3 line-clamp-2">
              {moment.description}
            </p>
          )}

          <div className="space-y-1 mb-3">
            {moment.gitBranch && (
              <div className="flex justify-between text-xs">
                <span className="text-te-gray-500 dark:text-te-gray-600">Branch</span>
                <span className="text-te-gray-700 dark:text-te-gray-400">{moment.gitBranch}</span>
              </div>
            )}
            {moment.gitCommitHash && (
              <div className="flex justify-between text-xs">
                <span className="text-te-gray-500 dark:text-te-gray-600">Commit</span>
                <span className="text-te-gray-700 dark:text-te-gray-400 font-mono">
                  {moment.gitCommitHash.substring(0, 7)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-te-gray-500 dark:text-te-gray-600">Assets</span>
              <span className="text-te-gray-700 dark:text-te-gray-400">{assetCount}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-te-gray-200 dark:border-te-gray-800">
            <p className="text-2xs text-te-gray-500 dark:text-te-gray-600">
              Added by {addedBy.name || addedBy.email} on {new Date(projectMoment.addedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}