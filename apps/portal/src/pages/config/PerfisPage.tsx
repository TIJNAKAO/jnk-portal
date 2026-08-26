import { Pencil, Plus, PowerOff, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface Perfil {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

const FORM_VAZIO = { nome: '', descricao: '' };

export function PerfisPage() {
  const api = useApi();
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setPerfis(await api<Perfil[]>('/perfis'));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setFormAberto(true);
    setErro(null);
  }

  function abrirEdicao(perfil: Perfil) {
    setEditando(perfil);
    setForm({ nome: perfil.nome, descricao: perfil.descricao ?? '' });
    setFormAberto(true);
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      if (editando) {
        await api(`/perfis/${editando.id}`, { method: 'PUT', body: form });
      } else {
        await api('/perfis', { method: 'POST', body: form });
      }
      setFormAberto(false);
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }

  async function alternarAtivo(perfil: Perfil) {
    await api(`/perfis/${perfil.id}`, { method: 'PUT', body: { ativo: !perfil.ativo } });
    await carregar();
  }

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(perfis, busca), {
    nome: (p) => p.nome,
    descricao: (p) => p.descricao,
    ativo: (p) => (p.ativo ? 1 : 0),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Perfis de Acesso</h1>
        <button
          type="button"
          onClick={abrirNovo}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Novo Perfil
        </button>
      </div>

      {formAberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            required
            placeholder="Nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
          <input
            placeholder="Descrição (opcional)"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
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

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar perfil..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Nome</ThOrdenavel>
              <ThOrdenavel campo="descricao" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Descrição</ThOrdenavel>
              <ThOrdenavel campo="ativo" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Status</ThOrdenavel>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((perfil) => (
              <tr key={perfil.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{perfil.nome}</td>
                <td className="p-3 text-slate-500">{perfil.descricao}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      perfil.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {perfil.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="flex justify-end gap-2 p-3">
                  <Link
                    to={`/config/perfis/${perfil.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Permissões"
                  >
                    <Shield size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => abrirEdicao(perfil)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarAtivo(perfil)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label={perfil.ativo ? 'Desativar' : 'Reativar'}
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
