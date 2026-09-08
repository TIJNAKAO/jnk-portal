import { useCallback, useEffect, useState } from 'react';
import { useApi, useApiDownload } from '../../../lib/useApi';

interface LinhaCusto {
  id_empresa: number | null;
  nome_empresa: string | null;
  origem: string;
  codigo_auxiliar: string | null;
  descricao_produto: string | null;
  marca: string | null;
  unidade: string | null;
  ncm: string | null;
  conta: string | null;
  tipo_saldo: string | null;
  qtde: number | null;
  vu_custo_estoque: number | null;
  vu_custo_venda: number | null;
  vu_custo: number | null;
  valor_custo_total: number | null;
}

interface ResumoCalculo {
  linhasFechamento: number;
  linhasEstoqueFull: number;
  usouCustoEstoque: number;
  usouCustoVenda: number;
  semCusto: number;
  totalGeral: number;
}

const TAMANHO_PAGINA = 50;

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

export function CustoFechamentoPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<{ grupos: string[]; periodos: string[] }>({ grupos: [], periodos: [] });
  const [grupo, setGrupo] = useState('');
  const [periodo, setPeriodo] = useState('');

  const [linhas, setLinhas] = useState<LinhaCusto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalGeral, setTotalGeral] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [dataFechamento, setDataFechamento] = useState<string | null>(null);

  const [resumo, setResumo] = useState<ResumoCalculo | null>(null);
  const [percentual, setPercentual] = useState<number | null>(null);

  const [carregando, setCarregando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<{ grupos: string[]; periodos: string[] }>('/estoque/fechamento/custo/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const carregar = useCallback(
    async (paginaAlvo: number) => {
      if (!grupo || !periodo) {
        setLinhas([]);
        setTotal(0);
        return;
      }

      setCarregando(true);
      setErro(null);
      try {
        const params = new URLSearchParams({
          grupo,
          periodo,
          pagina: String(paginaAlvo),
          tamanhoPagina: String(TAMANHO_PAGINA),
        });
        const dados = await api<{
          linhas: LinhaCusto[];
          total: number;
          totalGeral: number;
          dataFechamento: string;
        }>(`/estoque/fechamento/custo?${params.toString()}`);

        setLinhas(dados.linhas);
        setTotal(dados.total);
        setTotalGeral(dados.totalGeral);
        setDataFechamento(dados.dataFechamento);
        setPagina(paginaAlvo);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, grupo, periodo],
  );

  useEffect(() => {
    setResumo(null);
    carregar(1).catch(console.error);
  }, [carregar]);

  async function calcular() {
    setCalculando(true);
    setErro(null);
    try {
      const dados = await api<{ resumo: ResumoCalculo; percentualCustoVenda: number }>(
        '/estoque/fechamento/custo/calcular',
        { method: 'POST', body: { grupo, periodo } },
      );
      setResumo(dados.resumo);
      setPercentual(dados.percentualCustoVenda);
      await carregar(1);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCalculando(false);
    }
  }

  async function exportar(caminho: string, nomeArquivo: string) {
    setBaixando(caminho);
    try {
      const params = new URLSearchParams({ grupo, periodo });
      await baixar(`/estoque/fechamento/custo${caminho}?${params.toString()}`, { nomeArquivo });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(null);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const podeAgir = grupo !== '' && periodo !== '';
  const sufixo = podeAgir ? `${grupo}-${periodo.slice(0, 7)}` : '';

  const cartao = (rotulo: string, valor: string, alerta = false) => (
    <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Cálculo de Custo de Fechamento</h1>
        <p className="text-sm text-slate-500">
          Junta o Fechamento Mensal (que já tem custo próprio) com o Estoque FULL, valorizado pelo custo do
          Fechamento ou, na falta dele, por um percentual do preço de venda. Recalcular substitui o cálculo
          anterior deste grupo e período.
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

        <button
          type="button"
          onClick={calcular}
          disabled={!podeAgir || calculando}
          className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {calculando ? 'Calculando…' : 'Calcular custo'}
        </button>

        <button
          type="button"
          onClick={() => exportar('/lista-inventario', `lista-inventario-${sufixo}.xlsx`)}
          disabled={!podeAgir || total === 0 || baixando !== null}
          className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700 disabled:opacity-50"
        >
          {baixando === '/lista-inventario' ? 'Gerando…' : 'Gerar Lista de Inventário'}
        </button>

        <button
          type="button"
          onClick={() => exportar('/exportar', `custo-fechamento-${sufixo}.xlsx`)}
          disabled={!podeAgir || total === 0 || baixando !== null}
          className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700 disabled:opacity-50"
        >
          {baixando === '/exportar' ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {resumo && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {cartao('Linhas do Fechamento', inteiro(resumo.linhasFechamento))}
          {cartao('Linhas do Estoque FULL', inteiro(resumo.linhasEstoqueFull))}
          {cartao('Usou custo de estoque', inteiro(resumo.usouCustoEstoque))}
          {cartao(
            percentual === null ? 'Usou preço de venda' : `Usou ${percentual}% do preço de venda`,
            inteiro(resumo.usouCustoVenda),
          )}
          {cartao('Sem custo encontrado', inteiro(resumo.semCusto), resumo.semCusto > 0)}
          {cartao('Custo total geral', `R$ ${num(resumo.totalGeral, 2)}`)}
        </div>
      )}

      {podeAgir && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cartao('Registros no período/grupo', inteiro(total))}
          {cartao('Custo total geral (somado no banco)', `R$ ${num(totalGeral, 2)}`)}
          {cartao(
            'Data do fechamento',
            dataFechamento ? new Date(dataFechamento).toLocaleDateString('pt-BR') : '—',
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 font-medium">Un.</th>
              <th className="px-3 py-2 font-medium">NCM</th>
              <th className="px-3 py-2 font-medium">Conta</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 text-right font-medium">Qtde</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo Estoque</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo Venda</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo Adotado</th>
              <th className="px-3 py-2 text-right font-medium">Valor Custo Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-slate-500">
                  {carregando
                    ? 'Carregando…'
                    : podeAgir
                      ? 'Nenhum registro calculado para este grupo e período ainda — clique em "Calcular custo".'
                      : 'Selecione o grupo e o período.'}
                </td>
              </tr>
            )}
            {linhas.map((l, i) => (
              <tr
                key={`${l.origem}-${l.id_empresa}-${l.codigo_auxiliar}-${i}`}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      l.origem === 'FECHAMENTO' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {l.origem === 'FECHAMENTO' ? 'Fechamento' : 'Estoque FULL'}
                  </span>
                </td>
                <td className="px-3 py-2">{l.nome_empresa ?? '—'}</td>
                <td className="px-3 py-2">{l.codigo_auxiliar ?? '—'}</td>
                <td className="px-3 py-2">{l.descricao_produto ?? '—'}</td>
                <td className="px-3 py-2">{l.marca ?? '—'}</td>
                <td className="px-3 py-2">{l.unidade ?? '—'}</td>
                <td className="px-3 py-2">{l.ncm ?? '—'}</td>
                <td className="px-3 py-2">{l.conta ?? '—'}</td>
                <td className="px-3 py-2">{l.tipo_saldo ?? '—'}</td>
                <td className="px-3 py-2 text-right">{num(l.qtde)}</td>
                <td className="px-3 py-2 text-right">{num(l.vu_custo_estoque)}</td>
                <td className="px-3 py-2 text-right">{num(l.vu_custo_venda)}</td>
                <td className="px-3 py-2 text-right">{num(l.vu_custo)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_custo_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > TAMANHO_PAGINA && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {pagina} de {totalPaginas} · {inteiro(total)} registros
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => carregar(pagina - 1)}
              disabled={pagina <= 1 || carregando}
              className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => carregar(pagina + 1)}
              disabled={pagina >= totalPaginas || carregando}
              className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
