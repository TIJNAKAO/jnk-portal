import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import {
  buscarCustoUltimaEntradaPaginado,
  buscarPeriodosDisponiveis,
} from '../services/comprasCustoUltimaEntrada.js';

export const comprasCustoUltimaEntradaRouter = Router();

const ROTA = '/compras/custo-ultima-entrada';

comprasCustoUltimaEntradaRouter.use(authTenant);

comprasCustoUltimaEntradaRouter.get('/periodos', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  res.json(await buscarPeriodosDisponiveis());
});

comprasCustoUltimaEntradaRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const pagina = Math.max(1, Number(req.query.pagina ?? 1));
  const tamanho = Math.min(200, Math.max(1, Number(req.query.tamanho ?? 50)));

  const resultado = await buscarCustoUltimaEntradaPaginado({
    periodo: (req.query.periodo as string) || undefined,
    empresa: (req.query.empresa as string) || undefined,
    produto: (req.query.produto as string) || undefined,
    pagina,
    tamanho,
  });

  res.json({ ...resultado, pagina, tamanho });
});
