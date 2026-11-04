import { useCallback, useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { useApi, useApiDownload } from '../../lib/useApi';

type Situacao = 'OK' | 'DIVERGENTE' | 'SO_ML' | 'SO_SYSEMP';

interface LinhaFull {
  idEmpresa: number;
  empresa: string;
  codigo: string;
  descricao: string;
  marca: string | null;
  qtdeMl: number;
  totalMl: number;
  naoDisponivelMl: number;
  qtdeSysemp: number;
  diferenca: number;
  situacao: Situacao;
}

interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

interface Filtros {
  empresas: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
  datas: string[];
}

const TAMANHO_PAGINA = 50;

const ROTULO_SITUACAO: Record<Situacao, { texto: string; classe: string }> = {
  OK: { texto: 'OK', classe: 'bg-emerald-50 text-emerald-700' },
  DIVERGENTE: { texto: 'Divergente', classe: 'bg-red-50 text-red-700' },
  SO_ML: { texto: 'Só no ML', classe: 'bg-amber-50 text-amber-700' },
  SO_SYSEMP: { texto: 'Só no SysEmp', classe: 'bg-amber-50 text-amber-700' },
};

function num(v: number): string {
  return v.toLocaleString('pt-BR');
}

function dataHora(v: string | null): string {
  return v ? new Date(v).toLocaleString('pt-BR') : '—';
}

/** `YYYY-MM-DD` -> `dd/mm/aaaa` sem passar por Date (evita deslocar o dia pelo fuso). */
function dataBr(v: string): string {
  const [ano, mes, dia] = v.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function FullMlPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [filtros, setFiltros] = useState<Filtros>({ empresas: [], marcas: [], datas: [] });
  const [linhas, setLinhas] = useState<LinhaFull[]>([]);
  const [dataRef, setDataRef] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [data, setData] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [marca, setMarca] = useState('');
  const [busca, setBusca] = useState('');
  const [soDivergencias, setSoDivergencias] = useState(false);

  useEffect(() => {
    api<Filtros>('/estoque/full-ml/filtros')
      .then(setFiltros)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const queryFiltros = useCallback(() => {
    const params = new URLSearchParams();
    if (data) params.set('data', data);
    if (empresa) params.set('empresas', empresa);
    if (marca) params.set('marcas', marca);
    if (busca) params.set('busca', busca);
    if (soDivergencias) params.set('soDivergencias', 'true');
    return params;
  }, [data, empresa, marca, busca, soDivergencias]);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    api<{ linhas: LinhaFull[]; dataRef: string | null; atualizadoEm: string | null }>(`/estoque/full-ml?${queryFiltros().toString()}`)
      .then((d) => {
        setLinhas(d.linhas);
        setDataRef(d.dataRef);
        setAtualizadoEm(d.atualizadoEm);
        setPagina(1);
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [api, queryFiltros]);

  async function exportar() {
    setExportando(true);
    try {
      await baixar(`/estoque/full-ml/exportar?${queryFiltros().toString()}`, { nomeArquivo: `estoque-full-ml-${dataRef ?? 'sem-data'}.xlsx` });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / TAMANHO_PAGINA));
  const visiveis = linhas.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA);
  const divergentes = linhas.filter((l) => l.situacao !== 'OK').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Estoque FULL ML x SysEmp</h1>
          <p className="text-sm text-slate-500">
            Saldo disponível do FULL do Mercado Livre contra o saldo disponível da SysEmp (SKU = código auxiliar).
            {dataRef && ` Foto de ${dataBr(dataRef)}`}
            {atualizadoEm && `, atualizada em ${dataHora(atualizadoEm)}`}
            {dataRef && '.'}
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando || linhas.length === 0}
          className="min-h-[40px] shrink-0 rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={data} onChange={(e) => setData(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Última foto</option>
          {filtros.datas.map((d) => (
            <option key={d} value={d}>
              {dataBr(d)}
            </option>
          ))}
        </select>

        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as empresas</option>
          {filtros.empresas.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={marca} onChange={(e) => setMarca(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as marcas</option>
          {filtros.marcas.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <CampoBusca valor={busca} onChange={setBusca} placeholder="SKU ou descrição" />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={soDivergencias} onChange={(e) => setSoDivergencias(e.target.checked)} />
          Só divergências
        </label>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Empresa</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">Marca</th>
              <th className="p-3 text-right">ML disponível</th>
              <th className="p-3 text-right">ML total</th>
              <th className="p-3 text-right">ML não disp.</th>
              <th className="p-3 text-right">SysEmp</th>
              <th className="p-3 text-right">Diferença</th>
              <th className="p-3">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={`${l.idEmpresa}-${l.codigo}-${l.descricao}-${l.qtdeMl}`} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{l.empresa}</td>
                <td className="p-3">{l.codigo || <span className="text-slate-400">(sem SKU)</span>}</td>
                <td className="p-3">{l.descricao}</td>
                <td className="p-3 text-slate-500">{l.marca ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{num(l.qtdeMl)}</td>
                <td className="p-3 text-right tabular-nums text-slate-500">{num(l.totalMl)}</td>
                <td className="p-3 text-right tabular-nums text-slate-500">{num(l.naoDisponivelMl)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.qtdeSysemp)}</td>
                <td className={`p-3 text-right tabular-nums ${l.diferenca !== 0 ? 'font-medium text-red-700' : ''}`}>{num(l.diferenca)}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ROTULO_SITUACAO[l.situacao].classe}`}>{ROTULO_SITUACAO[l.situacao].texto}</span>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && !carregando && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-400">
                  {dataRef
                    ? 'Nenhum registro para estes filtros.'
                    : 'Sem foto do FULL ainda. Vincule as contas em Integração → Mercado Livre e rode a sincronização "Estoque FULL Mercado Livre" no Painel.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>
          {linhas.length.toLocaleString('pt-BR')} linha(s), {divergentes.toLocaleString('pt-BR')} com divergência — página {pagina} de {totalPaginas}
          {carregando && ' · carregando…'}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina(pagina - 1)}
            className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina(pagina + 1)}
            className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
