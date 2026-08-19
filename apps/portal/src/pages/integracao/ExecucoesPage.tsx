import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface Execucao {
  id: number;
  entidade: string;
  status: string;
  qtde_registros: number | null;
  duracao_ms: number | null;
  executado_em: string;
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
function fmtDuracao(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function ExecucoesPage() {
  const api = useApi();
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [entidade, setEntidade] = useState('');

  useEffect(() => {
    const query = entidade ? `?entidade=${entidade}` : '';
    api<Execucao[]>(`/integracao/execucoes${query}`).then(setExecucoes).catch(console.error);
  }, [api, entidade]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Histórico de Execuções</h1>
        <p className="text-sm text-slate-500">Sincronizações rodadas — clique numa linha pra ver o detalhe por página/registro.</p>
      </div>

      <input
        placeholder="Filtrar por entidade (ex: notas_fiscais)"
        value={entidade}
        onChange={(e) => setEntidade(e.target.value)}
        className="min-h-[44px] w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Entidade</th>
              <th className="p-3">Status</th>
              <th className="p-3">Registros</th>
              <th className="p-3">Duração</th>
              <th className="p-3">Executado em</th>
            </tr>
          </thead>
          <tbody>
            {execucoes.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  Nenhuma execução ainda.
                </td>
              </tr>
            )}
            {execucoes.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link to={`/integracao/execucoes/${e.id}`} className="hover:underline">
                    {e.entidade}
                  </Link>
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_POR_STATUS[e.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {e.status}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{e.qtde_registros ?? '—'}</td>
                <td className="p-3 text-slate-500">{fmtDuracao(e.duracao_ms)}</td>
                <td className="p-3 text-slate-500">{fmtData(e.executado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
