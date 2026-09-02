import { useCallback, useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import type { DirecaoOrdenacao } from '../../lib/tabela';
import { useApi } from '../../lib/useApi';

interface LinhaPreco {
  id_empresa: number;
  empresa: string | null;
  id_produto: number;
  nome_produto: string | null;
  marca: string | null;
  nome_tabela: string | null;
  nome_condicao: string | null;
  preco_tabela: number | null;
  preco_promocao: number | null;
  data_inicio_promocao: string | null;
  data_termino_promocao: string | null;
  synced_at: string;
}

interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

const TAMANHO_PAGINA = 50;

function moeda(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function data(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function dataHora(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR');
}

export function PrecosPage() {
  const api = useApi();

  const [linhas, setLinhas] = useState<LinhaPreco[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [opcoes, setOpcoes] = useState<{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[]; ultimaIntegracao: string | null }>({
    empresas: [],
    marcas: [],
    ultimaIntegracao: null,
  });

  const [empresa, setEmpresa] = useState('');
  const [marca, setMarca] = useState('');
  const [busca, setBusca] = useState('');
  const [soPromocao, setSoPromocao] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState('nome_produto');
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('asc');

  useEffect(() => {
    api<typeof opcoes>('/faturamento/precos/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const carregar = useCallback(
    async (paginaAlvo: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const params = new URLSearchParams();
        if (empresa) params.set('empresas', empresa);
        if (marca) params.set('marcas', marca);
        if (busca) params.set('busca', busca);
        if (soPromocao) params.set('soPromocao', 'true');
        params.set('ordenarPor', ordenarPor);
        params.set('direcao', direcao);
        params.set('pagina', String(paginaAlvo));
        params.set('tamanhoPagina', String(TAMANHO_PAGINA));

        const dados = await api<{ linhas: LinhaPreco[]; total: number }>(`/faturamento/precos?${params.toString()}`);
        setLinhas(dados.linhas);
        setTotal(dados.total);
        setPagina(paginaAlvo);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, empresa, marca, busca, soPromocao, ordenarPor, direcao],
  );

  useEffect(() => {
    carregar(1).catch(console.error);
  }, [carregar]);

  function ordenar(campo: string) {
    if (campo === ordenarPor) {
      setDirecao(direcao === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenarPor(campo);
      setDirecao('asc');
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const th = (campo: string, rotulo: string) => (
    <ThOrdenavel campo={campo} campoOrdenado={ordenarPor} direcao={direcao} onOrdenar={ordenar}>
      {rotulo}
    </ThOrdenavel>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Preços</h1>
        <p className="text-sm text-slate-500">
          Tabela de preços sincronizada da SysEmp, por empresa, tabela e condição de pagamento.
          {opcoes.ultimaIntegracao && ` Última integração: ${dataHora(opcoes.ultimaIntegracao)}.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
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
          <input type="checkbox" checked={soPromocao} onChange={(e) => setSoPromocao(e.target.checked)} />
          Só promoção vigente
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
              {th('nome_tabela', 'Tabela')}
              {th('nome_condicao', 'Condição')}
              {th('preco_tabela', 'Preço tabela')}
              {th('preco_promocao', 'Preço promocional')}
              {th('data_inicio_promocao', 'Início promoção')}
              {th('data_termino_promocao', 'Término promoção')}
              {th('synced_at', 'Data integração')}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.id_produto}-${l.id_empresa}-${l.nome_tabela}-${l.nome_condicao}`} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{l.empresa?.trim() || l.id_empresa}</td>
                <td className="p-3">{l.id_produto}</td>
                <td className="p-3">{l.nome_produto ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.marca ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.nome_tabela ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.nome_condicao ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{moeda(l.preco_tabela)}</td>
                <td className="p-3 text-right tabular-nums">{moeda(l.preco_promocao)}</td>
                <td className="p-3 text-slate-500">{data(l.data_inicio_promocao)}</td>
                <td className="p-3 text-slate-500">{data(l.data_termino_promocao)}</td>
                <td className="p-3 text-slate-500">{dataHora(l.synced_at)}</td>
              </tr>
            ))}
            {linhas.length === 0 && !carregando && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-slate-400">
                  Nenhum preço encontrado para estes filtros.
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
