import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface LinhaFila {
  id_fila: number;
  tipo_tabela: number;
  desc_tipo_tabela: string | null;
  acao: 'I' | 'U' | 'D';
  id_registro: number;
  consumido: number;
  erro_consumo: string | null;
  confirmado_sysemp: number;
  erro_confirmacao: string | null;
  importado_em: string;
}

function fmtData(v: string): string {
  return new Date(v).toLocaleString('pt-BR');
}

export function FilaPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<LinhaFila[]>([]);
  const [filtros, setFiltros] = useState({ tipoTabela: '', acao: '', comErro: '' });

  async function carregar() {
    const params = new URLSearchParams();
    if (filtros.tipoTabela) params.set('tipoTabela', filtros.tipoTabela);
    if (filtros.acao) params.set('acao', filtros.acao);
    if (filtros.comErro) params.set('comErro', 'true');
    setLinhas(await api<LinhaFila[]>(`/integracao/fila?${params.toString()}`));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api, filtros]);

  async function reprocessar(idFila: number) {
    await api(`/integracao/fila/${idFila}/reprocessar`, { method: 'PUT' });
    await carregar();
  }

  async function excluir(idFila: number) {
    if (!confirm(`Excluir o evento de fila ${idFila}? Ele volta a aparecer na próxima importação da fila da SysEmp.`)) return;
    await api(`/integracao/fila/${idFila}`, { method: 'DELETE' });
    await carregar();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Fila SysEmp</h1>
        <p className="text-sm text-slate-500">Auditoria dos eventos de fila (Notas Fiscais e Estoque). Force reprocessamento se algo ficou com erro.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filtros.tipoTabela}
          onChange={(e) => setFiltros({ ...filtros, tipoTabela: e.target.value })}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os tipos</option>
          <option value="2">2 — NF Venda</option>
          <option value="9">9 — Saldo Estoque</option>
        </select>
        <select
          value={filtros.acao}
          onChange={(e) => setFiltros({ ...filtros, acao: e.target.value })}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todas as ações</option>
          <option value="I">Insert</option>
          <option value="U">Update</option>
          <option value="D">Delete</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filtros.comErro === 'true'}
            onChange={(e) => setFiltros({ ...filtros, comErro: e.target.checked ? 'true' : '' })}
          />
          Só com erro
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">id_fila</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Ação</th>
              <th className="p-3">id_registro</th>
              <th className="p-3">Consumido</th>
              <th className="p-3">Confirmado</th>
              <th className="p-3">Importado em</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id_fila} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{l.id_fila}</td>
                <td className="p-3 text-slate-500">{l.desc_tipo_tabela ?? l.tipo_tabela}</td>
                <td className="p-3 text-slate-500">{l.acao}</td>
                <td className="p-3 text-slate-500">{l.id_registro}</td>
                <td className="p-3">
                  {l.consumido ? '✓' : l.erro_consumo ? <span className="text-red-600" title={l.erro_consumo}>erro</span> : '—'}
                </td>
                <td className="p-3">
                  {l.confirmado_sysemp ? '✓' : l.erro_confirmacao ? <span className="text-red-600" title={l.erro_confirmacao}>erro</span> : '—'}
                </td>
                <td className="p-3 text-slate-500">{fmtData(l.importado_em)}</td>
                <td className="flex justify-end gap-2 p-3">
                  <button type="button" onClick={() => reprocessar(l.id_fila)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Reprocessar">
                    <RefreshCw size={16} />
                  </button>
                  <button type="button" onClick={() => excluir(l.id_fila)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Excluir">
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
