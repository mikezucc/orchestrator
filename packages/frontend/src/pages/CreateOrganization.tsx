import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { organizationApi } from '../api/organizations';
import { useOrganization } from '../contexts/OrganizationContext';

export default function CreateOrganization() {
  const [organizationName, setOrganizationName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { refreshOrganizations } = useOrganization();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsCreating(true);

    try {
      await organizationApi.createOrganization(organizationName);
      await refreshOrganizations();
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-te-gray-100 dark:bg-te-gray-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-te-gray-950 rounded-lg shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold text-te-gray-900 dark:text-te-gray-100">
            Welcome!
          </h2>
          <p className="mt-2 text-center text-sm text-te-gray-600 dark:text-te-gray-400">
            Let's create your organization to get started
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="org-name" className="block text-sm font-medium text-te-gray-700 dark:text-te-gray-300">
              Organization Name
            </label>
            <input
              id="org-name"
              type="text"
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-te-gray-300 dark:border-te-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-te-yellow focus:border-te-yellow dark:bg-te-gray-900 dark:text-te-gray-100"
              placeholder="My Organization"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isCreating || !organizationName.trim()}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-te-yellow hover:bg-te-yellow/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-te-yellow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}