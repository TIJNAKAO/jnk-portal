import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface Equipamento {
  nome_computador: string;
  apelido: string | null;
  patrimonio: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  email_responsavel: string | null;
  nome_departamento: string | null;
}

interface Coleta {
  id: number;
  coletado_em: string;
}

interface ColetaCompleta {
  sistemaOperacional: Record<string, unknown> | null;
  processador: Record<string, unknown> | null;
  placaMae: Record<string, unknown> | null;
  memoriaRam: Record<string, unknown>[];
  disco: Record<string, unknown>[];
  software: Record<string, unknown>[];
}

interface TermoResposta {
  equipamento: Equipamento;
  coletas: Coleta[];
  coletaSelecionada: Coleta;
  dados: ColetaCompleta;
  fotoId: number | null;
  textoPolitica: string;
}

function fmtData(v: string): string {
  return new Date(v).toLocaleString('pt-BR');
}
function fmtBytes(v: unknown): string {
  const n = Number(v ?? 0);
  return n > 0 ? `${(n / 1073741824).toFixed(1)} GB` : '—';
}

export function TermoEquipamentoPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useApi();

  const [dados, setDados] = useState<TermoResposta | null>(null);
  const [textoPolitica, setTextoPolitica] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    const coleta = searchParams.get('coleta');
    api<TermoResposta>(`/ti/equipamentos/${id}/termo${coleta ? `?coleta=${coleta}` : ''}`).then((d) => {
      setDados(d);
      setTextoPolitica(d.textoPolitica);
    });
  }, [api, id, searchParams]);

  async function salvarPolitica(e: React.FormEvent) {
    e.preventDefault();
    await api('/parametros/TI', { method: 'PUT', body: { TERMO_POLITICA_TEXTO: textoPolitica } });
    setMensagem('Texto da política salvo.');
  }

  if (!dados) return null;

  const ramTotal = dados.dados.memoriaRam.reduce((soma, r) => soma + Number(r['capacidade_bytes'] ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-lg font-semibold text-slate-900">Termo de Responsabilidade</h1>
        <Link to={`/ti/equipamentos/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar pro histórico do equipamento
        </Link>
      </div>

      {mensagem && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 print:hidden">{mensagem}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <select
          value={dados.coletaSelecionada.id}
          onChange={(e) => setSearchParams({ coleta: e.target.value })}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          {dados.coletas.map((c) => (
            <option key={c.id} value={c.id}>
              {fmtData(c.coletado_em)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.print()} className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white">
          Imprimir / Salvar PDF
        </button>
      </div>

      <form onSubmit={salvarPolitica} className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Texto da política de uso (aparece no termo abaixo)</h3>
        <textarea
          value={textoPolitica}
          onChange={(e) => setTextoPolitica(e.target.value)}
          className="min-h-[140px] w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        <button type="submit" className="mt-3 min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700">
          Salvar texto da política
        </button>
      </form>

      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <h2 className="text-center text-xl font-semibold">Termo de Responsabilidade de Equipamento de TI</h2>
        <p className="mt-1 text-center text-xs text-slate-500">
          {dados.equipamento.nome_filial} — Gerado em {new Date().toLocaleString('pt-BR')}
        </p>

        {dados.fotoId && (
          <img
            src={`${import.meta.env.VITE_API_URL}/ti/equipamentos/${id}/fotos/${dados.fotoId}`}
            alt="Foto do equipamento"
            className="mx-auto my-5 max-w-xs rounded-lg border border-slate-200"
          />
        )}

        <h3 className="mt-6 font-medium">Responsável</h3>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Info rotulo="Nome" valor={dados.equipamento.nome_responsavel ?? '— não atribuído —'} />
          <Info rotulo="E-mail" valor={dados.equipamento.email_responsavel ?? '—'} />
          <Info rotulo="Departamento" valor={dados.equipamento.nome_departamento ?? '—'} />
        </div>

        <h3 className="mt-6 font-medium">Equipamento</h3>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Info rotulo="Apelido" valor={dados.equipamento.apelido ?? '—'} />
          <Info rotulo="Nome do computador" valor={dados.equipamento.nome_computador} />
          <Info rotulo="Patrimônio" valor={dados.equipamento.patrimonio ?? '—'} />
          <Info rotulo="Data da coleta" valor={fmtData(dados.coletaSelecionada.coletado_em)} />
        </div>

        <h3 className="mt-6 font-medium">Hardware</h3>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Info rotulo="Sistema Operacional" valor={String(dados.dados.sistemaOperacional?.['caption'] ?? '—')} />
          <Info rotulo="Processador" valor={String(dados.dados.processador?.['nome'] ?? '—')} />
          <Info rotulo="Placa-mãe" valor={String(dados.dados.placaMae?.['nome'] ?? '—')} />
          <Info rotulo="Memória RAM" valor={fmtBytes(ramTotal)} />
          {dados.dados.disco.map((d, i) => (
            <Info key={i} rotulo={`Disco ${i + 1}`} valor={`${d['tipo_midia'] ?? d['interface'] ?? ''} — ${fmtBytes(d['tamanho_bytes'])}`} />
          ))}
        </div>

        <h3 className="mt-6 font-medium">Software instalado ({dados.dados.software.length})</h3>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr>
              <th className="border-b border-slate-200 pb-1">Nome</th>
              <th className="border-b border-slate-200 pb-1">Versão</th>
            </tr>
          </thead>
          <tbody>
            {dados.dados.software.map((s, i) => (
              <tr key={i}>
                <td className="border-b border-slate-100 py-1">{String(s['nome'] ?? '')}</td>
                <td className="border-b border-slate-100 py-1">{String(s['versao'] ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-6 font-medium">Política de Uso de Equipamentos e Software</h3>
        <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-xs">{textoPolitica}</div>

        <div className="mt-16 text-center">
          <div className="mx-auto w-80 border-t border-slate-800 pt-1.5 text-xs">
            {dados.equipamento.nome_responsavel ?? '_________________________'}
            <br />
            Data: ____/____/______
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <span className="block text-xs uppercase tracking-wide text-slate-400">{rotulo}</span>
      {valor}
    </div>
  );
}
