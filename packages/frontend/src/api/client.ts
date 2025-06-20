import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
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