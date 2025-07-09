import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, Camera, FileText, Film, Plus, GitBranch, GitCommit } from 'lucide-react';
import { momentsApi } from '../api/moments';
import { useToast } from '../hooks/useToast';
import type { CreateMomentRequest, UploadAssetRequest } from '@gce-platform/types';

interface MomentCaptureProps {
  vmId?: string;
  vmName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FileUpload {
  id: string;
  file: File;
  type: UploadAssetRequest['assetType'];
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export const MomentCapture: React.FC<MomentCaptureProps> = ({
  vmId,
  vmName,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // Git info
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [gitCommitHash, setGitCommitHash] = useState('');
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [gitAuthor, setGitAuthor] = useState('');
  const [gitAuthorEmail, setGitAuthorEmail] = useState('');
  
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [momentId, setMomentId] = useState<string | null>(null);

  const getAssetType = (file: File): UploadAssetRequest['assetType'] => {
    if (file.type.startsWith('image/')) return 'screenshot';
    if (file.type.startsWith('video/')) return 'screen_recording';
    if (file.name.endsWith('.log') || file.name.endsWith('.txt')) return 'log_file';
    if (file.name.endsWith('.json') || file.name.endsWith('.yaml') || file.name.endsWith('.yml')) return 'config_file';
    return 'other';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newUploads: FileUpload[] = selectedFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      type: getAssetType(file),
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...newUploads]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newUploads: FileUpload[] = droppedFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      type: getAssetType(file),
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...newUploads]);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags(prev => [...prev, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  };

  const uploadFile = async (upload: FileUpload, momentId: string) => {
    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === upload.id ? { ...f, status: 'uploading' } : f
      ));

      // Get signed upload URL
      const { uploadUrl, assetId } = await momentsApi.getUploadUrl(momentId, {
        assetType: upload.type,
        fileName: upload.file.name,
        mimeType: upload.file.type || 'application/octet-stream',
        fileSizeBytes: upload.file.size,
        uploadMethod: 'web_ui',
      });

      // Upload to GCS
      await momentsApi.uploadAsset(uploadUrl, upload.file, (progress) => {
        setFiles(prev => prev.map(f => 
          f.id === upload.id ? { ...f, progress } : f
        ));
      });

      // Mark as completed
      setFiles(prev => prev.map(f => 
        f.id === upload.id ? { ...f, status: 'completed', progress: 100 } : f
      ));

      // Update asset status
      await momentsApi.updateAssetStatus(assetId, 'completed');
    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => 
        f.id === upload.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ));
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      showToast('Please enter a title', 'error');
      return;
    }

    setIsCreating(true);

    try {
      // Create moment
      const momentData: CreateMomentRequest = {
        vmId,
        title: title.trim(),
        description: description.trim(),
        tags,
        repositoryUrl: repositoryUrl.trim() || undefined,
        gitBranch: gitBranch.trim() || undefined,
        gitCommitHash: gitCommitHash.trim() || undefined,
        gitCommitMessage: gitCommitMessage.trim() || undefined,
        gitAuthor: gitAuthor.trim() || undefined,
        gitAuthorEmail: gitAuthorEmail.trim() || undefined,
      };

      const response = await momentsApi.createMoment(momentData);
      if (!response.success || !response.moment) {
        throw new Error('Failed to create moment');
      }

      const newMomentId = response.moment.id;
      setMomentId(newMomentId);

      // Upload all files
      if (files.length > 0) {
        await Promise.all(
          files.map(file => uploadFile(file, newMomentId))
        );
      }

      showToast('Moment created successfully', 'success');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating moment:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to create moment',
        'error'
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold">Capture Moment</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="text-lg font-medium mb-4">Basic Information</h3>
              {vmName && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  VM: {vmName}
                </p>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="e.g., Homepage redesign complete"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    rows={3}
                    placeholder="Describe what changed or what this moment captures..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tags</label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="hover:text-blue-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Add a tag..."
                    />
                    <button
                      onClick={addTag}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Git Information */}
            <div>
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Git Information (Optional)
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Repository URL</label>
                  <input
                    type="text"
                    value={repositoryUrl}
                    onChange={(e) => setRepositoryUrl(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="https://github.com/username/repo.git"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Branch</label>
                  <input
                    type="text"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="main"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Commit Hash</label>
                  <input
                    type="text"
                    value={gitCommitHash}
                    onChange={(e) => setGitCommitHash(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="abc123..."
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Commit Message</label>
                  <input
                    type="text"
                    value={gitCommitMessage}
                    onChange={(e) => setGitCommitMessage(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="feat: Add new homepage design"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Author</label>
                  <input
                    type="text"
                    value={gitAuthor}
                    onChange={(e) => setGitAuthor(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Author Email</label>
                  <input
                    type="email"
                    value={gitAuthorEmail}
                    onChange={(e) => setGitAuthorEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    placeholder="john@example.com"
                  />
                </div>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <h3 className="text-lg font-medium mb-4">Assets</h3>
              
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center"
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Drag and drop files here, or click to browse
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Supports images, videos, logs, and config files (max 500MB each)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,video/*,.log,.txt,.json,.yaml,.yml"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Select Files
                </button>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {file.type === 'screenshot' && <Camera className="w-5 h-5 text-blue-500" />}
                        {file.type === 'screen_recording' && <Film className="w-5 h-5 text-purple-500" />}
                        {file.type === 'log_file' && <FileText className="w-5 h-5 text-green-500" />}
                        {file.type === 'config_file' && <FileText className="w-5 h-5 text-orange-500" />}
                        {file.type === 'other' && <FileText className="w-5 h-5 text-gray-500" />}
                        
                        <div>
                          <p className="font-medium text-sm">{file.file.name}</p>
                          <p className="text-xs text-gray-500">
                            {(file.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {file.status === 'uploading' && (
                          <div className="w-32">
                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {file.status === 'completed' && (
                          <span className="text-green-500 text-sm">Uploaded</span>
                        )}
                        {file.status === 'error' && (
                          <span className="text-red-500 text-sm">{file.error}</span>
                        )}
                        {file.status === 'pending' && (
                          <button
                            onClick={() => removeFile(file.id)}
                            className="text-gray-500 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !title.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Moment'}
          </button>
        </div>
      </div>
    </div>
  );
};