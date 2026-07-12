import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getToken, setToken } from '../lib/api';
import type { AuthResponse, MeResponse } from '../lib/types';

interface AuthUser {
  userId: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    api
      .get<MeResponse>('/auth/me')
      .then((me) => setUser({ userId: me.userId, email: me.email }))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password }, false);
    setToken(response.token);
    setUser({ userId: response.userId, email: response.email });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/register', { email, password }, false);
    setToken(response.token);
    setUser({ userId: response.userId, email: response.email });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export type { AuthUser };
