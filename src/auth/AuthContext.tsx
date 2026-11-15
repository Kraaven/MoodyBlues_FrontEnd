import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, apiJson, refreshSession, setUnauthorizedHandler } from '../api/client';
import { queryClient } from '../api/queries';
import type { AuthResponse, MeResponse } from '../api/types';
import { AuthContext, type AuthUser } from './context';

/**
 * The signed-in user. The session itself lives in httpOnly cookies (see api/client.ts), so on
 * load the only way to know whether one exists is to ask: GET /auth/me, and if the access cookie
 * has lapsed, one refresh and a second try.
 */
async function probeSession(): Promise<MeResponse | null> {
  const me = () => apiJson<MeResponse>('/auth/me', { auth: false });
  try {
    return await me();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
  }
  return (await refreshSession()) ? me() : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  const signOut = useCallback((wasExpired: boolean) => {
    setUser(null);
    setExpired(wasExpired);
    queryClient.clear();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => signOut(true));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    probeSession()
      .then((me) => (me ? setUser({ userId: me.userId, email: me.email }) : signOut(false)))
      .catch(() => signOut(false))
      .finally(() => setIsLoading(false));
  }, [signOut]);

  const accept = useCallback((response: AuthResponse) => {
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

  const logout = useCallback(async () => {
    // Revokes the refresh token and clears both cookies. Sign out locally even if it fails.
    await apiJson<void>('/auth/logout', { method: 'POST', auth: false }).catch(() => undefined);
    signOut(false);
  }, [signOut]);

  const value = useMemo(
    () => ({ user, isLoading, expired, login, register, logout }),
    [user, isLoading, expired, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
