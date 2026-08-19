import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface Aviso {
  id: number;
  filial_id: number | null;
  titulo: string;
  mensagem: string;
  data_expiracao: string;
}

interface Filial {
  id: number;
  nome: string;
}

const FORM_VAZIO = { filialId: '', titulo: '', mensagem: '', dataExpiracao: '' };

export function AvisosPage() {
  const api = useApi();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const [a, f] = await Promise.all([api<Aviso[]>('/avisos'), api<Filial[]>('/filiais')]);
    setAvisos(a);
    setFiliais(f);
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api('/avisos', {
        method: 'POST',
        body: {
          filialId: form.filialId ? Number(form.filialId) : null,
          titulo: form.titulo,
          mensagem: form.mensagem,
          dataExpiracao: form.dataExpiracao,
        },
      });
      setFormAberto(false);
      setForm(FORM_VAZIO);
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }

  async function excluir(id: number) {
    await api(`/avisos/${id}`, { method: 'DELETE' });
    await carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Avisos</h1>
        <button
          type="button"
          onClick={() => setFormAberto((v) => !v)}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Novo Aviso
        </button>
      </div>

      {formAberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            required
            placeholder="Título"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
          <textarea
            required
            placeholder="Mensagem"
            value={form.mensagem}
            onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
            className="min-h-[88px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={form.filialId}
              onChange={(e) => setForm({ ...form, filialId: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Global (todas as filiais)</option>
              {filiais.map((filial) => (
                <option key={filial.id} value={filial.id}>
                  {filial.nome}
                </option>
              ))}
            </select>
            <input
              required
              type="datetime-local"
              value={form.dataExpiracao}
              onChange={(e) => setForm({ ...form, dataExpiracao: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white">
              Publicar
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

      <div className="space-y-3">
        {avisos.map((aviso) => (
          <div key={aviso.id} className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="font-medium text-slate-900">{aviso.titulo}</p>
              <p className="mt-1 text-sm text-slate-600">{aviso.mensagem}</p>
              <p className="mt-2 text-xs text-slate-400">
                {aviso.filial_id ? filiais.find((f) => f.id === aviso.filial_id)?.nome : 'Global'} · expira em{' '}
                {new Date(aviso.data_expiracao).toLocaleString('pt-BR')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => excluir(aviso.id)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Excluir"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
