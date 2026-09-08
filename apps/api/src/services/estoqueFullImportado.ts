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
 * Importação da planilha de Estoque FULL — o saldo por conta/canal
 * (Amazon, Shopee, Axado, lojas físicas). Ver
 * Specs/spec_modulo_estoque.md, seção 3.4.
 *
 * Diferente do Fechamento Mensal, esta planilha **só tem quantidade**:
 * o custo é atribuído depois, no Cálculo de Custo.
 *
 * `DC_PRODUTO` é exigida no cabeçalho mas não é gravada — a descrição de
 * referência é a do cadastro (`sysemp_produto`), não a que alguém digitou
 * na planilha.
 */

const COLUNAS = ['ID_EMPRESA', 'CONTA', 'PERIODO', 'TIPO_SALDO', 'CD_PRODUTO', 'DC_PRODUTO', 'QTDE'] as const;

export interface LinhaFullValida {
  periodo: string;
  idEmpresa: number;
  conta: string;
  tipoSaldo: string;
  cdProduto: string;
  qtde: number | null;
}

/** Vazio ou "-" na planilha significa saldo sem classificação específica. */
export function normalizarTipoSaldo(valor: string | null): string {
  const texto = valor?.trim() ?? '';
  return texto === '' || texto === '-' ? 'Disponível para Faturamento' : texto;
}

export function extrairLinhasFull(planilha: PlanilhaLida): {
  validas: LinhaFullValida[];
  ignoradas: LinhaIgnorada[];
} {
  const col = mapearColunas(planilha.cabecalho, COLUNAS);
  const validas: LinhaFullValida[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  planilha.linhas.forEach((linha, i) => {
    const numeroLinha = i + 2;
    const em = (nome: string): string | null => linha[col[nome] ?? -1] ?? null;

    const idBruto = parseTexto(em('ID_EMPRESA'));
    const conta = parseTexto(em('CONTA'));
    const cdProduto = parseTexto(em('CD_PRODUTO'));
    const periodo = parsePeriodo(em('PERIODO'));

    if (!idBruto || !/^\d+$/.test(idBruto) || !conta || !cdProduto) {
      ignoradas.push({ linha: numeroLinha, motivo: 'ID_EMPRESA, CONTA ou CD_PRODUTO vazio/inválido.' });
      return;
    }
    if (!periodo) {
      ignoradas.push({ linha: numeroLinha, motivo: 'PERIODO inválido (esperado MM/AAAA).' });
      return;
    }

    validas.push({
      periodo,
      idEmpresa: Number(idBruto),
      conta,
      tipoSaldo: normalizarTipoSaldo(em('TIPO_SALDO')),
      cdProduto,
      qtde: parseNumero(em('QTDE')),
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

export async function importarEstoqueFull(
  buffer: Buffer,
  arquivo: string,
  usuarioId: number,
): Promise<ResultadoImportacao> {
  const planilha = await lerPlanilha(buffer);
  const { validas, ignoradas } = extrairLinhasFull(planilha);

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
        `INSERT INTO estoque_full_importado
           (periodo, id_empresa, conta, tipo_saldo, cd_produto, qtde, produto_encontrado, empresa_encontrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           qtde = VALUES(qtde),
           produto_encontrado = VALUES(produto_encontrado),
           empresa_encontrada = VALUES(empresa_encontrada)`,
        [
          linha.periodo,
          linha.idEmpresa,
          linha.conta,
          linha.tipoSaldo,
          linha.cdProduto,
          linha.qtde,
          produtoEncontrado,
          empresaEncontrada,
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
      custoTotal: null, // esta planilha não tem custo
      periodo: periodos.size === 1 ? ([...periodos][0] ?? null) : null,
    };

    await registrarImportacao(conexao, { ...resultado, tipo: 'estoque_full', arquivo, usuarioId });

    return resultado;
  });
}
