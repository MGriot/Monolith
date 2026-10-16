import axios from 'axios';

export const AUTH_EXPIRED_EVENT = 'auth:expired';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 on any authenticated call means the token is expired/revoked or the account was
// deactivated: drop it and let AuthProvider route the user back to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url ?? '';
    const isLoginCall = url.includes('/login/access-token');
    if (error?.response?.status === 401 && !isLoginCall && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

export default api;
