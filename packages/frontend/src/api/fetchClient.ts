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
    const userData = localStorage.getItem('userData');
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-user-id'] = user.id;
        return headers;
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }

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

// Create default instance for API server
const apiBaseURL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3000/api';

export const fetchClient = new FetchClient(apiBaseURL);

// Export class for creating custom instances (e.g., for direct VM communication)
export { FetchClient };