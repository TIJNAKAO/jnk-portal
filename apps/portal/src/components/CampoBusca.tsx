import { Search } from 'lucide-react';

interface CampoBuscaProps {
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
}

/** Busca genérica acima de tabela — mesmo padrão em todo o portal. */
export function CampoBusca({ valor, onChange, placeholder = 'Buscar...' }: CampoBuscaProps) {
  return (
    <div className="relative w-full max-w-xs">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
      />
    </div>
  );
}
