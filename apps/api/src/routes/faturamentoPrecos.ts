import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { numeroXlsx } from '../services/numeroXlsx.js';
import {
  buscarFiltrosPrecos,
  buscarPrecosCompletos,
  buscarPrecosPaginados,
  type FiltroPrecos,
  type Ordenacao,
} from '../services/faturamentoPrecos.js';

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

faturamentoPrecosRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;

  // O escopo do usuário entra aqui igual à consulta da tela — a exportação
  // não é uma porta lateral que devolve o que a tela não mostraria.
  const linhas = await buscarPrecosCompletos(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    extrairOrdenacao(query),
  );

  const preco = { width: 16, style: { numFmt: '#,##0.0000' } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Precos');
  sheet.columns = [
    { header: 'EMPRESA', key: 'empresa', width: 40 },
    { header: 'CODIGO PRODUTO', key: 'id_produto', width: 16 },
    { header: 'DESCRICAO DO PRODUTO', key: 'nome_produto', width: 45 },
    { header: 'MARCA', key: 'marca', width: 20 },
    { header: 'NOME DA TABELA', key: 'nome_tabela', width: 24 },
    { header: 'NOME CONDICAO', key: 'nome_condicao', width: 26 },
    { header: 'PRECO TABELA', key: 'preco_tabela', ...preco },
    { header: 'PRECO PROMOCIONAL', key: 'preco_promocao', ...preco },
    { header: 'DATA INICIO PROMOCAO', key: 'data_inicio_promocao', width: 20 },
    { header: 'DATA TERMINO PROMOCAO', key: 'data_termino_promocao', width: 21 },
    { header: 'DATA INTEGRACAO', key: 'synced_at', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    linhas.map((l) => ({
      ...l,
      empresa: l.empresa?.trim() || String(l.id_empresa),
      // DECIMAL do mysql2 chega como string — sem isso o Excel grava
      // texto, não número (ver numeroXlsx.ts).
      preco_tabela: numeroXlsx(l.preco_tabela),
      preco_promocao: numeroXlsx(l.preco_promocao),
      synced_at: l.synced_at ? new Date(l.synced_at) : null,
    })),
  );
  sheet.getColumn('synced_at').numFmt = 'dd/mm/yyyy hh:mm';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="precos.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
