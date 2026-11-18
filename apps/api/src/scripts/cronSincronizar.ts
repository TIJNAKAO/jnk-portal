import { pool } from '../config/database.js';
import { buscarEntidadeIntegracao } from '../services/integracaoRegistry.js';
import { finalizar, idExecucaoEmAndamento, iniciar } from '../services/integracaoLog.js';
import { avisarResultadoDoCron } from '../services/alertasIntegracao.js';

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

  // Mesma checagem usada pelo botao manual do Painel -- sem ela, o cron
  // agendado poderia disparar em cima de uma sincronizacao ainda em
  // andamento (manual ou de uma rodada anterior que ainda nao terminou).
  const idLogEmAndamento = await idExecucaoEmAndamento(entidade.chave);
  if (idLogEmAndamento) {
    console.log(`[cron] ${chave}: ja existe execucao em andamento (idLog=${idLogEmAndamento}), pulando esta rodada.`);
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
    await avisarResultadoDoCron({ chave, nome: entidade.nome, idLog, status: cancelado ? 'cancelado' : 'sucesso' });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    await finalizar(idLog, {
      status: 'erro',
      mensagem,
      duracaoMs: Date.now() - inicio,
    });
    await avisarResultadoDoCron({ chave, nome: entidade.nome, idLog, status: 'erro', mensagem });
    console.error(`[cron] ${chave} falhou:`, error);
    process.exitCode = 1;
  }
}

main().finally(() => pool.end());
