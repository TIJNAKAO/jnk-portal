import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface Equipamento {
  id: number;
  nome_computador: string;
  apelido: string | null;
  patrimonio: string | null;
  id_departamento: number | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  nome_departamento: string | null;
  serial_bios: string | null;
  serial_placa_mae: string | null;
  primeira_coleta_em: string | null;
  ultima_coleta_em: string | null;
}

interface Foto {
  id: number;
  nome_arquivo: string | null;
  tamanho_bytes: number | null;
  enviado_em: string;
}

interface Coleta {
  id: number;
  coletado_em: string;
  usuario_windows: string | null;
  versao_agente: string | null;
  anydesk_id: string | null;
}

interface ColetaCompleta {
  sistemaOperacional: Record<string, unknown> | null;
  processador: Record<string, unknown> | null;
  placaMae: Record<string, unknown> | null;
  bios: Record<string, unknown> | null;
  memoriaRam: Record<string, unknown>[];
  disco: Record<string, unknown>[];
  rede: Record<string, unknown>[];
  software: Record<string, unknown>[];
  dispositivoUsb: Record<string, unknown>[];
}

interface Departamento {
  id: number;
  nome: string;
}

function fmtData(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR');
}
function fmtBytes(v: unknown): string {
  const n = Number(v ?? 0);
  return n > 0 ? `${(n / 1073741824).toFixed(1)} GB` : '—';
}
function fmtKb(v: number | null): string {
  if (!v || v <= 0) return '—';
  return `${(v / 1024).toFixed(0)} KB`;
}

