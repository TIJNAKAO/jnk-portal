import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  buscarVersaoPublicada,
  decidirAtualizacao,
  registrarTentativa,
  versaoJaTentada,
} from '../lib/atualizacao';

/** Injetada pelo build (ver `vite.config.ts`). Vazia em desenvolvimento. */
const VERSAO_LOCAL = typeof __VERSAO_BUILD__ === 'string' ? __VERSAO_BUILD__ : '';

/** De quanto em quanto tempo perguntar se saiu versão nova. */
const INTERVALO_MS = 5 * 60 * 1000;

/**
 * Mantém todo mundo na versão publicada.
 *
 * Confere ao abrir, ao voltar para a aba e a cada cinco minutos. Voltar para a
 * aba é o gatilho que mais pega na prática: o portal costuma ficar aberto o dia
 * inteiro em segundo plano, e é ao voltar nele que a pessoa vai usar a tela.
 *
 * Nunca recarrega duas vezes pela mesma versão. Se a recarga não resolver — a
 * CDN ainda servindo o `index.html` antigo, por exemplo — mostra um aviso
 * dispensável em vez de entrar em loop, que deixaria o portal inutilizável.
 */
export function ForceUpdateGuard({ children }: { children: ReactNode }) {
  const [avisoPersistente, setAvisoPersistente] = useState(false);
  const [recarregando, setRecarregando] = useState(false);
  const verificando = useRef(false);

  const verificar = useCallback(async () => {
    if (verificando.current || recarregando) return;
    verificando.current = true;
    try {
      const versaoServidor = await buscarVersaoPublicada();
      const decisao = decidirAtualizacao({
        versaoLocal: VERSAO_LOCAL,
        versaoServidor,
        versaoJaTentada: versaoJaTentada(),
      });

      if (decisao === 'recarregar' && versaoServidor) {
        registrarTentativa(versaoServidor);
        setRecarregando(true);
        // Dá tempo de a mensagem aparecer antes da tela sumir.
        setTimeout(() => window.location.reload(), 1200);
      } else if (decisao === 'pedir-recarga-manual') {
        setAvisoPersistente(true);
      }
    } finally {
      verificando.current = false;
    }
  }, [recarregando]);

  useEffect(() => {
    verificar().catch(() => undefined);

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') verificar().catch(() => undefined);
    };
    const intervalo = setInterval(() => void verificar(), INTERVALO_MS);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [verificar]);

  if (recarregando) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-slate-900/95 text-white">
        <RefreshCw className="animate-spin" size={32} />
        <p className="text-lg font-medium">Uma nova versão do Portal está disponível.</p>
        <p className="text-sm text-slate-300">Atualizando automaticamente...</p>
      </div>
    );
  }

  return (
    <>
      {/* Só aparece quando a recarga automática já foi tentada e não resolveu:
          aí o problema está no cache do navegador, e só o usuário resolve. */}
      {avisoPersistente && (
        <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950">
          <RefreshCw size={16} />
          <span>
            Há uma versão mais nova do Portal. Recarregue com <strong>Ctrl+Shift+R</strong> para atualizar.
          </span>
          <button
            type="button"
            onClick={() => setAvisoPersistente(false)}
            className="ml-2 rounded px-2 py-0.5 underline hover:bg-amber-600/30"
          >
            dispensar
          </button>
        </div>
      )}
      {children}
    </>
  );
}
