import { Pencil, Plus, PowerOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface Filial {
  id: number;
  nome: string;
  cnpj: string;
  ativa: boolean;
}

const FILIAL_VAZIA = { nome: '', cnpj: '' };

export function FiliaisPage() {
  const api = useApi();
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [editando, setEditando] = useState<Filial | null>(null);
  const [form, setForm] = useState(FILIAL_VAZIA);
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setFiliais(await api<Filial[]>('/filiais'));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  function abrirNovo() {
    setEditando(null);
    setForm(FILIAL_VAZIA);
    setFormAberto(true);
    setErro(null);
  }

  function abrirEdicao(filial: Filial) {
    setEditando(filial);
    setForm({ nome: filial.nome, cnpj: filial.cnpj });
    setFormAberto(true);
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      if (editando) {
        await api(`/filiais/${editando.id}`, { method: 'PUT', body: form });
      } else {
        await api('/filiais', { method: 'POST', body: form });
      }
      setFormAberto(false);
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }

  async function alternarAtiva(filial: Filial) {
    await api(`/filiais/${filial.id}`, { method: 'PUT', body: { ativa: !filial.ativa } });
    await carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Filiais</h1>
        <button
          type="button"
          onClick={abrirNovo}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Nova Filial
        </button>
      </div>

      {formAberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              required
              placeholder="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              required
              placeholder="CNPJ"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white">
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setFormAberto(false)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">CNPJ</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filiais.map((filial) => (
              <tr key={filial.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{filial.nome}</td>
                <td className="p-3">{filial.cnpj}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      filial.ativa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {filial.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="flex justify-end gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(filial)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarAtiva(filial)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label={filial.ativa ? 'Desativar' : 'Reativar'}
                  >
                    <PowerOff size={16} />
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
