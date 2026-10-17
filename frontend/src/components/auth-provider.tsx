import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { AUTH_EXPIRED_EVENT } from '../lib/api';

interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  email_verified_at?: string | null;
  notify_email_assignments?: boolean;
  notify_email_digest?: boolean;
  /** An administrator issued a temporary password: the user must choose their own before using the app. */
  must_change_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  /** Re-read the signed-in user (after changing preferences or verifying the e-mail address). */
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/users/me');
      setUser(response.data);
    } catch (error: any) {
      // Only an authentication failure ends the session; a network blip or 5xx must not log the user out.
      if (error?.response?.status === 401) {
        logout();
      }
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, [token, fetchUser]);

  // The axios interceptor fires this when any request comes back 401.
  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout);
  }, [logout]);

  const login = async (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    // User will be fetched by the useEffect
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser: fetchUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};