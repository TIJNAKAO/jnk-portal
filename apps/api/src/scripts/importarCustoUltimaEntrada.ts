import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { COLUNAS_LEGADO, data, decimal, periodoParaData, texto } from '../services/comprasCustoLegado.js';

/**
 * Carga unica do historico de custo de ultima entrada, vindo do SQL Server
 * (RDW.dbo.KPL_ULT_COMPRA) via CSV gerado pelo bcp.
 *
 * Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
 *
 * NAO recalcula nada: importa o resultado que o legado ja calculou. O KPL
 * parou em 31/12/2024 e as tabelas TOTVS estao vazias, entao recalcular
 * significaria refazer sete anos de regra fiscal sem ganho nenhum.
 *
 * id_empresa fica sempre NULL e empresa_encontrada sempre FALSE: o de-para
 * texto da empresa ('JNK'/'NK2') -> id do SysEmp e conhecimento de negocio
 * que a Fase 1 nao resolve. O texto da empresa e preservado na coluna
 * `empresa`.
 *
 * Idempotente: grava com ON DUPLICATE KEY UPDATE sobre
 * (periodo, origem, empresa, cd_produto). Rodar de novo reescreve os mesmos
 * valores, nao duplica.
 *
 * Uso:
 *   npm run import:custo-entrada --workspace=apps/api -- --arquivo <caminho.csv>
 *   npm run import:custo-entrada --workspace=apps/api -- --arquivo <caminho.csv> --limite 1000
 */

const ORIGEM = 'SQLSERVER';
const SEPARADOR = '~|~';
const TAMANHO_LOTE = 200;

const COLUNAS_DESTINO = [
  'periodo', 'origem', 'empresa', 'id_empresa', 'empresa_encontrada',
  'cd_produto', 'id_produto', 'produto_encontrado',
  'descricao_produto', 'marca', 'ncm',
  'dt_movto', 'dt_emissao', 'documento', 'serie',
  'cd_clifor', 'dc_clifor', 'mun_clifor', 'uf_clifor',
  'qtde', 'vu_merc', 'aliq_icms', 'aliq_red_icms', 'vb_icms', 'vt_icms',
  'vt_icms_st', 'vt_st_gnre', 'aliq_ipi', 'vb_ipi', 'vt_ipi',
  'aliq_pis', 'vb_pis', 'vt_pis', 'aliq_cofins', 'vb_cofins', 'vt_cofins',
  'vt_nf', 'vt_custo', 'vu_custo', 'vt_fob_euro', 'cst',
];

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface ProdutoRow extends RowDataPacket {
  id_produto: number;
  codigo_auxiliar: string;
}

/**
 * De-para carregado UMA vez na memoria. Sao 11.509 produtos: cabe folgado, e
 * evita 742 mil consultas de resolucao.
 */
async function carregarDePara() {
  const [produtos] = await pool.query<ProdutoRow[]>(
    'SELECT id_produto, codigo_auxiliar FROM sysemp_produto WHERE codigo_auxiliar IS NOT NULL',
  );
  const porCodigo = new Map<string, number>();
  for (const p of produtos) {
    const chave = String(p.codigo_auxiliar).trim().toUpperCase();
    if (chave && !porCodigo.has(chave)) porCodigo.set(chave, p.id_produto);
  }
  return porCodigo;
}

async function main() {
  const arquivo = argumento('arquivo');
  if (!arquivo) {
    console.error('[custo] uso: --arquivo <caminho do csv gerado pelo bcp>');
    process.exitCode = 1;
    return;
  }
  const limite = Number(argumento('limite') ?? 0);

  const porCodigo = await carregarDePara();
  console.log(`[custo] de-para de produto carregado: ${porCodigo.size} codigos.`);

  const leitor = createInterface({ input: createReadStream(arquivo, 'utf8'), crlfDelay: Infinity });

  let lidas = 0;
  let gravadas = 0;
  let semProduto = 0;
  let lote: unknown[][] = [];

  const gravar = async () => {
    if (lote.length === 0) return;
    const placeholders = lote.map(() => `(${COLUNAS_DESTINO.map(() => '?').join(',')})`).join(',');
    const atualizacoes = COLUNAS_DESTINO
      .filter((col) => !['periodo', 'origem', 'empresa', 'cd_produto'].includes(col))
      .map((col) => `${col} = VALUES(${col})`)
      .join(', ');
    await pool.query(
      `INSERT INTO compras_custo_ultima_entrada (${COLUNAS_DESTINO.join(',')})
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE ${atualizacoes}`,
      lote.flat(),
    );
    gravadas += lote.length;
    lote = [];
  };

  for await (const linha of leitor) {
    if (!linha.trim()) continue;
    const c = linha.split(SEPARADOR);
    if (c.length !== COLUNAS_LEGADO.length) {
      throw new Error(`[custo] linha ${lidas + 1} tem ${c.length} campos, esperado ${COLUNAS_LEGADO.length}`);
    }
    lidas += 1;

    const cdProduto = texto(c[2]) ?? '';
    const idProduto = porCodigo.get(cdProduto.toUpperCase()) ?? null;
    if (idProduto === null) semProduto += 1;

    lote.push([
      periodoParaData(c[1] ?? ''), ORIGEM, texto(c[0]) ?? '', null, false,
      cdProduto, idProduto, idProduto !== null,
      texto(c[3]), texto(c[4]), texto(c[5]),
      data(c[6]), data(c[7]), texto(c[8]), texto(c[9]),
      texto(c[10]), texto(c[11]), texto(c[12]), texto(c[13]),
      decimal(c[14]), decimal(c[15]), decimal(c[16]), decimal(c[17]), decimal(c[18]), decimal(c[19]),
      decimal(c[20]), decimal(c[21]), decimal(c[22]), decimal(c[23]), decimal(c[24]),
      decimal(c[25]), decimal(c[26]), decimal(c[27]), decimal(c[28]), decimal(c[29]), decimal(c[30]),
      decimal(c[31]), decimal(c[32]), decimal(c[33]), decimal(c[34]), texto(c[35]),
    ]);

    if (lote.length >= TAMANHO_LOTE) {
      await gravar();
      if (gravadas % 50000 === 0) console.log(`[custo] ${gravadas} linhas gravadas...`);
    }
    if (limite > 0 && lidas >= limite) break;
  }
  await gravar();

  console.log(`[custo] lidas=${lidas} gravadas=${gravadas} sem_produto_no_cadastro=${semProduto}`);
}

main()
  .catch((erro) => {
    console.error('[custo] falhou:', erro);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
