import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface EquipamentoAuditoria {
  id: number;
  nome_computador: string;
  apelido: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  nome_departamento: string | null;
  ultima_coleta_em: string | null;
  dias_sem_coletar: number | null;
}

const DIAS_ALERTA = 2;
const DIAS_CRITICO = 5;

function fmtData(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR');
}

function corBadge(dias: number | null): string {
  if (dias === null || dias > DIAS_CRITICO) return 'bg-red-100 text-red-700';
  if (dias > DIAS_ALERTA) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export function AuditoriaColetaPage() {
  const api = useApi();
  const [equipamentos, setEquipamentos] = useState<EquipamentoAuditoria[]>([]);

  useEffect(() => {
    api<EquipamentoAuditoria[]>('/ti/auditoria-coleta').then(setEquipamentos).catch(console.error);
  }, [api]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Auditoria de Coleta</h1>
        <p className="text-sm text-slate-500">Equipamentos ativos, ordenados pelo que está há mais tempo sem enviar um inventário novo.</p>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Até {DIAS_ALERTA} dia(s) — normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {DIAS_ALERTA + 1} a {DIAS_CRITICO} dias — atenção
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Mais de {DIAS_CRITICO} dias (ou nunca) — crítico
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Filial</th>
              <th className="p-3">Computador</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">Departamento</th>
              <th className="p-3">Última Coleta</th>
              <th className="p-3">Dias sem Coletar</th>
            </tr>
          </thead>
          <tbody>
            {equipamentos.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-400">
                  Nenhum equipamento ativo cadastrado.
                </td>
              </tr>
            )}
            {equipamentos.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{e.nome_filial ?? '—'}</td>
                <td className="p-3">
                  <Link to={`/ti/equipamentos/${e.id}`} className="hover:underline">
                    {e.apelido || e.nome_computador}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{e.nome_responsavel ?? '—'}</td>
                <td className="p-3 text-slate-500">{e.nome_departamento ?? '—'}</td>
                <td className="p-3 text-slate-500">{fmtData(e.ultima_coleta_em)}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corBadge(e.dias_sem_coletar)}`}>
                    {e.dias_sem_coletar === null ? 'Nunca coletou' : `${e.dias_sem_coletar} dia(s)`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
