import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { condicaoEscopoDeUmaOrigem, type EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Consulta de Pedidos de Compra sincronizados da SysEmp
 * (`sysemp_pedido_compra`, alimentada pela fila — ver
 * Specs/spec_modulo_integracao.md, seção 3.3).
 *
 * Uma linha por PEDIDO (cabeçalho), não por item — decisão da spec
 * (spec_modulo_compras.md, seção 2): visão geral de "quais pedidos estão
 * pendentes" é mais útil aqui do que uma grade item a item.
 *
 * Escopo por `condicaoEscopoDeUmaOrigem` com origem SYSEMP: a tabela é de
 * uma origem só e não tem coluna de origem, então ter a empresa 4 do KPL
 * não pode liberar a 4 da SysEmp, que é outra companhia.
 */

export interface FiltroPedidosCompra {
  empresas?: number[];
  fornecedores?: number[];
  statusPedido?: string[];
  statusEntrega?: string[];
  dataInicio?: string;
  dataFim?: string;
}

export interface LinhaPedidoCompra extends RowDataPacket {
  id_pedcompra: number;
  id_empresa: number | null;
  empresa: string | null;
  id_parceiro_fornecedor: number | null;
  fornecedor: string | null;
  data_pedido: string | null;
  data_prev_entrega: string | null;
  comprador: string | null;
  status_pedido: string | null;
  status_entrega: string | null;
  valor_bruto: number | null;
  valor_desconto: number | null;
  valor_ipi: number | null;
  valor_frete: number | null;
  total_geral: number | null;
}

export interface Ordenacao {
  coluna?: string;
  direcao: 'asc' | 'desc';
}

const COLUNAS_ORDENAVEIS: Record<string, string> = {
  empresa: 'e.fantasia',
  fornecedor: 'f.razao_social',
  data_pedido: 'pc.data_pedido',
  data_prev_entrega: 'pc.data_prev_entrega',
  status_pedido: 'pc.status_pedido',
  status_entrega: 'pc.status_entrega',
  total_geral: 'pc.total_geral',
};

const DE_JOINS = `
  FROM sysemp_pedido_compra pc
  LEFT JOIN sysemp_empresa e ON e.id_empresa = pc.id_empresa
  LEFT JOIN sysemp_parceiro f ON f.id_parceiro = pc.id_parceiro_fornecedor`;

/** Monta o WHERE completo: deletados fora, escopo (obrigatório) e filtros da tela. */
export function montarCondicoes(
  filtro: FiltroPedidosCompra,
  escopo: EmpresaPermitida[],
): { where: string; params: unknown[] } {
  const { where: escopoWhere, params } = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'pc.id_empresa');
  const condicoes = ['pc.deleted = FALSE', escopoWhere];

  if (filtro.empresas?.length) {
    condicoes.push(`pc.id_empresa IN (${filtro.empresas.map(() => '?').join(',')})`);
    params.push(...filtro.empresas);
  }

  if (filtro.fornecedores?.length) {
    condicoes.push(`pc.id_parceiro_fornecedor IN (${filtro.fornecedores.map(() => '?').join(',')})`);
    params.push(...filtro.fornecedores);
  }

  if (filtro.statusPedido?.length) {
    condicoes.push(`pc.status_pedido IN (${filtro.statusPedido.map(() => '?').join(',')})`);
    params.push(...filtro.statusPedido);
  }

  if (filtro.statusEntrega?.length) {
    condicoes.push(`pc.status_entrega IN (${filtro.statusEntrega.map(() => '?').join(',')})`);
    params.push(...filtro.statusEntrega);
  }

  if (filtro.dataInicio) {
    condicoes.push('pc.data_pedido >= ?');
    params.push(filtro.dataInicio);
  }

  if (filtro.dataFim) {
    condicoes.push('pc.data_pedido <= ?');
    params.push(filtro.dataFim);
  }

  return { where: condicoes.join(' AND '), params };
}

