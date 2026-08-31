import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import {
  buscarCurvaAbcCompleta,
  buscarCurvaAbcPaginada,
  buscarFiltrosDisponiveis,
  type FiltroCurvaAbc,
} from '../services/estoqueCurvaAbc.js';

export const estoqueCurvaAbcRouter = Router();

const ROTA = '/estoque/curva-abc';

estoqueCurvaAbcRouter.use(authTenant);

function extrairFiltros(query: Record<string, string | undefined>): FiltroCurvaAbc {
  return {
    empresas: query.empresas ? query.empresas.split(',').map(Number).filter((n) => !Number.isNaN(n)) : undefined,
    marcas: query.marcas ? query.marcas.split(',').filter(Boolean) : undefined,
  };
}

estoqueCurvaAbcRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosDisponiveis(await buscarEmpresasPermitidas(req.usuario!.id)));
});

estoqueCurvaAbcRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const filtros = extrairFiltros(req.query as Record<string, string | undefined>);
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(req.query.tamanhoPagina) || 50));

  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const { linhas, total } = await buscarCurvaAbcPaginada(filtros, escopo, pagina, tamanhoPagina);
  res.json({ linhas, total, pagina, tamanhoPagina });
});

estoqueCurvaAbcRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const filtros = extrairFiltros(req.query as Record<string, string | undefined>);
  const linhas = await buscarCurvaAbcCompleta(filtros, await buscarEmpresasPermitidas(req.usuario!.id));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Curva ABC');
  sheet.columns = [
    { header: 'ORDEM', key: 'ordem', width: 8 },
    { header: 'DC FILIAL', key: 'dc_filial', width: 20 },
    { header: 'CD PRODUTO', key: 'cd_produto', width: 14 },
    { header: 'DC PRODUTO', key: 'dc_produto', width: 45 },
    { header: 'MARCA', key: 'marca', width: 14 },
    { header: 'KIT', key: 'kit', width: 8 },
    { header: 'VT CUSTO GERAL', key: 'vt_custo_geral', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'PER VALOR', key: 'per_valor', width: 12, style: { numFmt: '0.00' } },
    { header: 'CLASSE VALOR', key: 'classe_valor', width: 12 },
    { header: 'QTDE', key: 'qtde', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'VT CUSTO', key: 'vt_custo', width: 16, style: { numFmt: '#,##0.00' } },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    linhas.map((l) => ({
      ...l,
      kit: l.kit ? 'Sim' : 'Não',
    })),
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="curva-abc-estoque.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
