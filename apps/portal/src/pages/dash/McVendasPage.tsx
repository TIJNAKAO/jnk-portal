import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { SERIE_1 } from '../../lib/paletaViz';
import type { DirecaoOrdenacao } from '../../lib/tabela';
import { useApi, useApiDownload } from '../../lib/useApi';
import { FiltroMultiplo } from './FiltroMultiplo';

/**
 * MC Vendas: margem de contribuição venda a venda, para empresa de lucro
 * real. Ver Specs/spec_modulo_dash.md, seção 2.
 *
 * Todo número vem calculado da API (`services/mcVendasCalculos.ts`). A tela
 * só formata: nenhuma fórmula de margem mora aqui.
 */

type FaixaMc = 'lt10' | 'f1015' | 'f1520' | 'f2025' | 'ge25' | 'semcusto';

interface LinhaMc {
  recno: number;
  empresa: string;
  data: string;
  nf: string;
  serie: string;
  uf: string;
  canal: string;
  cdProduto: string;
  produto: string;
  marca: string;
  qtde: number;
  valorUnitario: number;
  vendas: number;
  custoLiquidoUnitario: number | null;
  custoLiquido: number | null;
  icms: number;
  percIcms: number | null;
  pisCofins: number;
  percPisCofins: number | null;
  difal: number;
  percDifal: number | null;
  tarifa: number;
  frete: number;
  mc: number | null;
  percMc: number | null;
}

interface ComponentesComCusto {
  vendas: number;
  custoLiquido: number;
  icms: number;
  pisCofins: number;
  difal: number;
  tarifa: number;
  frete: number;
}

interface Agregado {
  itens: number;
  itensComCusto: number;
  qtde: number;
  vendas: number;
  comCusto: ComponentesComCusto;
  mc: number | null;
  percMc: number | null;
  cobertura: number | null;
}

interface Grupo extends Agregado {
  rotulo: string;
}

interface Resumo {
  total: Agregado & { notas: number };
  porCanal: Grupo[];
  topProdutos: (Grupo & { produto: string })[];
  fechamentoCusto: string | null;
  atualizadoEm: string | null;
}

interface ItemRanking extends Grupo {
  produto: string;
  marca: string;
  abc: 'A' | 'B' | 'C' | null;
}

interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

interface FiltrosDisponiveis {
  empresas: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
  canais: OpcaoFiltro[];
  periodo: { minimo: string | null; maximo: string | null };
}

const TAMANHO_PAGINA = 50;

/** Células da tabela venda a venda: respiro mínimo, para as 16 colunas caberem sem rolagem lateral. */
const TH = 'px-1.5 py-2';
const TD = 'px-1.5 py-1.5';
const NUM = `${TD} whitespace-nowrap text-right tabular-nums`;

const FAIXAS: { id: FaixaMc | ''; rotulo: string }[] = [
  { id: '', rotulo: 'Todas' },
  { id: 'lt10', rotulo: 'Abaixo de 10%' },
  { id: 'f1015', rotulo: '10 a 15%' },
  { id: 'f1520', rotulo: '15 a 20%' },
  { id: 'f2025', rotulo: '20 a 25%' },
  { id: 'ge25', rotulo: '25% ou mais' },
  { id: 'semcusto', rotulo: 'Sem custo' },
];

type VisaoRanking = 'mc' | 'percMc' | 'vendas' | 'qtde';

const VISOES: { id: VisaoRanking; rotulo: string }[] = [
  { id: 'mc', rotulo: 'Maior margem R$' },
  { id: 'percMc', rotulo: 'Maior margem %' },
  { id: 'vendas', rotulo: 'Mais faturam' },
  { id: 'qtde', rotulo: 'Mais unidades' },
];

