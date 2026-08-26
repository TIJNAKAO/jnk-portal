import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DirecaoOrdenacao } from '../lib/tabela';

interface ThOrdenavelProps {
  campo: string;
  campoOrdenado: string | null;
  direcao: DirecaoOrdenacao;
  onOrdenar: (campo: string) => void;
  className?: string;
  children: ReactNode;
}

/** Cabeçalho de coluna clicável — mesmo padrão de ordenação em toda tabela do portal. */
export function ThOrdenavel({ campo, campoOrdenado, direcao, onOrdenar, className, children }: ThOrdenavelProps) {
  const ativo = campoOrdenado === campo;
  return (
    <th className={className ?? 'p-3'}>
      <button type="button" onClick={() => onOrdenar(campo)} className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900">
        {children}
        {ativo ? (
          direcao === 'asc' ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )
        ) : (
          <ChevronsUpDown size={14} className="text-slate-300" />
        )}
      </button>
    </th>
  );
}
