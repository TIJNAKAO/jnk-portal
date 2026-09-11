import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CardGrafico } from '../../components/CardGrafico';
import { EIXO, GRADE, SERIE_1, SERIE_2, TEXTO_EIXO } from '../../lib/paletaViz';
import { useApi } from '../../lib/useApi';

interface Contagem {
  rotulo: string;
  quantidade: number;
}

interface MaquinaCritica {
  id: number;
  apelido: string | null;
  nome_computador: string;
  total_bytes: number;
  livre_bytes: number;
}

interface DashboardResposta {
  total_equipamentos: number;
  equipamentos_com_coleta: number;
  por_sistema_operacional: Contagem[];
  por_processador: Contagem[];
  por_faixa_ram: Contagem[];
  disco: { total_bytes: number; livre_bytes: number; maquinas_com_dado: number };
  maquinas_criticas: MaquinaCritica[];
}

interface OpcaoSimples {
  id: number;
  nome: string;
}

const CORES_PIZZA = [SERIE_1, SERIE_2, '#8b5cf6', '#22c55e', '#f59e0b', '#64748b'];

function fmtBytes(v: number): string {
  if (!v || v <= 0) return '—';
  return `${(v / 1073741824).toFixed(1)} GB`;
}

function fmtPercentual(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function AnalisesDashboardPage() {
  const api = useApi();
  const [dados, setDados] = useState<DashboardResposta | null>(null);
  const [filiais, setFiliais] = useState<OpcaoSimples[]>([]);
  const [departamentos, setDepartamentos] = useState<OpcaoSimples[]>([]);
  const [filialId, setFilialId] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    Promise.all([api<OpcaoSimples[]>('/filiais'), api<OpcaoSimples[]>('/ti/departamentos')])
      .then(([f, d]) => {
        setFiliais(f);
        setDepartamentos(d);
      })
      .catch(console.error);
  }, [api]);

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (filialId) params.set('filialId', filialId);
    if (departamentoId) params.set('departamentoId', departamentoId);

    api<DashboardResposta>(`/ti/dashboard?${params.toString()}`)
      .then(setDados)
      .catch(console.error)
      .finally(() => setCarregando(false));
  }, [api, filialId, departamentoId]);

  const percentualLivre = dados && dados.disco.total_bytes > 0 ? (dados.disco.livre_bytes / dados.disco.total_bytes) * 100 : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Dashboard TI</h1>
        <p className="text-sm text-slate-500">
          Visão agregada do parque de equipamentos — sistema operacional, processador, memória e disco.
          {dados && ` ${dados.equipamentos_com_coleta} de ${dados.total_equipamentos} equipamento(s) com coleta.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filialId} onChange={(e) => setFilialId(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as filiais</option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <select
          value={departamentoId}
          onChange={(e) => setDepartamentoId(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
      </div>

      {dados && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CardGrafico
            titulo="Por Sistema Operacional"
            dados={dados.por_sistema_operacional}
            carregando={carregando}
            colunas={[
              { titulo: 'Sistema', valor: (l) => l.rotulo },
              { titulo: 'Máquinas', valor: (l) => l.quantidade, alinharDireita: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={dados.por_sistema_operacional} dataKey="quantidade" nameKey="rotulo" outerRadius={90} label={(l) => l.name}>
                  {dados.por_sistema_operacional.map((entrada, i) => (
                    <Cell key={entrada.rotulo} fill={CORES_PIZZA[i % CORES_PIZZA.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardGrafico>

          <CardGrafico
            titulo="Por Processador"
            descricao="Top 8, restante agrupado em Outros"
            dados={dados.por_processador}
            carregando={carregando}
            colunas={[
              { titulo: 'Processador', valor: (l) => l.rotulo },
              { titulo: 'Máquinas', valor: (l) => l.quantidade, alinharDireita: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dados.por_processador} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={GRADE} horizontal={false} />
                <XAxis type="number" stroke={EIXO} tick={{ fill: TEXTO_EIXO, fontSize: 12 }} />
                <YAxis type="category" dataKey="rotulo" stroke={EIXO} width={160} tick={{ fill: TEXTO_EIXO, fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill={SERIE_1} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardGrafico>

          <CardGrafico
            titulo="Por Faixa de Memória RAM"
            dados={dados.por_faixa_ram}
            carregando={carregando}
            colunas={[
              { titulo: 'Faixa', valor: (l) => l.rotulo },
              { titulo: 'Máquinas', valor: (l) => l.quantidade, alinharDireita: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dados.por_faixa_ram}>
                <CartesianGrid stroke={GRADE} vertical={false} />
                <XAxis dataKey="rotulo" stroke={EIXO} tick={{ fill: TEXTO_EIXO, fontSize: 12 }} />
                <YAxis stroke={EIXO} tick={{ fill: TEXTO_EIXO, fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill={SERIE_2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardGrafico>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 font-medium text-slate-900">Espaço em Disco (parque)</h2>
            <p className="mb-4 text-xs text-slate-500">
              {dados.disco.maquinas_com_dado} máquina(s) com dado de volume — o restante ainda não recebeu o agente 1.4.0.
            </p>
            {dados.disco.maquinas_com_dado === 0 ? (
              <p className="text-sm text-slate-400">Sem dado — aguardando atualização do agente.</p>
            ) : (
              <>
                <p className="mb-4 text-2xl font-semibold text-slate-900">
                  {fmtBytes(dados.disco.livre_bytes)} livres de {fmtBytes(dados.disco.total_bytes)}
                  {percentualLivre !== null && <span className="ml-2 text-sm font-normal text-slate-500">({fmtPercentual(percentualLivre)})</span>}
                </p>
                <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Máquinas com menos espaço livre</h3>
                <ul className="space-y-1 text-sm">
                  {dados.maquinas_criticas.map((m) => {
                    const percentual = m.total_bytes > 0 ? (m.livre_bytes / m.total_bytes) * 100 : 0;
                    return (
                      <li key={m.id} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
                        <span className="text-slate-700">{m.apelido || m.nome_computador}</span>
                        <span className="text-slate-500">
                          {fmtBytes(m.livre_bytes)} livres ({fmtPercentual(percentual)})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
