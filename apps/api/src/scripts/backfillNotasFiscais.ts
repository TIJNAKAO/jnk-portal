import { pool, withTransaction } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';
import { gravarNotaFiscal } from '../services/sysemp/entidades/notasFiscais.js';
import { sysempPost } from '../services/sysemp/client.js';

/**
 * Rebusca e regrava Notas Fiscais que foram consumidas pela versão antiga do
 * consumidor de fila — aquela que gravava só 8 colunas do item e descartava
 * todo o bloco fiscal (ICMS, ST, DIFAL, IPI, PIS, COFINS, comissão, frete
 * seller). Entre 19/08/2026 e 31/08/2026 isso afetou ~1.200 notas.
 *
 * Não passa pela fila de propósito: os eventos dessas notas já foram
 * consumidos e confirmados na SysEmp, então não voltariam sozinhos. O script
 * chama `/listarNotasFiscais` direto e regrava pelo consumidor corrigido.
 *
 * Idempotente: regravar uma nota já correta apenas reescreve os mesmos
 * valores. Seguro rodar de novo.
 *
 * Uso:
 *   npm run backfill:nf --workspace=apps/api -- --dry-run
 *   npm run backfill:nf --workspace=apps/api -- --limite 50
 *   npm run backfill:nf --workspace=apps/api
 */

interface NotaPendente extends RowDataPacket {
  id_nota_saida: number;
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limite = Number(argumento('limite') ?? 0);

  // Critério: item sem bloco fiscal. `valor_icms IS NULL` distingue com
  // precisão o que a versão antiga gravou (NULL) do que é imposto zero
  // legítimo (0.0000) — nota de balcão com ICMS zero tem a coluna
  // preenchida com zero, não nula.
  const [pendentes] = await pool.query<NotaPendente[]>(
    `SELECT DISTINCT it.id_nota_saida
     FROM sysemp_nota_fiscal_item it
     WHERE it.deleted = FALSE AND it.valor_icms IS NULL
     ORDER BY it.id_nota_saida
     ${limite > 0 ? 'LIMIT ?' : ''}`,
    limite > 0 ? [limite] : [],
  );

  console.log(`[backfill-nf] ${pendentes.length} nota(s) a regravar${dryRun ? ' (dry-run, nada será gravado)' : ''}.`);
  if (pendentes.length === 0 || dryRun) {
    await pool.end();
    return;
  }

  let ok = 0;
  let semRetorno = 0;
  const falhas: { id: number; erro: string }[] = [];

  for (const [indice, { id_nota_saida: idNota }] of pendentes.entries()) {
    try {
      const resposta = await sysempPost<{ retorno?: Record<string, unknown>[] }>('/listarNotasFiscais', {
        id_nota_saida: String(idNota),
      });
      const nota = resposta.retorno?.[0] ?? null;

      if (!nota) {
        semRetorno++;
        continue;
      }

      await withTransaction((connection) => gravarNotaFiscal(connection, nota, 'U', idNota));
      ok++;
    } catch (erro) {
      // Segue para as próximas: diferente da fila, aqui cada nota é
      // independente — não há ordem de eventos a preservar.
      falhas.push({ id: idNota, erro: (erro as Error).message });
    }

    if ((indice + 1) % 50 === 0) {
      console.log(`[backfill-nf] ${indice + 1}/${pendentes.length} — ok=${ok} sem_retorno=${semRetorno} falhas=${falhas.length}`);
    }
  }

  console.log(`\n[backfill-nf] concluído: ${ok} regravada(s), ${semRetorno} sem retorno da SysEmp, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    console.log('[backfill-nf] falhas:');
    for (const f of falhas.slice(0, 20)) console.log(`  id_nota_saida=${f.id}: ${f.erro}`);
    if (falhas.length > 20) console.log(`  ... e mais ${falhas.length - 20}.`);
  }

  await pool.end();
}

main().catch((erro) => {
  console.error('[backfill-nf] falhou:', erro);
  process.exit(1);
});
