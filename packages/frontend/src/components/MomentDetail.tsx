import React, { useState, useEffect } from 'react';
import { X, Download, Camera, Film, FileText, File, Trash2, ExternalLink, GitBranch, GitCommit, User, Clock, Server, Tag } from 'lucide-react';
import { momentsApi } from '../api/moments';
import { useToast } from '../hooks/useToast';
import { format } from 'date-fns';
import type { MomentDetailResponse } from '@gce-platform/types';

interface MomentDetailProps {
  momentId: string;
  onClose: () => void;
  onDelete?: () => void;
}

export const MomentDetail: React.FC<MomentDetailProps> = ({ momentId, onClose, onDelete }) => {
  const { showToast } = useToast();
  const [data, setData] = useState<MomentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  useEffect(() => {
    loadMomentDetail();
  }, [momentId]);

  const loadMomentDetail = async () => {
    try {
      setLoading(true);
      const response = await momentsApi.getMomentDetail(momentId);
      if (response.success) {
        setData(response);
      }
    } catch (error) {
      console.error('Error loading moment detail:', error);
      showToast('Failed to load moment details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this moment?')) {
      return;
    }

    try {
      setDeleting(true);
      const response = await momentsApi.deleteMoment(momentId);
      if (response.success) {
        showToast('Moment deleted successfully', 'success');
        onDelete?.();
        onClose();
      }
    } catch (error) {
      console.error('Error deleting moment:', error);
      showToast('Failed to delete moment', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'screenshot':
        return <Camera className="w-5 h-5" />;
      case 'screen_recording':
        return <Film className="w-5 h-5" />;
      case 'log_file':
      case 'config_file':
        return <FileText className="w-5 h-5" />;
      default:
        return <File className="w-5 h-5" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { moment, assets } = data;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
            <h2 className="text-xl font-semibold">{moment.moment.title}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                title="Delete moment"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Moment Info */}
          <div className="p-6 space-y-4 overflow-y-auto">
            {moment.moment.description && (
              <div>
                <h3 className="font-medium mb-2">Description</h3>
                <p className="text-gray-600 dark:text-gray-400">{moment.moment.description}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</h4>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span>{format(new Date(moment.moment.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              {moment.createdByUser && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Created By</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>{moment.createdByUser.name || moment.createdByUser.email}</span>
                  </div>
                </div>
              )}

              {moment.vm && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Virtual Machine</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Server className="w-4 h-4 text-gray-400" />
                    <span>{moment.vm.name}</span>
                  </div>
                </div>
              )}

              {moment.moment.tags && moment.moment.tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Tags</h4>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {moment.moment.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Git Information */}
            {(moment.moment.gitBranch || moment.moment.gitCommitHash) && (
              <div className="border-t dark:border-gray-700 pt-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  Git Information
                </h3>
                <div className="space-y-2">
                  {moment.moment.gitBranch && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24">Branch:</span>
                      <span className="font-mono text-sm">{moment.moment.gitBranch}</span>
                    </div>
                  )}
                  {moment.moment.gitCommitHash && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24">Commit:</span>
                      <span className="font-mono text-sm">{moment.moment.gitCommitHash}</span>
                    </div>
                  )}
                  {moment.moment.gitCommitMessage && (
                    <div className="flex items-start gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24">Message:</span>
                      <span className="text-sm flex-1">{moment.moment.gitCommitMessage}</span>
                    </div>
                  )}
                  {moment.moment.gitAuthor && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24">Author:</span>
                      <span className="text-sm">
                        {moment.moment.gitAuthor}
                        {moment.moment.gitAuthorEmail && ` <${moment.moment.gitAuthorEmail}>`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assets */}
            {assets.length > 0 && (
              <div className="border-t dark:border-gray-700 pt-4">
                <h3 className="font-medium mb-3">Assets ({assets.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {assets.map(({ asset, uploadedByUser, downloadUrl }) => (
                    <div
                      key={asset.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedAsset === asset.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                      onClick={() => setSelectedAsset(asset.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">{getAssetIcon(asset.assetType)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{asset.fileName}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {formatFileSize(asset.fileSizeBytes)} • {asset.mimeType}
                          </p>
                          {uploadedByUser && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Uploaded by {uploadedByUser.name || uploadedByUser.email}
                            </p>
                          )}
                        </div>
                        {downloadUrl && (
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>

                      {/* Show preview for images */}
                      {asset.assetType === 'screenshot' && downloadUrl && selectedAsset === asset.id && (
                        <div className="mt-3">
                          <img
                            src={downloadUrl}
                            alt={asset.fileName}
                            className="w-full rounded border dark:border-gray-700"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )}

                      {/* Show metadata for videos */}
                      {asset.assetType === 'screen_recording' && asset.metadata && selectedAsset === asset.id && (
                        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                          {asset.metadata.width && asset.metadata.height && (
                            <p>Resolution: {asset.metadata.width}x{asset.metadata.height}</p>
                          )}
                          {asset.metadata.duration && (
                            <p>Duration: {Math.round(asset.metadata.duration)}s</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Asset Preview Sidebar */}
        {selectedAsset && (
          <div className="w-96 border-l dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6 overflow-y-auto">
            <h3 className="font-medium mb-4">Asset Preview</h3>
            {assets.map(({ asset, downloadUrl }) => {
              if (asset.id !== selectedAsset) return null;

              return (
                <div key={asset.id} className="space-y-4">
                  {/* Image preview */}
                  {asset.assetType === 'screenshot' && downloadUrl && (
                    <div>
                      <img
                        src={downloadUrl}
                        alt={asset.fileName}
                        className="w-full rounded border dark:border-gray-700"
                      />
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-3 text-blue-500 hover:text-blue-600"
                      >
                        Open full size <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {/* Log/config file preview */}
                  {(asset.assetType === 'log_file' || asset.assetType === 'config_file') && downloadUrl && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Download to view file contents
                      </p>
                      <a
                        href={downloadUrl}
                        download={asset.fileName}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                      >
                        <Download className="w-4 h-4" />
                        Download {asset.fileName}
                      </a>
                    </div>
                  )}

                  {/* Video preview */}
                  {asset.assetType === 'screen_recording' && downloadUrl && (
                    <div>
                      <video
                        controls
                        className="w-full rounded border dark:border-gray-700"
                        src={downloadUrl}
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}

                  {/* Asset details */}
                  <div className="border-t dark:border-gray-700 pt-4 space-y-2">
                    <div>
                      <span className="text-sm text-gray-500">Type:</span>
                      <span className="ml-2 text-sm">{asset.assetType.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Size:</span>
                      <span className="ml-2 text-sm">{formatFileSize(asset.fileSizeBytes)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">MIME Type:</span>
                      <span className="ml-2 text-sm">{asset.mimeType}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Uploaded:</span>
                      <span className="ml-2 text-sm">
                        {format(new Date(asset.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};