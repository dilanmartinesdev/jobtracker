import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { request, setUnauthorizedHandler, tokenStore } from "../api/client";
import type { User } from "../api/types";

interface AuthValue {
  user: User | null;
  /** True while a saved token is being checked against the API. */
  isChecking: boolean;
  /** Why the user is looking at the sign-in screen when it was not their choice. */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback(
    (message: string | null = null) => {
      tokenStore.clear();
      setToken(null);
      // Drop every cached query so the next person on this browser never sees old data.
      queryClient.clear();
      setNotice(message);
    },
    [queryClient],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => signOut("Your session expired. Sign in again."));
    return () => setUnauthorizedHandler(() => {});
  }, [signOut]);

  const me = useQuery({
    queryKey: ["me", token],
    queryFn: ({ signal }) => request<User>("/auth/me", { signal }),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
  });

  const signIn = useCallback(async (email: string, password: string) => {
    // Remove any stale token first so a wrong password is never mistaken for an expired session.
    tokenStore.clear();
    setNotice(null);
    const { access_token } = await request<{ access_token: string }>("/auth/login", {
      method: "POST",
      form: { username: email, password },
    });
    tokenStore.set(access_token);
    setToken(access_token);
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await request("/auth/register", { method: "POST", json: { email, password } });
      await signIn(email, password);
    },
    [signIn],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user: token ? (me.data ?? null) : null,
      isChecking: token !== null && me.isPending,
      notice,
      signIn,
      register,
      signOut: () => signOut(),
    }),
    [token, me.data, me.isPending, notice, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
