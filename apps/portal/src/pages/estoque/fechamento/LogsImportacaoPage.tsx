import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../lib/useApi';

interface LinhaLog {
  id: number;
  tipo: string;
  arquivo: string | null;
  periodo: string | null;
  total_linhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  produtos_nao_encontrados: number;
  empresas_nao_encontradas: number;
  custo_total: number | null;
  observacoes: string | null;
  usuario: string | null;
  executado_em: string;
}

const ROTULO_TIPO: Record<string, string> = {
  fechamento_estoque: 'Fechamento Mensal',
  estoque_full: 'Estoque FULL',
  inventario_fisico: 'Inventário Físico',
};

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function moeda(v: number | null): string {
  if (v === null) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function periodoLegivel(periodo: string | null): string {
  if (!periodo) return '—';
  const data = new Date(periodo);
  return `${String(data.getUTCMonth() + 1).padStart(2, '0')}/${data.getUTCFullYear()}`;
}

export function LogsImportacaoPage() {
  const api = useApi();

  const [tipo, setTipo] = useState('');
  const [linhas, setLinhas] = useState<LinhaLog[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set('tipo', tipo);

      const dados = await api<{ linhas: LinhaLog[] }>(`/estoque/fechamento/logs?${params.toString()}`);
      setLinhas(dados.linhas);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [api, tipo]);

  useEffect(() => {
    carregar().catch(console.error);
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Logs de Importação</h1>
        <p className="text-sm text-slate-500">
          Histórico das importações de planilha do Fechamento de Custo — as 300 execuções mais recentes.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(ROTULO_TIPO).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Arquivo</th>
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 text-right font-medium">Linhas</th>
              <th className="px-3 py-2 text-right font-medium">Inseridas</th>
              <th className="px-3 py-2 text-right font-medium">Atualizadas</th>
              <th className="px-3 py-2 text-right font-medium">Ignoradas</th>
              <th className="px-3 py-2 text-right font-medium">Prod. não achados</th>
              <th className="px-3 py-2 text-right font-medium">Emp. não achadas</th>
              <th className="px-3 py-2 text-right font-medium">Custo total</th>
              <th className="px-3 py-2 font-medium">Usuário</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                  {carregando ? 'Carregando…' : 'Nenhuma importação registrada ainda.'}
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2">
                  {new Date(l.executado_em).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2">{ROTULO_TIPO[l.tipo] ?? l.tipo}</td>
                <td className="px-3 py-2">
                  {l.arquivo ?? '—'}
                  {l.observacoes && (
                    <div className="mt-1 max-w-md whitespace-pre-line text-xs text-slate-500">
                      {l.observacoes}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">{periodoLegivel(l.periodo)}</td>
                <td className="px-3 py-2 text-right">{inteiro(l.total_linhas)}</td>
                <td className="px-3 py-2 text-right">{inteiro(l.inseridas)}</td>
                <td className="px-3 py-2 text-right">{inteiro(l.atualizadas)}</td>
                <td className={`px-3 py-2 text-right ${l.ignoradas > 0 ? 'font-semibold text-amber-700' : ''}`}>
                  {inteiro(l.ignoradas)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    l.produtos_nao_encontrados > 0 ? 'font-semibold text-amber-700' : ''
                  }`}
                >
                  {inteiro(l.produtos_nao_encontrados)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    l.empresas_nao_encontradas > 0 ? 'font-semibold text-amber-700' : ''
                  }`}
                >
                  {inteiro(l.empresas_nao_encontradas)}
                </td>
                <td className="px-3 py-2 text-right">{moeda(l.custo_total)}</td>
                <td className="px-3 py-2">{l.usuario ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
