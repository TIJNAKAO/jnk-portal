import 'express-async-errors'; // permite que handlers async lancem erro direto para o middleware de erro
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { avisosRouter } from './routes/avisos.js';
import { estoqueCurvaAbcRouter } from './routes/estoqueCurvaAbc.js';
import { faturamentoNotasFiscaisRouter } from './routes/faturamentoNotasFiscais.js';
import { filiaisRouter } from './routes/filiais.js';
import { healthRouter } from './routes/health.js';
import { integracaoExecucoesRouter } from './routes/integracaoExecucoes.js';
import { integracaoFilaRouter } from './routes/integracaoFila.js';
import { integracaoPainelRouter } from './routes/integracaoPainel.js';
import { integracaoParametrosFilaRouter } from './routes/integracaoParametrosFila.js';
import { logsAcessoRouter } from './routes/logsAcesso.js';
import { mercadoLivreRouter } from './routes/mercadoLivre.js';
import { parametrosRouter } from './routes/parametros.js';
import { perfisRouter } from './routes/perfis.js';
import { tiAuditoriaRouter } from './routes/tiAuditoria.js';
import { tiCatalogoProgramasRouter } from './routes/tiCatalogoProgramas.js';
import { tiDepartamentosRouter } from './routes/tiDepartamentos.js';
import { tiEquipamentosRouter } from './routes/tiEquipamentos.js';
import { tiGerarScriptsRouter } from './routes/tiGerarScripts.js';
import { tiInstalarProgramasRouter } from './routes/tiInstalarProgramas.js';
import { tiInventarioIngestaoRouter } from './routes/tiInventarioIngestao.js';
import { tiResponsaveisRouter } from './routes/tiResponsaveis.js';
import { tiSoftwaresAprovadosRouter } from './routes/tiSoftwaresAprovados.js';
import { usuariosRouter } from './routes/usuarios.js';

export const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json({ limit: '5mb' })); // acomoda foto_perfil_base64

// Downloads públicos (sem authTenant) — ex: o instalador do agente de
// inventário (apps/api/src/services/tiScripts.ts) baixa daqui via
// Invoke-WebRequest, sem token nenhum. Pasta na raiz do monorepo, fora de
// apps/api e apps/portal, pra não ficar dentro do build de nenhum dos
// dois. Mesma profundidade em dev (rodando de src/) e produção (rodando
// de dist/), então o caminho relativo funciona nos dois sem distinção.
const diretorioDownloads = join(dirname(fileURLToPath(import.meta.url)), '../../../downloads');
app.use('/downloads', express.static(diretorioDownloads));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/filiais', filiaisRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/perfis', perfisRouter);
app.use('/api/avisos', avisosRouter);
app.use('/api/logs-acesso', logsAcessoRouter);
app.use('/api/parametros', parametrosRouter);

// Endpoint do agente de inventário (máquina, não navegador) — autenticado
// por X-Api-Key dentro do próprio router, fora do JWT de sessão.
app.use('/api/ti/inventario', tiInventarioIngestaoRouter);

app.use('/api/ti/equipamentos', tiEquipamentosRouter);
app.use('/api/ti/departamentos', tiDepartamentosRouter);
app.use('/api/ti/responsaveis', tiResponsaveisRouter);
app.use('/api/ti/catalogo-programas', tiCatalogoProgramasRouter);
app.use('/api/ti/instalar-programas', tiInstalarProgramasRouter);
app.use('/api/ti/gerar-scripts', tiGerarScriptsRouter);
app.use('/api/ti/softwares-aprovados', tiSoftwaresAprovadosRouter);
app.use('/api/ti/auditoria-coleta', tiAuditoriaRouter);

app.use('/api/integracao/painel', integracaoPainelRouter);
app.use('/api/integracao/execucoes', integracaoExecucoesRouter);
app.use('/api/integracao/fila', integracaoFilaRouter);
app.use('/api/integracao/parametros-fila', integracaoParametrosFilaRouter);
// authTenant só nas rotas autenticadas deste router — /callback é acessado
// direto pelo navegador após o redirect do Mercado Livre, sem Bearer token.
app.use('/api/integracao/mercado-livre', mercadoLivreRouter);

app.use('/api/estoque/curva-abc', estoqueCurvaAbcRouter);

app.use('/api/faturamento/notas-fiscais', faturamentoNotasFiscaisRouter);

app.use((req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] erro não tratado:', err);

  // Erros do próprio Express/body-parser (JSON malformado, payload grande
  // demais etc.) já vêm com o status HTTP correto — preservar em vez de
  // sempre responder 500, que esconderia um erro de requisição do cliente.
  const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { status?: number })?.status;
  const statusValido = typeof status === 'number' && status >= 400 && status < 500;

  res.status(statusValido ? status! : 500).json({
    erro: statusValido ? (err as Error).message : 'Erro interno do servidor.',
  });
});
