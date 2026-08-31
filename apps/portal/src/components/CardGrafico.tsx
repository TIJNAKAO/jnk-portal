import { BarChart3, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

interface ColunaTabela<T> {
  titulo: string;
  valor: (item: T) => ReactNode;
  alinharDireita?: boolean;
}

interface CardGraficoProps<T> {
  titulo: string;
  descricao?: string;
  dados: T[];
  colunas: ColunaTabela<T>[];
  /** Reduz a opacidade em vez de trocar por esqueleto — evita o salto de layout no refetch. */
  carregando?: boolean;
  children: ReactNode;
}

/**
 * Card de gráfico com alternância para tabela.
 *
 * A tabela não é um extra: todo gráfico precisa de um equivalente legível sem
 * depender de cor nem de passar o mouse. Quem usa leitor de tela, quem imprime
 * e quem só quer conferir o número exato usam a mesma tela.
 */
export function CardGrafico<T>({ titulo, descricao, dados, colunas, carregando, children }: CardGraficoProps<T>) {
  const [verTabela, setVerTabela] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium text-slate-900">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
        </div>
        <button
          type="button"
          onClick={() => setVerTabela((v) => !v)}
          className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-50"
          aria-label={verTabela ? `Ver ${titulo} como gráfico` : `Ver ${titulo} como tabela`}
        >
          {verTabela ? <BarChart3 size={14} /> : <Table2 size={14} />}
          {verTabela ? 'Gráfico' : 'Tabela'}
        </button>
      </div>

      <div className={carregando ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        {verTabela ? (
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs text-slate-500">
                <tr>
                  {colunas.map((c) => (
                    <th key={c.titulo} className={`p-2 font-medium ${c.alinharDireita ? 'text-right' : ''}`}>
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.map((item, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {colunas.map((c) => (
                      <td
                        key={c.titulo}
                        className={`p-2 ${c.alinharDireita ? 'text-right tabular-nums text-slate-600' : 'text-slate-900'}`}
                      >
                        {c.valor(item)}
                      </td>
                    ))}
                  </tr>
                ))}
                {dados.length === 0 && (
                  <tr>
                    <td colSpan={colunas.length} className="p-6 text-center text-slate-400">
                      Sem dados para estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
