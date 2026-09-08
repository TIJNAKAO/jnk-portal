import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.js';

/**
 * Carga única do histórico de Fechamento de Custo do portal PHP anterior
 * (`jnakao-digital-ocean`) para este banco. Ver
 * Specs/spec_modulo_estoque.md, seção 3.12.
 *
 * Os dois bancos são clusters diferentes em produção, então abrimos um
 * segundo pool para o antigo, lido de variáveis de ambiente passadas na
 * execução — nenhuma credencial no repositório.
 *
 *   LEGADO_DB_HOST=... LEGADO_DB_USER=... LEGADO_DB_PASSWORD=... \
 *   LEGADO_DB_NAME=defaultdb \
 *   npm run migracao:fechamento --workspace=apps/api -- --dry-run
 *
 * Opções:
 *   --dry-run          não grava nada; relata contagens e chaves órfãs
 *   --periodo=AAAA-MM  carrega só um período
 *
 * Usa o **mesmo upsert das importações**: reexecutar não duplica.
 */

interface Opcoes {
  dryRun: boolean;
  periodo: string | null;
}

function lerOpcoes(argv: string[]): Opcoes {
  const periodoArg = argv.find((a) => a.startsWith('--periodo='))?.split('=')[1] ?? null;

  if (periodoArg !== null && !/^\d{4}-\d{2}$/.test(periodoArg)) {
    throw new Error('--periodo espera AAAA-MM (ex: --periodo=2026-07).');
  }

  return { dryRun: argv.includes('--dry-run'), periodo: periodoArg };
}

