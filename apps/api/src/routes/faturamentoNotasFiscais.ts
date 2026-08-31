import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import {
  buscarFiltrosDisponiveis,
  buscarLinhasCompletas,
  buscarLinhasPaginadas,
  type FiltroFaturamento,
  type LinhaRelatorio,
  type Ordenacao,
} from '../services/faturamento.js';

export const faturamentoNotasFiscaisRouter = Router();

const ROTA = '/faturamento/notas-fiscais';

/**
 * Acima disto o Excel fica pesado demais para gerar dentro de uma request.
 * Com ~6.000 itens/mês, o limite equivale a mais de um ano de faturamento.
 */
const LIMITE_EXPORTACAO = 100_000;

faturamentoNotasFiscaisRouter.use(authTenant);

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
    busca: query.busca || undefined,
  };
}

function extrairOrdenacao(query: Record<string, string | undefined>): Ordenacao {
  return { coluna: query.ordenarPor, direcao: query.direcao === 'asc' ? 'asc' : 'desc' };
}

faturamentoNotasFiscaisRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosDisponiveis(await buscarEmpresasPermitidas(req.usuario!.id)));
});

faturamentoNotasFiscaisRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
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

/**
 * Ordem das colunas segue a lista pedida pelo cliente
 * (Specs/spec_modulo_faturamento.md, seção 4.1), com Marca e Canal
 * acrescentados por serem filtros do relatório — sem eles, quem recebe a
 * planilha não consegue reagrupar.
 */
const COLUNAS_EXCEL: Partial<ExcelJS.Column>[] = [
  { header: 'EMPRESA', key: 'dc_filial', width: 32 },
  { header: 'DATA FATURAMENTO', key: 'dt_movto', width: 18 },
  { header: 'NF', key: 'nf', width: 11 },
  { header: 'SÉRIE', key: 'serie', width: 8 },
  { header: 'CLIENTE', key: 'dc_clifor', width: 40 },
  { header: 'UF', key: 'uf', width: 6 },
  { header: 'CÓD. PRODUTO', key: 'cd_produto', width: 15 },
  { header: 'DESCRIÇÃO PRODUTO', key: 'dc_produto', width: 45 },
  { header: 'MARCA', key: 'marca', width: 16 },
  { header: 'CANAL', key: 'canal', width: 28 },
  { header: 'QTDE', key: 'qtde', width: 10, style: { numFmt: MOEDA } },
  { header: 'VALOR UNITÁRIO', key: 'vu_merc', width: 16, style: { numFmt: MOEDA } },
  { header: 'VALOR TOTAL MERCADORIA', key: 'vt_merc', width: 22, style: { numFmt: MOEDA } },
  { header: 'VALOR ICMS', key: 'vt_icms', width: 14, style: { numFmt: MOEDA } },
  { header: 'VALOR ICMS ST', key: 'vt_icms_st', width: 15, style: { numFmt: MOEDA } },
  { header: 'VALOR IPI', key: 'vt_ipi', width: 13, style: { numFmt: MOEDA } },
  { header: 'VALOR PIS', key: 'vt_pis', width: 13, style: { numFmt: MOEDA } },
  { header: 'VALOR COFINS', key: 'vt_cofins', width: 14, style: { numFmt: MOEDA } },
  { header: 'VALOR DIFAL', key: 'vt_icms_difal', width: 14, style: { numFmt: MOEDA } },
  { header: 'VALOR FECP', key: 'vt_fecp', width: 13, style: { numFmt: MOEDA } },
  { header: 'VALOR TOTAL DA NF', key: 'vt_nota', width: 19, style: { numFmt: MOEDA } },
  { header: 'VALOR FRETE SELLER', key: 'vt_add_frete', width: 19, style: { numFmt: MOEDA } },
  { header: 'TAXA MARKETPLACE', key: 'vt_tx_fatur', width: 19, style: { numFmt: MOEDA } },
  { header: 'VALOR LÍQUIDO', key: 'vt_liquido_calc', width: 16, style: { numFmt: MOEDA } },
  { header: 'CUSTO UNITÁRIO', key: 'vu_custo', width: 16, style: { numFmt: MOEDA } },
  { header: 'MARGEM', key: 'vt_margem', width: 14, style: { numFmt: MOEDA } },
  { header: '% MARGEM', key: 'perc_margem', width: 12, style: { numFmt: '0.00' } },
  { header: 'PENDÊNCIA', key: 'ref_pendente', width: 16 },
];

function linhaParaExcel(l: LinhaRelatorio) {
  return {
    ...l,
    dt_movto: l.dt_movto ? new Date(l.dt_movto).toLocaleDateString('pt-BR') : '',
    // Custo e margem ficam em branco quando não há custo conhecido. Zero seria
    // lido como "margem nula" em vez de "não sei".
    vu_custo: l.vu_custo ?? null,
    vt_margem: l.vt_margem ?? null,
    perc_margem: l.perc_margem ?? null,
    ref_pendente: l.ref_pendente ?? '',
  };
}

faturamentoNotasFiscaisRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const linhas = await buscarLinhasCompletas(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    extrairOrdenacao(query),
  );

  if (linhas.length > LIMITE_EXPORTACAO) {
    res.status(413).json({
      erro: `A seleção tem ${linhas.length.toLocaleString('pt-BR')} linhas, acima do limite de ${LIMITE_EXPORTACAO.toLocaleString('pt-BR')}. Restrinja o período ou os filtros.`,
    });
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Notas Fiscais');
  sheet.columns = COLUNAS_EXCEL;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.addRows(linhas.map(linhaParaExcel));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_EXCEL.length } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="faturamento-notas-fiscais.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
