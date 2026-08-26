import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface Programa {
  id: number;
  nome: string;
  winget_id: string;
  ativo: boolean;
  configurar_acesso_remoto: boolean;
}

const FORM_VAZIO = { nome: '', wingetId: '', configurarAcessoRemoto: false };

export function CatalogoProgramasPage() {
  const api = useApi();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setProgramas(await api<Programa[]>('/ti/catalogo-programas'));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api('/ti/catalogo-programas', { method: 'POST', body: form });
      setForm(FORM_VAZIO);
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }

  async function alternarAcessoRemoto(p: Programa) {
    await api(`/ti/catalogo-programas/${p.id}`, { method: 'PUT', body: { configurarAcessoRemoto: !p.configurar_acesso_remoto } });
    await carregar();
  }

  async function alternarAtivo(p: Programa) {
    await api(`/ti/catalogo-programas/${p.id}`, { method: 'PUT', body: { ativo: !p.ativo } });
    await carregar();
  }

  async function excluir(p: Programa) {
    if (!confirm(`Excluir ${p.nome} do catálogo?`)) return;
    await api(`/ti/catalogo-programas/${p.id}`, { method: 'DELETE' });
    await carregar();
  }

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(programas, busca), {
    nome: (p) => p.nome,
    winget_id: (p) => p.winget_id,
    ativo: (p) => (p.ativo ? 1 : 0),
    configurar_acesso_remoto: (p) => (p.configurar_acesso_remoto ? 1 : 0),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Catálogo de Programas</h1>
        <p className="text-sm text-slate-500">
          Lista de programas disponíveis pra instalação via winget. Descubra o ID certo rodando{' '}
          <code className="rounded bg-slate-100 px-1">winget search "nome do programa"</code> numa máquina Windows.
        </p>
      </div>

      <form onSubmit={cadastrar} className="max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <input
          required
          placeholder="Nome (exibido na tela)"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
        />
        <input
          required
          placeholder="ID do winget (ex: Google.Chrome)"
          value={form.wingetId}
          onChange={(e) => setForm({ ...form, wingetId: e.target.value })}
          className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.configurarAcessoRemoto}
            onChange={(e) => setForm({ ...form, configurarAcessoRemoto: e.target.checked })}
          />
          Configurar acesso remoto não supervisionado após instalar (AnyDesk)
        </label>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white">
          Cadastrar
        </button>
      </form>

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar programa..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Nome</ThOrdenavel>
              <ThOrdenavel campo="winget_id" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>ID do winget</ThOrdenavel>
              <ThOrdenavel campo="ativo" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Status</ThOrdenavel>
              <ThOrdenavel campo="configurar_acesso_remoto" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Acesso Remoto</ThOrdenavel>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{p.nome}</td>
                <td className="p-3">
                  <code className="rounded bg-slate-100 px-1 text-xs">{p.winget_id}</code>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => alternarAtivo(p)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="p-3">
                  <button type="button" onClick={() => alternarAcessoRemoto(p)} className="text-xs text-slate-600 hover:underline">
                    {p.configurar_acesso_remoto ? 'Sim (AnyDesk)' : 'Não'}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button type="button" onClick={() => excluir(p)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
