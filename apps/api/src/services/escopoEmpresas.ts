import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

/**
 * Escopo de empresas do ERP que cada usuário pode ver.
 *
 * Distinto de **filial**, que é unidade organizacional (onde fica um
 * equipamento, a quem se dirige um aviso, o seletor da barra lateral). Empresa
 * é entidade do ERP — e cinco das nove empresas da SysEmp compartilham o mesmo
 * CNPJ, sendo apenas contas de fulfillment de marketplace. Colapsar os dois
 * conceitos quebraria o módulo TI, onde "FULL SHOPEE" não é um lugar.
 *
 * Ver Specs/spec_modulo_faturamento.md, seção 10.
 */

export interface EmpresaPermitida {
  origem: string;
  cdFilial: number;
}

/**
 * Cruza o que o usuário pediu na tela com o que ele tem direito de ver.
 *
 * Regras, nesta ordem:
 * - não pedir nada significa "tudo que eu posso", não "tudo que existe";
 * - pedir algo fora do escopo **descarta** o pedido, nunca o concede;
 * - sem nenhum vínculo, o resultado é vazio — falha fechada. A ausência de
 *   configuração jamais pode virar acesso total.
 */
export function aplicarEscopo(
  pedidas: number[] | undefined,
  permitidas: EmpresaPermitida[],
): EmpresaPermitida[] {
  if (!pedidas?.length) return permitidas;
  const alvo = new Set(pedidas);
  return permitidas.filter((e) => alvo.has(e.cdFilial));
}

interface EmpresaRow extends RowDataPacket {
  origem_dados: string;
  cd_filial: number;
}

export async function buscarEmpresasPermitidas(usuarioId: number): Promise<EmpresaPermitida[]> {
  const [linhas] = await pool.query<EmpresaRow[]>(
    'SELECT origem_dados, cd_filial FROM usuarios_empresas WHERE usuario_id = ? ORDER BY origem_dados, cd_filial',
    [usuarioId],
  );
  return linhas.map((l) => ({ origem: l.origem_dados, cdFilial: l.cd_filial }));
}

/**
 * Condição SQL para restringir uma consulta ao escopo. Sempre em pares
 * (origem, código): o código 1 é Barueri na SysEmp e JNK Barueri no KPL —
 * empresas diferentes que compartilham o número.
 *
 * Escopo vazio devolve uma condição sempre falsa, e não a ausência de
 * condição: é a diferença entre "não vê nada" e "vê tudo".
 */
export function condicaoEscopo(
  escopo: EmpresaPermitida[],
  colunaOrigem = 'origem_dados',
  colunaEmpresa = 'cd_filial',
): { where: string; params: unknown[] } {
  if (escopo.length === 0) return { where: '1 = 0', params: [] };

  return {
    where: `(${escopo.map(() => `(${colunaOrigem} = ? AND ${colunaEmpresa} = ?)`).join(' OR ')})`,
    params: escopo.flatMap((e) => [e.origem, e.cdFilial]),
  };
}

/**
 * Condição para tabelas de uma origem só, que por isso não têm coluna de
 * origem — `sysemp_estoque_fisico`, por exemplo.
 *
 * Filtra o escopo pela origem antes de usar os códigos: sem isso, ter a
 * empresa 4 do KPL liberaria a empresa 4 da SysEmp, que é outra companhia.
 */
export function condicaoEscopoDeUmaOrigem(
  escopo: EmpresaPermitida[],
  origem: string,
  coluna: string,
): { where: string; params: unknown[] } {
  const codigos = escopo.filter((e) => e.origem === origem).map((e) => e.cdFilial);
  if (codigos.length === 0) return { where: '1 = 0', params: [] };

  return { where: `${coluna} IN (${codigos.map(() => '?').join(',')})`, params: codigos };
}
