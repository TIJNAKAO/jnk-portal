import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useOrdenacao } from '../../lib/tabela';

interface Conta {
  id: number;
  userIdMl: number;
  nickname: string;
  expiraEm: string;
  idEmpresa: number | null;
}

interface EmpresaErp {
  idEmpresa: number;
  fantasia: string;
}

export function MercadoLivrePage() {
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contas, setContas] = useState<Conta[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaErp[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setContas(await api<Conta[]>('/integracao/mercado-livre/contas'));
  }

  useEffect(() => {
    carregar().catch(console.error);
    api<EmpresaErp[]>('/integracao/mercado-livre/empresas').then(setEmpresas).catch(console.error);
  }, [api]);

  async function vincularEmpresa(id: number, valor: string) {
    try {
      await api(`/integracao/mercado-livre/contas/${id}/empresa`, {
        method: 'PUT',
        body: { idEmpresa: valor === '' ? null : Number(valor) },
      });
      await carregar();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar o vínculo.');
    }
  }

  useEffect(() => {
    const status = searchParams.get('ml');
    if (status === 'sucesso') {
      setMensagem('Conta conectada com sucesso.');
      carregar().catch(console.error);
    } else if (status === 'erro') {
      setErro(searchParams.get('mensagem') ?? 'Falha ao conectar.');
    }
    if (status) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    try {
      const { url } = await api<{ url: string }>('/integracao/mercado-livre/conectar');
      window.location.href = url;
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível iniciar a conexão.');
    }
  }

  async function testar(id: number) {
    try {
      const resultado = await api<{ ok: boolean; nickname: string }>(`/integracao/mercado-livre/contas/${id}/testar`, { method: 'POST' });
      setMensagem(`Conexão OK — ${resultado.nickname}.`);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Falha ao testar a conexão.');
    }
  }

  async function desconectar(id: number) {
    if (!confirm('Desconectar esta conta do Mercado Livre?')) return;
    await api(`/integracao/mercado-livre/contas/${id}`, { method: 'DELETE' });
    await carregar();
  }

  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(contas, {
    nickname: (c) => c.nickname,
    userIdMl: (c) => c.userIdMl,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Conexão Mercado Livre</h1>
        <p className="text-sm text-slate-500">
          Credenciais do app (App ID/Secret/Redirect URI) ficam em Configurador → Parâmetros → Mercado Livre.
        </p>
      </div>

      {mensagem && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</p>}
      {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <button type="button" onClick={conectar} className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
        Conectar nova conta
      </button>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nickname" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Conta</ThOrdenavel>
              <ThOrdenavel campo="userIdMl" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>user_id</ThOrdenavel>
              <th className="p-3">Empresa do ERP (estoque FULL)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {contas.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  Nenhuma conta conectada ainda.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{c.nickname}</td>
                <td className="p-3 text-slate-500">{c.userIdMl}</td>
                <td className="p-3">
                  <select
                    value={c.idEmpresa ?? ''}
                    onChange={(e) => vincularEmpresa(c.id, e.target.value)}
                    className="min-h-[36px] rounded-lg border border-slate-300 px-2 text-sm"
                  >
                    <option value="">— sem vínculo —</option>
                    {empresas.map((e) => (
                      <option key={e.idEmpresa} value={e.idEmpresa}>
                        {e.fantasia}
                      </option>
                    ))}
                  </select>
                  {c.idEmpresa === null && (
                    <p className="mt-1 text-xs text-amber-600">Sem empresa vinculada, esta conta não entra na sincronização do FULL.</p>
                  )}
                </td>
                <td className="flex justify-end gap-2 p-3">
                  <button type="button" onClick={() => testar(c.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                    Testar conexão
                  </button>
                  <button type="button" onClick={() => desconectar(c.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                    Desconectar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Sincronizar pedidos das contas conectadas: use o card "Pedidos Mercado Livre" no{' '}
        <Link to="/integracao/painel" className="underline">
          Painel de Integrações
        </Link>
        .
      </p>
    </div>
  );
}
