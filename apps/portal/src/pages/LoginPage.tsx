import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { usuario, login, switchFilial } = useAuth();
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState<'credenciais' | 'filial'>('credenciais');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Após autenticar, avança direto se só houver uma filial; senão, pede a escolha (spec, seção 4.2).
  useEffect(() => {
    if (!usuario || etapa === 'filial') return;
    if (usuario.filiaisPermitidas.length > 1) {
      setEtapa('filial');
    } else {
      navigate('/modules', { replace: true });
    }
  }, [usuario, etapa, navigate]);

  async function handleCredenciais(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      await login(email, senha);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Entrar no Portal</h1>

        {usuario && etapa === 'filial' ? (
          <SelecaoFilial
            filiaisPermitidas={usuario.filiaisPermitidas}
            onSelecionar={async (filialId) => {
              await switchFilial(filialId);
              navigate('/modules', { replace: true });
            }}
          />
        ) : (
          <form onSubmit={handleCredenciais} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Senha</label>
              <input
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <button
              type="submit"
              disabled={carregando}
              className="min-h-[44px] w-full rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {carregando ? 'Entrando...' : 'Entrar'}
            </button>

            <Link to="/esqueci-senha" className="block text-center text-sm text-slate-500 hover:text-slate-700">
              Esqueci minha senha
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

function SelecaoFilial({
  filiaisPermitidas,
  onSelecionar,
}: {
  filiaisPermitidas: { id: number; nomeFormatado: string }[];
  onSelecionar: (filialId: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="mb-4 text-sm text-slate-600">Selecione a filial de acesso:</p>
      {filiaisPermitidas.map((filial) => (
        <button
          key={filial.id}
          type="button"
          onClick={() => onSelecionar(filial.id)}
          className="flex min-h-[44px] w-full items-center rounded-lg border border-slate-200 px-3 text-left text-sm hover:bg-slate-50"
        >
          {filial.nomeFormatado}
        </button>
      ))}
    </div>
  );
}
