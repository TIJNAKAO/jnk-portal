import { RefreshCw, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useApiDownload } from '../../lib/useApi';

interface CardScriptProps {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  nomeBotao: string;
  onGerar: () => Promise<void>;
}

function CardScript({ icone, titulo, descricao, nomeBotao, onGerar }: CardScriptProps) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleClick() {
    setErro(null);
    setGerando(true);
    try {
      await onGerar();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível gerar o script.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">{icone}</div>
      <h2 className="mt-3 font-medium text-slate-900">{titulo}</h2>
      <p className="mt-1 flex-1 text-sm text-slate-500">{descricao}</p>
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      <button
        type="button"
        onClick={handleClick}
        disabled={gerando}
        className="mt-4 min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {gerando ? 'Gerando...' : nomeBotao}
      </button>
    </div>
  );
}

export function GerarScriptsPage() {
  const apiDownload = useApiDownload();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Gerar Scripts</h1>
        <p className="text-sm text-slate-500">
          Scripts pra automatizar tarefas em equipamentos Windows, gerados como <strong>.bat</strong> executável: o
          usuário dá duplo clique e o próprio arquivo pede elevação. Nada roda automaticamente a partir do clique aqui.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardScript
          icone={<RefreshCw size={20} />}
          titulo="Atualizar Programas e Drivers"
          descricao="Roda winget upgrade --all (silencioso) e verifica/instala drivers pendentes via Windows Update."
          nomeBotao="Gerar Executável (.bat)"
          onGerar={() =>
            apiDownload('/ti/gerar-scripts/atualizar-programas', { nomeArquivo: 'atualizar_programas.bat' })
          }
        />

        <CardScript
          icone={<Wrench size={20} />}
          titulo="Configurar Agente de Inventário"
          descricao="Baixa o AgenteInventarioPC.exe, instala em C:\Program Files\RRCMTOOLS e registra a tarefa agendada que roda a cada reinicialização (como SYSTEM)."
          nomeBotao="Gerar Executável (.bat)"
          onGerar={() =>
            apiDownload('/ti/gerar-scripts/configurar-agente', { nomeArquivo: 'configurar_agente.bat' })
          }
        />
      </div>

      <p className="text-xs text-slate-400">
        A URL de download do agente, a URL da API e o token ficam em{' '}
        <Link to="/config/parametros" className="underline">
          Configurador → Parâmetros → TI
        </Link>
        .
      </p>
    </div>
  );
}
