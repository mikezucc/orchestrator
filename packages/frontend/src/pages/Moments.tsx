import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { momentsApi } from '../api/moments';
import type { Moment, MomentAsset } from '@gce-platform/types';

interface MomentWithDetails {
  moment: Moment;
  createdByUser: {
    id: string;
    email: string;
    name?: string;
  };
  vm?: {
    id: string;
    name: string;
  };
  assetCount?: number;
}

interface MomentAssets {
  [momentId: string]: MomentAsset[];
}

export default function Moments() {
  const [moments, setMoments] = useState<MomentWithDetails[]>([]);
  const [momentAssets, setMomentAssets] = useState<MomentAssets>({});
  const [expandedMoments, setExpandedMoments] = useState<Set<string>>(new Set());
  const [loadingAssets, setLoadingAssets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { currentOrganizationId } = useAuth();
  const { showError } = useToast();

  useEffect(() => {
    if (currentOrganizationId) {
      fetchMoments();
    }
  }, [currentOrganizationId]);

  // Automatically load assets for all moments when they are fetched
  useEffect(() => {
    moments.forEach(item => {
      if (item.assetCount && item.assetCount > 0 && !momentAssets[item.moment.id]) {
        fetchMomentAssets(item.moment.id);
      }
    });
  }, [moments]);

  const fetchMoments = async () => {
    try {
      setLoading(true);
      const response = await momentsApi.listMoments();
      
      if (response.moments) {
        setMoments(response.moments || []);
      }
    } catch (error) {
      console.error('Error fetching moments:', error);
      showError('Failed to load moments');
    } finally {
      setLoading(false);
    }
  };

  const fetchMomentAssets = async (momentId: string) => {
    try {
      setLoadingAssets(prev => new Set(prev).add(momentId));
      const response = await momentsApi.getMomentDetail(momentId);
      
      if (response.success && response.data) {
        // Extract the asset objects from the response
        const assetsWithUrls = response.data.assets || [];
        const assets = assetsWithUrls.map((item: any) => ({
          ...item.asset,
          downloadUrl: item.downloadUrl
        }));
        setMomentAssets(prev => ({ ...prev, [momentId]: assets }));
      }
    } catch (error) {
      console.error('Error fetching moment assets:', error);
      showError('Failed to load moment details');
    } finally {
      setLoadingAssets(prev => {
        const newSet = new Set(prev);
        newSet.delete(momentId);
        return newSet;
      });
    }
  };

  const toggleMomentExpanded = async (momentId: string) => {
    const isExpanded = expandedMoments.has(momentId);
    
    if (isExpanded) {
      setExpandedMoments(prev => {
        const newSet = new Set(prev);
        newSet.delete(momentId);
        return newSet;
      });
    } else {
      setExpandedMoments(prev => new Set(prev).add(momentId));
      
      // Fetch assets if not already loaded
      if (!momentAssets[momentId]) {
        await fetchMomentAssets(momentId);
      }
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

      <div className="space-y-8">
        {moments.map((item) => (
          <div
            key={item.moment.id}
            className="bg-white dark:bg-te-gray-900 border border-te-gray-300 dark:border-te-gray-800 rounded-lg overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row">
              {/* Left Side - Large Asset Previews */}
              <div className="lg:w-2/3 bg-te-gray-50 dark:bg-te-gray-950">
                {loadingAssets.has(item.moment.id) ? (
                  <div className="flex items-center justify-center h-96 p-8">
                    <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
                      Loading assets...
                    </div>
                  </div>
                ) : momentAssets[item.moment.id] && momentAssets[item.moment.id].length > 0 ? (
                  <div className="p-6 space-y-6">
                    {momentAssets[item.moment.id].map((asset) => (
                      <div key={asset.id} className="space-y-2">
                        {asset.assetType === 'screenshot' && (
                          <div className="relative">
                            <img
                              src={(asset as any).downloadUrl || `${import.meta.env.VITE_API_URL}/moments/${item.moment.id}/assets/${asset.id}/download`}
                              alt={asset.fileName}
                              className="w-full h-auto rounded-lg shadow-xl"
                              style={{ maxHeight: '800px', objectFit: 'contain' }}
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
                              className="w-full h-auto rounded-lg shadow-xl"
                              style={{ maxHeight: '800px' }}
                            >
                              <source
                                src={(asset as any).downloadUrl || `${import.meta.env.VITE_API_URL}/moments/${item.moment.id}/assets/${asset.id}/download`}
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
                            href={(asset as any).downloadUrl || `${import.meta.env.VITE_API_URL}/moments/${item.moment.id}/assets/${asset.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-3 p-6 bg-white dark:bg-te-gray-800 rounded-lg hover:bg-te-gray-100 dark:hover:bg-te-gray-700 transition-colors border border-te-gray-300 dark:border-te-gray-700"
                          >
                            <svg className="w-8 h-8 text-te-gray-600 dark:text-te-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                ) : (
                  <div className="flex items-center justify-center h-96 p-8">
                    <p className="text-sm text-te-gray-500 dark:text-te-gray-600 uppercase tracking-wider">
                      No assets attached
                    </p>
                  </div>
                )}
              </div>

              {/* Right Side - Moment Details */}
              <div className="lg:w-1/3 p-6 space-y-6">
                {/* Title and Description */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">{item.moment.title}</h3>
                  {item.moment.description && (
                    <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
                      {item.moment.description}
                    </p>
                  )}
                </div>

                {/* Metadata */}
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-te-gray-500 dark:text-te-gray-600">Created</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">
                      {formatDate(item.moment.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-te-gray-500 dark:text-te-gray-600">By</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">
                      {item.createdByUser.email}
                    </span>
                  </div>
                  {item.vm && (
                    <div className="flex items-center justify-between">
                      <span className="text-te-gray-500 dark:text-te-gray-600">VM</span>
                      <span className="text-te-gray-700 dark:text-te-gray-400">
                        {item.vm.name}
                      </span>
                    </div>
                  )}
                  {item.assetCount !== undefined && item.assetCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-te-gray-500 dark:text-te-gray-600">Assets</span>
                      <span className="text-te-gray-700 dark:text-te-gray-400">
                        {item.assetCount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Git Information */}
                {item.moment.gitCommitHash && (
                  <div className="pt-4 border-t border-te-gray-300 dark:border-te-gray-800">
                    <h4 className="text-sm font-medium mb-3 flex items-center space-x-2">
                      <svg className="w-4 h-4 text-te-gray-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      <span>Git Information</span>
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-te-gray-500 dark:text-te-gray-600">Branch:</span>
                        <span className="ml-2 text-te-gray-700 dark:text-te-gray-400">
                          {item.moment.gitBranch}
                        </span>
                      </div>
                      <div>
                        <span className="text-te-gray-500 dark:text-te-gray-600">Commit:</span>
                        <span className="ml-2 text-te-gray-700 dark:text-te-gray-400 font-mono">
                          {item.moment.gitCommitHash.substring(0, 7)}
                        </span>
                      </div>
                      {item.moment.gitCommitMessage && (
                        <div className="mt-2">
                          <p className="text-te-gray-600 dark:text-te-gray-500 italic">
                            "{item.moment.gitCommitMessage}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {item.moment.tags && item.moment.tags.length > 0 && (
                  <div className="pt-4 border-t border-te-gray-300 dark:border-te-gray-800">
                    <h4 className="text-sm font-medium mb-3">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {item.moment.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-te-yellow bg-opacity-20 text-te-yellow-dark rounded-full text-xs uppercase tracking-wider"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ID */}
                <div className="pt-4 border-t border-te-gray-300 dark:border-te-gray-800">
                  <span className="text-xs text-te-gray-500 dark:text-te-gray-600 uppercase tracking-wider">
                    ID: {item.moment.id.substring(0, 8)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}