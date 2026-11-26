import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../../middlewares/authTenant.js';
import { requirePermissao } from '../../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../../services/escopoEmpresas.js';
import { buscarFiltrosDisponiveis } from '../../services/faturamento.js';
import {
  buscarLinhasCompletas,
  buscarLinhasPaginadas,
  buscarRanking,
  buscarResumo,
  contarLinhas,
  faixaValida,
  type FiltroMcVendas,
  type LinhaMcVendas,
  type OrdenacaoMc,
} from '../../services/dash/mcVendas.js';

export const dashMcVendasRouter = Router();

const ROTA = '/dash/mc-vendas';

/** Mesmo teto do Relatório de Notas Fiscais: acima disto o Excel não cabe numa request. */
const LIMITE_EXPORTACAO = 100_000;

dashMcVendasRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroMcVendas {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => !Number.isNaN(n));

  return {
    empresas: empresas?.length ? empresas : undefined,
    marcas: lista(query.marcas),
    canais: lista(query.canais),
    dataInicio: query.dataInicio || undefined,
    dataFim: query.dataFim || undefined,
    busca: query.busca || undefined,
    faixa: faixaValida(query.faixa),
  };
}

function extrairOrdenacao(query: Record<string, string | undefined>): OrdenacaoMc {
  return { coluna: query.ordenarPor, direcao: query.direcao === 'asc' ? 'asc' : 'desc' };
}

dashMcVendasRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosDisponiveis(await buscarEmpresasPermitidas(req.usuario!.id)));
});

/** Cards, vendas por canal e top produtos: três recortes do mesmo filtro, numa ida só. */
dashMcVendasRouter.get('/resumo', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const filtros = extrairFiltros(req.query as Record<string, string | undefined>);
  res.json(await buscarResumo(filtros, await buscarEmpresasPermitidas(req.usuario!.id)));
});

dashMcVendasRouter.get('/ranking', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const filtros = extrairFiltros(req.query as Record<string, string | undefined>);
  res.json({ itens: await buscarRanking(filtros, await buscarEmpresasPermitidas(req.usuario!.id)) });
});

dashMcVendasRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total } = await buscarLinhasPaginadas(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    pagina,
    tamanhoPagina,
    extrairOrdenacao(query),
  );
  res.json({ linhas, total, pagina, tamanhoPagina });
});

const MOEDA = '#,##0.00';
const PERCENTUAL = '0.00';

const COLUNAS_EXCEL: Partial<ExcelJS.Column>[] = [
  { header: 'EMPRESA', key: 'empresa', width: 32 },
  { header: 'DATA', key: 'data', width: 12 },
  { header: 'NF', key: 'nf', width: 11 },
  { header: 'SÉRIE', key: 'serie', width: 8 },
  { header: 'UF', key: 'uf', width: 6 },
  { header: 'CANAL', key: 'canal', width: 28 },
  { header: 'CÓD. PRODUTO', key: 'cdProduto', width: 15 },
  { header: 'DESCRIÇÃO PRODUTO', key: 'produto', width: 45 },
  { header: 'MARCA', key: 'marca', width: 16 },
  { header: 'QTDE', key: 'qtde', width: 10, style: { numFmt: MOEDA } },
  { header: 'VALOR UNITÁRIO', key: 'valorUnitario', width: 16, style: { numFmt: MOEDA } },
  { header: 'VALOR VENDA', key: 'vendas', width: 16, style: { numFmt: MOEDA } },
  { header: 'CUSTO LÍQUIDO UNIT.', key: 'custoLiquidoUnitario', width: 20, style: { numFmt: MOEDA } },
  { header: 'CUSTO LÍQUIDO', key: 'custoLiquido', width: 16, style: { numFmt: MOEDA } },
  { header: 'ICMS VALOR', key: 'icms', width: 14, style: { numFmt: MOEDA } },
  { header: 'ICMS %', key: 'percIcms', width: 10, style: { numFmt: PERCENTUAL } },
  { header: 'PIS/COFINS VALOR', key: 'pisCofins', width: 18, style: { numFmt: MOEDA } },
  { header: 'PIS/COFINS %', key: 'percPisCofins', width: 14, style: { numFmt: PERCENTUAL } },
  { header: 'DIFAL VALOR', key: 'difal', width: 14, style: { numFmt: MOEDA } },
  { header: 'DIFAL %', key: 'percDifal', width: 10, style: { numFmt: PERCENTUAL } },
  { header: 'TARIFA CANAL', key: 'tarifa', width: 15, style: { numFmt: MOEDA } },
  { header: 'FRETE VENDEDOR', key: 'frete', width: 16, style: { numFmt: MOEDA } },
  { header: 'MC R$', key: 'mc', width: 14, style: { numFmt: MOEDA } },
  { header: 'MC %', key: 'percMc', width: 10, style: { numFmt: PERCENTUAL } },
];

/** `2026-11-26` → `26/11/2026`, sem passar por `Date`: data de NF não tem fuso. */
function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function linhaParaExcel(l: LinhaMcVendas) {
  // Custo e MC nulos ficam em branco: zero seria lido como "margem nula".
  return { ...l, data: dataBr(l.data) };
}

dashMcVendasRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const filtros = extrairFiltros(query);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);

  // Conta antes de buscar: carregar 500 mil linhas só para recusá-las derrubaria a API.
  const total = await contarLinhas(filtros, escopo);
  if (total > LIMITE_EXPORTACAO) {
    res.status(413).json({
      erro: `A seleção tem ${total.toLocaleString('pt-BR')} linhas, acima do limite de ${LIMITE_EXPORTACAO.toLocaleString('pt-BR')}. Restrinja o período ou os filtros.`,
    });
    return;
  }

  const linhas = await buscarLinhasCompletas(filtros, escopo, extrairOrdenacao(query));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('MC Vendas');
  sheet.columns = COLUNAS_EXCEL;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.addRows(linhas.map(linhaParaExcel));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_EXCEL.length } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mc-vendas.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
