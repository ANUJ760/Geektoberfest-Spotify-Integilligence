import axios from 'axios';

// Set up the global configuration for backend communications
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api', // Maps directly to your Express server
  headers: {
    'Content-Type': 'application/json',
  },
});

export const trackService = {
  // Fetches paginated tracks with optional search parameters and filters
  getTracks: async (params) => {
    const response = await API.get('/tracks', { params });
    return response.data;
  },

  //new analytics fetcher hook
  getDashboardMetrics: async () => {
    const response = await API.get('/analytics/dashboard');
    return response.data;
  },

  // Fetches a single targeted genre profile metric for comparison frames
  getGenreData: async (genreName) => {
    const response = await API.get(`/analytics/genres/${genreName}`);
    return response.data;
  },
  
  // Fetches a distinct list of all musical genres for dropdown menus
  getGenres: async () => {
    const response = await API.get('/genres');
    return response.data;
  },
};

export default API;
