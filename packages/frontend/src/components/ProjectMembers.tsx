import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';

interface ProjectMembersProps {
  projectId: string;
  canEdit: boolean;
}

export default function ProjectMembers({ projectId, canEdit }: ProjectMembersProps) {
  const { data: members, isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => projectsApi.getMembers(projectId),
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading members...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="text-right">
          <p className="text-xs text-te-gray-500 dark:text-te-gray-600">
            Member management coming soon
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {members?.map(({ member, user }) => (
          <div
            key={`${member.projectId}-${member.userId}`}
            className="border border-te-gray-300 dark:border-te-gray-800 p-4"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-sm font-medium">{user.name || user.email}</p>
                {user.name && (
                  <p className="text-xs text-te-gray-500 dark:text-te-gray-600">{user.email}</p>
                )}
              </div>
              <span className="text-2xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600 bg-te-gray-100 dark:bg-te-gray-900 px-2 py-1">
                {member.role}
              </span>
            </div>
            
            <p className="text-2xs text-te-gray-500 dark:text-te-gray-600 mt-3">
              Joined {new Date(member.addedAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}