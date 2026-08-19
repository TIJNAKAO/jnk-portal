import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface TelaPermissao {
  telaId: number;
  nomeTela: string;
  rotaTela: string;
  nomeModulo: string;
  podeVisualizar: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeDeletar: boolean;
}

const ACOES = [
  { chave: 'podeVisualizar', label: 'Ver' },
  { chave: 'podeCriar', label: 'Criar' },
  { chave: 'podeEditar', label: 'Editar' },
  { chave: 'podeDeletar', label: 'Excluir' },
] as const;

export function PerfilPermissoesPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const [telas, setTelas] = useState<TelaPermissao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    api<TelaPermissao[]>(`/perfis/${id}/telas`).then(setTelas).catch(console.error);
  }, [api, id]);

  function alternar(telaId: number, acao: (typeof ACOES)[number]['chave']) {
    setSalvo(false);
    setTelas((prev) => prev.map((t) => (t.telaId === telaId ? { ...t, [acao]: !t[acao] } : t)));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await api(`/perfis/${id}/telas`, { method: 'PUT', body: { telas } });
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  }

  const porModulo = telas.reduce<Record<string, TelaPermissao[]>>((acc, tela) => {
    (acc[tela.nomeModulo] ??= []).push(tela);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/config/perfis" className="text-sm text-slate-500 hover:text-slate-700">
            ← Perfis de Acesso
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">Matriz de Permissões</h1>
        </div>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar'}
        </button>
      </div>

      {Object.entries(porModulo).map(([nomeModulo, telasDoModulo]) => (
        <div key={nomeModulo} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 p-3 text-sm font-medium text-slate-700">{nomeModulo}</h2>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-3">Tela</th>
                {ACOES.map((acao) => (
                  <th key={acao.chave} className="p-3 text-center">
                    {acao.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {telasDoModulo.map((tela) => (
                <tr key={tela.telaId} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{tela.nomeTela}</td>
                  {ACOES.map((acao) => (
                    <td key={acao.chave} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={tela[acao.chave]}
                        onChange={() => alternar(tela.telaId, acao.chave)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
