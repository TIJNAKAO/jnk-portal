import { aplicarEscopo, condicaoEscopo, type EmpresaPermitida } from './escopoEmpresas.js';

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
  /** Texto livre, procurado em número da NF, cliente, código e descrição do produto. */
  busca?: string;
}

/** Colunas varridas pela busca livre. */
const COLUNAS_BUSCA = ['nf', 'dc_clifor', 'cd_produto', 'dc_produto'] as const;

/**
 * Neutraliza os curingas do LIKE. Sem isso, buscar "100%" traria tudo que
 * começa com 100, e "_" casaria com qualquer caractere.
 */
function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
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

  const busca = filtros.busca?.trim();
  if (busca) {
    // Os parênteses são essenciais: sem eles, `empresa = ? AND a OR b` traria
    // linhas de outras empresas, porque AND tem precedência sobre OR.
    condicoes.push(`(${COLUNAS_BUSCA.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    params.push(...COLUNAS_BUSCA.map(() => `%${escaparLike(busca)}%`));
  }

  // `1 = 1` mantém o WHERE sempre válido quando nenhum filtro sobrou.
  return { where: condicoes.length > 0 ? condicoes.join(' AND ') : '1 = 1', params };
}

/**
 * Filtro da tela **interseccionado** com o escopo de empresas do usuário.
 *
 * É esta função, e não `montarFiltro`, que as consultas devem usar: o código
 * da empresa chega pela query string, então pedir uma empresa fora do escopo
 * nunca pode concedê-la. A escolha da tela é aplicada *dentro* do que a pessoa
 * já pode ver, e o escopo entra por AND — nunca substitui os demais filtros.
 */
export function montarFiltroComEscopo(
  filtros: FiltroFaturamento,
  escopoUsuario: EmpresaPermitida[],
): ClausulaFiltro {
  const escopoEfetivo = aplicarEscopo(filtros.empresas, escopoUsuario);

  // `empresas` sai do filtro comum: quem restringe empresa agora é o escopo,
  // que carrega origem junto e por isso não confunde SYSEMP 1 com KPL 1.
  const base = montarFiltro({ ...filtros, empresas: undefined });
  const escopo = condicaoEscopo(escopoEfetivo);

  return {
    where: `${base.where} AND ${escopo.where}`,
    params: [...base.params, ...escopo.params],
  };
}
