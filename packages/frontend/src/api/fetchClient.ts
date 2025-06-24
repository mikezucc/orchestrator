import { ApiResponse } from '../types';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

class FetchClient {
  private baseURL: string;

  constructor(baseURL: string = '') {
    this.baseURL = baseURL;
  }

  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {};
    
    // Check for OTP auth token first
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-user-id'] = user.id;
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    } else {
      // Fall back to Google auth
      const authData = localStorage.getItem('auth');
      if (authData) {
        try {
          const auth = JSON.parse(authData);
          if (auth.accessToken) {
            headers['Authorization'] = `Bearer ${auth.accessToken}`;
          }
        } catch (e) {
          console.error('Failed to parse auth data:', e);
        }
      }
    }

    // Add organization ID if available
    const organizationId = localStorage.getItem('currentOrganizationId');
    if (organizationId) {
      headers['x-organization-id'] = organizationId;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        data: null as any,
        error: errorData.error || `HTTP error! status: ${response.status}`,
      };
    }

    try {
      const data = await response.json();
      // The server already returns ApiResponse<T>, so we just return it as-is
      return data as ApiResponse<T>;
    } catch (e) {
      return {
        success: false,
        data: null as any,
        error: 'Failed to parse response',
      };
    }
  }

  async request<T>(endpoint: string, options: FetchOptions = {}): Promise<ApiResponse<T>> {
    const { skipAuth, headers: customHeaders, ...restOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(!skipAuth ? this.getAuthHeaders() : {}),
      ...customHeaders,
    };

    const url = this.baseURL ? `${this.baseURL}${endpoint}` : endpoint;

    try {
      const response = await fetch(url, {
        ...restOptions,
        headers,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        success: false,
        data: null as any,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  async get<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any, options?: FetchOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: any, options?: FetchOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async patch<T>(endpoint: string, body?: any, options?: FetchOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

// Dynamically determine API base URL based on current window location
const getApiBaseURL = () => {
  if (process.env.NODE_ENV === 'production') {
    // In production, use relative path
    return '/api';
  }
  
  // In development, check if we're accessing from a non-localhost address
  const { protocol, hostname } = window.location;
  
  // If accessing from localhost, use the default development URL
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  
  // Otherwise, use the same hostname with port 3000
  return `${protocol}//${hostname}:3000/api`;
};

// Create default instance for API server
const apiBaseURL = getApiBaseURL();

export const fetchClient = new FetchClient(apiBaseURL);

// Export class for creating custom instances (e.g., for direct VM communication)
export { FetchClient };