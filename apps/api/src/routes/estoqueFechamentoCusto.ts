import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { buscarPeriodosDisponiveis, calcularCustoFechamento } from '../services/estoqueCustoFechamento.js';
import { buscarGruposPermitidos, exigirGrupoPermitido } from '../services/estoqueFechamentoGrupos.js';
import { obterParametrosFechamento } from '../services/estoqueFechamentoParametros.js';

export const estoqueFechamentoCustoRouter = Router();

const ROTA = '/estoque/fechamento/custo';

estoqueFechamentoCustoRouter.use(authTenant);

/** Período chega como AAAA-MM-01; recusa qualquer outra coisa antes do SQL. */
function exigirPeriodo(valor: unknown): string {
  const texto = String(valor ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(texto)) {
    const erro = new Error('Período inválido.') as Error & { statusCode: number };
    erro.statusCode = 400;
    throw erro;
  }
  return texto;
}

estoqueFechamentoCustoRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const [grupos, periodos] = await Promise.all([
    buscarGruposPermitidos(escopo),
    buscarPeriodosDisponiveis(),
  ]);

  res.json({ grupos: grupos.map((g) => g.grupo), periodos });
});

// Calcular grava tabela (apaga o cálculo anterior do par e regrava), por
// isso pede podeCriar e não podeVisualizar. Não é consulta.
estoqueFechamentoCustoRouter.post('/calcular', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const periodo = exigirPeriodo(req.body?.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(req.body?.grupo ?? ''), escopo);
  const parametros = await obterParametrosFechamento();

  res.json({
    resumo: await calcularCustoFechamento(periodo, grupo, parametros),
    percentualCustoVenda: parametros.percentualCustoVenda,
  });
});
