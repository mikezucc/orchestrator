import axios from 'axios';

// Dynamically determine API base URL based on current window location
const getApiBaseURL = () => {
  // Check for explicit API URL in environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  const { protocol, hostname } = window.location;
  
  // Production mode with specific domain handling
  if (process.env.NODE_ENV === 'production') {
    // If on slopbox.dev or www.slopbox.dev, use api.slopbox.dev
    if (hostname === 'slopbox.dev' || hostname === 'www.slopbox.dev') {
      return `${protocol}//api.slopbox.dev/api`;
    }
    // Otherwise use relative path (same domain)
    return '/api';
  }
  
  // Development mode
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  
  // Non-localhost development (e.g., accessing via IP)
  return `${protocol}//${hostname}:3000/api`;
};

const apiBaseURL = getApiBaseURL();

export const api = axios.create({
  baseURL: apiBaseURL,
});

api.interceptors.request.use((config) => {
  // Check for OTP auth token first
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        config.headers['x-user-id'] = userData.id;
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    }
  } else {
    // Fall back to Google auth
    const userId = localStorage.getItem('userId');
    const authData = localStorage.getItem('auth');
    
    if (userId) {
      config.headers['x-user-id'] = userId;
    }
    
    if (authData) {
      try {
        const auth = JSON.parse(authData);
        if (auth.accessToken) {
          config.headers['Authorization'] = `Bearer ${auth.accessToken}`;
        }
      } catch (error) {
        console.error('Failed to parse auth data:', error);
      }
    }
  }
  
  // Add organization ID if available
  const organizationId = localStorage.getItem('currentOrganizationId');
  if (organizationId) {
    config.headers['x-organization-id'] = organizationId;
  }
  
  return config;
});