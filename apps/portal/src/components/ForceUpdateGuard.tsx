import { RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthProvider';

const VERSAO_LOCAL = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

export function ForceUpdateGuard({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [divergente, setDivergente] = useState(false);

  useEffect(() => {
    if (usuario && usuario.versaoSistema !== VERSAO_LOCAL) {
      setDivergente(true);
      const timeout = setTimeout(() => window.location.reload(), 2000);
      return () => clearTimeout(timeout);
    }
  }, [usuario]);

  if (divergente) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-slate-900/95 text-white">
        <RefreshCw className="animate-spin" size={32} />
        <p className="text-lg font-medium">Uma nova versão do Portal está disponível.</p>
        <p className="text-sm text-slate-300">Atualizando automaticamente...</p>
      </div>
    );
  }

  return <>{children}</>;
}
