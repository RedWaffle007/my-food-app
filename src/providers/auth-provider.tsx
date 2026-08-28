import { createContext, useContext, type ReactNode } from 'react';

export type Role = 'donor' | 'agent' | 'recipient';

export type AuthState = {
  /** Firebase user — null until auth is wired. */
  user: null;
  role: Role | null;
  loading: boolean;
};

const defaultState: AuthState = { user: null, role: null, loading: false };

const AuthContext = createContext<AuthState>(defaultState);

export const useAuth = () => useContext(AuthContext);

// Placeholder provider. No Firebase wiring yet — a later step replaces this with
// a real onAuthStateChanged listener plus the role from a custom claim / users doc.
export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={defaultState}>{children}</AuthContext.Provider>;
}
