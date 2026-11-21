import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserDto } from '@bookshelf/shared';
import { api } from '../api/client';

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, seedSamples?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login({ username, password });
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (username: string, password: string, seedSamples = true) => {
      const res = await api.register({ username, password, seedSamples });
      setUser(res.user);
    },
    []
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
