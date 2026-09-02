import { useEffect, useState } from 'react';
import { useApi, useApiDownload } from '../../lib/useApi';

interface Programa {
  id: number;
  nome: string;
  winget_id: string;
}

interface ItemIndesejado {
  id: string;
  nome: string;
}

export function InstalarProgramasPage() {
  const api = useApi();
  const apiDownload = useApiDownload();

  const [programas, setProgramas] = useState<Programa[]>([]);
  const [indesejados, setIndesejados] = useState<ItemIndesejado[]>([]);
  const [programaIds, setProgramaIds] = useState<number[]>([]);
  const [desinstalarIds, setDesinstalarIds] = useState<string[]>([]);
  const [habilitarAdmin, setHabilitarAdmin] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    api<{ programas: Programa[]; catalogoIndesejados: ItemIndesejado[] }>('/ti/instalar-programas').then((d) => {
      setProgramas(d.programas);
      setIndesejados(d.catalogoIndesejados);
    });
  }, [api]);

  function alternar(lista: number[], id: number): number[] {
    return lista.includes(id) ? lista.filter((v) => v !== id) : [...lista, id];
  }
  function alternarStr(lista: string[], id: string): string[] {
    return lista.includes(id) ? lista.filter((v) => v !== id) : [...lista, id];
  }

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setGerando(true);
    try {
      await apiDownload('/ti/instalar-programas/script', {
        method: 'POST',
        body: { programaIds, desinstalarIds, habilitarAdmin },
        nomeArquivo: 'instalar_programas.bat',
      });
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Instalar Programas</h1>
        <p className="text-sm text-slate-500">
          Escolha os programas pra instalar, indesejados pra remover e/ou habilite o Administrador local — tudo vira
          um único <strong>.bat</strong> executável. Baixe na máquina e dê duplo clique: o próprio arquivo pede
          elevação.
        </p>
      </div>

      {programas.length === 0 && (
        <p className="text-sm text-slate-400">Nenhum programa ativo no catálogo — cadastre em Catálogo de Programas.</p>
      )}

      <form onSubmit={gerar} className="max-w-2xl space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        {programas.length > 0 && (
          <div className="space-y-2">
            {programas.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={programaIds.includes(p.id)} onChange={() => setProgramaIds(alternar(programaIds, p.id))} />
                {p.nome} <span className="text-xs text-slate-400">({p.winget_id})</span>
              </label>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-sm font-medium text-slate-700">Remover programas indesejados (jogos, Xbox, Spotify etc.)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {indesejados.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={desinstalarIds.includes(item.id)} onChange={() => setDesinstalarIds(alternarStr(desinstalarIds, item.id))} />
                {item.nome}
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2 border-t border-slate-200 pt-4 text-sm">
          <input type="checkbox" checked={habilitarAdmin} onChange={(e) => setHabilitarAdmin(e.target.checked)} className="mt-0.5" />
          <span>
            Habilitar conta de Administrador local do Windows
            <br />
            <span className="text-xs text-slate-400">O script pergunta a senha na hora que rodar, na própria máquina — nunca fica salva no site.</span>
          </span>
        </label>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button type="submit" disabled={gerando} className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50">
          {gerando ? 'Gerando...' : 'Gerar Executável (.bat)'}
        </button>
      </form>
    </div>
  );
}
