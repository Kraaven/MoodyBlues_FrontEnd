import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, apiJson, refreshSession, setUnauthorizedHandler } from '../api/client';
import { queryClient } from '../api/queries';
import type { PendingVerificationResponse, UserResponse } from '../api/types';
import { prefetcher } from '../prefetch/prefetcher';
import { sceneCache } from '../prefetch/sceneCache';
import { AuthContext, type AuthUser } from './context';

/**
 * The signed-in user. The session itself lives in httpOnly cookies (see api/client.ts), so on
 * load the only way to know whether one exists is to ask: GET /auth/me, and if the access cookie
 * has lapsed, one refresh and a second try.
 */
async function probeSession(): Promise<UserResponse | null> {
  const me = () => apiJson<UserResponse>('/auth/me', { auth: false });
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
    // Cached scenes belong to the signed-in user.
    prefetcher.stop();
    void sceneCache.clear();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => signOut(true));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    probeSession()
      .then((me) => setUser(me ? { userId: me.userId, email: me.email } : null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const accept = useCallback((response: UserResponse) => {
    setExpired(false);
    setUser({ userId: response.userId, email: response.email });
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      accept(await apiJson<UserResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false })),
    [accept],
  );

  const register = useCallback(
    (email: string, password: string) =>
      apiJson<PendingVerificationResponse>('/auth/register', { method: 'POST', body: { email, password }, auth: false }),
    [],
  );

  const verifyRegistration = useCallback(
    async (email: string, code: string) =>
      accept(await apiJson<UserResponse>('/auth/register/verify', { method: 'POST', body: { email, code }, auth: false })),
    [accept],
  );

  const requestPasswordReset = useCallback(
    (email: string) => apiJson<PendingVerificationResponse>('/auth/password/forgot', { method: 'POST', body: { email }, auth: false }),
    [],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) =>
      accept(await apiJson<UserResponse>('/auth/password/reset', { method: 'POST', body: { email, code, newPassword }, auth: false })),
    [accept],
  );

  const logout = useCallback(async () => {
    // Revokes the refresh token and clears both cookies. Sign out locally even if it fails.
    await apiJson<void>('/auth/logout', { method: 'POST', auth: false }).catch(() => undefined);
    signOut(false);
  }, [signOut]);

  const value = useMemo(
    () => ({ user, isLoading, expired, login, register, verifyRegistration, requestPasswordReset, resetPassword, logout }),
    [user, isLoading, expired, login, register, verifyRegistration, requestPasswordReset, resetPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
