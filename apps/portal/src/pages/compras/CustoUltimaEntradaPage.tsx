import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface LinhaCusto {
  id: number;
  periodo: string;
  origem: string;
  empresa: string;
  cd_produto: string;
  descricao_produto: string | null;
  marca: string | null;
  dt_movto: string | null;
  documento: string | null;
  dc_clifor: string | null;
  qtde: string | null;
  vu_custo: string | null;
  vt_custo: string | null;
  produto_encontrado: number;
}

interface Resposta {
  linhas: LinhaCusto[];
  total: number;
  pagina: number;
  tamanho: number;
}

const TAMANHO = 50;

function fmtData(valor: string | null): string {
  if (!valor) return '';
  // O valor chega como ISO; formatar sem passar por fuso do navegador.
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function fmtNumero(valor: string | null, casas: number): string {
  if (valor === null) return '';
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function CustoUltimaEntradaPage() {
  const api = useApi();
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [produto, setProduto] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<string[]>('/compras/custo-ultima-entrada/periodos')
      .then((lista) => {
        setPeriodos(lista);
        if (lista.length > 0 && !periodo) setPeriodo(lista[0] ?? '');
      })
      .catch((e) => setErro(String(e)));
  }, []);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams({ pagina: String(pagina), tamanho: String(TAMANHO) });
    if (periodo) params.set('periodo', periodo);
    if (empresa) params.set('empresa', empresa);
    if (produto) params.set('produto', produto);

    api<Resposta>(`/compras/custo-ultima-entrada?${params.toString()}`)
      .then(setDados)
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, [periodo, empresa, produto, pagina]);

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / TAMANHO)) : 1;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Custo da Última Entrada</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="border rounded px-2 py-1"
          value={periodo}
          onChange={(e) => { setPeriodo(e.target.value); setPagina(1); }}
        >
          <option value="">Todos os períodos</option>
          {periodos.map((p) => (
            <option key={p} value={p}>{p.slice(0, 7).split('-').reverse().join('/')}</option>
          ))}
        </select>

        <select
          className="border rounded px-2 py-1"
          value={empresa}
          onChange={(e) => { setEmpresa(e.target.value); setPagina(1); }}
        >
          <option value="">Todas as empresas</option>
          <option value="JNK">JNK</option>
          <option value="NK2">NK2</option>
        </select>

        <input
          className="border rounded px-2 py-1 flex-1 min-w-[200px]"
          placeholder="Código ou descrição do produto"
          value={produto}
          onChange={(e) => { setProduto(e.target.value); setPagina(1); }}
        />
      </div>

      {erro && <div className="text-red-600 mb-3">{erro}</div>}
      {carregando && <div className="text-gray-500 mb-3">Carregando...</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Empresa</th>
              <th className="p-2">Produto</th>
              <th className="p-2">Descrição</th>
              <th className="p-2">Marca</th>
              <th className="p-2">Entrada</th>
              <th className="p-2">Documento</th>
              <th className="p-2">Fornecedor</th>
              <th className="p-2 text-right">Qtde</th>
              <th className="p-2 text-right">Custo unit.</th>
              <th className="p-2 text-right">Custo total</th>
              <th className="p-2">Origem</th>
            </tr>
          </thead>
          <tbody>
            {dados?.linhas.map((l) => (
              <tr key={l.id} className="border-b hover:bg-gray-50">
                <td className="p-2">{l.empresa}</td>
                <td className="p-2">
                  {l.cd_produto}
                  {!l.produto_encontrado && (
                    <span className="ml-1 text-amber-600" title="Produto não encontrado no cadastro atual">*</span>
                  )}
                </td>
                <td className="p-2">{l.descricao_produto}</td>
                <td className="p-2">{l.marca}</td>
                <td className="p-2">{fmtData(l.dt_movto)}</td>
                <td className="p-2">{l.documento}</td>
                <td className="p-2">{l.dc_clifor}</td>
                <td className="p-2 text-right">{fmtNumero(l.qtde, 2)}</td>
                <td className="p-2 text-right">{fmtNumero(l.vu_custo, 4)}</td>
                <td className="p-2 text-right">{fmtNumero(l.vt_custo, 2)}</td>
                <td className="p-2">{l.origem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dados && (
        <div className="flex items-center gap-3 mt-4">
          <button
            className="border rounded px-3 py-1 disabled:opacity-40"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="text-sm">
            Página {pagina} de {totalPaginas} — {dados.total.toLocaleString('pt-BR')} linhas
          </span>
          <button
            className="border rounded px-3 py-1 disabled:opacity-40"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        * produto sem correspondência no cadastro atual do SysEmp — a linha histórica foi
        importada do mesmo jeito.
      </p>
    </div>
  );
}
