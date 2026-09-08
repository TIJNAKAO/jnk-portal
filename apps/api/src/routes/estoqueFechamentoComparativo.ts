import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { buscarPeriodosDisponiveis } from '../services/estoqueCustoFechamento.js';
import { buscarComparativo } from '../services/estoqueFechamentoComparativo.js';
import { buscarGruposPermitidos, exigirGrupoPermitido } from '../services/estoqueFechamentoGrupos.js';

export const estoqueFechamentoComparativoRouter = Router();

const ROTA = '/estoque/fechamento/comparativo';

estoqueFechamentoComparativoRouter.use(authTenant);

function exigirPeriodo(valor: unknown): string {
  const texto = String(valor ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(texto)) {
    const erro = new Error('Período inválido.') as Error & { statusCode: number };
    erro.statusCode = 400;
    throw erro;
  }
  return texto;
}

estoqueFechamentoComparativoRouter.get(
  '/filtros',
  requirePermissao(ROTA, 'podeVisualizar'),
  async (req, res) => {
    const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
    const [grupos, periodos] = await Promise.all([
      buscarGruposPermitidos(escopo),
      buscarPeriodosDisponiveis(),
    ]);

    res.json({ grupos: grupos.map((g) => g.grupo), periodos });
  },
);

estoqueFechamentoComparativoRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const periodo = exigirPeriodo(query.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

  res.json(await buscarComparativo(periodo, grupo, query.modo === 'divergencia'));
});
