import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { useApi, useApiDownload } from '../../lib/useApi';

interface LinhaCurvaAbc {
  ordem: number;
  dc_filial: string;
  cd_produto: string | null;
  dc_produto: string;
  marca: string | null;
  origem_custo: 'MEDIO' | 'FORMACAO' | 'SEM_CUSTO';
  vt_custo_geral: number;
  per_valor: number;
  classe_valor: 'A70' | 'B20' | 'C10';
  qtde: number;
  vt_custo: number;
}

interface ResumoCusto {
  comCustoFormacao: number;
  semCusto: number;
  unidadesSemCusto: number;
}

const ORIGEM_CUSTO: Record<LinhaCurvaAbc['origem_custo'], { texto: string; classe: string }> = {
  MEDIO: { texto: 'Médio', classe: 'text-slate-500' },
  FORMACAO: { texto: 'Formação', classe: 'text-amber-700' },
  SEM_CUSTO: { texto: 'Sem custo', classe: 'font-medium text-red-700' },
};

interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

const TAMANHO_PAGINA = 50;

const CLASSE_COR: Record<string, string> = {
  A70: 'bg-emerald-100 text-emerald-700',
  B20: 'bg-amber-100 text-amber-700',
  C10: 'bg-slate-100 text-slate-700',
};

function fmtNumero(v: number): string {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function selecionadas(e: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(e.target.selectedOptions).map((o) => o.value);
}

export function CurvaAbcPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[] }>({ empresas: [], marcas: [] });
  const [empresasSel, setEmpresasSel] = useState<string[]>([]);
  const [marcasSel, setMarcasSel] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<LinhaCurvaAbc[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoCusto>({ comCustoFormacao: 0, semCusto: 0, unidadesSemCusto: 0 });
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    api<{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[] }>('/estoque/curva-abc/filtros').then(setOpcoes);
  }, [api]);

  function queryFiltros() {
    const params = new URLSearchParams();
    if (empresasSel.length) params.set('empresas', empresasSel.join(','));
    if (marcasSel.length) params.set('marcas', marcasSel.join(','));
    return params;
  }

  async function carregar(paginaAtual: number) {
    setCarregando(true);
    try {
      const params = queryFiltros();
      params.set('pagina', String(paginaAtual));
      params.set('tamanhoPagina', String(TAMANHO_PAGINA));
      const dados = await api<{ linhas: LinhaCurvaAbc[]; total: number; resumo: ResumoCusto }>(
        `/estoque/curva-abc?${params.toString()}`,
      );
      setLinhas(dados.linhas);
      setTotal(dados.total);
      setResumo(dados.resumo);
      setPagina(paginaAtual);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(1).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, empresasSel, marcasSel]);

  async function exportar() {
    setExportando(true);
    try {
      await baixar(`/estoque/curva-abc/exportar?${queryFiltros().toString()}`, { nomeArquivo: 'curva-abc-estoque.xlsx' });
    } finally {
      setExportando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Curva ABC de Estoque</h1>
          <p className="text-sm text-slate-500">
            Classificação 70/20/10 por valor de estoque (saldo × custo médio; custo de formação quando o médio é
            zero), sumarizado por produto. Kits cadastrados como kit ficam fora: o saldo deles não é físico.
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando || total === 0}
          className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
          <select
            multiple
            value={empresasSel}
            onChange={(e) => setEmpresasSel(selecionadas(e))}
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
            value={marcasSel}
            onChange={(e) => setMarcasSel(selecionadas(e))}
            className="min-h-[84px] min-w-[220px] rounded-lg border border-slate-300 p-2 text-sm"
          >
            {opcoes.marcas.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(resumo.semCusto > 0 || resumo.comCustoFormacao > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {resumo.semCusto > 0 && (
            <p>
              <strong>{resumo.semCusto}</strong> produto(s) sem custo cadastrado ({fmtNumero(resumo.unidadesSemCusto)}{' '}
              unidades) entram com valor zero e ficam na classe C. O custo precisa ser corrigido no SysEmp para a
              classificação ficar completa.
            </p>
          )}
          {resumo.comCustoFormacao > 0 && (
            <p>
              <strong>{resumo.comCustoFormacao}</strong> produto(s) estão valorizados pelo custo de formação, porque o
              custo médio está zerado (coluna Custo = Formação).
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">ORDEM</th>
              <th className="p-3">DC FILIAL</th>
              <th className="p-3">CD PRODUTO</th>
              <th className="p-3">DC PRODUTO</th>
              <th className="p-3">MARCA</th>
              <th className="p-3">CUSTO</th>
              <th className="p-3 text-right">VT CUSTO GERAL</th>
              <th className="p-3 text-right">PER VALOR</th>
              <th className="p-3">CLASSE VALOR</th>
              <th className="p-3 text-right">QTDE</th>
              <th className="p-3 text-right">VT CUSTO</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ordem} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{l.ordem}</td>
                <td className="p-3">{l.dc_filial}</td>
                <td className="p-3 text-slate-500">{l.cd_produto ?? '—'}</td>
                <td className="p-3">{l.dc_produto}</td>
                <td className="p-3 text-slate-500">{l.marca ?? '—'}</td>
                <td className={`p-3 ${ORIGEM_CUSTO[l.origem_custo].classe}`}>{ORIGEM_CUSTO[l.origem_custo].texto}</td>
                <td className="p-3 text-right text-slate-500">{fmtNumero(l.vt_custo_geral)}</td>
                <td className="p-3 text-right text-slate-500">{fmtNumero(l.per_valor)}%</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSE_COR[l.classe_valor]}`}>
                    {l.classe_valor}
                  </span>
                </td>
                <td className="p-3 text-right text-slate-500">{fmtNumero(l.qtde)}</td>
                <td className="p-3 text-right font-medium text-slate-900">{fmtNumero(l.vt_custo)}</td>
              </tr>
            ))}
            {linhas.length === 0 && !carregando && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-slate-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {total} produto(s) — página {pagina} de {totalPaginas}
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
