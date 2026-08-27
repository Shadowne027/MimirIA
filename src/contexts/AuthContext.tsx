import React, { createContext, useContext, useEffect, useState } from "react";

/*
 * Adaptación del AuthContext original de MIMIRIA.
 * En el repositorio el contexto consume el backend (FastAPI); en este entorno
 * estático se simula con localStorage manteniendo la misma interfaz pública:
 * { user, login, register, logout }.
 */

export interface MimirUser {
  username: string;
  createdAt: string;
}

interface AuthCtx {
  user: MimirUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<MimirUser>;
  register: (username: string, password: string) => Promise<MimirUser>;
  logout: () => void;
  formatApiError: (err: unknown) => string;
}

const AuthContext = createContext<AuthCtx | null>(null);

const USERS_KEY = "mimir_users";
const SESSION_KEY = "mimir_session";

function readUsers(): Record<string, { password: string; createdAt: string }> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MimirUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        setUser(JSON.parse(session));
      } catch {
        /* sesión corrupta: se ignora */
      }
    }
    setLoading(false);
  }, []);

  const register = async (usernameRaw: string, password: string) => {
    const username = usernameRaw.trim();
    await new Promise((r) => setTimeout(r, 650)); // latencia simulada
    const users = readUsers();
    if (users[username.toLowerCase()]) {
      throw new Error("El nombre de usuario ya está registrado. Intenta iniciar sesión.");
    }
    const record = { password, createdAt: new Date().toISOString() };
    users[username.toLowerCase()] = record;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const u: MimirUser = { username, createdAt: record.createdAt };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const login = async (usernameRaw: string, password: string) => {
    const username = usernameRaw.trim();
    await new Promise((r) => setTimeout(r, 650));
    const users = readUsers();
    const record = users[username.toLowerCase()];
    if (!record) {
      throw new Error("Usuario no encontrado. Verifica tu nombre de usuario.");
    }
    if (record.password !== password) {
      throw new Error("Contraseña incorrecta. Intenta de nuevo.");
    }
    const u: MimirUser = { username, createdAt: record.createdAt };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const formatApiError = (err: unknown) =>
    err instanceof Error ? err.message : "Ocurrió un error inesperado. Intenta de nuevo.";

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, formatApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
