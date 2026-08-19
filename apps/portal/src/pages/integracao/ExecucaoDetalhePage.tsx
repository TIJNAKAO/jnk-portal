import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import { useApi } from '../../lib/useApi';

interface Execucao {
  id: number;
  entidade: string;
  status: 'iniciado' | 'sucesso' | 'erro' | 'cancelado';
  qtde_registros: number | null;
  mensagem: string | null;
  duracao_ms: number | null;
  executado_em: string;
}

interface Detalhe {
  id: number;
  pagina: number | null;
  qtde_registros: number | null;
  status: 'ok' | 'erro';
  mensagem: string | null;
  duracao_ms: number | null;
  criado_em: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

function fmtData(v: string): string {
  return new Date(v).toLocaleString('pt-BR');
}

export function ExecucaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const api = useApi();

  const [execucao, setExecucao] = useState<Execucao | null>(null);
  const [detalhes, setDetalhes] = useState<Detalhe[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    api<{ execucao: Execucao; detalhes: Detalhe[] }>(`/integracao/execucoes/${id}`).then((dados) => {
      setExecucao(dados.execucao);
      setDetalhes(dados.detalhes);
    });
  }, [api, id]);

  useEffect(() => {
    if (!execucao || execucao.status !== 'iniciado' || !token) return;

    const es = new EventSource(`${API_URL}/integracao/execucoes/${id}/stream?token=${token}`);
    eventSourceRef.current = es;

    es.addEventListener('detalhe', (evento) => {
      const linha = JSON.parse((evento as MessageEvent).data) as Detalhe;
      setDetalhes((prev) => (prev.some((d) => d.id === linha.id) ? prev : [...prev, linha]));
    });
    es.addEventListener('fim', (evento) => {
      const dados = JSON.parse((evento as MessageEvent).data) as Partial<Execucao>;
      setExecucao((prev) => (prev ? { ...prev, ...dados, status: (dados.status as Execucao['status']) ?? 'sucesso' } : prev));
      es.close();
    });
    es.onerror = () => es.close();

    return () => es.close();
  }, [execucao?.status, id, token]);

  async function cancelar() {
    await api(`/integracao/execucoes/${id}/cancelar`, { method: 'POST' });
  }

  if (!execucao) return null;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/integracao/execucoes" className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar pro histórico
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">
          {execucao.entidade} — {execucao.status}
          {execucao.status === 'iniciado' && <span className="ml-2 animate-pulse text-sm text-blue-600">ao vivo</span>}
        </h1>
        <p className="text-sm text-slate-500">
          Iniciado em {fmtData(execucao.executado_em)}
          {execucao.qtde_registros !== null && ` · ${execucao.qtde_registros} registro(s)`}
        </p>
        {execucao.mensagem && <p className="mt-1 text-sm text-red-600">{execucao.mensagem}</p>}
      </div>

      {execucao.status === 'iniciado' && (
        <button type="button" onClick={cancelar} className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700">
          Cancelar sincronização
        </button>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Página/Registro</th>
              <th className="p-3">Status</th>
              <th className="p-3">Registros</th>
              <th className="p-3">Duração</th>
              <th className="p-3">Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {detalhes.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3 text-slate-500">{d.pagina ?? '—'}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {d.status}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{d.qtde_registros ?? '—'}</td>
                <td className="p-3 text-slate-500">{d.duracao_ms !== null ? `${d.duracao_ms} ms` : '—'}</td>
                <td className="p-3 text-slate-500">{d.mensagem ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