const SELECT_COLUNAS = `
  SELECT
    pc.id_pedcompra, pc.id_empresa, e.fantasia AS empresa,
    pc.id_parceiro_fornecedor, f.razao_social AS fornecedor,
    pc.data_pedido, pc.data_prev_entrega, pc.comprador,
    pc.status_pedido, pc.status_entrega,
    pc.valor_bruto, pc.valor_desconto, pc.valor_ipi, pc.valor_frete, pc.total_geral`;

export async function buscarPedidosCompraPaginados(
  filtro: FiltroPedidosCompra,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
  ordenacao: Ordenacao,
): Promise<{ linhas: LinhaPedidoCompra[]; total: number }> {
  const { where, params } = montarCondicoes(filtro, escopo);

  const [contagem] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${DE_JOINS} WHERE ${where}`, params);
  const total = Number(contagem[0]?.total ?? 0);
  if (total === 0) return { linhas: [], total: 0 };

  const coluna = COLUNAS_ORDENAVEIS[ordenacao.coluna ?? ''] ?? 'pc.data_pedido';
  const direcao = ordenacao.direcao === 'asc' ? 'ASC' : 'DESC';

  const [linhas] = await pool.query<LinhaPedidoCompra[]>(
    `${SELECT_COLUNAS} ${DE_JOINS} WHERE ${where}
     ORDER BY ${coluna} ${direcao}, pc.id_pedcompra
     LIMIT ? OFFSET ?`,
    [...params, tamanhoPagina, (pagina - 1) * tamanhoPagina],
  );

  return { linhas, total };
}

/** Acima disto o Excel fica pesado demais para gerar dentro de uma request. */
export const LIMITE_EXPORTACAO = 100_000;

/** Mesma consulta da tela, sem paginação — para a exportação em Excel. */
export async function buscarPedidosCompraCompletos(
  filtro: FiltroPedidosCompra,
  escopo: EmpresaPermitida[],
  ordenacao: Ordenacao,
): Promise<LinhaPedidoCompra[]> {
  const { linhas } = await buscarPedidosCompraPaginados(filtro, escopo, 1, LIMITE_EXPORTACAO, ordenacao);
  return linhas;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/** Opções dos seletores da tela, já restritas ao escopo. */
export async function buscarFiltrosPedidosCompra(escopo: EmpresaPermitida[]): Promise<{
  empresas: OpcaoFiltro[];
  fornecedores: OpcaoFiltro[];
  statusPedido: OpcaoFiltro[];
  statusEntrega: OpcaoFiltro[];
}> {
  const { where, params } = montarCondicoes({}, escopo);

  const [empresas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.id_empresa, e.fantasia ${DE_JOINS} WHERE ${where} ORDER BY e.fantasia`,
    params,
  );
  const [fornecedores] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.id_parceiro_fornecedor, f.razao_social ${DE_JOINS}
      WHERE ${where} AND pc.id_parceiro_fornecedor IS NOT NULL ORDER BY f.razao_social`,
    params,
  );
  const [statusPedido] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.status_pedido ${DE_JOINS}
      WHERE ${where} AND pc.status_pedido IS NOT NULL AND pc.status_pedido <> '' ORDER BY pc.status_pedido`,
    params,
  );
  const [statusEntrega] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.status_entrega ${DE_JOINS}
      WHERE ${where} AND pc.status_entrega IS NOT NULL AND pc.status_entrega <> '' ORDER BY pc.status_entrega`,
    params,
  );

  return {
    empresas: empresas.map((e) => ({ valor: String(e.id_empresa), rotulo: String(e.fantasia ?? e.id_empresa).trim() })),
    fornecedores: fornecedores.map((f) => ({
      valor: String(f.id_parceiro_fornecedor),
      rotulo: String(f.razao_social ?? f.id_parceiro_fornecedor).trim(),
    })),
    statusPedido: statusPedido.map((s) => ({ valor: String(s.status_pedido), rotulo: String(s.status_pedido) })),
    statusEntrega: statusEntrega.map((s) => ({ valor: String(s.status_entrega), rotulo: String(s.status_entrega) })),
  };
}
