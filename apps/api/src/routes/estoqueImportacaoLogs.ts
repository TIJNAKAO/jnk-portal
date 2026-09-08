import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { listarImportacoes, type TipoImportacao } from '../services/estoqueImportacaoLog.js';

export const estoqueImportacaoLogsRouter = Router();

const ROTA = '/estoque/fechamento/logs';

const TIPOS_VALIDOS: TipoImportacao[] = ['fechamento_estoque', 'estoque_full', 'inventario_fisico'];

estoqueImportacaoLogsRouter.use(authTenant);

estoqueImportacaoLogsRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const pedido = String(req.query.tipo ?? '');
  // Lista fechada: o valor vem da query string e entra numa cláusula SQL.
  const tipo = TIPOS_VALIDOS.find((t) => t === pedido);

  res.json({ linhas: await listarImportacoes(tipo) });
});
