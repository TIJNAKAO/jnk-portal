import { pool } from '../config/database.js';
import { buscarEntidadeIntegracao } from '../services/integracaoRegistry.js';
import { finalizar, iniciar } from '../services/integracaoLog.js';

/**
 * Entrada usada pelos jobs SCHEDULED do App Platform — roda uma sincronização
 * síncrona (sem executarEmBackground, que é fire-and-forget e não serve pra
 * um processo que precisa esperar terminar antes de sair). Mesmo registro
 * central usado pelo botão manual do Painel (services/integracaoRegistry.ts).
 */
async function main() {
  const chave = process.argv[2];
  if (!chave) {
    console.error('[cron] uso: tsx cronSincronizar.ts <chave-entidade>');
    process.exitCode = 1;
    return;
  }

  const entidade = buscarEntidadeIntegracao(chave);
  if (!entidade) {
    console.error(`[cron] entidade '${chave}' nao encontrada no registro.`);
    process.exitCode = 1;
    return;
  }

  const idLog = await iniciar(entidade.chave);
  const inicio = Date.now();
  try {
    const { qtde, cancelado } = await entidade.sincronizar(idLog);
    await finalizar(idLog, {
      status: cancelado ? 'cancelado' : 'sucesso',
      qtdeRegistros: qtde,
      duracaoMs: Date.now() - inicio,
    });
    console.log(`[cron] ${chave}: ${qtde} registro(s) processado(s).`);
  } catch (error) {
    await finalizar(idLog, {
      status: 'erro',
      mensagem: error instanceof Error ? error.message : String(error),
      duracaoMs: Date.now() - inicio,
    });
    console.error(`[cron] ${chave} falhou:`, error);
    process.exitCode = 1;
  }
}

main().finally(() => pool.end());