function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ${nome} não definida — ela aponta para o banco antigo.`);
  }
  return valor;
}

/**
 * Senha tem regra própria: string vazia é configuração legítima (root sem
 * senha num MySQL local), então o que se exige é a variável estar
 * **definida**, não preenchida. Tratar vazio como ausente impediria rodar
 * a carga contra um banco de desenvolvimento.
 */
function exigirSenha(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined) {
    throw new Error(`Variável de ambiente ${nome} não definida — ela aponta para o banco antigo.`);
  }
  return valor;
}

function conectarLegado() {
  return mysql.createPool({
    host: exigirEnv('LEGADO_DB_HOST'),
    port: Number(process.env.LEGADO_DB_PORT ?? 3306),
    user: exigirEnv('LEGADO_DB_USER'),
    password: exigirSenha('LEGADO_DB_PASSWORD'),
    database: exigirEnv('LEGADO_DB_NAME'),
    timezone: '-03:00',
    connectionLimit: 4,
    ssl: process.env.LEGADO_DB_CA_CERT
      ? { ca: process.env.LEGADO_DB_CA_CERT, rejectUnauthorized: true }
      : undefined,
  });
}

/** Cláusula de período, aplicada igual em todas as tabelas. */
function filtroPeriodo(opcoes: Opcoes, coluna = 'periodo'): { where: string; params: string[] } {
  if (!opcoes.periodo) return { where: '', params: [] };
  return { where: ` WHERE ${coluna} = ?`, params: [`${opcoes.periodo}-01`] };
}

const TAMANHO_LOTE = 500;

async function emLotes<T>(itens: T[], acao: (lote: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    await acao(itens.slice(i, i + TAMANHO_LOTE));
  }
}

async function main() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const legado = conectarLegado();

  console.log(
    `Carga do Fechamento de Custo — ${opcoes.dryRun ? 'DRY RUN (nada será gravado)' : 'GRAVANDO'}` +
      `${opcoes.periodo ? `, período ${opcoes.periodo}` : ', todos os períodos'}`,
  );

  try {
    // ---- Cadastro do destino, para o dry-run apontar chaves órfãs ----
    const [empresasDestino] = await pool.query<RowDataPacket[]>(
      'SELECT id_empresa, TRIM(razao_social) AS razao_social FROM sysemp_empresa',
    );
    const idEmpresaPorRazao = new Map(
      empresasDestino.map((e) => [String(e.razao_social), Number(e.id_empresa)]),
    );
    const idsEmpresa = new Set(empresasDestino.map((e) => Number(e.id_empresa)));

    const [produtosDestino] = await pool.query<RowDataPacket[]>(
      'SELECT id_produto, codigo_auxiliar FROM sysemp_produto',
    );
    const idsProduto = new Set(produtosDestino.map((p) => Number(p.id_produto)));
    const codigosProduto = new Set(
      produtosDestino.filter((p) => p.codigo_auxiliar !== null).map((p) => String(p.codigo_auxiliar)),
    );

    // ---- 1. Fechamento Mensal ----
    const f = filtroPeriodo(opcoes);
    const [fechamento] = await legado.query<RowDataPacket[]>(
      `SELECT periodo, empresa, id_produto, codigo_auxiliar, descricao, ncm, unidade, marca,
              estoque, custo, total, cst_venda, produto_encontrado
         FROM tb_fechamento_estoque_mensal${f.where}`,
      f.params,
    );

    const razoesOrfas = new Set(
      fechamento.map((r) => String(r.empresa).trim()).filter((razao) => !idEmpresaPorRazao.has(razao)),
    );
    const produtosOrfaos = fechamento.filter((r) => !idsProduto.has(Number(r.id_produto))).length;

    console.log(
      `\ntb_fechamento_estoque_mensal: ${fechamento.length} linha(s)` +
        `\n  razões sociais sem empresa no destino: ${razoesOrfas.size}` +
        (razoesOrfas.size > 0 ? ` → ${[...razoesOrfas].slice(0, 10).join(' | ')}` : '') +
        `\n  linhas com id_produto sem cadastro no destino: ${produtosOrfaos}`,
    );

    if (!opcoes.dryRun) {
      await emLotes(fechamento, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_fechamento_mensal
             (periodo, empresa, id_empresa, id_produto, codigo_auxiliar, descricao, ncm, unidade,
              marca, estoque, custo, total, cst_venda, produto_encontrado, empresa_encontrada)
           VALUES ${marcadores}
           ON DUPLICATE KEY UPDATE
             id_empresa = VALUES(id_empresa), codigo_auxiliar = VALUES(codigo_auxiliar),
             descricao = VALUES(descricao), ncm = VALUES(ncm), unidade = VALUES(unidade),
             marca = VALUES(marca), estoque = VALUES(estoque), custo = VALUES(custo),
             total = VALUES(total), cst_venda = VALUES(cst_venda),
             produto_encontrado = VALUES(produto_encontrado),
             empresa_encontrada = VALUES(empresa_encontrada)`,
          lote.flatMap((r) => {
            const razao = String(r.empresa).trim();
            const idEmpresa = idEmpresaPorRazao.get(razao) ?? null;
            return [
              r.periodo, razao, idEmpresa, r.id_produto, r.codigo_auxiliar, r.descricao, r.ncm,
              r.unidade, r.marca, r.estoque, r.custo, r.total, r.cst_venda,
              idsProduto.has(Number(r.id_produto)), idEmpresa !== null,
            ];
          }),
        );
      });
    }

    // ---- 2. Estoque FULL ----
    const [full] = await legado.query<RowDataPacket[]>(
      `SELECT periodo, id_empresa, conta, tipo_saldo, cd_produto, qtde
         FROM tb_estoque_full_importado${f.where}`,
      f.params,
    );

    console.log(
      `\ntb_estoque_full_importado: ${full.length} linha(s)` +
        `\n  linhas com empresa sem cadastro no destino: ${full.filter((r) => !idsEmpresa.has(Number(r.id_empresa))).length}` +
        `\n  linhas com cd_produto sem cadastro no destino: ${full.filter((r) => !codigosProduto.has(String(r.cd_produto))).length}`,
    );

    if (!opcoes.dryRun) {
      await emLotes(full, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_full_importado
             (periodo, id_empresa, conta, tipo_saldo, cd_produto, qtde, produto_encontrado, empresa_encontrada)
           VALUES ${marcadores}
           ON DUPLICATE KEY UPDATE
             qtde = VALUES(qtde), produto_encontrado = VALUES(produto_encontrado),
             empresa_encontrada = VALUES(empresa_encontrada)`,
          lote.flatMap((r) => [
            r.periodo, r.id_empresa, r.conta, r.tipo_saldo, r.cd_produto, r.qtde,
            codigosProduto.has(String(r.cd_produto)), idsEmpresa.has(Number(r.id_empresa)),
          ]),
        );
      });
    }

    // ---- 3. Inventário Físico ----
    const [inventario] = await legado.query<RowDataPacket[]>(
      `SELECT periodo, id_empresa, cd_produto, almox, marca, contagem_1, contagem_2, contagem_3,
              contagem_4, contagem_5, contagem_final, saldo_sysemp, divergencia, analise, acao
         FROM tb_inventario_fisico${f.where}`,
      f.params,
    );

    console.log(`\ntb_inventario_fisico: ${inventario.length} linha(s)`);

    if (!opcoes.dryRun) {
      await emLotes(inventario, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_inventario_fisico
             (periodo, id_empresa, cd_produto, almox, marca, contagem_1, contagem_2, contagem_3,
              contagem_4, contagem_5, contagem_final, saldo_sysemp, divergencia, analise, acao,
              produto_encontrado, empresa_encontrada)
           VALUES ${marcadores}
           ON DUPLICATE KEY UPDATE
             marca = VALUES(marca), contagem_1 = VALUES(contagem_1), contagem_2 = VALUES(contagem_2),
             contagem_3 = VALUES(contagem_3), contagem_4 = VALUES(contagem_4),
             contagem_5 = VALUES(contagem_5), contagem_final = VALUES(contagem_final),
             saldo_sysemp = VALUES(saldo_sysemp), divergencia = VALUES(divergencia),
             analise = VALUES(analise), acao = VALUES(acao),
             produto_encontrado = VALUES(produto_encontrado),
             empresa_encontrada = VALUES(empresa_encontrada)`,
          lote.flatMap((r) => [
            r.periodo, r.id_empresa, r.cd_produto, r.almox ?? '', r.marca,
            r.contagem_1, r.contagem_2, r.contagem_3, r.contagem_4, r.contagem_5,
            r.contagem_final, r.saldo_sysemp, r.divergencia, r.analise, r.acao,
            codigosProduto.has(String(r.cd_produto)), idsEmpresa.has(Number(r.id_empresa)),
          ]),
        );
      });
    }

    // ---- 4. Cálculo de custo já rodado ----
    const [custo] = await legado.query<RowDataPacket[]>(
      `SELECT data_calculo_custo, periodo, grupo_empresa, id_empresa, nome_empresa, origem,
              id_produto, codigo_auxiliar, descricao_produto, marca, unidade, ncm, conta,
              tipo_saldo, qtde, vu_custo_estoque, vu_custo_venda, vu_custo, valor_custo_total
         FROM tb_calculo_custo_fechamento${f.where}`,
      f.params,
    );

    console.log(`\ntb_calculo_custo_fechamento: ${custo.length} linha(s)`);

    if (!opcoes.dryRun) {
      // A tabela não tem chave única — a idempotência vem de apagar o par
      // (periodo, grupo) antes de inserir, igual ao que o recálculo faz.
      // A chave do Map é string só para deduplicar; o DELETE recebe os
      // valores ORIGINAIS. `periodo` vem do driver como Date, e um Date
      // interpolado em string vira "Wed Jul 01 2026 …", que o MySQL
      // recusa com ER_TRUNCATED_WRONG_VALUE.
      const pares = new Map<string, { periodo: unknown; grupo: unknown }>();
      for (const r of custo) {
        pares.set(`${String(r.periodo)}|${String(r.grupo_empresa)}`, {
          periodo: r.periodo,
          grupo: r.grupo_empresa,
        });
      }

      for (const { periodo, grupo } of pares.values()) {
        await pool.query('DELETE FROM estoque_custo_fechamento WHERE periodo = ? AND grupo_empresa = ?', [
          periodo,
          grupo,
        ]);
      }

      await emLotes(custo, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_custo_fechamento
             (data_calculo_custo, periodo, grupo_empresa, id_empresa, nome_empresa, origem,
              id_produto, codigo_auxiliar, descricao_produto, marca, unidade, ncm, conta,
              tipo_saldo, qtde, vu_custo_estoque, vu_custo_venda, vu_custo, valor_custo_total)
           VALUES ${marcadores}`,
          lote.flatMap((r) => [
            r.data_calculo_custo, r.periodo, r.grupo_empresa, r.id_empresa, r.nome_empresa, r.origem,
            r.id_produto, r.codigo_auxiliar, r.descricao_produto, r.marca, r.unidade, r.ncm, r.conta,
            r.tipo_saldo, r.qtde, r.vu_custo_estoque, r.vu_custo_venda, r.vu_custo, r.valor_custo_total,
          ]),
        );
      });
    }

    // ---- 5. Log de importação ----
    const logFiltro = filtroPeriodo(opcoes);
    const [logs] = await legado.query<RowDataPacket[]>(
      `SELECT tipo, arquivo, periodo, total_linhas, inseridas, atualizadas, ignoradas,
              produtos_nao_encontrados, empresas_nao_encontradas, custo_total, observacoes,
              usuario, executado_em
         FROM tb_importacao_log${logFiltro.where}`,
      logFiltro.params,
    );

    console.log(`\ntb_importacao_log: ${logs.length} linha(s)`);

    if (!opcoes.dryRun) {
      // O log antigo guardava o nome do usuário em texto; aqui a coluna é
      // uma FK. Não dá para adivinhar o id, então fica nulo e o nome vai
      // para observacoes, preservando quem executou.
      await pool.query('DELETE FROM estoque_importacao_log WHERE usuario_id IS NULL');

      await emLotes(logs, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_importacao_log
             (tipo, arquivo, periodo, total_linhas, inseridas, atualizadas, ignoradas,
              produtos_nao_encontrados, empresas_nao_encontradas, custo_total, observacoes,
              usuario_id, executado_em)
           VALUES ${marcadores}`,
          lote.flatMap((r) => [
            r.tipo, r.arquivo, r.periodo, r.total_linhas, r.inseridas, r.atualizadas, r.ignoradas,
            r.produtos_nao_encontrados, r.empresas_nao_encontradas, r.custo_total,
            [r.usuario ? `Executado no portal anterior por: ${String(r.usuario)}` : null, r.observacoes]
              .filter(Boolean)
              .join('\n') || null,
            null,
            r.executado_em,
          ]),
        );
      });
    }

    console.log(
      opcoes.dryRun
        ? '\nDry run concluído. Confira as chaves órfãs acima antes de rodar sem --dry-run.'
        : '\nCarga concluída.',
    );
  } finally {
    await legado.end();
    await pool.end();
  }
}

main().catch((erro) => {
  console.error('Falha na carga:', erro);
  process.exit(1);
});