export function EquipamentoHistoricoPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const navigate = useNavigate();

  const [equipamento, setEquipamento] = useState<Equipamento | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [atual, setAtual] = useState<ColetaCompleta | null>(null);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [form, setForm] = useState({ apelido: '', patrimonio: '', idDepartamento: '' });
  const [de, setDe] = useState<number | null>(null);
  const [para, setPara] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    const dados = await api<{ equipamento: Equipamento; fotos: Foto[]; coletas: Coleta[]; atual: ColetaCompleta | null }>(
      `/ti/equipamentos/${id}`,
    );
    setEquipamento(dados.equipamento);
    setFotos(dados.fotos);
    setColetas(dados.coletas);
    setAtual(dados.atual);
    setForm({
      apelido: dados.equipamento.apelido ?? '',
      patrimonio: dados.equipamento.patrimonio ?? '',
      idDepartamento: dados.equipamento.id_departamento ? String(dados.equipamento.id_departamento) : '',
    });
    if (dados.coletas.length >= 2) {
      setDe(dados.coletas[1]!.id);
      setPara(dados.coletas[0]!.id);
    }
  }

  useEffect(() => {
    carregar().catch(console.error);
    api<Departamento[]>('/ti/departamentos').then(setDepartamentos).catch(console.error);
  }, [api, id]);

  async function salvarCadastro(e: React.FormEvent) {
    e.preventDefault();
    await api(`/ti/equipamentos/${id}`, {
      method: 'PUT',
      body: {
        apelido: form.apelido,
        patrimonio: form.patrimonio,
        idDepartamento: form.idDepartamento ? Number(form.idDepartamento) : null,
      },
    });
    setMensagem('Dados do equipamento atualizados.');
    await carregar();
  }

  async function enviarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = e.target.files;
    if (!arquivos || arquivos.length === 0) return;

    const formData = new FormData();
    for (const arquivo of Array.from(arquivos)) formData.append('fotos', arquivo);

    const resultado = await api<{ enviadas: number }>(`/ti/equipamentos/${id}/fotos`, { method: 'POST', body: formData });
    setMensagem(resultado.enviadas > 0 ? `${resultado.enviadas} foto(s) enviada(s).` : 'Nenhuma foto válida selecionada.');
    e.target.value = '';
    await carregar();
  }

  async function excluirFoto(idFoto: number) {
    await api(`/ti/equipamentos/${id}/fotos/${idFoto}`, { method: 'DELETE' });
    await carregar();
  }

  if (!equipamento) return null;

  const ramTotal = (atual?.memoriaRam ?? []).reduce((soma, r) => soma + Number(r['capacidade_bytes'] ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/ti/equipamentos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar pra lista de equipamentos
        </Link>
        {coletas.length > 0 && (
          <>
            {' · '}
            <Link to={`/ti/equipamentos/${id}/termo`} className="text-sm text-slate-500 hover:text-slate-700">
              Gerar Termo de Responsabilidade
            </Link>
          </>
        )}
      </div>

      {mensagem && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</p>}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-slate-900">{equipamento.apelido || equipamento.nome_computador}</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Info rotulo="Nome do computador" valor={equipamento.nome_computador} />
          <Info rotulo="Filial" valor={equipamento.nome_filial} />
          <Info rotulo="Responsável" valor={equipamento.nome_responsavel} />
          <Info rotulo="Departamento" valor={equipamento.nome_departamento} />
          <Info rotulo="Patrimônio" valor={equipamento.patrimonio} />
          <Info rotulo="Serial BIOS" valor={equipamento.serial_bios} />
          <Info rotulo="Primeira coleta" valor={fmtData(equipamento.primeira_coleta_em)} />
          <Info rotulo="Última coleta" valor={fmtData(equipamento.ultima_coleta_em)} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-slate-900">Editar dados do equipamento</h2>
        <form onSubmit={salvarCadastro} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            placeholder="Apelido"
            value={form.apelido}
            onChange={(e) => setForm({ ...form, apelido: e.target.value })}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
          <input
            placeholder="Nº de Patrimônio"
            value={form.patrimonio}
            onChange={(e) => setForm({ ...form, patrimonio: e.target.value })}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
          <select
            value={form.idDepartamento}
            onChange={(e) => setForm({ ...form, idDepartamento: e.target.value })}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">— Sem departamento —</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white sm:col-span-3 sm:w-fit">
            Salvar
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-slate-900">Fotos do equipamento</h2>
        {fotos.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-4">
            {fotos.map((f) => (
              <div key={f.id} className="w-40">
                <a href={`${import.meta.env.VITE_API_URL}/ti/equipamentos/${id}/fotos/${f.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`${import.meta.env.VITE_API_URL}/ti/equipamentos/${id}/fotos/${f.id}`}
                    alt={f.nome_arquivo ?? 'Foto'}
                    className="h-28 w-40 rounded-lg border border-slate-200 object-cover"
                  />
                </a>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {f.nome_arquivo} ({fmtKb(f.tamanho_bytes)})
                </p>
                <button
                  type="button"
                  onClick={() => excluirFoto(f.id)}
                  className="mt-1 text-xs text-red-600 hover:underline"
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
        <input type="file" accept="image/*" multiple onChange={enviarFotos} className="text-sm" />
      </div>

      {atual && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-medium text-slate-900">Snapshot atual (última coleta)</h2>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Info rotulo="Sistema Operacional" valor={String(atual.sistemaOperacional?.['caption'] ?? '—')} />
              <Info rotulo="Processador" valor={String(atual.processador?.['nome'] ?? '—')} />
              <Info rotulo="Placa-mãe" valor={String(atual.placaMae?.['nome'] ?? '—')} />
              <Info rotulo="BIOS" valor={`${atual.bios?.['fabricante'] ?? ''} ${atual.bios?.['versao'] ?? ''}`.trim() || '—'} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Contador rotulo="Memória RAM" valor={fmtBytes(ramTotal)} />
              <Contador rotulo="Discos" valor={String(atual.disco.length)} />
              <Contador rotulo="Redes" valor={String(atual.rede.length)} />
              <Contador rotulo="Programas" valor={String(atual.software.length)} />
              <Contador rotulo="USB conhecidos" valor={String(atual.dispositivoUsb.length)} />
            </div>
          </div>

          {atual.disco.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 font-medium text-slate-900">Discos</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Modelo</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {atual.disco.map((d, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-2">{String(d['nome'] ?? '—')}</td>
                      <td className="p-2">{String(d['modelo'] ?? '—')}</td>
                      <td className="p-2">{String(d['tipo_midia'] ?? d['interface'] ?? '—')}</td>
                      <td className="p-2">{fmtBytes(d['tamanho_bytes'])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-slate-900">Coletas (escolha duas pra comparar)</h2>
        {coletas.length < 2 ? (
          <p className="text-sm text-slate-400">Só existe {coletas.length} coleta registrada — precisa de pelo menos duas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="p-2">De</th>
                  <th className="p-2">Para</th>
                  <th className="p-2">Coletado em</th>
                  <th className="p-2">Usuário Windows</th>
                </tr>
              </thead>
              <tbody>
                {coletas.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="p-2">
                      <input type="radio" name="de" checked={de === c.id} onChange={() => setDe(c.id)} />
                    </td>
                    <td className="p-2">
                      <input type="radio" name="para" checked={para === c.id} onChange={() => setPara(c.id)} />
                    </td>
                    <td className="p-2">{fmtData(c.coletado_em)}</td>
                    <td className="p-2">{c.usuario_windows ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              disabled={de === null || para === null}
              onClick={() => navigate(`/ti/equipamentos/${id}/comparar?de=${de}&para=${para}`)}
              className="mt-3 min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
            >
              Comparar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <span className="block text-xs uppercase tracking-wide text-slate-400">{rotulo}</span>
      {valor ?? '—'}
    </div>
  );
}

function Contador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[100px] rounded-lg bg-slate-50 px-4 py-2 text-sm">
      {rotulo}
      <br />
      <b className="text-lg">{valor}</b>
    </div>
  );
}
