import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import type { GrupoEmpresa } from './estoqueFechamentoGrupos.js';

/**
 * Comparar Inventário Físico × Fechamento Mensal. Tela 100% de leitura,
 * sem tabela própria: calcula na hora a partir das duas importações.
 * Ver Specs/spec_modulo_estoque.md, seção 3.9.
 *
 * O Fechamento contábil **não distingue almoxarifado**; o inventário
 * físico conta PRINCIPAL e AVARIAS separadamente. Por isso a agregação
 * acontece aqui, na função pura, e não no SQL: é ela que o teste cobre.
 */

export interface ItemFechamento {
  idEmpresa: number;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  estoque: number | null;
  custo: number | null;
}

export interface ItemInventario {
  idEmpresa: number;
  codigo: string;
  marca: string | null;
  contagemFinal: number | null;
}

export interface LinhaComparativo {
  idEmpresa: number;
  nomeEmpresa: string | null;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  qtdeFechamento: number;
  qtdeInventario: number;
  /** Inventário − Fechamento: positivo = contagem física maior que o livro. */
  divergencia: number;
  vuCusto: number | null;
  valorDivergencia: number | null;
}

interface Acumulado {
  idEmpresa: number;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  qtdeFechamento: number;
  qtdeInventario: number;
  custo: number | null;
}

export function compararQuantidades(
  fechamento: ItemFechamento[],
  inventario: ItemInventario[],
  nomePorEmpresa: Map<number, string>,
): LinhaComparativo[] {
  const porChave = new Map<string, Acumulado>();

  const obter = (idEmpresa: number, codigo: string): Acumulado => {
    const chave = `${idEmpresa}|${codigo}`;
    let item = porChave.get(chave);
    if (!item) {
      item = {
        idEmpresa,
        codigo,
        descricao: null,
        marca: null,
        qtdeFechamento: 0,
        qtdeInventario: 0,
        custo: null,
      };
      porChave.set(chave, item);
    }
    return item;
  };

  for (const f of fechamento) {
    const item = obter(f.idEmpresa, f.codigo);
    item.qtdeFechamento += f.estoque ?? 0;
    item.descricao ??= f.descricao;
    item.marca ??= f.marca;
    // Primeiro custo não nulo encontrado — todas as linhas do mesmo
    // produto no período carregam o mesmo custo do Fechamento.
    item.custo ??= f.custo;
  }

  for (const i of inventario) {
    const item = obter(i.idEmpresa, i.codigo);
    item.qtdeInventario += i.contagemFinal ?? 0;
    item.marca ??= i.marca;
  }

  return [...porChave.values()].map((item) => {
    const divergencia = item.qtdeInventario - item.qtdeFechamento;
    return {
      idEmpresa: item.idEmpresa,
      nomeEmpresa: nomePorEmpresa.get(item.idEmpresa) ?? null,
      codigo: item.codigo,
      descricao: item.descricao,
      marca: item.marca,
      qtdeFechamento: item.qtdeFechamento,
      qtdeInventario: item.qtdeInventario,
      divergencia,
      vuCusto: item.custo,
      // Sem custo, o valor fica em branco e não zero: zero afirmaria que
      // a divergência não custa nada, o que é outra informação.
      valorDivergencia: item.custo === null ? null : divergencia * item.custo,
    };
  });
}

export async function buscarComparativo(
  periodo: string,
  grupo: GrupoEmpresa,
  soDivergencias: boolean,
): Promise<{
  linhas: LinhaComparativo[];
  totalRegistros: number;
  totalDivergencias: number;
  valorTotalDivergencias: number;
}> {
  const idsEmpresa = grupo.empresas.map((e) => e.idEmpresa);
  const marcadores = idsEmpresa.map(() => '?').join(',');
  const nomePorEmpresa = new Map(grupo.empresas.map((e) => [e.idEmpresa, e.razaoSocial]));

  const [linhasFechamento] = await pool.query<RowDataPacket[]>(
    `SELECT id_empresa, codigo_auxiliar, descricao, marca, estoque, custo
       FROM estoque_fechamento_mensal
      WHERE periodo = ? AND id_empresa IN (${marcadores})
        AND codigo_auxiliar IS NOT NULL AND codigo_auxiliar <> ''`,
    [periodo, ...idsEmpresa],
  );

  // Sem GROUP BY de propósito: a soma entre almoxarifados acontece na
  // função pura acima, que é a que o teste cobre.
  const [linhasInventario] = await pool.query<RowDataPacket[]>(
    `SELECT id_empresa, cd_produto, marca, contagem_final
       FROM estoque_inventario_fisico
      WHERE periodo = ? AND id_empresa IN (${marcadores})`,
    [periodo, ...idsEmpresa],
  );

  const todas = compararQuantidades(
    linhasFechamento.map((f) => ({
      idEmpresa: Number(f.id_empresa),
      codigo: String(f.codigo_auxiliar),
      descricao: f.descricao === null ? null : String(f.descricao),
      marca: f.marca === null ? null : String(f.marca),
      estoque: f.estoque === null ? null : Number(f.estoque),
      custo: f.custo === null ? null : Number(f.custo),
    })),
    linhasInventario.map((i) => ({
      idEmpresa: Number(i.id_empresa),
      codigo: String(i.cd_produto),
      marca: i.marca === null ? null : String(i.marca),
      contagemFinal: i.contagem_final === null ? null : Number(i.contagem_final),
    })),
    nomePorEmpresa,
  );

  const divergentes = todas.filter((l) => l.divergencia !== 0);

  return {
    linhas: (soDivergencias ? divergentes : todas).sort(
      (a, b) => a.codigo.localeCompare(b.codigo) || a.idEmpresa - b.idEmpresa,
    ),
    totalRegistros: todas.length,
    totalDivergencias: divergentes.length,
    valorTotalDivergencias: divergentes.reduce((soma, l) => soma + (l.valorDivergencia ?? 0), 0),
  };
}
