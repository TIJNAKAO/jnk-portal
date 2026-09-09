import type { CategoriaParametro } from '@jnk-portal/shared';
import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface ParametroExposto {
  categoria: CategoriaParametro;
  chave: string;
  sensivel: boolean;
  valor: string | null;
  definido: boolean;
}

const CATEGORIAS: { chave: CategoriaParametro; label: string }[] = [
  { chave: 'EMAIL', label: 'E-mail (SMTP)' },
  { chave: 'WHATSAPP', label: 'WhatsApp' },
  { chave: 'TELEGRAM', label: 'Telegram' },
  { chave: 'TI', label: 'TI' },
  { chave: 'SYSEMP', label: 'SysEmp' },
  { chave: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { chave: 'ESTOQUE', label: 'Estoque' },
];

export function ParametrosPage() {
  const api = useApi();
  const [categoria, setCategoria] = useState<CategoriaParametro>('EMAIL');
  const [campos, setCampos] = useState<ParametroExposto[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setSalvo(false);
    setErro(null);
    // Limpa ANTES de buscar: se o fetch falhar, a tela fica vazia (com o
    // erro visível) em vez de continuar mostrando os campos da categoria
    // anterior sob o rótulo da nova aba — foi assim que a falta de
    // categoriaValida('ESTOQUE') na API virou "Estoque mostrando campos
    // de E-mail" em vez de um erro claro.
    setCampos([]);
    setValores({});
    api<ParametroExposto[]>(`/parametros/${categoria}`)
      .then((dados) => {
        setCampos(dados);
        setValores(Object.fromEntries(dados.map((c) => [c.chave, c.sensivel ? '' : (c.valor ?? '')])));
      })
      .catch((e: Error) => setErro(e.message));
  }, [api, categoria]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api(`/parametros/${categoria}`, { method: 'PUT', body: valores });
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Parâmetros do Sistema</h1>

      <div className="flex gap-2 border-b border-slate-200">
        {CATEGORIAS.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={() => setCategoria(c.chave)}
            className={`min-h-[44px] border-b-2 px-4 text-sm font-medium ${
              categoria === c.chave ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {erro && <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <form onSubmit={salvar} className="max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {campos.map((campo) => (
          <div key={campo.chave}>
            <label className="mb-1 block text-sm font-medium text-slate-700">{campo.chave}</label>
            <input
              type={campo.sensivel ? 'password' : 'text'}
              placeholder={campo.sensivel && campo.definido ? 'já configurado — deixe em branco para manter' : ''}
              value={valores[campo.chave] ?? ''}
              onChange={(e) => setValores({ ...valores, [campo.chave]: e.target.value })}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={salvando}
          className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar'}
        </button>
      </form>
    </div>
  );
}
