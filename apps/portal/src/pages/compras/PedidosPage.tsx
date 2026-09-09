import { useCallback, useEffect, useState } from 'react';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import type { DirecaoOrdenacao } from '../../lib/tabela';
import { useApi, useApiDownload } from '../../lib/useApi';

interface LinhaPedido {
  id_pedcompra: number;
  empresa: string | null;
  fornecedor: string | null;
  data_pedido: string | null;
  data_prev_entrega: string | null;
  comprador: string | null;
  status_pedido: string | null;
  status_entrega: string | null;
  valor_bruto: number | null;
  valor_desconto: number | null;
  valor_ipi: number | null;
  valor_frete: number | null;
  total_geral: number | null;
}

interface Opcoes {
  empresas: { valor: string; rotulo: string }[];
  fornecedores: { valor: string; rotulo: string }[];
  statusPedido: { valor: string; rotulo: string }[];
  statusEntrega: { valor: string; rotulo: string }[];
}

const TAMANHO_PAGINA = 50;

function num(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function data(v: string | null): string {
  if (!v) return '—';
  // Data-sem-hora: le pelos getters UTC, sem passar pelo fuso do
  // navegador (mesma razao de formatarDataUtc em lib/datas.ts).
  const d = new Date(v);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export function PedidosPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<Opcoes>({ empresas: [], fornecedores: [], statusPedido: [], statusEntrega: [] });
  const [empresa, setEmpresa] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [statusPedido, setStatusPedido] = useState('');
  const [statusEntrega, setStatusEntrega] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [ordenarPor, setOrdenarPor] = useState('data_pedido');
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('desc');

  const [linhas, setLinhas] = useState<LinhaPedido[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Opcoes>('/compras/pedidos/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const queryFiltros = useCallback(() => {
    const params = new URLSearchParams();
    if (empresa) params.set('empresas', empresa);
    if (fornecedor) params.set('fornecedores', fornecedor);
    if (statusPedido) params.set('statusPedido', statusPedido);
    if (statusEntrega) params.set('statusEntrega', statusEntrega);
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    params.set('ordenarPor', ordenarPor);
    params.set('direcao', direcao);
    return params;
  }, [empresa, fornecedor, statusPedido, statusEntrega, dataInicio, dataFim, ordenarPor, direcao]);

  const carregar = useCallback(
    async (paginaAlvo: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const params = queryFiltros();
        params.set('pagina', String(paginaAlvo));
        params.set('tamanhoPagina', String(TAMANHO_PAGINA));

        const dados = await api<{ linhas: LinhaPedido[]; total: number }>(`/compras/pedidos?${params.toString()}`);
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
      await baixar(`/compras/pedidos/exportar?${queryFiltros().toString()}`, { nomeArquivo: 'pedidos-compra.xlsx' });
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
          <h1 className="text-lg font-semibold text-slate-900">Pedidos de Compra</h1>
          <p className="text-sm text-slate-500">Pedidos de compra sincronizados da SysEmp, um por linha.</p>
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

        <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todos os fornecedores</option>
          {opcoes.fornecedores.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={statusPedido} onChange={(e) => setStatusPedido(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Status do pedido (todos)</option>
          {opcoes.statusPedido.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={statusEntrega} onChange={(e) => setStatusEntrega(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Status da entrega (todos)</option>
          {opcoes.statusEntrega.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        />
        <span className="text-sm text-slate-500">até</span>
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        />
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Pedido</th>
              {th('empresa', 'Empresa')}
              {th('fornecedor', 'Fornecedor')}
              {th('data_pedido', 'Data do pedido')}
              {th('data_prev_entrega', 'Previsão de entrega')}
              <th className="px-3 py-2 font-medium">Comprador</th>
              {th('status_pedido', 'Status do pedido')}
              {th('status_entrega', 'Status da entrega')}
              <th className="px-3 py-2 text-right font-medium">Valor bruto</th>
              <th className="px-3 py-2 text-right font-medium">Desconto</th>
              <th className="px-3 py-2 text-right font-medium">IPI</th>
              <th className="px-3 py-2 text-right font-medium">Frete</th>
              {th('total_geral', 'Total geral', true)}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-slate-500">
                  {carregando ? 'Carregando…' : 'Nenhum pedido de compra encontrado.'}
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.id_pedcompra} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">{l.id_pedcompra}</td>
                <td className="px-3 py-2">{l.empresa ?? '—'}</td>
                <td className="px-3 py-2">{l.fornecedor ?? '—'}</td>
                <td className="px-3 py-2">{data(l.data_pedido)}</td>
                <td className="px-3 py-2">{data(l.data_prev_entrega)}</td>
                <td className="px-3 py-2">{l.comprador ?? '—'}</td>
                <td className="px-3 py-2">{l.status_pedido ?? '—'}</td>
                <td className="px-3 py-2">{l.status_entrega ?? '—'}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_bruto)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_desconto)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_ipi)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_frete)}</td>
                <td className="px-3 py-2 text-right">{num(l.total_geral)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > TAMANHO_PAGINA && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {pagina} de {totalPaginas} · {total.toLocaleString('pt-BR')} pedidos
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
