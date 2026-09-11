import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface MaquinaPrograma {
  id: number;
  nome_computador: string;
  apelido: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  versao: string;
  versao_maxima: string;
  atualizado: number;
}

export function ProgramaMaquinasPage() {
  const api = useApi();
  const [searchParams] = useSearchParams();
  const nome = searchParams.get('nome') ?? '';
  const [linhas, setLinhas] = useState<MaquinaPrograma[]>([]);

  useEffect(() => {
    if (!nome) return;
    api<MaquinaPrograma[]>(`/ti/programas-desatualizados/maquinas?nome=${encodeURIComponent(nome)}`).then(setLinhas).catch(console.error);
  }, [api, nome]);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/ti/programas-desatualizados" className="text-sm text-slate-500 hover:underline">
          ← Voltar pra Programas Desatualizados
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Máquinas com {nome}</h1>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3 font-medium">Computador</th>
              <th className="p-3 font-medium">Filial</th>
              <th className="p-3 font-medium">Responsável</th>
              <th className="p-3 font-medium">Versão instalada</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link to={`/ti/equipamentos/${l.id}`} className="font-medium text-slate-900 hover:underline">
                    {l.apelido || l.nome_computador}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{l.nome_filial ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.nome_responsavel ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.versao}</td>
                <td className="p-3">
                  {Number(l.atualizado) === 1 ? (
                    <span className="text-emerald-600">Atualizado</span>
                  ) : (
                    <span className="text-amber-600">Desatualizado (máx: {l.versao_maxima})</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
