import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';

export function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const resposta = await apiRequest<{ mensagem: string }>('/auth/esqueci-senha', {
        method: 'POST',
        body: { email },
      });
      setMensagem(resposta.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Esqueci minha senha</h1>

        {mensagem ? (
          <p className="text-sm text-slate-600">{mensagem}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <button
              type="submit"
              disabled={carregando}
              className="min-h-[44px] w-full rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {carregando ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        <Link to="/login" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-700">
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
