import type { PermissaoTela } from '@jnk-portal/shared';

/**
 * Agrupa as telas da barra lateral pelos submenus declarados em
 * `telas_modulo.grupo_menu`.
 *
 * A ordem em que a API devolve as telas (`ORDER BY m.id, t.id`) é
 * preservada: um grupo ocupa a posição da sua **primeira** tela, e não o
 * fim da lista. Sem isso, marcar um grupo reordenaria o menu inteiro — e
 * quem já conhece a posição das telas perderia a referência.
 */

export type ItemMenu =
  | { tipo: 'tela'; tela: PermissaoTela }
  | { tipo: 'grupo'; grupo: string; telas: PermissaoTela[] };

export function agruparTelas(telas: PermissaoTela[]): ItemMenu[] {
  const itens: ItemMenu[] = [];
  const gruposAbertos = new Map<string, PermissaoTela[]>();

  for (const tela of telas) {
    const grupo = tela.grupoMenu?.trim();

    if (!grupo) {
      itens.push({ tipo: 'tela', tela });
      continue;
    }

    // Telas do mesmo grupo se juntam mesmo separadas por outras na
    // ordenação: o grupo já criado recebe a tela, sem virar um segundo.
    const existente = gruposAbertos.get(grupo);
    if (existente) {
      existente.push(tela);
      continue;
    }

    const doGrupo = [tela];
    gruposAbertos.set(grupo, doGrupo);
    itens.push({ tipo: 'grupo', grupo, telas: doGrupo });
  }

  return itens;
}
