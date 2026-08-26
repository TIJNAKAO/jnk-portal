import { Plus, PowerOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface Departamento {
  id: number;
  nome: string;
  ativo: boolean;
}

export function DepartamentosPage() {
  const api = useApi();
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setDepartamentos(await api<Departamento[]>('/ti/departamentos'));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api('/ti/departamentos', { method: 'POST', body: { nome } });
      setNome('');
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }

  async function alternarAtivo(d: Departamento) {
    await api(`/ti/departamentos/${d.id}`, { method: 'PUT', body: { ativo: !d.ativo } });
    await carregar();
  }

  async function excluir(d: Departamento) {
    if (!confirm(`Excluir o departamento ${d.nome}? Equipamentos já classificados ficam sem departamento.`)) return;
    await api(`/ti/departamentos/${d.id}`, { method: 'DELETE' });
    await carregar();
  }

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(departamentos, busca), {
    nome: (d) => d.nome,
    ativo: (d) => (d.ativo ? 1 : 0),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Departamentos</h1>
        <p className="text-sm text-slate-500">Usado pra classificar onde cada equipamento de TI fica.</p>
      </div>

      <form onSubmit={cadastrar} className="flex max-w-md gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          required
          placeholder="Ex: Atendimento Ecommerce"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
        />
        <button type="submit" className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm text-white">
          <Plus size={16} />
          Cadastrar
        </button>
      </form>
      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar departamento..." />

      <div className="max-w-xl overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Nome</ThOrdenavel>
              <ThOrdenavel campo="ativo" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Status</ThOrdenavel>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{d.nome}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {d.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="flex justify-end gap-2 p-3">
                  <button type="button" onClick={() => alternarAtivo(d)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                    <PowerOff size={16} />
                  </button>
                  <button type="button" onClick={() => excluir(d)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
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
