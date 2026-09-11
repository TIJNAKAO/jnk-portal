import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface ProgramaDesatualizado {
  nome: string;
  versao_maxima: string;
  qtd_total: number;
  qtd_atualizadas: number;
}

export function ProgramasDesatualizadosPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<ProgramaDesatualizado[]>([]);

  useEffect(() => {
    api<ProgramaDesatualizado[]>('/ti/programas-desatualizados').then(setLinhas).catch(console.error);
  }, [api]);

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(linhas, busca), {
    nome: (l) => l.nome,
    versao_maxima: (l) => l.versao_maxima,
    qtd_total: (l) => l.qtd_total,
    qtd_atualizadas: (l) => l.qtd_atualizadas,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Programas Desatualizados</h1>
        <p className="text-sm text-slate-500">
          Software cuja versão instalada é menor que a maior versão vista no parque hoje. Comparação é textual, não
          entende versionamento semântico — use como indicativo de disparidade grande, não ranking exato.
        </p>
      </div>

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar programa..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Programa</ThOrdenavel>
              <ThOrdenavel campo="versao_maxima" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Versão máxima no parque</ThOrdenavel>
              <ThOrdenavel campo="qtd_atualizadas" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Atualizadas</ThOrdenavel>
              <ThOrdenavel campo="qtd_total" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Desatualizadas</ThOrdenavel>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  Nenhum programa desatualizado encontrado.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((l) => (
              <tr key={l.nome} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link to={`/ti/programas-desatualizados/maquinas?nome=${encodeURIComponent(l.nome)}`} className="font-medium text-slate-900 hover:underline">
                    {l.nome}
                  </Link>
                </td>
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
