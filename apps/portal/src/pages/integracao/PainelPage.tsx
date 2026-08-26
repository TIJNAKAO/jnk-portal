import { Eye, PlayCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface UltimaExecucao {
  id: number;
  status: 'iniciado' | 'sucesso' | 'erro' | 'cancelado';
  qtde_registros: number | null;
  executado_em: string;
}

interface CardEntidade {
  chave: string;
  nome: string;
  ultimaExecucao: UltimaExecucao | null;
}

const BADGE_POR_STATUS: Record<string, string> = {
  iniciado: 'bg-blue-100 text-blue-700',
  sucesso: 'bg-emerald-100 text-emerald-700',
  erro: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
};

function fmtData(v: string): string {
  return new Date(v).toLocaleString('pt-BR');
}

export function PainelPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [cards, setCards] = useState<CardEntidade[]>([]);
  const [sincronizando, setSincronizando] = useState<string | null>(null);

  async function carregar() {
    setCards(await api<CardEntidade[]>('/integracao/painel'));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  async function sincronizar(chave: string) {
    setSincronizando(chave);
    try {
      const { idLog } = await api<{ idLog: number; jaEmAndamento?: boolean }>(`/integracao/painel/${chave}/sincronizar`, { method: 'POST' });
      navigate(`/integracao/execucoes/${idLog}`);
    } finally {
      setSincronizando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Painel de Integrações</h1>
        <p className="text-sm text-slate-500">Sincronização com o ERP SysEmp e o Mercado Livre. Gatilho manual nesta versão.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.chave} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">{card.nome}</h2>

            {card.ultimaExecucao ? (
              <Link to={`/integracao/execucoes/${card.ultimaExecucao.id}`} className="mt-2 flex-1 text-sm text-slate-500 hover:text-slate-700">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_POR_STATUS[card.ultimaExecucao.status]}`}>
                  {card.ultimaExecucao.status}
                </span>
                <p className="mt-2">{fmtData(card.ultimaExecucao.executado_em)}</p>
                {card.ultimaExecucao.qtde_registros !== null && <p>{card.ultimaExecucao.qtde_registros} registro(s)</p>}
              </Link>
            ) : (
              <p className="mt-2 flex-1 text-sm text-slate-400">Nunca sincronizado.</p>
            )}

            {card.ultimaExecucao?.status === 'iniciado' ? (
              <Link
                to={`/integracao/execucoes/${card.ultimaExecucao.id}`}
                className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Eye size={16} />
                Acompanhar execução em andamento
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => sincronizar(card.chave)}
                disabled={sincronizando === card.chave}
                className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <PlayCircle size={16} />
                {sincronizando === card.chave ? 'Iniciando...' : 'Sincronizar agora'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
