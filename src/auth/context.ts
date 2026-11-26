import { createContext } from 'react';

import type { PendingVerificationResponse } from '../api/types';

export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  /** Set when the user was signed out because their token expired. */
  expired: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Emails a code; does not sign in. Calling it again with the same details resends the code. */
  register: (email: string, password: string) => Promise<PendingVerificationResponse>;
  /** Completes registration with the emailed code and signs in. */
  verifyRegistration: (email: string, code: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<PendingVerificationResponse>;
  /** Sets a new password with the emailed code and signs in. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
