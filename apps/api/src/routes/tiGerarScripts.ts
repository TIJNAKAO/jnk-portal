import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { obterParametro } from '../services/parametros.js';
import { gerarScriptAtualizarProgramas, gerarScriptConfigurarAgente } from '../services/tiScripts.js';

export const tiGerarScriptsRouter = Router();

const ROTA = '/ti/gerar-scripts';

tiGerarScriptsRouter.use(authTenant);

tiGerarScriptsRouter.get('/atualizar-programas', requirePermissao(ROTA, 'podeVisualizar'), (_req, res) => {
  const script = gerarScriptAtualizarProgramas();
  res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
  res.setHeader('Content-Disposition', 'attachment; filename="atualizar_programas.ps1"');
  res.send(script);
});

// Depende de TI → Parâmetros estar configurado (URL de download do agente,
// URL da API de ingestão e o token do agente) — sem isso não tem como
// montar um script funcional, então recusa em vez de gerar algo quebrado.
tiGerarScriptsRouter.get('/configurar-agente', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [agenteUrl, apiUrl, apiKey] = await Promise.all([
    obterParametro('TI', 'AGENTE_DOWNLOAD_URL'),
    obterParametro('TI', 'AGENTE_API_URL'),
    obterParametro('TI', 'AGENTE_API_KEY'),
  ]);

  if (!agenteUrl || !apiUrl || !apiKey) {
    res.status(422).json({
      erro:
        'Configure a URL de download do agente, a URL da API e o token em TI → Parâmetros antes de gerar este script.',
    });
    return;
  }

  const script = gerarScriptConfigurarAgente({ agenteUrl, apiUrl, apiKey });
  res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
  res.setHeader('Content-Disposition', 'attachment; filename="configurar_agente.ps1"');
  res.send(script);
});
