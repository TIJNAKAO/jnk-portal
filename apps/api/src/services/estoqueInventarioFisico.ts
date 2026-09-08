import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../config/database.js';
import { registrarImportacao, type LinhaIgnorada, type ResultadoImportacao } from './estoqueImportacaoLog.js';
import {
  lerPlanilha,
  mapearColunas,
  parseNumero,
  parsePeriodo,
  parseTexto,
  type PlanilhaLida,
} from './planilha.js';

/**
 * Importação da planilha de Inventário Físico — a contagem física, com
 * até cinco rodadas mais a final. Ver Specs/spec_modulo_estoque.md,
 * seção 3.4.
 *
 * `almox` entra na chave porque PRINCIPAL e AVARIAS contam o mesmo
 * produto separadamente. O Fechamento contábil não distingue
 * almoxarifado, e é isso que obriga o comparativo (seção 3.9) a somar os
 * almoxarifados antes de comparar.
 */

const COLUNAS = [
  'ID_EMPRESA', 'PERIODO', 'CD_PRODUTO', 'DC_PRODUTO', 'MARCA', 'ALMOX',
  'CONTAGEM_1', 'CONTAGEM_2', 'CONTAGEM_3', 'CONTAGEM_4', 'CONTAGEM_5',
  'CONTAGEM_FINAL', 'SALDO_SYSEMP', 'DIVERGENCIA', 'ANALISE', 'ACAO',
] as const;

export interface LinhaInventarioValida {
  periodo: string;
  idEmpresa: number;
  cdProduto: string;
  almox: string;
  marca: string | null;
  contagem1: number | null;
  contagem2: number | null;
  contagem3: number | null;
  contagem4: number | null;
  contagem5: number | null;
  contagemFinal: number | null;
  saldoSysemp: number | null;
  divergencia: number | null;
  analise: string | null;
  acao: string | null;
}

