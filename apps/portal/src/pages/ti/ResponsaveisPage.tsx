import { useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface EquipamentoResponsavel {
  id: number;
  nome_computador: string;
  nome_filial: string | null;
  id_usuario_responsavel: number | null;
}

interface Usuario {
  id: number;
  nome: string;
}

export function ResponsaveisPage() {
  const api = useApi();
  const [equipamentos, setEquipamentos] = useState<EquipamentoResponsavel[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Record<number, string>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    const [eq, us] = await Promise.all([
      api<EquipamentoResponsavel[]>('/ti/responsaveis'),
      api<Usuario[]>('/usuarios'),
    ]);
    setEquipamentos(eq);
    setUsuarios(us);
    setAtribuicoes(Object.fromEntries(eq.map((e) => [e.id, e.id_usuario_responsavel ? String(e.id_usuario_responsavel) : ''])));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = Object.fromEntries(
      Object.entries(atribuicoes).map(([id, usuarioId]) => [id, usuarioId ? Number(usuarioId) : null]),
    );
    await api('/ti/responsaveis', { method: 'PUT', body: corpo });
    setMensagem('Responsáveis atualizados.');
  }

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(equipamentos, busca), {
    nome_computador: (e) => e.nome_computador,
    nome_filial: (e) => e.nome_filial,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Atribuir Responsáveis</h1>
        <p className="text-sm text-slate-500">Liga cada equipamento a um usuário como responsável.</p>
      </div>

      {mensagem && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</p>}

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar equipamento..." />

      <form onSubmit={salvar} className="space-y-4">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <ThOrdenavel campo="nome_computador" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Computador</ThOrdenavel>
                <ThOrdenavel campo="nome_filial" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Filial</ThOrdenavel>
                <th className="p-3">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {linhasOrdenadas.map((eq) => (
                <tr key={eq.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{eq.nome_computador}</td>
                  <td className="p-3 text-slate-500">{eq.nome_filial ?? '—'}</td>
                  <td className="p-3">
                    <select
                      value={atribuicoes[eq.id] ?? ''}
                      onChange={(e) => setAtribuicoes({ ...atribuicoes, [eq.id]: e.target.value })}
                      className="min-h-[40px] w-full max-w-xs rounded-lg border border-slate-300 px-2 text-sm"
                    >
                      <option value="">— Sem responsável —</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {equipamentos.length > 0 && (
          <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white">
            Salvar
          </button>
        )}
      </form>
    </div>
  );
}
