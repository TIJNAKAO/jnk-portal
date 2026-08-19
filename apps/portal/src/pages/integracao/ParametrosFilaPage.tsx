import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface ConfigFila {
  chave: string;
  nome: string;
  tipo_tabela: number;
  endpoint_fila: string;
  endpoint_detalhe: string | null;
  campo_id_detalhe: string | null;
  endpoint_confirmacao: string;
  limite_pagina: number;
  ativo: number;
  observacoes: string | null;
}

export function ParametrosFilaPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<ConfigFila[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    setLinhas(await api<ConfigFila[]>('/integracao/parametros-fila'));
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  function atualizarLinha(chave: string, campo: keyof ConfigFila, valor: string | number | boolean) {
    setLinhas((prev) => prev.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  async function salvar(linha: ConfigFila) {
    await api(`/integracao/parametros-fila/${linha.chave}`, {
      method: 'PUT',
      body: {
        nome: linha.nome,
        endpointFila: linha.endpoint_fila,
        endpointDetalhe: linha.endpoint_detalhe,
        campoIdDetalhe: linha.campo_id_detalhe,
        endpointConfirmacao: linha.endpoint_confirmacao,
        limitePagina: linha.limite_pagina,
        ativo: Boolean(linha.ativo),
        observacoes: linha.observacoes,
      },
    });
    setMensagem(`Configuração de "${linha.nome}" salva.`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Parâmetros de Fila SysEmp</h1>
        <p className="text-sm text-slate-500">
          Só edição de linhas que já têm suporte no código — não cria uma integração nova do nada, só ajusta as que já existem.
        </p>
      </div>

      {mensagem && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</p>}

      <div className="space-y-4">
        {linhas.map((linha) => (
          <div key={linha.chave} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-slate-900">
                {linha.nome} <span className="text-xs text-slate-400">(tipo_tabela={linha.tipo_tabela})</span>
              </h2>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={Boolean(linha.ativo)} onChange={(e) => atualizarLinha(linha.chave, 'ativo', e.target.checked)} />
                Ativo
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Endpoint da fila" value={linha.endpoint_fila} onChange={(v) => atualizarLinha(linha.chave, 'endpoint_fila', v)} />
              <Campo label="Endpoint de confirmação" value={linha.endpoint_confirmacao} onChange={(v) => atualizarLinha(linha.chave, 'endpoint_confirmacao', v)} />
              <Campo label="Endpoint de detalhe" value={linha.endpoint_detalhe ?? ''} onChange={(v) => atualizarLinha(linha.chave, 'endpoint_detalhe', v)} />
              <Campo label="Campo do id no detalhe" value={linha.campo_id_detalhe ?? ''} onChange={(v) => atualizarLinha(linha.chave, 'campo_id_detalhe', v)} />
              <Campo
                label="Registros por página"
                value={String(linha.limite_pagina)}
                type="number"
                onChange={(v) => atualizarLinha(linha.chave, 'limite_pagina', Number(v))}
              />
            </div>

            <button type="button" onClick={() => salvar(linha)} className="mt-4 min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white">
              Salvar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-sm"
      />
    </div>
  );
}