export function extrairLinhasInventario(planilha: PlanilhaLida): {
  validas: LinhaInventarioValida[];
  ignoradas: LinhaIgnorada[];
} {
  const col = mapearColunas(planilha.cabecalho, COLUNAS);
  const validas: LinhaInventarioValida[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  planilha.linhas.forEach((linha, i) => {
    const numeroLinha = i + 2;
    const em = (nome: string): string | null => linha[col[nome] ?? -1] ?? null;

    const idBruto = parseTexto(em('ID_EMPRESA'));
    const cdProduto = parseTexto(em('CD_PRODUTO'));
    const periodo = parsePeriodo(em('PERIODO'));

    if (!idBruto || !/^\d+$/.test(idBruto) || !cdProduto) {
      ignoradas.push({ linha: numeroLinha, motivo: 'ID_EMPRESA ou CD_PRODUTO vazio/inválido.' });
      return;
    }
    if (!periodo) {
      ignoradas.push({ linha: numeroLinha, motivo: 'PERIODO inválido (esperado MM/AAAA).' });
      return;
    }

    validas.push({
      periodo,
      idEmpresa: Number(idBruto),
      cdProduto,
      // A coluna tem DEFAULT '' e entra na chave única: nulo aqui
      // impediria a deduplicação de quem não informa almoxarifado.
      almox: parseTexto(em('ALMOX')) ?? '',
      marca: parseTexto(em('MARCA')),
      contagem1: parseNumero(em('CONTAGEM_1')),
      contagem2: parseNumero(em('CONTAGEM_2')),
      contagem3: parseNumero(em('CONTAGEM_3')),
      contagem4: parseNumero(em('CONTAGEM_4')),
      contagem5: parseNumero(em('CONTAGEM_5')),
      contagemFinal: parseNumero(em('CONTAGEM_FINAL')),
      saldoSysemp: parseNumero(em('SALDO_SYSEMP')),
      divergencia: parseNumero(em('DIVERGENCIA')),
      analise: parseTexto(em('ANALISE')),
      acao: parseTexto(em('ACAO')),
    });
  });

  return { validas, ignoradas };
}

async function codigosExistentes(conexao: PoolConnection, codigos: string[]): Promise<Set<string>> {
  const encontrados = new Set<string>();
  for (let i = 0; i < codigos.length; i += 1000) {
    const bloco = codigos.slice(i, i + 1000);
    const marcadores = bloco.map(() => '?').join(',');
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT codigo_auxiliar FROM sysemp_produto WHERE codigo_auxiliar IN (${marcadores})`,
      bloco,
    );
    for (const l of linhas) encontrados.add(String(l.codigo_auxiliar));
  }
  return encontrados;
}

async function empresasExistentes(conexao: PoolConnection, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const marcadores = ids.map(() => '?').join(',');
  const [linhas] = await conexao.query<RowDataPacket[]>(
    `SELECT id_empresa FROM sysemp_empresa WHERE id_empresa IN (${marcadores})`,
    ids,
  );
  return new Set(linhas.map((l) => Number(l.id_empresa)));
}

export async function importarInventarioFisico(
  buffer: Buffer,
  arquivo: string,
  usuarioId: number,
): Promise<ResultadoImportacao> {
  const planilha = await lerPlanilha(buffer);
  const { validas, ignoradas } = extrairLinhasInventario(planilha);

  return withTransaction(async (conexao) => {
    const produtos = await codigosExistentes(conexao, [...new Set(validas.map((l) => l.cdProduto))]);
    const empresas = await empresasExistentes(conexao, [...new Set(validas.map((l) => l.idEmpresa))]);

    let inseridas = 0;
    let atualizadas = 0;
    let produtosNaoEncontrados = 0;
    let empresasNaoEncontradas = 0;

    for (const linha of validas) {
      const produtoEncontrado = produtos.has(linha.cdProduto);
      const empresaEncontrada = empresas.has(linha.idEmpresa);
      if (!produtoEncontrado) produtosNaoEncontrados++;
      if (!empresaEncontrada) empresasNaoEncontradas++;

      const [resultado] = await conexao.query<ResultSetHeader>(
        `INSERT INTO estoque_inventario_fisico
           (periodo, id_empresa, cd_produto, almox, marca, contagem_1, contagem_2, contagem_3,
            contagem_4, contagem_5, contagem_final, saldo_sysemp, divergencia, analise, acao,
            produto_encontrado, empresa_encontrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           marca = VALUES(marca), contagem_1 = VALUES(contagem_1), contagem_2 = VALUES(contagem_2),
           contagem_3 = VALUES(contagem_3), contagem_4 = VALUES(contagem_4),
           contagem_5 = VALUES(contagem_5), contagem_final = VALUES(contagem_final),
           saldo_sysemp = VALUES(saldo_sysemp), divergencia = VALUES(divergencia),
           analise = VALUES(analise), acao = VALUES(acao),
           produto_encontrado = VALUES(produto_encontrado),
           empresa_encontrada = VALUES(empresa_encontrada)`,
        [
          linha.periodo, linha.idEmpresa, linha.cdProduto, linha.almox, linha.marca,
          linha.contagem1, linha.contagem2, linha.contagem3, linha.contagem4, linha.contagem5,
          linha.contagemFinal, linha.saldoSysemp, linha.divergencia, linha.analise, linha.acao,
          produtoEncontrado, empresaEncontrada,
        ],
      );

      if (resultado.affectedRows === 1) inseridas++;
      else atualizadas++;
    }

    const periodos = new Set(validas.map((l) => l.periodo));
    const resultado: ResultadoImportacao = {
      totalLinhas: planilha.linhas.length,
      inseridas,
      atualizadas,
      ignoradas,
      produtosNaoEncontrados,
      empresasNaoEncontradas,
      custoTotal: null,
      periodo: periodos.size === 1 ? ([...periodos][0] ?? null) : null,
    };

    await registrarImportacao(conexao, { ...resultado, tipo: 'inventario_fisico', arquivo, usuarioId });

    return resultado;
  });
}
