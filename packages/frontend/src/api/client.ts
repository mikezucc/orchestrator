import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
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
    return config;
  }
  
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
  
  return config;
});