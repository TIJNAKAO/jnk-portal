import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface Equipamento {
  id: number;
  nome_computador: string;
  apelido: string | null;
  patrimonio: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  nome_departamento: string | null;
  so_caption: string | null;
  processador_nome: string | null;
  ram_total_bytes: number | null;
  ultima_coleta_em: string | null;
  total_coletas: number;
}

function fmtBytes(v: number | null): string {
  if (!v || v <= 0) return '—';
  return `${(v / 1073741824).toFixed(1)} GB`;
}

function fmtData(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR');
}

export function EquipamentosPage() {
  const api = useApi();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);

  useEffect(() => {
    api<Equipamento[]>('/ti/equipamentos').then(setEquipamentos).catch(console.error);
  }, [api]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Equipamentos de TI</h1>
        <p className="text-sm text-slate-500">
          Inventário de hardware/software coletado pelo agente Windows. Clique num equipamento pra ver o histórico
          de coletas e comparar mudanças.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Filial</th>
              <th className="p-3">Computador</th>
              <th className="p-3">Apelido</th>
              <th className="p-3">Departamento</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">Sistema Operacional</th>
              <th className="p-3">Processador</th>
              <th className="p-3">RAM</th>
              <th className="p-3">Última Coleta</th>
            </tr>
          </thead>
          <tbody>
            {equipamentos.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-slate-400">
                  Nenhum equipamento coletado ainda.
                </td>
              </tr>
            )}
            {equipamentos.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{e.nome_filial ?? '—'}</td>
                <td className="p-3">
                  <Link to={`/ti/equipamentos/${e.id}`} className="font-medium text-slate-900 hover:underline">
                    {e.apelido || e.nome_computador}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{e.apelido ?? '—'}</td>
                <td className="p-3 text-slate-500">{e.nome_departamento ?? '—'}</td>
                <td className="p-3 text-slate-500">{e.nome_responsavel ?? '—'}</td>
                <td className="p-3 text-slate-500">{e.so_caption ?? '—'}</td>
                <td className="p-3 text-slate-500">{e.processador_nome ?? '—'}</td>
                <td className="p-3 text-slate-500">{fmtBytes(e.ram_total_bytes)}</td>
                <td className="p-3 text-slate-500">{fmtData(e.ultima_coleta_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
