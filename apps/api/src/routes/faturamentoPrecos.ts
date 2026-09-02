import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { buscarFiltrosPrecos, buscarPrecosPaginados, type FiltroPrecos, type Ordenacao } from '../services/faturamentoPrecos.js';

export const faturamentoPrecosRouter = Router();

const ROTA = '/faturamento/precos';

faturamentoPrecosRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroPrecos {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));

  return {
    empresas: empresas?.length ? empresas : undefined,
    marcas: lista(query.marcas),
    busca: query.busca?.trim() || undefined,
    soPromocao: query.soPromocao === 'true',
  };
}

function extrairOrdenacao(query: Record<string, string | undefined>): Ordenacao {
  return { coluna: query.ordenarPor, direcao: query.direcao === 'desc' ? 'desc' : 'asc' };
}

faturamentoPrecosRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosPrecos(await buscarEmpresasPermitidas(req.usuario!.id)));
});

faturamentoPrecosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total } = await buscarPrecosPaginados(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    pagina,
    tamanhoPagina,
    extrairOrdenacao(query),
  );

  res.json({ linhas, total, pagina, tamanhoPagina });
});
