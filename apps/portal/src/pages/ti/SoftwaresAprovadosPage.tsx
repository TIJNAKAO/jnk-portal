import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface SoftwareLinha {
  nome: string;
  versao_recente: string | null;
  qtd_maquinas: number;
  aprovado: number | null;
  versao_aprovada: string | null;
}

interface LinhaEditavel {
  nome: string;
  versaoRecente: string | null;
  qtdMaquinas: number;
  aprovado: boolean;
  versaoAprovada: string;
}

export function SoftwaresAprovadosPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);
  const [status, setStatus] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    const query = status ? `?status=${status}` : '';
    const dados = await api<SoftwareLinha[]>(`/ti/softwares-aprovados${query}`);
    setLinhas(
      dados.map((l) => ({
        nome: l.nome,
        versaoRecente: l.versao_recente,
        qtdMaquinas: l.qtd_maquinas,
        aprovado: Number(l.aprovado ?? 0) === 1,
        versaoAprovada: l.versao_aprovada ?? '',
      })),
    );
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api, status]);

  function atualizarLinha(nome: string, campo: 'aprovado' | 'versaoAprovada', valor: boolean | string) {
    setLinhas((prev) => prev.map((l) => (l.nome === nome ? { ...l, [campo]: valor } : l)));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    await api('/ti/softwares-aprovados', {
      method: 'PUT',
      body: { aprovacoes: linhas.map((l) => ({ nome: l.nome, aprovado: l.aprovado, versaoAprovada: l.versaoAprovada })) },
    });
    setMensagem('Aprovações salvas.');
  }

  async function excluir(nome: string) {
    if (!confirm(`Remover a aprovação de ${nome}?`)) return;
    await api('/ti/softwares-aprovados', { method: 'DELETE', body: { nome } });
    await carregar();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Softwares Aprovados</h1>
        <p className="text-sm text-slate-500">Marque o que é aprovado pela empresa. Versão em branco = qualquer versão serve.</p>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
      >
        <option value="">Todos</option>
        <option value="aprovados">Aprovados</option>
        <option value="nao_aprovados">Não aprovados</option>
      </select>

      {mensagem && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</p>}

      <form onSubmit={salvar} className="space-y-4">
        <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">Aprovado</th>
                <th className="p-3">Software</th>
                <th className="p-3">Última versão vista</th>
                <th className="p-3">Versão aprovada</th>
                <th className="p-3">Qtd. Máquinas</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400">
                    Nenhum software instalado em nenhuma máquina no momento.
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={l.nome} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">
                    <input type="checkbox" checked={l.aprovado} onChange={(e) => atualizarLinha(l.nome, 'aprovado', e.target.checked)} />
                  </td>
                  <td className="p-3">
                    <Link to={`/ti/softwares-aprovados/maquinas?nome=${encodeURIComponent(l.nome)}`} className="hover:underline">
                      {l.nome}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-500">{l.versaoRecente ?? '—'}</td>
                  <td className="p-3">
                    <input
                      placeholder="qualquer"
                      value={l.versaoAprovada}
                      onChange={(e) => atualizarLinha(l.nome, 'versaoAprovada', e.target.value)}
                      className="min-h-[36px] w-32 rounded-lg border border-slate-300 px-2 text-sm"
                    />
                  </td>
                  <td className="p-3">{l.qtdMaquinas}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => excluir(l.nome)} className="text-xs text-red-600 hover:underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {linhas.length > 0 && (
          <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white">
            Salvar aprovações
          </button>
        )}
      </form>
    </div>
  );
}
