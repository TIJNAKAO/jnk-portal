import { useMemo, useState } from 'react';

export type DirecaoOrdenacao = 'asc' | 'desc';

/**
 * Ordenação client-side genérica pra qualquer tabela — clique no cabeçalho
 * alterna asc/desc/asc. `valorPara` mapeia cada campo ordenável pra uma
 * função que extrai o valor comparável da linha (string ou number).
 */
export function useOrdenacao<T>(linhas: T[], valorPara: Record<string, (item: T) => string | number | null | undefined>) {
  const [campo, setCampo] = useState<string | null>(null);
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('asc');

  function ordenarPor(novoCampo: string) {
    if (campo === novoCampo) {
      setDirecao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCampo(novoCampo);
      setDirecao('asc');
    }
  }

  const linhasOrdenadas = useMemo(() => {
    if (!campo || !valorPara[campo]) return linhas;
    const extrator = valorPara[campo];
    const copia = [...linhas];
    copia.sort((a, b) => {
      const va = extrator(a);
      const vb = extrator(b);
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      const comp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return direcao === 'asc' ? comp : -comp;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, campo, direcao]);

  return { linhasOrdenadas, campoOrdenado: campo, direcao, ordenarPor };
}

/** Busca genérica: filtra linhas cujo texto de qualquer campo (raso) bate com o termo. */
export function filtrarPorTexto<T>(linhas: T[], termo: string): T[] {
  const alvo = termo.trim().toLowerCase();
  if (!alvo) return linhas;
  return linhas.filter((linha) =>
    Object.values(linha as Record<string, unknown>).some((v) => {
      if (v === null || v === undefined || typeof v === 'object') return false;
      return String(v).toLowerCase().includes(alvo);
    }),
  );
}
