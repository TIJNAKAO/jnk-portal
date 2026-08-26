import { Eye, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { useOrdenacao } from '../../lib/tabela';

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
  const [status, setStatus] = useState('');
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [excluindo, setExcluindo] = useState(false);

  async function carregar() {
    const params = new URLSearchParams();
    if (entidade) params.set('entidade', entidade);
    if (status) params.set('status', status);
    const linhas = await api<Execucao[]>(`/integracao/execucoes?${params.toString()}`);
    setExecucoes(linhas);
    setSelecionados(new Set());
  }

  useEffect(() => {
    carregar().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, entidade, status]);

  function alternarSelecao(id: number) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTudo() {
    setSelecionados((prev) => (prev.size === execucoes.length ? new Set() : new Set(execucoes.map((e) => e.id))));
  }

  async function excluir(id: number) {
    if (!confirm('Excluir esta execução e todo o detalhe dela? Não dá pra desfazer.')) return;
    await api(`/integracao/execucoes/${id}`, { method: 'DELETE' });
    await carregar();
  }

  async function excluirSelecionados() {
    if (selecionados.size === 0) return;
    if (!confirm(`Excluir ${selecionados.size} execução(ões) selecionada(s)? Não dá pra desfazer.`)) return;
    setExcluindo(true);
    try {
      await api('/integracao/execucoes/excluir-lote', { method: 'POST', body: { ids: [...selecionados] } });
      await carregar();
    } finally {
      setExcluindo(false);
    }
  }

  const todosSelecionados = execucoes.length > 0 && selecionados.size === execucoes.length;

  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(execucoes, {
    entidade: (e) => e.entidade,
    status: (e) => e.status,
    qtde_registros: (e) => e.qtde_registros,
    duracao_ms: (e) => e.duracao_ms,
    executado_em: (e) => e.executado_em,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Histórico de Execuções</h1>
        <p className="text-sm text-slate-500">Sincronizações rodadas — clique numa linha pra ver o detalhe por página/registro.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Filtrar por entidade (ex: notas_fiscais)"
          value={entidade}
          onChange={(e) => setEntidade(e.target.value)}
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="iniciado">Iniciado</option>
          <option value="sucesso">Sucesso</option>
          <option value="erro">Erro</option>
          <option value="cancelado">Cancelado</option>
        </select>

        {selecionados.size > 0 && (
          <button
            type="button"
            onClick={excluirSelecionados}
            disabled={excluindo}
            className="ml-auto flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {excluindo ? 'Excluindo...' : `Excluir selecionadas (${selecionados.size})`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">
                <input type="checkbox" checked={todosSelecionados} onChange={alternarSelecionarTudo} aria-label="Selecionar tudo" />
              </th>
              <ThOrdenavel campo="entidade" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Entidade</ThOrdenavel>
              <ThOrdenavel campo="status" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Status</ThOrdenavel>
              <ThOrdenavel campo="qtde_registros" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Registros</ThOrdenavel>
              <ThOrdenavel campo="duracao_ms" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Duração</ThOrdenavel>
              <ThOrdenavel campo="executado_em" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Executado em</ThOrdenavel>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {execucoes.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-400">
                  Nenhuma execução encontrada.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <input type="checkbox" checked={selecionados.has(e.id)} onChange={() => alternarSelecao(e.id)} aria-label={`Selecionar execução ${e.id}`} />
                </td>
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
                <td className="flex justify-end gap-2 p-3">
                  <Link
                    to={`/integracao/execucoes/${e.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Ver detalhe"
                  >
                    <Eye size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => excluir(e.id)}
                    disabled={e.status === 'iniciado'}
                    title={e.status === 'iniciado' ? 'Cancele a execução antes de excluir' : undefined}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    aria-label="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
