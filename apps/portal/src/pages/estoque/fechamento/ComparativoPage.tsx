import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../lib/useApi';

interface LinhaComparativo {
  idEmpresa: number;
  nomeEmpresa: string | null;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  qtdeFechamento: number;
  qtdeInventario: number;
  divergencia: number;
  vuCusto: number | null;
  valorDivergencia: number | null;
}

function num(v: number | null, casas = 4): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function periodoLegivel(periodo: string): string {
  const [ano, mes] = periodo.split('-');
  return `${mes}/${ano}`;
}

export function ComparativoPage() {
  const api = useApi();

  const [opcoes, setOpcoes] = useState<{ grupos: string[]; periodos: string[] }>({ grupos: [], periodos: [] });
  const [grupo, setGrupo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [soDivergencias, setSoDivergencias] = useState(false);

  const [linhas, setLinhas] = useState<LinhaComparativo[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalDivergencias, setTotalDivergencias] = useState(0);
  const [valorTotalDivergencias, setValorTotalDivergencias] = useState(0);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<{ grupos: string[]; periodos: string[] }>('/estoque/fechamento/comparativo/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const carregar = useCallback(async () => {
    if (!grupo || !periodo) {
      setLinhas([]);
      return;
    }

    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ grupo, periodo });
      if (soDivergencias) params.set('modo', 'divergencia');

      const dados = await api<{
        linhas: LinhaComparativo[];
        totalRegistros: number;
        totalDivergencias: number;
        valorTotalDivergencias: number;
      }>(`/estoque/fechamento/comparativo?${params.toString()}`);

      setLinhas(dados.linhas);
      setTotalRegistros(dados.totalRegistros);
      setTotalDivergencias(dados.totalDivergencias);
      setValorTotalDivergencias(dados.valorTotalDivergencias);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [api, grupo, periodo, soDivergencias]);

  useEffect(() => {
    carregar().catch(console.error);
  }, [carregar]);

  const cartao = (rotulo: string, valor: string, alerta = false) => (
    <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Comparar Inventário × Fechamento</h1>
        <p className="text-sm text-slate-500">
          Confronta a contagem física com o estoque do livro. A contagem é somada entre almoxarifados antes de
          comparar, porque o Fechamento não distingue almoxarifado. Divergência positiva significa contagem
          física maior que o livro.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Selecione o grupo…</option>
          {opcoes.grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Selecione o período…</option>
          {opcoes.periodos.map((p) => (
            <option key={p} value={p}>
              {periodoLegivel(p)}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={soDivergencias}
            onChange={(e) => setSoDivergencias(e.target.checked)}
          />
          Só divergências
        </label>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {grupo && periodo && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cartao('Itens comparados', inteiro(totalRegistros))}
          {cartao('Itens com divergência', inteiro(totalDivergencias), totalDivergencias > 0)}
          {cartao(
            'Valor total das divergências',
            `R$ ${num(valorTotalDivergencias, 2)}`,
            valorTotalDivergencias !== 0,
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 text-right font-medium">Qtde Fechamento</th>
              <th className="px-3 py-2 text-right font-medium">Qtde Inventário</th>
              <th className="px-3 py-2 text-right font-medium">Divergência</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo</th>
              <th className="px-3 py-2 text-right font-medium">Valor da Divergência</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  {carregando
                    ? 'Carregando…'
                    : grupo && periodo
                      ? 'Nenhum item para este grupo e período — importe o Fechamento e o Inventário Físico.'
                      : 'Selecione o grupo e o período.'}
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={`${l.idEmpresa}-${l.codigo}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">{l.nomeEmpresa ?? '—'}</td>
                <td className="px-3 py-2">{l.codigo}</td>
                <td className="px-3 py-2">{l.descricao ?? '—'}</td>
                <td className="px-3 py-2">{l.marca ?? '—'}</td>
                <td className="px-3 py-2 text-right">{num(l.qtdeFechamento)}</td>
                <td className="px-3 py-2 text-right">{num(l.qtdeInventario)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    l.divergencia === 0 ? '' : l.divergencia > 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {num(l.divergencia)}
                </td>
                <td className="px-3 py-2 text-right">{num(l.vuCusto)}</td>
                <td className="px-3 py-2 text-right">{num(l.valorDivergencia, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
