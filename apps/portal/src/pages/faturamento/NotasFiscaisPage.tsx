import { AlertTriangle } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import type { DirecaoOrdenacao } from '../../lib/tabela';
import { useApi, useApiDownload } from '../../lib/useApi';

interface LinhaRelatorio {
  origem_dados: string;
  dc_filial: string;
  dt_movto: string;
  nf: string;
  serie: string;
  dc_clifor: string;
  uf: string;
  cd_produto: string;
  dc_produto: string;
  marca: string;
  canal: string;
  ref_pendente: string | null;
  qtde: number;
  vu_merc: number;
  vt_merc: number;
  vt_nota: number;
  vt_icms: number;
  vt_icms_st: number;
  vt_ipi: number;
  vt_pis: number;
  vt_cofins: number;
  vt_icms_difal: number;
  vt_fecp: number;
  vt_add_frete: number;
  vt_tx_fatur: number;
  vu_custo: number | null;
  vt_liquido_calc: number;
  vt_margem: number | null;
  perc_margem: number | null;
}

interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

interface FiltrosDisponiveis {
  empresas: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
  canais: OpcaoFiltro[];
  origens: OpcaoFiltro[];
  periodo: { minimo: string | null; maximo: string | null };
}

const TAMANHO_PAGINA = 50;

