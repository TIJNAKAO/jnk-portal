import { useCallback, useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import type { DirecaoOrdenacao } from '../../lib/tabela';
import { useApi, useApiDownload } from '../../lib/useApi';

interface LinhaSaldo {
  id_empresa: number;
  empresa: string | null;
  id_produto: number;
  nome_produto: string | null;
  marca: string | null;
  saldo_disponivel: number | null;
  estoque_principal: number | null;
  estoque_reservado: number | null;
  estoque_importacao: number | null;
  estoque_avarias: number | null;
  estoque_loja: number | null;
  estoque_assistencia: number | null;
  estoque_armazem_externo: number | null;
  custo_formacao: number | null;
  custo_medio: number | null;
  synced_at: string;
}

interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

const TAMANHO_PAGINA = 50;

function num(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataHora(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR');
}

export function SaldosPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [linhas, setLinhas] = useState<LinhaSaldo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [opcoes, setOpcoes] = useState<{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[]; ultimaIntegracao: string | null }>({
    empresas: [],
    marcas: [],
    ultimaIntegracao: null,
  });

  const [empresa, setEmpresa] = useState('');
  const [marca, setMarca] = useState('');
  const [busca, setBusca] = useState('');
  const [soComSaldo, setSoComSaldo] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState('nome_produto');
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('asc');

  useEffect(() => {
    api<typeof opcoes>('/estoque/saldos/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const queryFiltros = useCallback(() => {
    const params = new URLSearchParams();
    if (empresa) params.set('empresas', empresa);
    if (marca) params.set('marcas', marca);
    if (busca) params.set('busca', busca);
    if (soComSaldo) params.set('soComSaldo', 'true');
    params.set('ordenarPor', ordenarPor);
    params.set('direcao', direcao);
    return params;
  }, [empresa, marca, busca, soComSaldo, ordenarPor, direcao]);

  const carregar = useCallback(
    async (paginaAlvo: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const params = queryFiltros();
        params.set('pagina', String(paginaAlvo));
        params.set('tamanhoPagina', String(TAMANHO_PAGINA));

        const dados = await api<{ linhas: LinhaSaldo[]; total: number }>(`/estoque/saldos?${params.toString()}`);
        setLinhas(dados.linhas);
        setTotal(dados.total);
        setPagina(paginaAlvo);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, queryFiltros],
  );

  useEffect(() => {
    carregar(1).catch(console.error);
  }, [carregar]);

  async function exportar() {
    setExportando(true);
    try {
      await baixar(`/estoque/saldos/exportar?${queryFiltros().toString()}`, { nomeArquivo: 'estoque-saldos.xlsx' });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  function ordenar(campo: string) {
    if (campo === ordenarPor) {
      setDirecao(direcao === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenarPor(campo);
      setDirecao('asc');
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const th = (campo: string, rotulo: string, alinharDireita = false) => (
    <ThOrdenavel campo={campo} campoOrdenado={ordenarPor} direcao={direcao} onOrdenar={ordenar} alinharDireita={alinharDireita}>
      {rotulo}
    </ThOrdenavel>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Saldo de Estoque</h1>
          <p className="text-sm text-slate-500">
            Estoque físico sincronizado da SysEmp, por produto e empresa.
            {opcoes.ultimaIntegracao && ` Última integração: ${dataHora(opcoes.ultimaIntegracao)}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando || total === 0}
          className="min-h-[40px] shrink-0 rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as empresas</option>
          {opcoes.empresas.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={marca} onChange={(e) => setMarca(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as marcas</option>
          {opcoes.marcas.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <CampoBusca valor={busca} onChange={setBusca} placeholder="Código, descrição ou código de barras" />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} />
          Só com saldo
        </label>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              {th('empresa', 'Empresa')}
              {th('id_produto', 'Código')}
              {th('nome_produto', 'Descrição do produto')}
              {th('marca', 'Marca')}
              {th('saldo_disponivel', 'Disponível', true)}
              {th('estoque_principal', 'Principal', true)}
              {th('estoque_reservado', 'Reservada', true)}
              {th('estoque_importacao', 'Importação', true)}
              {th('estoque_avarias', 'Avarias', true)}
              {th('estoque_loja', 'Loja', true)}
              {th('estoque_assistencia', 'Assistência', true)}
              {th('estoque_armazem_externo', 'Armazém externo', true)}
              {th('custo_formacao', 'Custo formação', true)}
              {th('custo_medio', 'Custo médio', true)}
              {th('synced_at', 'Data integração')}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.id_produto}-${l.id_empresa}`} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{l.empresa?.trim() || l.id_empresa}</td>
                <td className="p-3">{l.id_produto}</td>
                <td className="p-3">{l.nome_produto ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.marca ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{num(l.saldo_disponivel)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_principal)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_reservado)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_importacao)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_avarias)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_loja)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_assistencia)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.estoque_armazem_externo)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.custo_formacao)}</td>
                <td className="p-3 text-right tabular-nums">{num(l.custo_medio)}</td>
                <td className="p-3 text-slate-500">{dataHora(l.synced_at)}</td>
              </tr>
            ))}
            {linhas.length === 0 && !carregando && (
              <tr>
                <td colSpan={15} className="p-6 text-center text-slate-400">
                  Nenhum saldo encontrado para estes filtros.
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
