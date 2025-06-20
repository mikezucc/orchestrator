import { useQuery } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { data: vmsResponse, isLoading } = useQuery({
    queryKey: ['vms'],
    queryFn: vmApi.list,
  });

  const vms = vmsResponse?.data || [];
  const runningVMs = vms.filter(vm => vm.status === 'running').length;
  const stoppedVMs = vms.filter(vm => vm.status === 'stopped').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold uppercase tracking-wider mb-2">Dashboard</h1>
        <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
          System Overview
        </p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                Total VMs
              </p>
              <p className="text-2xl font-bold tabular-nums">{vms.length}</p>
            </div>
            <div className="p-2 bg-te-gray-100 dark:bg-te-gray-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                Running
              </p>
              <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-te-yellow">
                {runningVMs}
              </p>
            </div>
            <div className="p-2 bg-green-50 dark:bg-te-gray-800 text-green-600 dark:text-te-yellow">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                Stopped
              </p>
              <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-te-orange">
                {stoppedVMs}
              </p>
            </div>
            <div className="p-2 bg-red-50 dark:bg-te-gray-800 text-red-600 dark:text-te-orange">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold uppercase tracking-wider">Recent Machines</h2>
          <Link to="/vms" className="link text-xs uppercase tracking-wider">
            View All →
          </Link>
        </div>
        
        <div className="card p-0 overflow-hidden">
          {vms.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
                No virtual machines found
              </p>
              <Link to="/vms" className="btn-primary inline-block mt-4">
                Create Your First VM
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Zone</th>
                  <th className="text-left px-4 py-3">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
                {vms.slice(0, 5).map((vm) => (
                  <tr key={vm.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        vm.status === 'running' 
                          ? 'bg-green-500 dark:bg-te-yellow' 
                          : 'bg-te-gray-400 dark:bg-te-gray-600'
                      }`} />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/vms/${vm.id}`} className="link font-medium">
                        {vm.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                      {vm.zone}
                    </td>
                    <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                      {vm.machineType}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}