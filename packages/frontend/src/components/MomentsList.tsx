import React, { useState, useEffect } from 'react';
import { Camera, GitBranch, Clock, User, Server, Tag, ChevronRight, Film, FileText, File } from 'lucide-react';
import { momentsApi } from '../api/moments';
import { useToast } from '../hooks/useToast';
import { format } from 'date-fns';
import type { ListMomentsResponse } from '@gce-platform/types';

interface MomentsListProps {
  vmId?: string;
  onSelectMoment: (momentId: string) => void;
}

export const MomentsList: React.FC<MomentsListProps> = ({ vmId, onSelectMoment }) => {
  const { showToast } = useToast();
  const [moments, setMoments] = useState<ListMomentsResponse['moments']>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const pageSize = 20;

  const loadMoments = async () => {
    try {
      setLoading(true);
      const response = await momentsApi.listMoments({
        vmId,
        gitBranch: selectedBranch || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        limit: pageSize,
        offset: page * pageSize,
      });

      if (response.success) {
        setMoments(response.moments);
        setTotal(response.total);
      }
    } catch (error) {
      console.error('Error loading moments:', error);
      showToast('Failed to load moments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMoments();
  }, [vmId, page, selectedBranch, selectedTags]);

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'screenshot':
        return <Camera className="w-4 h-4" />;
      case 'screen_recording':
        return <Film className="w-4 h-4" />;
      case 'log_file':
      case 'config_file':
        return <FileText className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  const getAllTags = () => {
    const tagsSet = new Set<string>();
    moments.forEach(m => {
      (m.moment.tags || []).forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  };

  const getAllBranches = () => {
    const branchesSet = new Set<string>();
    moments.forEach(m => {
      if (m.moment.gitBranch) {
        branchesSet.add(m.moment.gitBranch);
      }
    });
    return Array.from(branchesSet).sort();
  };

  if (loading && page === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const allTags = getAllTags();
  const allBranches = getAllBranches();

  return (
    <div className="space-y-4">
      {/* Filters */}
      {(allBranches.length > 0 || allTags.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-3">
          {allBranches.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Filter by Branch</label>
              <select
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setPage(0);
                }}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">All branches</option>
                {allBranches.map(branch => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </div>
          )}

          {allTags.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Filter by Tags</label>
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setSelectedTags(prev => 
                        prev.includes(tag) 
                          ? prev.filter(t => t !== tag)
                          : [...prev, tag]
                      );
                      setPage(0);
                    }}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Moments List */}
      {moments.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
          <Camera className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600 dark:text-gray-400">No moments captured yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Create a moment to capture the current state of your work
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {moments.map(({ moment, createdByUser, vm, assetCount }) => (
            <div
              key={moment.id}
              onClick={() => onSelectMoment(moment.id)}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{moment.title}</h3>
                  {moment.description && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                      {moment.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {format(new Date(moment.createdAt), 'MMM d, yyyy h:mm a')}
                    </div>

                    {createdByUser && (
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {createdByUser.name || createdByUser.email}
                      </div>
                    )}

                    {vm && (
                      <div className="flex items-center gap-1">
                        <Server className="w-4 h-4" />
                        {vm.name}
                      </div>
                    )}

                    {moment.gitBranch && (
                      <div className="flex items-center gap-1">
                        <GitBranch className="w-4 h-4" />
                        {moment.gitBranch}
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {moment.tags && moment.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {moment.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Git commit info */}
                  {moment.gitCommitHash && (
                    <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono">
                      <div className="text-gray-600 dark:text-gray-400">
                        {moment.gitCommitHash.substring(0, 7)}
                        {moment.gitCommitMessage && ` - ${moment.gitCommitMessage}`}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 ml-4">
                  {assetCount > 0 && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Camera className="w-4 h-4" />
                      <span className="text-sm">{assetCount}</span>
                    </div>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page + 1} of {Math.ceil(total / pageSize)}
          </span>
          
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * pageSize >= total}
            className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};