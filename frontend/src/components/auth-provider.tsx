import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    console.log('AuthProvider: fetchUser called');
    try {
      const response = await api.get('/users/me');
      setUser(response.data);
      console.log('AuthProvider: User fetched successfully');
    } catch (error) {
      console.error('AuthProvider: Failed to fetch user', error);
      logout();
    } finally {
      setIsLoading(false);
      console.log('AuthProvider: setIsLoading(false) in fetchUser finally');
    }
  }, []);

  useEffect(() => {
    console.log('AuthProvider: useEffect triggered. token:', token, 'isLoading:', isLoading);
    if (token) {
      fetchUser();
    } else {
      setIsLoading(false);
      console.log('AuthProvider: No token found, setIsLoading(false)');
    }
  }, [token, fetchUser]);

  const login = async (newToken: string) => {
    console.log('AuthProvider: login called with new token');
    localStorage.setItem('token', newToken);
    setToken(newToken);
    // User will be fetched by the useEffect
  };

  const logout = () => {
    console.log('AuthProvider: logout called');
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
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