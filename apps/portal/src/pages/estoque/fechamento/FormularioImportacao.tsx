import { useState } from 'react';
import { useApi } from '../../../lib/useApi';

/**
 * Formulário das três telas de upload do Fechamento de Custo. As telas
 * diferem só no título, no texto de ajuda, nas colunas esperadas e no
 * endpoint — a mecânica de enviar, mostrar o resumo e listar as linhas
 * ignoradas é a mesma.
 */

interface LinhaIgnorada {
  linha: number;
  motivo: string;
}

interface ResultadoImportacao {
  totalLinhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: LinhaIgnorada[];
  produtosNaoEncontrados: number;
  empresasNaoEncontradas: number;
  custoTotal: number | null;
  periodo: string | null;
}

export interface PropsFormularioImportacao {
  titulo: string;
  descricao: string;
  /** Caminho a partir de /estoque/fechamento/importar. */
  endpoint: string;
  /** Colunas que a planilha precisa ter, exibidas como ajuda. */
  colunas: string[];
}

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function periodoLegivel(periodo: string | null): string {
  if (!periodo) return '—';
  const [ano, mes] = periodo.split('-');
  return `${mes}/${ano}`;
}

export function FormularioImportacao({ titulo, descricao, endpoint, colunas }: PropsFormularioImportacao) {
  const api = useApi();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function enviar() {
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    setResultado(null);

    try {
      const corpo = new FormData();
      corpo.append('arquivo', arquivo);
      setResultado(
        await api<ResultadoImportacao>(`/estoque/fechamento/importar/${endpoint}`, {
          method: 'POST',
          body: corpo,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const cartao = (rotulo: string, valor: string, alerta = false) => (
    <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        <p className="text-sm text-slate-500">{descricao}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setResultado(null);
              setErro(null);
            }}
            className="text-sm"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!arquivo || enviando}
            className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
          >
            {enviando ? 'Importando…' : 'Importar planilha'}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Colunas esperadas (a ordem não importa): {colunas.join(', ')}.
        </p>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {resultado && (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Importação concluída — período {periodoLegivel(resultado.periodo)}.
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {cartao('Linhas na planilha', inteiro(resultado.totalLinhas))}
            {cartao('Inseridas', inteiro(resultado.inseridas))}
            {cartao('Atualizadas', inteiro(resultado.atualizadas))}
            {cartao('Ignoradas', inteiro(resultado.ignoradas.length), resultado.ignoradas.length > 0)}
            {cartao(
              'Produtos não encontrados',
              inteiro(resultado.produtosNaoEncontrados),
              resultado.produtosNaoEncontrados > 0,
            )}
            {cartao(
              'Empresas não encontradas',
              inteiro(resultado.empresasNaoEncontradas),
              resultado.empresasNaoEncontradas > 0,
            )}
          </div>

          {resultado.custoTotal !== null && (
            <div className="grid grid-cols-1 gap-3">
              {cartao('Custo total da planilha', `R$ ${moeda(resultado.custoTotal)}`)}
            </div>
          )}

          {(resultado.produtosNaoEncontrados > 0 || resultado.empresasNaoEncontradas > 0) && (
            <p className="text-xs text-slate-500">
              Linha que não bate com o cadastro é importada assim mesmo, só marcada — a informação continua
              válida ainda que o produto não esteja sincronizado.
            </p>
          )}

          {resultado.ignoradas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Linha</th>
                    <th className="px-3 py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.ignoradas.map((i) => (
                    <tr key={i.linha} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{i.linha}</td>
                      <td className="px-3 py-2 text-slate-600">{i.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
