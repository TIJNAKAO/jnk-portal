import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface LinhaDiff {
  categoria: string;
  item: string;
  tipo: string;
  campo: string;
  de: string;
  para: string;
}

interface Resultado {
  coletaDe: { coletado_em: string };
  coletaPara: { coletado_em: string };
  linhas: LinhaDiff[];
}

const BADGE_POR_TIPO: Record<string, string> = {
  Adicionado: 'bg-emerald-100 text-emerald-700',
  Instalado: 'bg-emerald-100 text-emerald-700',
  Removido: 'bg-red-100 text-red-700',
  Desinstalado: 'bg-red-100 text-red-700',
  Alterado: 'bg-amber-100 text-amber-700',
};

function fmtData(v: string): string {
  return new Date(v).toLocaleString('pt-BR');
}

export function CompararColetasPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const api = useApi();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(resultado?.linhas ?? [], busca), {
    categoria: (l) => l.categoria,
    item: (l) => l.item,
    tipo: (l) => l.tipo,
    campo: (l) => l.campo,
  });

  useEffect(() => {
    const de = searchParams.get('de');
    const para = searchParams.get('para');
    api<Resultado>(`/ti/equipamentos/${id}/comparar?de=${de}&para=${para}`)
      .then(setResultado)
      .catch((e) => setErro(e.message));
  }, [api, id, searchParams]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Comparar Coletas</h1>
        <Link to={`/ti/equipamentos/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar pro histórico do equipamento
        </Link>
      </div>

      {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {resultado && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex gap-6 text-sm">
            <div>
              De
              <br />
              <b>{fmtData(resultado.coletaDe.coletado_em)}</b>
            </div>
            <div className="self-center">→</div>
            <div>
              Para
              <br />
              <b>{fmtData(resultado.coletaPara.coletado_em)}</b>
            </div>
          </div>

          {resultado.linhas.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
              Nenhuma alteração de hardware ou software encontrada entre essas duas coletas.
            </p>
          ) : (
            <div className="space-y-3">
            <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar na comparação..." />

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <ThOrdenavel campo="categoria" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor} className="p-2">Categoria</ThOrdenavel>
                    <ThOrdenavel campo="item" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor} className="p-2">Item</ThOrdenavel>
                    <ThOrdenavel campo="tipo" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor} className="p-2">Tipo</ThOrdenavel>
                    <ThOrdenavel campo="campo" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor} className="p-2">Campo</ThOrdenavel>
                    <th className="p-2">De</th>
                    <th className="p-2">Para</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasOrdenadas.map((l, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="p-2">{l.categoria}</td>
                      <td className="p-2">{l.item || '—'}</td>
                      <td className="p-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_POR_TIPO[l.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                          {l.tipo}
                        </span>
                      </td>
                      <td className="p-2">{l.campo}</td>
                      <td className="p-2">{l.de}</td>
                      <td className="p-2">{l.para}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
