import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { buscarComparativoFull, buscarFiltrosFullMl, type FiltroFullMl } from '../services/estoqueFullMl.js';

export const estoqueFullMlRouter = Router();

const ROTA = '/estoque/full-ml';

estoqueFullMlRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroFullMl {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));

  return {
    data: query.data || undefined,
    empresas: empresas?.length ? empresas : undefined,
    marcas: lista(query.marcas),
    busca: query.busca?.trim() || undefined,
    soDivergencias: query.soDivergencias === 'true',
  };
}

estoqueFullMlRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosFullMl(await buscarEmpresasPermitidas(req.usuario!.id)));
});

estoqueFullMlRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const filtro = extrairFiltros(req.query as Record<string, string | undefined>);
  res.json(await buscarComparativoFull(filtro, await buscarEmpresasPermitidas(req.usuario!.id)));
});

const SITUACAO: Record<string, string> = {
  OK: 'OK',
  DIVERGENTE: 'DIVERGENTE',
  SO_ML: 'SO NO ML',
  SO_SYSEMP: 'SO NO SYSEMP',
};

estoqueFullMlRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  // Mesmo escopo da tela — a exportação não é porta lateral.
  const { linhas, dataRef } = await buscarComparativoFull(
    extrairFiltros(req.query as Record<string, string | undefined>),
    await buscarEmpresasPermitidas(req.usuario!.id),
  );

  const qtde = { width: 14, style: { numFmt: '#,##0' } };
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('FULL ML x SysEmp');
  sheet.columns = [
    { header: 'EMPRESA', key: 'empresa', width: 30 },
    { header: 'CODIGO AUXILIAR (SKU)', key: 'codigo', width: 22 },
    { header: 'DESCRICAO', key: 'descricao', width: 45 },
    { header: 'MARCA', key: 'marca', width: 20 },
    { header: 'QTDE ML DISPONIVEL', key: 'qtdeMl', ...qtde },
    { header: 'QTDE ML TOTAL', key: 'totalMl', ...qtde },
    { header: 'QTDE ML NAO DISPONIVEL', key: 'naoDisponivelMl', ...qtde },
    { header: 'QTDE SYSEMP', key: 'qtdeSysemp', ...qtde },
    { header: 'DIFERENCA', key: 'diferenca', ...qtde },
    { header: 'SITUACAO', key: 'situacao', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(linhas.map((l) => ({ ...l, situacao: SITUACAO[l.situacao] ?? l.situacao })));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="estoque-full-ml-${dataRef ?? 'sem-data'}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
