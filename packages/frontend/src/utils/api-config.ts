// Shared API configuration utilities

export const getApiBaseURL = () => {
  // Check for explicit API URL in environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  const { protocol, hostname } = window.location;
  
  // Production mode with specific domain handling
  if (import.meta.env.PROD || process.env.NODE_ENV === 'production') {
    // If on onfacet.dev or www.onfacet.dev, use api.onfacet.dev
    if (hostname === 'onfacet.dev' || hostname === 'www.onfacet.dev') {
      return `${protocol}//api.onfacet.dev/api`;
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

export const getWebSocketBaseURL = () => {
  const apiUrl = getApiBaseURL();
  
  // Convert HTTP to WebSocket protocol and remove /api suffix
  return apiUrl
    .replace('http:', 'ws:')
    .replace('https:', 'wss:')
    .replace('/api', '');
};