import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

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

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(equipamentos, busca), {
    nome_filial: (e) => e.nome_filial,
    nome_computador: (e) => e.apelido || e.nome_computador,
    apelido: (e) => e.apelido,
    nome_departamento: (e) => e.nome_departamento,
    nome_responsavel: (e) => e.nome_responsavel,
    so_caption: (e) => e.so_caption,
    processador_nome: (e) => e.processador_nome,
    ram_total_bytes: (e) => e.ram_total_bytes,
    ultima_coleta_em: (e) => e.ultima_coleta_em,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Equipamentos de TI</h1>
        <p className="text-sm text-slate-500">
          Inventário de hardware/software coletado pelo agente Windows. Clique num equipamento pra ver o histórico
          de coletas e comparar mudanças.
        </p>
      </div>

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar equipamento..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome_filial" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Filial</ThOrdenavel>
              <ThOrdenavel campo="nome_computador" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Computador</ThOrdenavel>
              <ThOrdenavel campo="apelido" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Apelido</ThOrdenavel>
              <ThOrdenavel campo="nome_departamento" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Departamento</ThOrdenavel>
              <ThOrdenavel campo="nome_responsavel" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Responsável</ThOrdenavel>
              <ThOrdenavel campo="so_caption" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Sistema Operacional</ThOrdenavel>
              <ThOrdenavel campo="processador_nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Processador</ThOrdenavel>
              <ThOrdenavel campo="ram_total_bytes" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>RAM</ThOrdenavel>
              <ThOrdenavel campo="ultima_coleta_em" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Última Coleta</ThOrdenavel>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-slate-400">
                  Nenhum equipamento coletado ainda.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((e) => (
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
