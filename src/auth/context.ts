import { createContext } from 'react';

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
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
