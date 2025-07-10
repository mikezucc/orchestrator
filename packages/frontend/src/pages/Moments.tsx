import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Moment, MomentAsset, ListMomentsResponse } from '@gce-platform/types';

interface MomentWithDetails {
  moment: Moment;
  assets: MomentAsset[];
  createdByUser: {
    id: string;
    email: string;
    name?: string;
  };
  vm?: {
    id: string;
    name: string;
  };
}

export default function Moments() {
  const [moments, setMoments] = useState<MomentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentOrganizationId } = useAuth();
  const { showError } = useToast();

  useEffect(() => {
    if (currentOrganizationId) {
      fetchMoments();
    }
  }, [currentOrganizationId]);

  const fetchMoments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/moments?organizationId=${currentOrganizationId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch moments');
      }

      const data: ListMomentsResponse = await response.json();
      if (data.success && data.moments) {
        setMoments(data.moments);
      }
    } catch (error) {
      console.error('Error fetching moments:', error);
      showError('Failed to load moments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading moments...
        </div>
      </div>
    );
  }

  if (moments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <svg className="w-16 h-16 text-te-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-te-gray-600 dark:text-te-gray-500 uppercase tracking-wider">
          No moments captured yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold uppercase tracking-wider">Moments</h2>
        <span className="text-xs uppercase tracking-wider text-te-gray-500">
          {moments.length} {moments.length === 1 ? 'moment' : 'moments'}
        </span>
      </div>

      <div className="grid gap-6">
        {moments.map((item) => (
          <div
            key={item.moment.id}
            className="bg-white dark:bg-te-gray-900 border border-te-gray-300 dark:border-te-gray-800 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-te-gray-300 dark:border-te-gray-800">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-base font-semibold">{item.moment.title}</h3>
                  {item.moment.description && (
                    <p className="text-sm text-te-gray-600 dark:text-te-gray-500 mt-1">
                      {item.moment.description}
                    </p>
                  )}
                  <div className="flex items-center space-x-4 mt-2 text-xs text-te-gray-500">
                    <span>Created by {item.createdByUser.email}</span>
                    {item.vm && <span>VM: {item.vm.name}</span>}
                  </div>
                </div>
                <span className="text-xs text-te-gray-500 dark:text-te-gray-600 uppercase tracking-wider ml-4">
                  {formatDate(item.moment.createdAt)}
                </span>
              </div>
            </div>

            {/* Assets - Large Previews */}
            {item.assets && item.assets.length > 0 && (
              <div className="p-6 space-y-6 bg-te-gray-50 dark:bg-te-gray-950">
                {item.assets.map((asset) => (
                  <div key={asset.id} className="space-y-2">
                    {asset.assetType === 'screenshot' && (
                      <div className="relative">
                        <img
                          src={`${import.meta.env.VITE_API_URL}/moments/${item.moment.id}/assets/${asset.id}/download`}
                          alt={asset.fileName}
                          className="w-full h-auto rounded-lg shadow-lg border border-te-gray-300 dark:border-te-gray-700"
                          style={{ maxHeight: '600px', objectFit: 'contain' }}
                        />
                        <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mt-2">
                          {asset.fileName}
                        </p>
                      </div>
                    )}
                    {asset.assetType === 'screen_recording' && (
                      <div className="relative">
                        <video
                          controls
                          className="w-full h-auto rounded-lg shadow-lg border border-te-gray-300 dark:border-te-gray-700"
                          style={{ maxHeight: '600px' }}
                        >
                          <source
                            src={`${import.meta.env.VITE_API_URL}/moments/${item.moment.id}/assets/${asset.id}/download`}
                            type={asset.mimeType}
                          />
                          Your browser does not support the video tag.
                        </video>
                        <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mt-2">
                          {asset.fileName}
                        </p>
                      </div>
                    )}
                    {(asset.assetType === 'log_file' || asset.assetType === 'config_file' || asset.assetType === 'other') && (
                      <a
                        href={`${import.meta.env.VITE_API_URL}/moments/${item.moment.id}/assets/${asset.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 p-4 bg-white dark:bg-te-gray-800 rounded-lg hover:bg-te-gray-100 dark:hover:bg-te-gray-700 transition-colors border border-te-gray-300 dark:border-te-gray-700"
                      >
                        <svg className="w-6 h-6 text-te-gray-600 dark:text-te-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-te-gray-700 dark:text-te-gray-300">
                            {asset.fileName}
                          </span>
                          <span className="text-xs text-te-gray-500 dark:text-te-gray-600 block">
                            {asset.assetType.replace('_', ' ')} • {(asset.fileSizeBytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Git Information */}
            {item.moment.gitCommitHash && (
              <div className="p-4 bg-te-gray-50 dark:bg-te-gray-950 border-t border-te-gray-300 dark:border-te-gray-800">
                <div className="text-xs space-y-1">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-te-gray-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span className="text-te-gray-600 dark:text-te-gray-500">
                      {item.moment.gitBranch} • {item.moment.gitCommitHash.substring(0, 7)}
                    </span>
                  </div>
                  {item.moment.gitCommitMessage && (
                    <p className="text-te-gray-600 dark:text-te-gray-500 pl-6">
                      {item.moment.gitCommitMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tags and Metadata */}
            <div className="px-4 py-3 bg-white dark:bg-te-gray-900 border-t border-te-gray-300 dark:border-te-gray-800">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-4">
                  {item.moment.tags && item.moment.tags.length > 0 && (
                    <div className="flex items-center space-x-2">
                      {item.moment.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-te-yellow bg-opacity-20 text-te-yellow-dark rounded uppercase tracking-wider"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-te-gray-500 dark:text-te-gray-600 uppercase tracking-wider">
                  ID: {item.moment.id.substring(0, 8)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}