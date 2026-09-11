import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface DriverDesatualizado {
  hardware_id: string;
  nome: string | null;
  fabricante: string | null;
  versao_maxima: string;
  qtd_total: number;
  qtd_atualizadas: number;
}

export function DriversDesatualizadosPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<DriverDesatualizado[]>([]);

  useEffect(() => {
    api<DriverDesatualizado[]>('/ti/drivers-desatualizados').then(setLinhas).catch(console.error);
  }, [api]);

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(linhas, busca), {
    nome: (l) => l.nome,
    fabricante: (l) => l.fabricante,
    versao_maxima: (l) => l.versao_maxima,
    qtd_atualizadas: (l) => Number(l.qtd_atualizadas),
    qtd_total: (l) => Number(l.qtd_total),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Drivers Desatualizados</h1>
        <p className="text-sm text-slate-500">
          Driver cuja versão instalada é menor que a maior versão vista no parque, para o mesmo componente de
          hardware. Some da lista até o equipamento receber o agente 1.4.0 (rollout gradual — ver spec).
        </p>
      </div>

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar driver..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Dispositivo</ThOrdenavel>
              <ThOrdenavel campo="fabricante" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Fabricante</ThOrdenavel>
              <ThOrdenavel campo="versao_maxima" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Versão máxima no parque</ThOrdenavel>
              <ThOrdenavel campo="qtd_atualizadas" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Atualizadas</ThOrdenavel>
              <ThOrdenavel campo="qtd_total" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Desatualizadas</ThOrdenavel>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  Nenhum driver desatualizado encontrado.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((l) => (
              <tr key={l.hardware_id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link
                    to={`/ti/drivers-desatualizados/maquinas?hardwareId=${encodeURIComponent(l.hardware_id)}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {l.nome ?? '—'}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{l.fabricante ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.versao_maxima}</td>
                <td className="p-3 text-slate-500">{l.qtd_atualizadas}</td>
                <td className="p-3 text-slate-500">{l.qtd_total - l.qtd_atualizadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
