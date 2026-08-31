import { AlertTriangle } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CardGrafico } from '../../components/CardGrafico';
import {
  EIXO,
  GRADE,
  moeda,
  moedaCompacta,
  moedaExata,
  NEGATIVO,
  percentual,
  rotuloPeriodo,
  SERIE_1,
  SERIE_2,
  TEXTO_EIXO,
} from '../../lib/paletaViz';
import { useApi } from '../../lib/useApi';

interface Agregado {
  rotulo: string;
  itens: number;
  faturamento: number;
  liquido: number;
  margem: number | null;
  percMargem: number | null;
}

interface Resumo {
  kpis: {
    faturamentoBruto: number;
    devolucoes: number;
    faturamentoLiquido: number;
    qtdeNotas: number;
    qtdeItens: number;
    ticketMedio: number;
    margem: number | null;
    percMargem: number | null;
    coberturaCusto: number;
  };
  evolucaoMensal: Agregado[];
  porCanal: Agregado[];
  porMarca: Agregado[];
  porUf: Agregado[];
  porEmpresa: Agregado[];
  atualizadoEm: string | null;
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

function selecionadas(e: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(e.target.selectedOptions).map((o) => o.value);
}

/** Um número é a resposta inteira — não vira gráfico de uma barra só. */
function Kpi({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: 'negativo';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      {/* Figuras proporcionais de propósito: tabular-nums deixa número grande frouxo. */}
      <p className={`mt-1 text-2xl font-semibold ${destaque === 'negativo' ? 'text-red-600' : 'text-slate-900'}`}>
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

const EIXO_PROPS = {
  stroke: EIXO,
  tick: { fill: TEXTO_EIXO, fontSize: 11 },
  tickLine: false,
} as const;

interface ItemTooltip {
  name?: string;
  value?: number;
  color?: string;
}

function Tip({
  active,
  payload,
  label,
  formatar,
}: {
  active?: boolean;
  payload?: ItemTooltip[];
  label?: string;
  formatar: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-900">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-slate-900">{formatar(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const api = useApi();

  const [opcoes, setOpcoes] = useState<FiltrosDisponiveis>({
    empresas: [],
    marcas: [],
    canais: [],
    periodo: { minimo: null, maximo: null },
  });
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [canais, setCanais] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<FiltrosDisponiveis>('/faturamento/dashboard/filtros')
      .then((dados) => {
        setOpcoes(dados);
        if (dados.periodo.minimo) setDataInicio(dados.periodo.minimo);
        if (dados.periodo.maximo) setDataFim(dados.periodo.maximo);
      })
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (empresas.length) params.set('empresas', empresas.join(','));
      if (marcas.length) params.set('marcas', marcas.join(','));
      if (canais.length) params.set('canais', canais.join(','));
      if (dataInicio) params.set('dataInicio', dataInicio);
      if (dataFim) params.set('dataFim', dataFim);
      setResumo(await api<Resumo>(`/faturamento/dashboard?${params.toString()}`));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [api, empresas, marcas, canais, dataInicio, dataFim]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregar().catch(console.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [carregar]);

  const k = resumo?.kpis;
  const evolucao = (resumo?.evolucaoMensal ?? []).map((m) => ({ ...m, rotulo: rotuloPeriodo(m.rotulo) }));

  const colunasRanking = [
    { titulo: 'Nome', valor: (a: Agregado) => a.rotulo || '—' },
    { titulo: 'Faturamento', valor: (a: Agregado) => moedaExata(a.faturamento), alinharDireita: true },
    { titulo: 'Líquido', valor: (a: Agregado) => moedaExata(a.liquido), alinharDireita: true },
    { titulo: '% Margem', valor: (a: Agregado) => percentual(a.percMargem), alinharDireita: true },
  ];

  /**
   * Ranking horizontal: uma categoria nominal, então uma cor só — degradê por
   * tamanho apenas repetiria o comprimento da barra e queimaria o único canal
   * livre. Rótulos longos ("MERCADO LIVRE J NAKAO MAQUINAS") são encurtados com
   * reticências em vez de cortados pela metade; o nome inteiro está no tooltip
   * e na tabela.
   */
  const graficoRanking = (dados: Agregado[]) => (
    <ResponsiveContainer width="100%" height={Math.max(200, dados.length * 34 + 30)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }} barCategoryGap={2}>
        <CartesianGrid stroke={GRADE} horizontal={false} />
        <XAxis type="number" tickFormatter={moedaCompacta} {...EIXO_PROPS} />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={185}
          tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v || '—')}
          {...EIXO_PROPS}
        />
        <Tooltip content={<Tip formatar={moedaExata} />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
        <Bar dataKey="faturamento" name="Faturamento" fill={SERIE_1} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Dashboard de Faturamento</h1>
        <p className="text-sm text-slate-500">
          Somente notas autorizadas pela SEFAZ.{' '}
          {resumo?.atualizadoEm && `Dados do último processamento em ${new Date(resumo.atualizadoEm).toLocaleString('pt-BR')}.`}
        </p>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Uma linha de filtros acima de tudo: todos os gráficos leem a mesma fatia. */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">De</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Até</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
          <select
            multiple
            value={empresas}
            onChange={(e) => setEmpresas(selecionadas(e))}
            className="min-h-[84px] min-w-[220px] rounded-lg border border-slate-300 p-2 text-sm"
          >
            {opcoes.empresas.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Marca</label>
          <select
            multiple
            value={marcas}
            onChange={(e) => setMarcas(selecionadas(e))}
            className="min-h-[84px] min-w-[180px] rounded-lg border border-slate-300 p-2 text-sm"
          >
            {opcoes.marcas.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Canal</label>
          <select
            multiple
            value={canais}
            onChange={(e) => setCanais(selecionadas(e))}
            className="min-h-[84px] min-w-[220px] rounded-lg border border-slate-300 p-2 text-sm"
          >
            {opcoes.canais.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${carregando ? 'opacity-50' : ''} transition-opacity`}>
        <Kpi rotulo="Faturamento bruto" valor={moeda(k?.faturamentoBruto ?? 0)} detalhe={`${(k?.qtdeNotas ?? 0).toLocaleString('pt-BR')} notas`} />
        <Kpi rotulo="Receita líquida" valor={moeda(k?.faturamentoLiquido ?? 0)} detalhe="após tributos, comissão e frete" />
        <Kpi
          rotulo="Margem"
          valor={percentual(k?.percMargem)}
          detalhe={moeda(k?.margem ?? 0)}
          destaque={(k?.percMargem ?? 0) < 0 ? 'negativo' : undefined}
        />
        <Kpi
          rotulo="Cobertura de custo"
          valor={percentual(k?.coberturaCusto)}
          detalhe="dos itens têm custo para calcular margem"
        />
        <Kpi rotulo="Ticket médio" valor={moeda(k?.ticketMedio ?? 0)} detalhe="por nota fiscal" />
        <Kpi rotulo="Devoluções" valor={moeda(k?.devolucoes ?? 0)} detalhe="notas de entrada no período" />
        <Kpi rotulo="Itens faturados" valor={(k?.qtdeItens ?? 0).toLocaleString('pt-BR')} detalhe="linhas de nota fiscal" />
        <Kpi rotulo="Empresas" valor={String(resumo?.porEmpresa.length ?? 0)} detalhe="com faturamento no período" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardGrafico
          titulo="Evolução mensal"
          descricao="Faturamento bruto e receita líquida, no mesmo eixo por serem a mesma unidade."
          dados={evolucao}
          carregando={carregando}
          colunas={[
            { titulo: 'Mês', valor: (a: Agregado) => a.rotulo },
            { titulo: 'Faturamento', valor: (a: Agregado) => moedaExata(a.faturamento), alinharDireita: true },
            { titulo: 'Líquido', valor: (a: Agregado) => moedaExata(a.liquido), alinharDireita: true },
            { titulo: 'Margem', valor: (a: Agregado) => moedaExata(a.margem), alinharDireita: true },
          ]}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucao} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={GRADE} vertical={false} />
              <XAxis dataKey="rotulo" {...EIXO_PROPS} />
              <YAxis tickFormatter={moedaCompacta} {...EIXO_PROPS} />
              <Tooltip content={<Tip formatar={moedaExata} />} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke={SERIE_1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="liquido" name="Receita líquida" stroke={SERIE_2} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardGrafico>

        <CardGrafico
          titulo="Margem mensal"
          descricao="Percentual, portanto em gráfico próprio — nunca num segundo eixo sobre o faturamento."
          dados={evolucao}
          carregando={carregando}
          colunas={[
            { titulo: 'Mês', valor: (a: Agregado) => a.rotulo },
            { titulo: '% Margem', valor: (a: Agregado) => percentual(a.percMargem), alinharDireita: true },
            { titulo: 'Margem', valor: (a: Agregado) => moedaExata(a.margem), alinharDireita: true },
          ]}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucao} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={GRADE} vertical={false} />
              <XAxis dataKey="rotulo" {...EIXO_PROPS} />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} {...EIXO_PROPS} />
              <Tooltip content={<Tip formatar={(v) => percentual(v)} />} />
              <Line type="monotone" dataKey="percMargem" name="% Margem" stroke={SERIE_1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardGrafico>

        <CardGrafico titulo="Faturamento por canal" dados={resumo?.porCanal ?? []} carregando={carregando} colunas={colunasRanking}>
          {graficoRanking(resumo?.porCanal ?? [])}
        </CardGrafico>

        <CardGrafico titulo="Faturamento por marca" dados={resumo?.porMarca ?? []} carregando={carregando} colunas={colunasRanking}>
          {graficoRanking(resumo?.porMarca ?? [])}
        </CardGrafico>

        <CardGrafico
          titulo="Faturamento por UF do cliente"
          descricao="Operação interestadual é parte grande do negócio — daí o peso do DIFAL."
          dados={resumo?.porUf ?? []}
          carregando={carregando}
          colunas={colunasRanking}
        >
          {graficoRanking(resumo?.porUf ?? [])}
        </CardGrafico>

        <CardGrafico titulo="Faturamento por empresa" dados={resumo?.porEmpresa ?? []} carregando={carregando} colunas={colunasRanking}>
          {graficoRanking(resumo?.porEmpresa ?? [])}
        </CardGrafico>
      </div>

      <p className="text-xs text-slate-500">
        A margem compara receita líquida com o custo médio de estoque congelado na emissão. Como o custo é bruto (inclui
        tributos pagos na compra) e a receita já teve os tributos de saída deduzidos, o número é conservador — não é
        lucro contábil. <span style={{ color: NEGATIVO }}>Valores negativos</span> aparecem em vermelho.
      </p>
    </div>
  );
}
