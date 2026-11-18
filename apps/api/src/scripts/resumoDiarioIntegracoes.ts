import { pool } from '../config/database.js';
import { enviarResumoDiario } from '../services/resumoIntegracoes.js';

/** Job SCHEDULED diário (`cron-resumo-integracoes`, 08:00): e-mail à TI com o resumo das integrações de ontem. */
async function main() {
  const enviado = await enviarResumoDiario();
  if (!enviado) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('[resumo] falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
