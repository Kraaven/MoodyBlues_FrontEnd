import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiJson, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { queryClient } from '../api/queries';
import type { AuthResponse, MeResponse } from '../api/types';
import { AuthContext, type AuthUser } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(() => getToken() !== null);
  const [expired, setExpired] = useState(false);

  const signOut = useCallback((wasExpired: boolean) => {
    setToken(null);
    setUser(null);
    setExpired(wasExpired);
    queryClient.clear();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => signOut(true));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!getToken()) return;
    apiJson<MeResponse>('/auth/me')
      .then((me) => setUser({ userId: me.userId, email: me.email }))
      .catch(() => signOut(false))
      .finally(() => setIsLoading(false));
  }, [signOut]);

  const accept = useCallback((response: AuthResponse) => {
    setToken(response.token);
    setExpired(false);
    setUser({ userId: response.userId, email: response.email });
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      accept(await apiJson<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false })),
    [accept],
  );

  const register = useCallback(
    async (email: string, password: string) =>
      accept(await apiJson<AuthResponse>('/auth/register', { method: 'POST', body: { email, password }, auth: false })),
    [accept],
  );

  const logout = useCallback(() => signOut(false), [signOut]);

  const value = useMemo(
    () => ({ user, isLoading, expired, login, register, logout }),
    [user, isLoading, expired, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
