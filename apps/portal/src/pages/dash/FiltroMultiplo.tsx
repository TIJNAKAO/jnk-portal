import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface Opcao {
  valor: string;
  rotulo: string;
}

interface FiltroMultiploProps {
  rotulo: string;
  opcoes: Opcao[];
  /** `null` = todas selecionadas, que é o padrão e não restringe nada. */
  selecionadas: string[] | null;
  onChange: (selecionadas: string[] | null) => void;
}

/** A partir disto a lista ganha campo de busca: rolar 262 marcas para achar uma não é filtro. */
const MINIMO_PARA_BUSCA = 9;

/**
 * Filtro de múltipla escolha num botão que abre uma lista de caixas de
 * marcação. Nasce com tudo marcado.
 *
 * Substitui o `<select multiple>` nas telas do DASH: ele exige Ctrl+clique,
 * não mostra o que está selecionado sem rolar e começa vazio.
 */
export function FiltroMultiplo({ rotulo, opcoes, selecionadas, onChange }: FiltroMultiploProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const idLista = useId();

  // Fecha ao clicar fora. Só escuta enquanto está aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  const marcadas = useMemo(
    () => new Set(selecionadas ?? opcoes.map((o) => o.valor)),
    [selecionadas, opcoes],
  );

  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return alvo ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(alvo)) : opcoes;
  }, [opcoes, busca]);

  function alternar(valor: string) {
    const proximas = new Set(marcadas);
    if (proximas.has(valor)) proximas.delete(valor);
    else proximas.add(valor);
    // Voltar a ter tudo marcado volta para "todas": a consulta deixa de mandar a lista inteira.
    onChange(proximas.size === opcoes.length ? null : opcoes.filter((o) => proximas.has(o.valor)).map((o) => o.valor));
  }

  let resumo: string;
  if (selecionadas === null || marcadas.size === opcoes.length) resumo = `Todas (${opcoes.length})`;
  else if (marcadas.size === 0) resumo = 'Nenhuma marcada';
  else if (marcadas.size === 1) resumo = opcoes.find((o) => marcadas.has(o.valor))?.rotulo ?? '1 selecionada';
  else resumo = `${marcadas.size} de ${opcoes.length}`;

  return (
    <div
      ref={raiz}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setAberto(false);
      }}
    >
      <span className="mb-1 block text-xs font-medium text-slate-500">{rotulo}</span>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-label={`${rotulo}: ${resumo}`}
        className="flex min-h-[44px] w-56 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 hover:bg-slate-50"
      >
        <span className="truncate">{resumo}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-500" />
      </button>

      {aberto && (
        <div
          id={idLista}
          className="absolute left-0 top-full z-20 mt-1 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 p-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="min-h-[36px] rounded-md border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50"
            >
              Marcar todas
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="min-h-[36px] rounded-md border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50"
            >
              Desmarcar todas
            </button>
          </div>

          {opcoes.length >= MINIMO_PARA_BUSCA && (
            <div className="border-b border-slate-200 p-2">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={`Buscar em ${rotulo.toLowerCase()}...`}
                aria-label={`Buscar em ${rotulo}`}
                className="min-h-[36px] w-full rounded-md border border-slate-300 px-2 text-sm"
              />
            </div>
          )}

          <ul className="max-h-64 overflow-y-auto p-1">
            {visiveis.map((o) => (
              <li key={o.valor}>
                <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-slate-800 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={marcadas.has(o.valor)}
                    onChange={() => alternar(o.valor)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{o.rotulo}</span>
                </label>
              </li>
            ))}
            {visiveis.length === 0 && <li className="p-3 text-center text-sm text-slate-500">Nada encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
