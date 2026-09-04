import { ChevronDown, Grid2x2, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

/** Módulo ativo é derivado da rota atual — nunca fica dessincronizado do que está na tela (spec, seção 5.4). */
function useModuloAtivo() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();

  if (!usuario) return null;
  return (
    usuario.modulosPermitidos.find((modulo) => modulo.telas.some((tela) => pathname.startsWith(tela.rotaTela))) ??
    null
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { usuario, switchFilial, logout } = useAuth();
  const moduloAtivo = useModuloAtivo();
  const [filialDropdownAberto, setFilialDropdownAberto] = useState(false);

  if (!usuario) return null;

  const filialAtiva = usuario.filiaisPermitidas.find((f) => f.id === usuario.filialAtivaId);

  return (
    <aside className="flex h-full w-72 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <Link
          to="/modules"
          onClick={onNavigate}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          <Grid2x2 size={18} />
          Alternar Aplicativo
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {moduloAtivo ? (
          <ul className="space-y-1">
            {moduloAtivo.telas
              .filter((tela) => tela.podeVisualizar)
              .map((tela) => (
                <li key={tela.telaId}>
                  <Link
                    to={tela.rotaTela}
                    onClick={onNavigate}
                    className="flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    {tela.nomeTela}
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-sm text-slate-400">Selecione um aplicativo para iniciar</p>
        )}
      </nav>

      <div className="relative border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
            {usuario.nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{usuario.nome}</p>
            <p className="truncate text-xs text-slate-500">{usuario.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFilialDropdownAberto((v) => !v)}
          className="mt-3 flex min-h-[44px] w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span className="truncate">{filialAtiva?.nomeFormatado ?? 'Selecionar filial'}</span>
          <ChevronDown size={16} />
        </button>

        {filialDropdownAberto && (
          <ul className="absolute inset-x-4 bottom-24 z-10 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {usuario.filiaisPermitidas.map((filial) => (
              <li key={filial.id}>
                <button
                  type="button"
                  onClick={async () => {
                    setFilialDropdownAberto(false);
                    if (filial.id !== usuario.filialAtivaId) {
                      await switchFilial(filial.id);
                    }
                  }}
                  className="flex min-h-[44px] w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  disabled={filial.id === usuario.filialAtivaId}
                >
                  {filial.nomeFormatado}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={logout}
          className="mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}
