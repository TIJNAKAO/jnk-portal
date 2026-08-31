import { pool } from '../config/database.js';
import * as integracaoLog from '../services/integracaoLog.js';
import { rodarEtlFatcom } from '../services/etl/fatcom.js';

/**
 * Recarrega `etl_fatcom` do zero para a origem `SYSEMP`.
 *
 * Necessário uma vez após a correção do ETL: as 24.305 linhas gravadas pela
 * versão anterior têm custo zerado, desconto zerado, taxa de marketplace
 * ausente e incluem notas canceladas — não há como consertá-las por upsert,
 * porque parte delas nem deveria existir.
 *
 * Apaga apenas `origem_dados = 'SYSEMP'`. Qualquer outra origem (o KPL, quando
 * for carregado) fica intacta.
 *
 * Atenção: a recarga refaz o congelamento do custo usando o custo médio de
 * hoje. Rodar de novo no futuro reescreveria o custo histórico — depois desta
 * reconstrução, use a sincronização normal, que preserva o custo já gravado.
 *
 * Uso: npm run etl:fatcom:recarregar --workspace=apps/api
 */
async function main() {
  const idLog = await integracaoLog.iniciar('etl_fatcom');
  const inicio = Date.now();
  console.log(`[recarga-fatcom] iniciada (id_log=${idLog}).`);

  try {
    const { qtde } = await rodarEtlFatcom(idLog, { recargaCompleta: true });
    await integracaoLog.finalizar(idLog, { status: 'sucesso', qtdeRegistros: qtde, duracaoMs: Date.now() - inicio });
    console.log(`[recarga-fatcom] concluída: ${qtde} linha(s) afetada(s) em ${Date.now() - inicio}ms.`);
  } catch (erro) {
    await integracaoLog.finalizar(idLog, {
      status: 'erro',
      mensagem: erro instanceof Error ? erro.message : String(erro),
      duracaoMs: Date.now() - inicio,
    });
    throw erro;
  } finally {
    await pool.end();
  }
}

main().catch((erro) => {
  console.error('[recarga-fatcom] falhou:', erro);
  process.exit(1);
});