function fmt(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(v: string): string {
  return v ? new Date(v).toLocaleDateString('pt-BR') : '—';
}

function selecionadas(e: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(e.target.selectedOptions).map((o) => o.value);
}

/** Colunas numéricas ficam à direita; a ordenação é sempre no servidor. */
const COLUNAS_VALOR: { campo: string; titulo: string; valor: (l: LinhaRelatorio) => number | null }[] = [
  { campo: 'qtde', titulo: 'QTDE', valor: (l) => l.qtde },
  { campo: 'vu_merc', titulo: 'VLR UNIT.', valor: (l) => l.vu_merc },
  { campo: 'vt_merc', titulo: 'TOTAL MERC.', valor: (l) => l.vt_merc },
  { campo: '', titulo: 'ICMS', valor: (l) => l.vt_icms },
  { campo: '', titulo: 'ICMS ST', valor: (l) => l.vt_icms_st },
  { campo: '', titulo: 'IPI', valor: (l) => l.vt_ipi },
  { campo: '', titulo: 'PIS', valor: (l) => l.vt_pis },
  { campo: '', titulo: 'COFINS', valor: (l) => l.vt_cofins },
  { campo: '', titulo: 'DIFAL', valor: (l) => l.vt_icms_difal },
  { campo: '', titulo: 'FECP', valor: (l) => l.vt_fecp },
  { campo: 'vt_nota', titulo: 'TOTAL NF', valor: (l) => l.vt_nota },
  { campo: '', titulo: 'FRETE SELLER', valor: (l) => l.vt_add_frete },
  { campo: '', titulo: 'TAXA MKTPLACE', valor: (l) => l.vt_tx_fatur },
  { campo: '', titulo: 'LÍQUIDO', valor: (l) => l.vt_liquido_calc },
  { campo: 'vt_custo', titulo: 'CUSTO UNIT.', valor: (l) => l.vu_custo },
  { campo: '', titulo: 'MARGEM', valor: (l) => l.vt_margem },
];

export function NotasFiscaisPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<FiltrosDisponiveis>({
    empresas: [],
    marcas: [],
    canais: [],
    origens: [],
    periodo: { minimo: null, maximo: null },
  });

  const [empresas, setEmpresas] = useState<string[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [canais, setCanais] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState<'S' | 'E' | 'ambos'>('S');
  const [busca, setBusca] = useState('');

  const [linhas, setLinhas] = useState<LinhaRelatorio[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [ordenarPor, setOrdenarPor] = useState('dt_movto');
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('desc');
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<FiltrosDisponiveis>('/faturamento/notas-fiscais/filtros')
      .then((dados) => {
        setOpcoes(dados);
        // Abre no período disponível, em vez de varrer o histórico inteiro.
        if (dados.periodo.minimo) setDataInicio(dados.periodo.minimo);
        if (dados.periodo.maximo) setDataFim(dados.periodo.maximo);
      })
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const queryFiltros = useCallback(() => {
    const params = new URLSearchParams();
    if (empresas.length) params.set('empresas', empresas.join(','));
    if (marcas.length) params.set('marcas', marcas.join(','));
    if (canais.length) params.set('canais', canais.join(','));
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    if (busca.trim()) params.set('busca', busca.trim());
    params.set('tipoOperacao', tipoOperacao);
    params.set('ordenarPor', ordenarPor);
    params.set('direcao', direcao);
    return params;
  }, [empresas, marcas, canais, dataInicio, dataFim, busca, tipoOperacao, ordenarPor, direcao]);

  const carregar = useCallback(
    async (paginaAtual: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const params = queryFiltros();
        params.set('pagina', String(paginaAtual));
        params.set('tamanhoPagina', String(TAMANHO_PAGINA));
        const dados = await api<{ linhas: LinhaRelatorio[]; total: number }>(
          `/faturamento/notas-fiscais?${params.toString()}`,
        );
        setLinhas(dados.linhas);
        setTotal(dados.total);
        setPagina(paginaAtual);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, queryFiltros],
  );

  // Trocar filtro sempre volta pra primeira página: manter a página 7 de um
  // resultado que agora tem 2 mostraria tela vazia sem explicação.
  useEffect(() => {
    const timer = setTimeout(() => {
      carregar(1).catch(console.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [carregar]);

  function ordenar(campo: string) {
    if (!campo) return;
    if (campo === ordenarPor) {
      setDirecao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenarPor(campo);
      setDirecao('asc');
    }
  }

  async function exportar() {
    setExportando(true);
    setErro(null);
    try {
      await baixar(`/faturamento/notas-fiscais/exportar?${queryFiltros().toString()}`, {
        nomeArquivo: 'faturamento-notas-fiscais.xlsx',
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const semCusto = useMemo(() => linhas.filter((l) => l.vu_custo === null).length, [linhas]);

  const props = { campoOrdenado: ordenarPor, direcao, onOrdenar: ordenar };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Relatório de Notas Fiscais</h1>
          <p className="text-sm text-slate-500">
            Uma linha por item de NF, com impostos, taxa de marketplace, custo e margem. Somente notas autorizadas pela
            SEFAZ.
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Operação</label>
          <select
            value={tipoOperacao}
            onChange={(e) => setTipoOperacao(e.target.value as 'S' | 'E' | 'ambos')}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="S">Saídas</option>
            <option value="E">Devoluções</option>
            <option value="ambos">Ambas</option>
          </select>
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
        <CampoBusca valor={busca} onChange={setBusca} placeholder="NF, cliente ou produto..." />
      </div>

      {semCusto > 0 && (
        <p className="text-xs text-slate-500">
          {semCusto} de {linhas.length} linhas desta página estão sem custo cadastrado — margem em branco, não zero.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="dc_filial" {...props}>
                EMPRESA
              </ThOrdenavel>
              <ThOrdenavel campo="dt_movto" {...props}>
                DATA
              </ThOrdenavel>
              <ThOrdenavel campo="nf" {...props}>
                NF
              </ThOrdenavel>
              <th className="p-3">SÉRIE</th>
              <ThOrdenavel campo="dc_clifor" {...props}>
                CLIENTE
              </ThOrdenavel>
              <ThOrdenavel campo="uf" {...props}>
                UF
              </ThOrdenavel>
              <ThOrdenavel campo="cd_produto" {...props}>
                CÓD.
              </ThOrdenavel>
              <ThOrdenavel campo="dc_produto" {...props}>
                PRODUTO
              </ThOrdenavel>
              <ThOrdenavel campo="marca" {...props}>
                MARCA
              </ThOrdenavel>
              <ThOrdenavel campo="canal" {...props}>
                CANAL
              </ThOrdenavel>
              {COLUNAS_VALOR.map((c) =>
                c.campo ? (
                  <ThOrdenavel key={c.titulo} campo={c.campo} className="p-3 text-right" {...props}>
                    {c.titulo}
                  </ThOrdenavel>
                ) : (
                  <th key={c.titulo} className="whitespace-nowrap p-3 text-right">
                    {c.titulo}
                  </th>
                ),
              )}
              <th className="whitespace-nowrap p-3 text-right">% MARGEM</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.origem_dados}-${l.nf}-${l.serie}-${l.cd_produto}-${i}`} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap p-3">{l.dc_filial}</td>
                <td className="whitespace-nowrap p-3 text-slate-500">{fmtData(l.dt_movto)}</td>
                <td className="p-3">{l.nf}</td>
                <td className="p-3 text-slate-500">{l.serie}</td>
                <td className="p-3">
                  {l.dc_clifor || <span className="text-amber-600">cliente não sincronizado</span>}
                </td>
                <td className="p-3 text-slate-500">{l.uf || '—'}</td>
                <td className="whitespace-nowrap p-3 text-slate-500">{l.cd_produto}</td>
                <td className="p-3">{l.dc_produto}</td>
                <td className="whitespace-nowrap p-3 text-slate-500">{l.marca || '—'}</td>
                <td className="whitespace-nowrap p-3 text-slate-500">{l.canal || '—'}</td>
                {COLUNAS_VALOR.map((c) => (
                  <td key={c.titulo} className="whitespace-nowrap p-3 text-right text-slate-600">
                    {fmt(c.valor(l))}
                  </td>
                ))}
                <td
                  className={`whitespace-nowrap p-3 text-right font-medium ${
                    l.perc_margem === null ? 'text-slate-400' : l.perc_margem < 0 ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {l.perc_margem === null ? '—' : `${fmt(l.perc_margem)}%`}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && !carregando && (
              <tr>
                <td colSpan={28} className="p-6 text-center text-slate-400">
                  Nenhuma nota encontrada para estes filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>
          {total.toLocaleString('pt-BR')} linha(s) — página {pagina} de {totalPaginas}
          {carregando && ' · carregando…'}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagina <= 1 || carregando}
            onClick={() => carregar(pagina - 1)}
            className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={pagina >= totalPaginas || carregando}
            onClick={() => carregar(pagina + 1)}
            className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
