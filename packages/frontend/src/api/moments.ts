import { 
  CreateMomentRequest, 
  UploadAssetRequest, 
  UploadAssetResponse,
  ListMomentsRequest,
  ListMomentsResponse,
  MomentDetailResponse,
  ApiResponse
} from '@gce-platform/types';
import { fetchClient } from './fetchClient';

export const momentsApi = {
  // Create a new moment
  createMoment: async (data: CreateMomentRequest): Promise<ApiResponse<{ moment: any }>> => {
    const response = await fetchClient('/api/moments/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Get upload URL for asset
  getUploadUrl: async (momentId: string, data: UploadAssetRequest): Promise<UploadAssetResponse> => {
    const response = await fetchClient(`/api/moments/${momentId}/assets/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Upload asset to GCS using signed URL
  uploadAsset: async (uploadUrl: string, file: File, onProgress?: (percent: number) => void) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  },

  // List moments
  listMoments: async (params?: ListMomentsRequest): Promise<ListMomentsResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.vmId) searchParams.append('vmId', params.vmId);
    if (params?.gitBranch) searchParams.append('gitBranch', params.gitBranch);
    if (params?.tags) params.tags.forEach(tag => searchParams.append('tags', tag));
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());

    const response = await fetchClient(`/api/moments/list?${searchParams}`);
    return response.json();
  },

  // Get moment details with assets
  getMomentDetail: async (momentId: string): Promise<MomentDetailResponse> => {
    const response = await fetchClient(`/api/moments/${momentId}`);
    return response.json();
  },

  // Delete moment
  deleteMoment: async (momentId: string): Promise<ApiResponse<void>> => {
    const response = await fetchClient(`/api/moments/${momentId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Update asset status (for internal use)
  updateAssetStatus: async (
    assetId: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    metadata?: any
  ): Promise<ApiResponse<void>> => {
    const response = await fetchClient(`/api/moments/assets/${assetId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, error, metadata }),
    });
    return response.json();
  },
};