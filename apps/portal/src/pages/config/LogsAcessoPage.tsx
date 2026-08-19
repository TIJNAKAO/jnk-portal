import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface LogAcesso {
  id: number;
  tipo_evento: 'LOGIN' | 'SWITCH_FILIAL' | 'ACESSO_TELA';
  ip_origem: string | null;
  criado_em: string;
  nomeUsuario: string;
  nomeFilial: string | null;
  nomeTela: string | null;
}

interface Usuario {
  id: number;
  nome: string;
}

const LABEL_EVENTO: Record<LogAcesso['tipo_evento'], string> = {
  LOGIN: 'Login',
  SWITCH_FILIAL: 'Troca de filial',
  ACESSO_TELA: 'Acesso a tela',
};

export function LogsAcessoPage() {
  const api = useApi();
  const [logs, setLogs] = useState<LogAcesso[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioId, setUsuarioId] = useState('');

  useEffect(() => {
    api<Usuario[]>('/usuarios').then(setUsuarios).catch(console.error);
  }, [api]);

  useEffect(() => {
    const query = usuarioId ? `?usuarioId=${usuarioId}` : '';
    api<LogAcesso[]>(`/logs-acesso${query}`).then(setLogs).catch(console.error);
  }, [api, usuarioId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Log de Acessos</h1>
        <select
          value={usuarioId}
          onChange={(e) => setUsuarioId(e.target.value)}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os usuários</option>
          {usuarios.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {usuario.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Usuário</th>
              <th className="p-3">Evento</th>
              <th className="p-3">Filial</th>
              <th className="p-3">Tela</th>
              <th className="p-3">IP</th>
              <th className="p-3">Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{log.nomeUsuario}</td>
                <td className="p-3">{LABEL_EVENTO[log.tipo_evento]}</td>
                <td className="p-3 text-slate-500">{log.nomeFilial ?? '—'}</td>
                <td className="p-3 text-slate-500">{log.nomeTela ?? '—'}</td>
                <td className="p-3 text-slate-500">{log.ip_origem ?? '—'}</td>
                <td className="p-3 text-slate-500">{new Date(log.criado_em).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
