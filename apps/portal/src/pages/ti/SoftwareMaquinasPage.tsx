import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface Maquina {
  id: number;
  nome_computador: string;
  apelido: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  versao: string | null;
  coletado_em: string;
}

function fmtData(v: string): string {
  return new Date(v).toLocaleString('pt-BR');
}

export function SoftwareMaquinasPage() {
  const [searchParams] = useSearchParams();
  const nome = searchParams.get('nome') ?? '';
  const api = useApi();
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);

  useEffect(() => {
    api<Maquina[]>(`/ti/softwares-aprovados/maquinas?nome=${encodeURIComponent(nome)}`).then(setMaquinas).catch(console.error);
  }, [api, nome]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Máquinas com "{nome}"</h1>
        <Link to="/ti/softwares-aprovados" className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar pra Softwares Aprovados
        </Link>
        <p className="text-sm text-slate-500">Considera só a última coleta de cada equipamento.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Filial</th>
              <th className="p-3">Computador</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">Versão instalada</th>
              <th className="p-3">Última coleta</th>
            </tr>
          </thead>
          <tbody>
            {maquinas.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  Nenhuma máquina com este software na última coleta.
                </td>
              </tr>
            )}
            {maquinas.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{m.nome_filial ?? '—'}</td>
                <td className="p-3">
                  <Link to={`/ti/equipamentos/${m.id}`} className="hover:underline">
                    {m.apelido || m.nome_computador}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{m.nome_responsavel ?? '—'}</td>
                <td className="p-3 text-slate-500">{m.versao ?? '—'}</td>
                <td className="p-3 text-slate-500">{fmtData(m.coletado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">{maquinas.length} máquina(s).</p>
    </div>
  );
}
