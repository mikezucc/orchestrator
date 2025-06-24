import axios from 'axios';

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