import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { prefetcher } from './prefetcher';

/** Runs the background scene prefetcher while a user is signed in; sign-out stops it (and AuthContext clears the cache). */
export function PrefetchHost() {
  const { user } = useAuth();
  const client = useQueryClient();
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn) return;
    prefetcher.start(client);
    return () => prefetcher.stop();
  }, [signedIn, client]);

  return null;
}