function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moedaInteira(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function numero(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** `2026-11-26` → `26/11/2026`, sem passar por `Date`: data de NF não tem hora nem fuso. */
function dataBr(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

/** Data local em `YYYY-MM-DD`. `toISOString` daria o dia seguinte depois das 21h em Brasília. */
function isoLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Vermelho abaixo de 10%, verde a partir de 20%. O sinal e o número dizem o mesmo sem depender da cor. */
function corMc(perc: number | null): string {
  if (perc === null) return 'text-slate-500';
  if (perc < 10) return 'text-red-700';
  if (perc >= 20) return 'text-green-700';
  return 'text-slate-900';
}

function Pilula({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={`min-h-[44px] rounded-full border px-3 text-sm ${
        ativa ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function LinhaComponente({ nome, valor, base }: { nome: string; valor: number; base: number }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-700">{nome}</span>
      <span className="tabular-nums text-slate-900">
        {moedaInteira(valor)} <span className="text-slate-500">({pct(base > 0 ? (valor / base) * 100 : null)})</span>
      </span>
    </div>
  );
}

export function McVendasPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<FiltrosDisponiveis>({
    empresas: [],
    marcas: [],
    canais: [],
    periodo: { minimo: null, maximo: null },
  });

  const [aba, setAba] = useState<'vendas' | 'ranking'>('vendas');
  const [empresas, setEmpresas] = useState<string[] | null>(null);
  const [marcas, setMarcas] = useState<string[] | null>(null);
  const [canais, setCanais] = useState<string[] | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [busca, setBusca] = useState('');
  const [faixa, setFaixa] = useState<FaixaMc | ''>('');

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [linhas, setLinhas] = useState<LinhaMc[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [ordenarPor, setOrdenarPor] = useState('data');
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('desc');
  const [ranking, setRanking] = useState<ItemRanking[]>([]);
  const [visao, setVisao] = useState<VisaoRanking>('mc');

  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<FiltrosDisponiveis>('/dash/mc-vendas/filtros')
      .then((dados) => {
        setOpcoes(dados);
        // Abre no mês da última venda disponível, não no histórico inteiro:
        // o JOIN de custo sobre anos de notas pesa, e ninguém decide preço
        // olhando a margem de 2026 inteiro de uma vez.
        const maximo = dados.periodo.maximo;
        if (maximo) {
          setDataInicio(`${maximo.slice(0, 8)}01`);
          setDataFim(maximo);
        }
      })
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  /** Filtros comuns às três consultas. Faixa e ordenação são só da tabela. */
  const queryBase = useCallback(() => {
    const params = new URLSearchParams();
    // `null` é "todas": não manda a lista, e o servidor não restringe. Lista vazia também
    // não restringe, senão desmarcar tudo esvaziaria a tela no meio da escolha.
    if (empresas?.length) params.set('empresas', empresas.join(','));
    if (marcas?.length) params.set('marcas', marcas.join(','));
    if (canais?.length) params.set('canais', canais.join(','));
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    if (busca.trim()) params.set('busca', busca.trim());
    return params;
  }, [empresas, marcas, canais, dataInicio, dataFim, busca]);

  const queryTabela = useCallback(() => {
    const params = queryBase();
    if (faixa) params.set('faixa', faixa);
    params.set('ordenarPor', ordenarPor);
    params.set('direcao', direcao);
    return params;
  }, [queryBase, faixa, ordenarPor, direcao]);

  const periodoPronto = Boolean(dataInicio && dataFim);

  // Resumo e ranking dependem só dos filtros comuns: trocar de página ou de
  // faixa na tabela não refaz as agregações.
  useEffect(() => {
    if (!periodoPronto) return;
    const timer = setTimeout(() => {
      const params = queryBase().toString();
      Promise.all([
        api<Resumo>(`/dash/mc-vendas/resumo?${params}`),
        api<{ itens: ItemRanking[] }>(`/dash/mc-vendas/ranking?${params}`),
      ])
        .then(([dadosResumo, dadosRanking]) => {
          setResumo(dadosResumo);
          setRanking(dadosRanking.itens);
        })
        .catch((e: Error) => setErro(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [api, queryBase, periodoPronto]);

  const carregarTabela = useCallback(
    async (paginaAtual: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const params = queryTabela();
        params.set('pagina', String(paginaAtual));
        params.set('tamanhoPagina', String(TAMANHO_PAGINA));
        const dados = await api<{ linhas: LinhaMc[]; total: number }>(`/dash/mc-vendas?${params.toString()}`);
        setLinhas(dados.linhas);
        setTotal(dados.total);
        setPagina(paginaAtual);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, queryTabela],
  );

  // Trocar filtro sempre volta pra primeira página: manter a página 7 de um
  // resultado que agora tem 2 mostraria tela vazia sem explicação.
  useEffect(() => {
    if (!periodoPronto) return;
    const timer = setTimeout(() => {
      carregarTabela(1).catch(console.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [carregarTabela, periodoPronto]);

  function ordenar(campo: string) {
    if (campo === ordenarPor) {
      setDirecao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenarPor(campo);
      // Número abre do maior para o menor: é o que se procura numa coluna de valor.
      setDirecao(['canal', 'produto'].includes(campo) ? 'asc' : 'desc');
    }
  }

  function atalhoPeriodo(qual: 'hoje' | 'ontem' | 'mes' | 'mesAnterior') {
    const hoje = new Date();
    if (qual === 'hoje') {
      setDataInicio(isoLocal(hoje));
      setDataFim(isoLocal(hoje));
    } else if (qual === 'ontem') {
      const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
      setDataInicio(isoLocal(ontem));
      setDataFim(isoLocal(ontem));
    } else if (qual === 'mes') {
      setDataInicio(isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
      setDataFim(isoLocal(hoje));
    } else {
      setDataInicio(isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)));
      // Dia 0 do mês corrente é o último dia do mês anterior.
      setDataFim(isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 0)));
    }
  }

  async function exportar() {
    setExportando(true);
    setErro(null);
    try {
      await baixar(`/dash/mc-vendas/exportar?${queryTabela().toString()}`, { nomeArquivo: 'mc-vendas.xlsx' });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  const rankingOrdenado = useMemo(() => {
    const copia = [...ranking];
    // Sem custo vai para o fim nas visões de margem: não há o que comparar.
    const valor = (i: ItemRanking) => i[visao] ?? Number.NEGATIVE_INFINITY;
    copia.sort((a, b) => valor(b) - valor(a));
    return copia;
  }, [ranking, visao]);

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const t = resumo?.total;
  const cc = t?.comCusto;
  const maiorCanal = Math.max(1, ...(resumo?.porCanal ?? []).map((c) => c.vendas));
  const props = { campoOrdenado: ordenarPor, direcao, onOrdenar: ordenar };
  const semCobertura = t ? t.itens - t.itensComCusto : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">MC Vendas</h1>
          <p className="text-sm text-slate-500">
            Margem de contribuição venda a venda, com os impostos da NF de saída e o custo líquido de créditos.
            Somente notas autorizadas pela SEFAZ.{' '}
            {resumo?.atualizadoEm &&
              `Dados do último processamento em ${new Date(resumo.atualizadoEm).toLocaleString('pt-BR')}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando || total === 0}
          className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {resumo && resumo.fechamentoCusto === null && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Não há Fechamento de Custo calculado até o fim deste período, então nenhuma venda tem custo líquido e a MC
            fica em branco. O custo vem de Estoque › Fechamento Mensal › Cálculo de custo.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-500">Período</span>
          <div className="flex flex-wrap gap-1">
            <Pilula ativa={false} onClick={() => atalhoPeriodo('hoje')}>
              Hoje
            </Pilula>
            <Pilula ativa={false} onClick={() => atalhoPeriodo('ontem')}>
              Ontem
            </Pilula>
            <Pilula ativa={false} onClick={() => atalhoPeriodo('mes')}>
              Mês atual
            </Pilula>
            <Pilula ativa={false} onClick={() => atalhoPeriodo('mesAnterior')}>
              Mês anterior
            </Pilula>
          </div>
        </div>
        <div>
          <label htmlFor="mc-de" className="mb-1 block text-xs font-medium text-slate-500">
            De
          </label>
          <input
            id="mc-de"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="mc-ate" className="mb-1 block text-xs font-medium text-slate-500">
            Até
          </label>
          <input
            id="mc-ate"
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
        </div>
        <FiltroMultiplo rotulo="Empresa" opcoes={opcoes.empresas} selecionadas={empresas} onChange={setEmpresas} />
        <FiltroMultiplo rotulo="Canal" opcoes={opcoes.canais} selecionadas={canais} onChange={setCanais} />
        <FiltroMultiplo rotulo="Marca" opcoes={opcoes.marcas} selecionadas={marcas} onChange={setMarcas} />
        <CampoBusca valor={busca} onChange={setBusca} placeholder="NF, cliente ou produto..." />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Vendas no período</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{moedaInteira(t?.vendas ?? 0)}</p>
          <p className="text-xs text-slate-500">
            {(t?.notas ?? 0).toLocaleString('pt-BR')} notas, {(t?.itens ?? 0).toLocaleString('pt-BR')} itens
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Margem de contribuição</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${corMc(t?.percMc ?? null)}`}>
            {moedaInteira(t?.mc ?? null)}
          </p>
          <p className={`text-sm font-semibold ${corMc(t?.percMc ?? null)}`}>MC {pct(t?.percMc ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500">sobre {moedaInteira(cc?.vendas ?? 0)} de vendas com custo</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Para onde vai a venda</p>
          <div className="mt-2 space-y-1">
            <LinhaComponente nome="Custo líquido" valor={cc?.custoLiquido ?? 0} base={cc?.vendas ?? 0} />
            <LinhaComponente nome="ICMS" valor={cc?.icms ?? 0} base={cc?.vendas ?? 0} />
            <LinhaComponente nome="PIS/COFINS" valor={cc?.pisCofins ?? 0} base={cc?.vendas ?? 0} />
            <LinhaComponente nome="DIFAL" valor={cc?.difal ?? 0} base={cc?.vendas ?? 0} />
            <LinhaComponente nome="Tarifa do canal" valor={cc?.tarifa ?? 0} base={cc?.vendas ?? 0} />
            <LinhaComponente nome="Frete do vendedor" valor={cc?.frete ?? 0} base={cc?.vendas ?? 0} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Cobertura de custo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{pct(t?.cobertura ?? null)}</p>
          <p className="text-xs text-slate-500">das vendas, em valor, têm custo líquido e entram na MC</p>
          <p className="mt-2 text-xs text-slate-500">
            {semCobertura.toLocaleString('pt-BR')} itens sem custo.{' '}
            {resumo?.fechamentoCusto && `Custo do fechamento de ${dataBr(resumo.fechamentoCusto).slice(3)}.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {(
          [
            { id: 'vendas', rotulo: 'Venda a venda' },
            { id: 'ranking', rotulo: 'Ranking de produtos' },
          ] as const
        ).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            aria-pressed={aba === a.id}
            className={`-mb-px min-h-[44px] border-b-2 px-4 text-sm ${
              aba === a.id ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-600'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'vendas' && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-medium text-slate-900">Vendas por canal</h2>
              <p className="mb-3 mt-0.5 text-xs text-slate-500">Valor vendido no período e a MC de cada canal.</p>
              <div className="space-y-2">
                {(resumo?.porCanal ?? []).map((c) => (
                  <div key={c.rotulo} className="flex items-center gap-3 text-sm">
                    <div className="w-44 shrink-0 truncate text-slate-700" title={c.rotulo}>
                      {c.rotulo || '—'}
                    </div>
                    <div className="h-4 min-w-[40px] flex-1 rounded bg-slate-100">
                      <div
                        className="h-4 rounded"
                        style={{ width: `${Math.max(1, (c.vendas / maiorCanal) * 100)}%`, backgroundColor: SERIE_1 }}
                      />
                    </div>
                    <div className="w-24 shrink-0 text-right tabular-nums text-slate-900">{moedaInteira(c.vendas)}</div>
                    <div className={`w-14 shrink-0 text-right font-semibold tabular-nums ${corMc(c.percMc)}`}>
                      {pct(c.percMc)}
                    </div>
                  </div>
                ))}
                {resumo && resumo.porCanal.length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-500">Sem vendas para estes filtros.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 font-medium text-slate-900">Top 5 produtos do período</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-1 font-medium">Produto</th>
                    <th className="py-1 text-right font-medium">Vendas</th>
                    <th className="py-1 text-right font-medium">Un.</th>
                    <th className="py-1 text-right font-medium">MC</th>
                  </tr>
                </thead>
                <tbody>
                  {(resumo?.topProdutos ?? []).map((p) => (
                    <tr key={p.rotulo} className="border-t border-slate-100">
                      <td className="py-2">
                        <span className="font-medium text-slate-900">{p.rotulo}</span>{' '}
                        <span className="text-slate-600">{p.produto}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{moedaInteira(p.vendas)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{p.qtde.toLocaleString('pt-BR')}</td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${corMc(p.percMc)}`}>
                        {pct(p.percMc)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por faixa de MC">
            {FAIXAS.map((f) => (
              <Pilula key={f.id || 'todas'} ativa={faixa === f.id} onClick={() => setFaixa(f.id)}>
                {f.rotulo}
              </Pilula>
            ))}
          </div>

          {/* Tabela compacta: 16 colunas precisam caber numa tela de notebook sem rolagem
              lateral. Por isso letra menor, pouco respiro, data+NF+UF e canal+empresa
              empilhados numa célula só, e produto com quebra de linha. O overflow fica
              como rede de segurança para telas estreitas. */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 align-bottom text-slate-500">
                <tr>
                  <ThOrdenavel campo="data" className={TH} {...props}>
                    DATA / NF
                  </ThOrdenavel>
                  <ThOrdenavel campo="canal" className={TH} {...props}>
                    CANAL
                  </ThOrdenavel>
                  <ThOrdenavel campo="produto" className={TH} {...props}>
                    PRODUTO
                  </ThOrdenavel>
                  <ThOrdenavel campo="qtde" alinharDireita className={TH} {...props}>
                    QTD
                  </ThOrdenavel>
                  <ThOrdenavel campo="vendas" alinharDireita className={TH} {...props}>
                    VALOR
                  </ThOrdenavel>
                  <ThOrdenavel campo="custoLiquido" alinharDireita className={TH} {...props}>
                    CUSTO LÍQ.
                  </ThOrdenavel>
                  <ThOrdenavel campo="icms" alinharDireita className={`${TH} border-l border-slate-200`} {...props}>
                    ICMS R$
                  </ThOrdenavel>
                  <th className={`${TH} text-right font-medium`}>ICMS %</th>
                  <ThOrdenavel campo="pisCofins" alinharDireita className={TH} {...props}>
                    PIS/COF R$
                  </ThOrdenavel>
                  <th className={`${TH} text-right font-medium`}>PIS/COF %</th>
                  <ThOrdenavel campo="difal" alinharDireita className={TH} {...props}>
                    DIFAL R$
                  </ThOrdenavel>
                  <th className={`${TH} border-r border-slate-200 text-right font-medium`}>DIFAL %</th>
                  <ThOrdenavel campo="tarifa" alinharDireita className={TH} {...props}>
                    TARIFA
                  </ThOrdenavel>
                  <ThOrdenavel campo="frete" alinharDireita className={TH} {...props}>
                    FRETE
                  </ThOrdenavel>
                  <ThOrdenavel campo="mc" alinharDireita className={TH} {...props}>
                    MC R$
                  </ThOrdenavel>
                  <ThOrdenavel campo="percMc" alinharDireita className={TH} {...props}>
                    MC %
                  </ThOrdenavel>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.recno} className="border-b border-slate-100 align-top last:border-0">
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="text-slate-900">{dataBr(l.data).slice(0, 5)}</div>
                      <div className="text-slate-500">
                        {l.nf}
                        {l.uf ? ` · ${l.uf}` : ''}
                      </div>
                    </td>
                    <td className={`${TD} max-w-[9rem]`}>
                      <div className="truncate text-slate-900" title={l.canal}>
                        {l.canal || '—'}
                      </div>
                      <div className="truncate text-slate-500" title={l.empresa}>
                        {l.empresa}
                      </div>
                    </td>
                    <td className={`${TD} min-w-[9rem]`}>
                      <div className="text-slate-900">{l.produto || '—'}</div>
                      <div className="text-slate-500">
                        {l.cdProduto}
                        {l.marca ? ` · ${l.marca}` : ''}
                      </div>
                    </td>
                    <td className={NUM}>{l.qtde.toLocaleString('pt-BR')}</td>
                    <td className={NUM}>{numero(l.vendas)}</td>
                    <td className={NUM}>
                      {l.custoLiquido === null ? (
                        <span className="font-semibold text-amber-800">Sem custo</span>
                      ) : (
                        numero(l.custoLiquido)
                      )}
                    </td>
                    <td className={`${NUM} border-l border-slate-100 text-slate-700`}>{numero(l.icms)}</td>
                    <td className={`${NUM} text-slate-600`}>{pct(l.percIcms)}</td>
                    <td className={`${NUM} text-slate-700`}>{numero(l.pisCofins)}</td>
                    <td className={`${NUM} text-slate-600`}>{pct(l.percPisCofins)}</td>
                    <td className={`${NUM} text-slate-700`}>{numero(l.difal)}</td>
                    <td className={`${NUM} border-r border-slate-100 text-slate-600`}>{pct(l.percDifal)}</td>
                    <td className={`${NUM} text-slate-700`}>{numero(l.tarifa)}</td>
                    <td className={`${NUM} text-slate-700`}>{numero(l.frete)}</td>
                    <td className={`${NUM} font-semibold ${corMc(l.percMc)}`}>{numero(l.mc)}</td>
                    <td className={`${NUM} font-semibold ${corMc(l.percMc)}`}>{pct(l.percMc)}</td>
                  </tr>
                ))}
                {linhas.length === 0 && !carregando && (
                  <tr>
                    <td colSpan={16} className="p-6 text-center text-sm text-slate-500">
                      Nenhuma venda encontrada para estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>
              {total.toLocaleString('pt-BR')} linha(s), página {pagina} de {totalPaginas}
              {carregando && ' · carregando…'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagina <= 1 || carregando}
                onClick={() => carregarTabela(pagina - 1)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagina >= totalPaginas || carregando}
                onClick={() => carregarTabela(pagina + 1)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}

      {aba === 'ranking' && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ordenar ranking">
            {VISOES.map((v) => (
              <Pilula key={v.id} ativa={visao === v.id} onClick={() => setVisao(v.id)}>
                {v.rotulo}
              </Pilula>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3 text-right font-medium">#</th>
                  <th className="p-3 font-medium">PRODUTO</th>
                  <th className="p-3 font-medium">MARCA</th>
                  <th className="p-3 text-center font-medium">ABC</th>
                  <th className="p-3 text-right font-medium">VENDAS</th>
                  <th className="p-3 text-right font-medium">UNIDADES</th>
                  <th className="p-3 text-right font-medium">MC R$</th>
                  <th className="p-3 text-right font-medium">MC %</th>
                </tr>
              </thead>
              <tbody>
                {rankingOrdenado.map((r, i) => (
                  <tr key={r.rotulo} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 text-right tabular-nums text-slate-500">{i + 1}</td>
                    <td className="min-w-[260px] p-3">
                      <span className="font-medium text-slate-900">{r.rotulo}</span>{' '}
                      <span className="text-slate-600">{r.produto}</span>
                    </td>
                    <td className="whitespace-nowrap p-3 text-slate-600">{r.marca || '—'}</td>
                    <td className="p-3 text-center">
                      {r.abc ? (
                        <span
                          className={`inline-block min-w-[24px] rounded-md px-1.5 py-0.5 text-xs font-bold ${
                            r.abc === 'A'
                              ? 'bg-green-100 text-green-900'
                              : r.abc === 'B'
                                ? 'bg-blue-100 text-blue-900'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.abc}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3 text-right tabular-nums">{moeda(r.vendas)}</td>
                    <td className="whitespace-nowrap p-3 text-right tabular-nums">{r.qtde.toLocaleString('pt-BR')}</td>
                    <td className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${corMc(r.percMc)}`}>
                      {r.mc === null ? <span className="text-amber-800">Sem custo</span> : moeda(r.mc)}
                    </td>
                    <td className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${corMc(r.percMc)}`}>
                      {pct(r.percMc)}
                    </td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      Nenhum produto vendido para estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Curva ABC sobre a MC acumulada: A até 80%, B até 95%, C o restante. Até 1.000 produtos, os de maior venda.
          </p>
        </>
      )}

      <p className="text-xs text-slate-500">
        MC = valor da venda − custo líquido − ICMS − PIS/COFINS − DIFAL − tarifa do canal − frete do vendedor. Os
        impostos são os destacados em cada item da NF de saída; o percentual é o valor sobre o preço de venda. DIFAL
        inclui o FECP. O custo líquido vem do Fechamento de Custo mais recente até o fim do período, já sem os créditos
        de ICMS, PIS e COFINS. Venda sem custo fica fora da MC, em branco, nunca zero.
      </p>
    </div>
  );
}
