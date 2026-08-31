import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { buscarFiltrosDisponiveis, buscarResumo, type FiltroFaturamento } from '../services/faturamento.js';

export const faturamentoDashboardRouter = Router();

const ROTA = '/faturamento/dashboard';

faturamentoDashboardRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroFaturamento {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => !Number.isNaN(n));

  return {
    origens: lista(query.origens),
    empresas: empresas?.length ? empresas : undefined,
    marcas: lista(query.marcas),
    canais: lista(query.canais),
    dataInicio: query.dataInicio || undefined,
    dataFim: query.dataFim || undefined,
    tipoOperacao: query.tipoOperacao === 'E' || query.tipoOperacao === 'ambos' ? query.tipoOperacao : 'S',
    geraFinanceiro: query.geraFinanceiro === 'S' ? true : query.geraFinanceiro === 'N' ? false : undefined,
  };
}

faturamentoDashboardRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosDisponiveis(await buscarEmpresasPermitidas(req.usuario!.id)));
});

/**
 * Um endpoint só devolve todas as agregações do painel. São seis recortes do
 * mesmo filtro — buscá-los separadamente seriam seis idas ao servidor para
 * montar uma tela que só faz sentido inteira.
 */
faturamentoDashboardRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const filtros = extrairFiltros(req.query as Record<string, string | undefined>);
  res.json(await buscarResumo(filtros, await buscarEmpresasPermitidas(req.usuario!.id)));
});
