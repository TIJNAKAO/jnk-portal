import type { UsuarioSessao } from '@jnk-portal/shared';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../lib/api';

interface SessaoArmazenada {
  token: string;
  usuario: UsuarioSessao;
}

interface AuthContextValue {
  token: string | null;
  usuario: UsuarioSessao | null;
  login: (email: string, senha: string) => Promise<void>;
  switchFilial: (filialId: number) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'jnk-portal:sessao';

function carregarSessao(): SessaoArmazenada | null {
  const bruto = localStorage.getItem(STORAGE_KEY);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as SessaoArmazenada;
  } catch {
    return null;
  }
}

function salvarSessao(sessao: SessaoArmazenada) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessao));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoArmazenada | null>(() => carregarSessao());

  const login = async (email: string, senha: string) => {
    const resposta = await apiRequest<SessaoArmazenada>('/auth/login', {
      method: 'POST',
      body: { email, senha },
    });
    salvarSessao(resposta);
    setSessao(resposta);
  };

  const switchFilial = async (filialId: number) => {
    if (!sessao) return;
    const resposta = await apiRequest<SessaoArmazenada>('/auth/switch-filial', {
      method: 'POST',
      body: { filialId },
      token: sessao.token,
    });
    salvarSessao(resposta);
    setSessao(resposta);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSessao(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ token: sessao?.token ?? null, usuario: sessao?.usuario ?? null, login, switchFilial, logout }),
    [sessao],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }
  return context;
}
