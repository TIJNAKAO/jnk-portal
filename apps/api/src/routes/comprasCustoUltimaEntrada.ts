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
  // `||` (nao `??`) pra cair no default tambem em NaN — `pagina=abc` vira
  // `Number('abc') = NaN`, que `??` nao trata. `Math.floor` garante inteiro:
  // sem ele, `pagina=2.5`/`tamanho=50.7` chegam decimais no LIMIT/OFFSET do
  // SQL e o MySQL rejeita com erro de sintaxe (500 pro cliente).
  const pagina = Math.max(1, Math.floor(Number(req.query.pagina) || 1));
  const tamanho = Math.min(200, Math.max(1, Math.floor(Number(req.query.tamanho) || 50)));

  const resultado = await buscarCustoUltimaEntradaPaginado({
    periodo: (req.query.periodo as string) || undefined,
    empresa: (req.query.empresa as string) || undefined,
    produto: (req.query.produto as string) || undefined,
    pagina,
    tamanho,
  });

  res.json({ ...resultado, pagina, tamanho });
});
