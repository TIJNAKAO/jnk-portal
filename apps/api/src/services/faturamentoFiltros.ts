/**
 * Filtros das consultas de faturamento sobre `etl_fatcom`.
 *
 * A tabela-fato já exclui, na carga, notas canceladas e não autorizadas pela
 * SEFAZ (ver services/etl/fatcom.ts) — aqui só entram os recortes que o
 * usuário escolhe na tela.
 */

export interface FiltroFaturamento {
  /** `SYSEMP` e/ou `KPL`. Vazio traz todas as origens. */
  origens?: string[];
  /** `cd_filial` — a empresa dentro da origem. */
  empresas?: number[];
  marcas?: string[];
  canais?: string[];
  /** `YYYY-MM-DD`, inclusivo. */
  dataInicio?: string;
  dataFim?: string;
  /** Saídas por padrão: devoluções distorcem o faturamento se entrarem sem querer. */
  tipoOperacao?: 'S' | 'E' | 'ambos';
  /** `undefined` traz tudo; `true`/`false` restringe a `ctrl_financeiro`. */
  geraFinanceiro?: boolean;
}

export interface ClausulaFiltro {
  where: string;
  params: unknown[];
}

export function montarFiltro(filtros: FiltroFaturamento): ClausulaFiltro {
  const condicoes: string[] = [];
  const params: unknown[] = [];

  const tipo = filtros.tipoOperacao ?? 'S';
  if (tipo !== 'ambos') {
    condicoes.push('ent_sai = ?');
    params.push(tipo);
  }

  const emLista = (coluna: string, valores: (string | number)[] | undefined) => {
    if (!valores?.length) return;
    condicoes.push(`${coluna} IN (${valores.map(() => '?').join(',')})`);
    params.push(...valores);
  };

  emLista('origem_dados', filtros.origens);
  emLista('cd_filial', filtros.empresas);
  emLista('marca', filtros.marcas);
  emLista('canal', filtros.canais);

  if (filtros.dataInicio) {
    condicoes.push('dt_movto >= ?');
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    condicoes.push('dt_movto <= ?');
    params.push(filtros.dataFim);
  }

  if (filtros.geraFinanceiro !== undefined) {
    condicoes.push('ctrl_financeiro = ?');
    params.push(filtros.geraFinanceiro ? 'S' : 'N');
  }

  // `1 = 1` mantém o WHERE sempre válido quando nenhum filtro sobrou.
  return { where: condicoes.length > 0 ? condicoes.join(' AND ') : '1 = 1', params };
}
