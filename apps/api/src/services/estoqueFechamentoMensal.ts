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
 * Importação da planilha de Fechamento Mensal (a planilha contábil, que
 * já traz custo próprio). Ver Specs/spec_modulo_estoque.md, seção 3.4.
 *
 * A planilha só traz a razão social em EMPRESA. O `id_empresa` é
 * resolvido **aqui, uma vez**, contra `sysemp_empresa.razao_social`, e o
 * texto original fica gravado como auditoria. No portal PHP anterior esse
 * casamento por nome exato era refeito em cada tela que consumia a
 * tabela.
 *
 * Linha que não bate com o cadastro é importada assim mesmo, só marcada:
 * a informação contábil continua válida ainda que o produto não esteja
 * sincronizado.
 */

const COLUNAS = [
  'EMPRESA',
  'ID Produto',
  'Código Auxiliar',
  'Descrição',
  'NCM',
  'Un',
  'Marca',
  'Estoque',
  'Custo',
  'Total',
  'CST Venda',
  'Mês/Ano',
] as const;

export interface LinhaFechamentoValida {
  periodo: string;
  empresa: string;
  idProduto: number;
  codigoAuxiliar: string | null;
  descricao: string | null;
  ncm: string | null;
  unidade: string | null;
  marca: string | null;
  estoque: number | null;
  custo: number | null;
  total: number | null;
  cstVenda: string | null;
}

export function extrairLinhasFechamento(planilha: PlanilhaLida): {
  validas: LinhaFechamentoValida[];
  ignoradas: LinhaIgnorada[];
} {
  const col = mapearColunas(planilha.cabecalho, COLUNAS);
  const validas: LinhaFechamentoValida[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  planilha.linhas.forEach((linha, i) => {
    const numeroLinha = i + 2; // +1 pela base 1, +1 pelo cabeçalho
    const em = (nome: string): string | null => linha[col[nome] ?? -1] ?? null;

    const empresa = parseTexto(em('EMPRESA'));
    const idBruto = parseTexto(em('ID Produto'));
    const periodo = parsePeriodo(em('Mês/Ano'));

    if (!empresa || !idBruto || !/^\d+$/.test(idBruto)) {
      ignoradas.push({ linha: numeroLinha, motivo: 'EMPRESA ou ID Produto vazio/inválido.' });
      return;
    }
    if (!periodo) {
      ignoradas.push({ linha: numeroLinha, motivo: 'Mês/Ano inválido (esperado MM/AAAA).' });
      return;
    }

    validas.push({
      periodo,
      empresa,
      idProduto: Number(idBruto),
      codigoAuxiliar: parseTexto(em('Código Auxiliar')),
      descricao: parseTexto(em('Descrição')),
      ncm: parseTexto(em('NCM')),
      unidade: parseTexto(em('Un')),
      marca: parseTexto(em('Marca')),
      estoque: parseNumero(em('Estoque')),
      custo: parseNumero(em('Custo')),
      total: parseNumero(em('Total')),
      cstVenda: parseTexto(em('CST Venda')),
    });
  });

  return { validas, ignoradas };
}

/** Razão social (aparada) → id_empresa, para as empresas citadas na planilha. */
async function resolverEmpresas(
  conexao: PoolConnection,
  razoesSociais: string[],
): Promise<Map<string, number>> {
  if (razoesSociais.length === 0) return new Map();

  const marcadores = razoesSociais.map(() => '?').join(',');
  const [linhas] = await conexao.query<RowDataPacket[]>(
    `SELECT id_empresa, TRIM(razao_social) AS razao_social
       FROM sysemp_empresa WHERE TRIM(razao_social) IN (${marcadores})`,
    razoesSociais,
  );

  return new Map(linhas.map((l) => [String(l.razao_social), Number(l.id_empresa)]));
}

async function resolverProdutos(conexao: PoolConnection, ids: number[]): Promise<Set<number>> {
  const encontrados = new Set<number>();
  for (let i = 0; i < ids.length; i += 1000) {
    const bloco = ids.slice(i, i + 1000);
    const marcadores = bloco.map(() => '?').join(',');
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto FROM sysemp_produto WHERE id_produto IN (${marcadores})`,
      bloco,
    );
    for (const l of linhas) encontrados.add(Number(l.id_produto));
  }
  return encontrados;
}

export async function importarFechamentoMensal(
  buffer: Buffer,
  arquivo: string,
  usuarioId: number,
): Promise<ResultadoImportacao> {
  const planilha = await lerPlanilha(buffer);
  const { validas, ignoradas } = extrairLinhasFechamento(planilha);

  return withTransaction(async (conexao) => {
    const empresas = await resolverEmpresas(conexao, [...new Set(validas.map((l) => l.empresa))]);
    const produtos = await resolverProdutos(conexao, [...new Set(validas.map((l) => l.idProduto))]);

    let inseridas = 0;
    let atualizadas = 0;
    let produtosNaoEncontrados = 0;
    let empresasNaoEncontradas = 0;
    let custoTotal = 0;

    for (const linha of validas) {
      const idEmpresa = empresas.get(linha.empresa) ?? null;
      const produtoEncontrado = produtos.has(linha.idProduto);
      if (idEmpresa === null) empresasNaoEncontradas++;
      if (!produtoEncontrado) produtosNaoEncontrados++;
      custoTotal += linha.total ?? 0;

      // `affectedRows` do MySQL num upsert: 1 = inseriu, 2 = atualizou,
      // 0 = a linha já estava idêntica (reenvio da mesma planilha).
      const [resultado] = await conexao.query<ResultSetHeader>(
        `INSERT INTO estoque_fechamento_mensal
           (periodo, empresa, id_empresa, id_produto, codigo_auxiliar, descricao, ncm, unidade,
            marca, estoque, custo, total, cst_venda, produto_encontrado, empresa_encontrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id_empresa = VALUES(id_empresa), codigo_auxiliar = VALUES(codigo_auxiliar),
           descricao = VALUES(descricao), ncm = VALUES(ncm), unidade = VALUES(unidade),
           marca = VALUES(marca), estoque = VALUES(estoque), custo = VALUES(custo),
           total = VALUES(total), cst_venda = VALUES(cst_venda),
           produto_encontrado = VALUES(produto_encontrado),
           empresa_encontrada = VALUES(empresa_encontrada)`,
        [
          linha.periodo,
          linha.empresa,
          idEmpresa,
          linha.idProduto,
          linha.codigoAuxiliar,
          linha.descricao,
          linha.ncm,
          linha.unidade,
          linha.marca,
          linha.estoque,
          linha.custo,
          linha.total,
          linha.cstVenda,
          produtoEncontrado,
          idEmpresa !== null,
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
      custoTotal: validas.length > 0 ? custoTotal : null,
      periodo: periodos.size === 1 ? ([...periodos][0] ?? null) : null,
    };

    await registrarImportacao(conexao, {
      ...resultado,
      tipo: 'fechamento_estoque',
      arquivo,
      usuarioId,
    });

    return resultado;
  });
}
