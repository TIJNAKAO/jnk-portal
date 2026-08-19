import type { ModuloAcesso } from '@jnk-portal/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { iconePorNome } from '../lib/icons';
import { useApi } from '../lib/useApi';

interface Aviso {
  id: number;
  titulo: string;
  mensagem: string;
  data_expiracao: string;
}

function saudacao(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function IconePorNome({ nome, ...props }: { nome: string; size?: number; className?: string }) {
  const Icone = iconePorNome(nome);
  return <Icone {...props} />;
}

function ModuloCard({ modulo }: { modulo: ModuloAcesso }) {
  const navigate = useNavigate();
  const primeiraTela = modulo.telas.find((t) => t.podeVisualizar);

  return (
    <button
      type="button"
      onClick={() => primeiraTela && navigate(primeiraTela.rotaTela)}
      disabled={!primeiraTela}
      className="flex min-h-[44px] flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md disabled:opacity-50"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
        <IconePorNome nome={modulo.iconeModulo} size={22} />
      </div>
      <div>
        <p className="font-medium text-slate-900">{modulo.nomeModulo}</p>
        <p className="mt-1 text-sm text-slate-500">{modulo.descricaoModulo}</p>
      </div>
    </button>
  );
}

function QuadroDeAvisos() {
  const api = useApi();
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    api<Aviso[]>('/avisos/ativos').then(setAvisos).catch(console.error);
  }, [api]);

  if (avisos.length === 0) return null;

  return (
    <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-5 md:w-80">
      <h2 className="mb-3 font-medium text-slate-900">Quadro de Avisos</h2>
      <ul className="space-y-3">
        {avisos.map((aviso) => (
          <li key={aviso.id} className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">{aviso.titulo}</p>
            <p className="mt-1 text-sm text-slate-600">{aviso.mensagem}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function ModulesPage() {
  const { usuario } = useAuth();
  if (!usuario) return null;

  const primeiroNome = usuario.nome.split(' ')[0];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-lg font-semibold">
          Olá, {primeiroNome}! Bem-vindo ao hub operacional.
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          {saudacao()}! Seu trabalho constrói a nossa eficiência e a nossa segurança. Escolha um dos aplicativos
          abaixo para iniciar suas atividades com foco e excelência!
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {usuario.modulosPermitidos.map((modulo) => (
            <ModuloCard key={modulo.moduloId} modulo={modulo} />
          ))}
        </div>

        <QuadroDeAvisos />
      </div>
    </div>
  );
}
