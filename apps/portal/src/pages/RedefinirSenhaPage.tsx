import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';

export function RedefinirSenhaPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (novaSenha !== confirmacao) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (novaSenha.length < 8) {
      setErro('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setCarregando(true);
    try {
      await apiRequest('/auth/redefinir-senha', { method: 'POST', body: { token, novaSenha } });
      setSucesso(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível redefinir a senha.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Redefinir senha</h1>

        {sucesso ? (
          <p className="text-sm text-slate-600">
            Senha redefinida com sucesso.{' '}
            <Link to="/login" className="font-medium text-slate-900 hover:underline">
              Entrar
            </Link>
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nova senha</label>
              <input
                type="password"
                required
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Confirmar nova senha</label>
              <input
                type="password"
                required
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <button
              type="submit"
              disabled={carregando}
              className="min-h-[44px] w-full rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {carregando ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
