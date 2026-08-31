import { Pencil, Plus, PowerOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface Usuario {
  id: number;
  nome: string;
  email: string;
  whatsapp: string | null;
  ativo: boolean;
}

interface Filial {
  id: number;
  nome: string;
}

interface Perfil {
  id: number;
  nome: string;
}

interface FormState {
  nome: string;
  email: string;
  senha: string;
  whatsapp: string;
  filiaisIds: number[];
  perfisIds: number[];
  /** Empresas do ERP, no formato "SYSEMP:2". */
  empresas: string[];
}

/** Empresa do ERP disponivel para vinculo — vem consolidada de SysEmp e KPL. */
interface EmpresaErp {
  valor: string;
  origem: string;
  grupo: string;
  nome: string;
}

const FORM_VAZIO: FormState = {
  nome: '',
  email: '',
  senha: '',
  whatsapp: '',
  filiaisIds: [],
  perfisIds: [],
  empresas: [],
};

export function UsuariosPage() {
  const api = useApi();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [empresasErp, setEmpresasErp] = useState<EmpresaErp[]>([]);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const [u, f, p, e] = await Promise.all([
      api<Usuario[]>('/usuarios'),
      api<Filial[]>('/filiais'),
      api<Perfil[]>('/perfis'),
      api<EmpresaErp[]>('/usuarios/empresas-erp'),
    ]);
    setUsuarios(u);
    setFiliais(f);
    setPerfis(p);
    setEmpresasErp(e);
  }

  useEffect(() => {
    carregar().catch(console.error);
  }, [api]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setFormAberto(true);
    setErro(null);
  }

  async function abrirEdicao(usuario: Usuario) {
    setEditando(usuario);
    setFormAberto(true);
    setErro(null);
    // Empresas vem marcadas com o que ja esta vinculado: diferente de filial e
    // perfil, aqui desmarcar tudo e uma acao valida (tirar todo o acesso), e
    // "vazio = manter" esconderia isso do administrador.
    const empresas = await api<string[]>(`/usuarios/${usuario.id}/empresas-erp`).catch(() => [] as string[]);
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      whatsapp: usuario.whatsapp ?? '',
      filiaisIds: [],
      perfisIds: [],
      empresas,
    });
  }

  function alternarSelecao(lista: number[], id: number): number[] {
    return lista.includes(id) ? lista.filter((v) => v !== id) : [...lista, id];
  }

  function alternarEmpresa(valor: string): string[] {
    return form.empresas.includes(valor) ? form.empresas.filter((v) => v !== valor) : [...form.empresas, valor];
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      if (editando) {
        const body: Record<string, unknown> = { nome: form.nome, email: form.email, whatsapp: form.whatsapp };
        if (form.senha) body.senha = form.senha;
        if (form.filiaisIds.length > 0) body.filiaisIds = form.filiaisIds;
        if (form.perfisIds.length > 0) body.perfisIds = form.perfisIds;
        // Sempre enviado, inclusive vazio: e assim que se remove todo o acesso.
        body.empresas = form.empresas;
        await api(`/usuarios/${editando.id}`, { method: 'PUT', body });
      } else {
        await api('/usuarios', { method: 'POST', body: form });
      }
      setFormAberto(false);
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }

  async function alternarAtivo(usuario: Usuario) {
    await api(`/usuarios/${usuario.id}`, { method: 'PUT', body: { ativo: !usuario.ativo } });
    await carregar();
  }

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(usuarios, busca), {
    nome: (u) => u.nome,
    email: (u) => u.email,
    ativo: (u) => (u.ativo ? 1 : 0),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Usuários</h1>
        <button
          type="button"
          onClick={abrirNovo}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Novo Usuário
        </button>
      </div>

      {formAberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              required
              placeholder="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              required
              type="email"
              placeholder="E-mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              placeholder={editando ? 'Nova senha (deixe em branco para manter)' : 'Senha (mínimo 8 caracteres)'}
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              placeholder="WhatsApp (opcional)"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Filiais {editando && <span className="font-normal text-slate-400">(deixe em branco para manter)</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {filiais.map((filial) => (
                <label
                  key={filial.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.filiaisIds.includes(filial.id)}
                    onChange={() => setForm({ ...form, filiaisIds: alternarSelecao(form.filiaisIds, filial.id) })}
                  />
                  {filial.nome}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Empresas do ERP</p>
            <p className="mb-2 text-xs text-slate-500">
              Quais empresas este usuário vê nos relatórios de Faturamento e Estoque. Diferente de Filial, que define a
              unidade organizacional. <strong>Nenhuma marcada significa nenhum acesso a dado do ERP.</strong>
            </p>
            {Object.entries(
              empresasErp.reduce<Record<string, EmpresaErp[]>>((acc, empresa) => {
                (acc[`${empresa.origem} · ${empresa.grupo}`] ??= []).push(empresa);
                return acc;
              }, {}),
            ).map(([grupo, lista]) => (
              <div key={grupo} className="mb-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{grupo}</p>
                <div className="flex flex-wrap gap-2">
                  {lista.map((empresa) => (
                    <label
                      key={empresa.valor}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.empresas.includes(empresa.valor)}
                        onChange={() => setForm({ ...form, empresas: alternarEmpresa(empresa.valor) })}
                      />
                      {empresa.nome}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Perfis de acesso {editando && <span className="font-normal text-slate-400">(deixe em branco para manter)</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {perfis.map((perfil) => (
                <label
                  key={perfil.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.perfisIds.includes(perfil.id)}
                    onChange={() => setForm({ ...form, perfisIds: alternarSelecao(form.perfisIds, perfil.id) })}
                  />
                  {perfil.nome}
                </label>
              ))}
            </div>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white">
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setFormAberto(false)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar usuário..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Nome</ThOrdenavel>
              <ThOrdenavel campo="email" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>E-mail</ThOrdenavel>
              <ThOrdenavel campo="ativo" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Status</ThOrdenavel>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((usuario) => (
              <tr key={usuario.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{usuario.nome}</td>
                <td className="p-3">{usuario.email}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      usuario.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {usuario.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="flex justify-end gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(usuario)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarAtivo(usuario)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label={usuario.ativo ? 'Desativar' : 'Reativar'}
                  >
                    <PowerOff size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
