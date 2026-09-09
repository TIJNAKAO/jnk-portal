import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { numeroXlsx } from '../services/numeroXlsx.js';
import {
  buscarCalculoCompleto,
  buscarCalculoPaginado,
  buscarListaInventario,
  buscarPeriodosDisponiveis,
  calcularCustoFechamento,
  ultimoDiaDoMes,
} from '../services/estoqueCustoFechamento.js';
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

estoqueFechamentoCustoRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const periodo = exigirPeriodo(query.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total, totalGeral } = await buscarCalculoPaginado(periodo, grupo, pagina, tamanhoPagina);

  res.json({
    linhas,
    total,
    totalGeral,
    pagina,
    tamanhoPagina,
    dataFechamento: ultimoDiaDoMes(periodo),
  });
});

/** Formata a célula como Texto, para código não perder zero à esquerda. */
const TEXTO = { width: 18, style: { numFmt: '@' } };

estoqueFechamentoCustoRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const periodo = exigirPeriodo(query.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

  const linhas = await buscarCalculoCompleto(periodo, grupo);
  const dataFechamento = ultimoDiaDoMes(periodo);

  const qtde = { width: 14, style: { numFmt: '#,##0.0000' } };
  const valor = { width: 16, style: { numFmt: '#,##0.0000' } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Custo de Fechamento');
  sheet.columns = [
    { header: 'DATA DO FECHAMENTO', key: 'data_fechamento', width: 20 },
    { header: 'ORIGEM', key: 'origem', width: 16 },
    { header: 'EMPRESA', key: 'nome_empresa', width: 40 },
    { header: 'CODIGO', key: 'codigo_auxiliar', ...TEXTO },
    { header: 'PRODUTO', key: 'descricao_produto', width: 45 },
    { header: 'MARCA', key: 'marca', width: 20 },
    { header: 'UNIDADE', key: 'unidade', width: 10 },
    { header: 'NCM', key: 'ncm', ...TEXTO },
    { header: 'CONTA', key: 'conta', width: 16 },
    { header: 'SITUACAO', key: 'tipo_saldo', width: 26 },
    { header: 'QTDE', key: 'qtde', ...qtde },
    { header: 'VU CUSTO ESTOQUE', key: 'vu_custo_estoque', ...valor },
    { header: 'VU CUSTO VENDA', key: 'vu_custo_venda', ...valor },
    { header: 'VU CUSTO ADOTADO', key: 'vu_custo', ...valor },
    { header: 'VALOR CUSTO TOTAL', key: 'valor_custo_total', ...valor },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    linhas.map((l) => ({
      ...l,
      data_fechamento: dataFechamento,
      // DECIMAL do mysql2 chega como string — sem isso o Excel grava
      // texto, não número (ver numeroXlsx.ts). Foi exatamente este bug
      // que o usuário reportou: "96.8588" com ponto literal, sem
      // formatação de locale nenhuma, e o aviso de "número como texto".
      qtde: numeroXlsx(l.qtde),
      vu_custo_estoque: numeroXlsx(l.vu_custo_estoque),
      vu_custo_venda: numeroXlsx(l.vu_custo_venda),
      vu_custo: numeroXlsx(l.vu_custo),
      valor_custo_total: numeroXlsx(l.valor_custo_total),
    })),
  );
  sheet.getColumn('data_fechamento').numFmt = 'dd/mm/yyyy';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="custo-fechamento-${grupo.grupo}-${periodo.slice(0, 7)}.xlsx"`,
  );
  await workbook.xlsx.write(res);
  res.end();
});

/**
 * Lista de Inventário: formato fixo, é o que a contabilidade entrega para
 * fora. Código e NCM saem como Texto — código só com dígitos perde zero à
 * esquerda se o Excel o tratar como número ("0012" vira "12"), e o
 * arquivo chega quebrado.
 */
estoqueFechamentoCustoRouter.get(
  '/lista-inventario',
  requirePermissao(ROTA, 'podeVisualizar'),
  async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const periodo = exigirPeriodo(query.periodo);
    const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
    const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

    const linhas = await buscarListaInventario(periodo, grupo);
    const dataFechamento = ultimoDiaDoMes(periodo);

    const valor = { width: 16, style: { numFmt: '#,##0.00' } };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Lista de Inventario');
    sheet.columns = [
      { header: 'CodigoProduto', key: 'codigo_auxiliar', ...TEXTO },
      { header: 'NomeProduto', key: 'descricao_produto', width: 45 },
      { header: 'UnidadeMedida', key: 'unidade', width: 14 },
      { header: 'NCM', key: 'ncm', ...TEXTO },
      { header: 'DataFechamento', key: 'data_fechamento', width: 18 },
      { header: 'Quantidade', key: 'qtde', width: 14, style: { numFmt: '#,##0.00' } },
      { header: 'ValorUnitario', key: 'vu_custo', ...valor },
      { header: 'ValorTotal', key: 'valor_custo_total', ...valor },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(
      linhas.map((l) => ({
        ...l,
        data_fechamento: dataFechamento,
        // DECIMAL do mysql2 chega como string — sem isso o Excel grava
        // texto, não número (ver numeroXlsx.ts).
        qtde: numeroXlsx(l.qtde),
        vu_custo: numeroXlsx(l.vu_custo),
        valor_custo_total: numeroXlsx(l.valor_custo_total),
      })),
    );
    sheet.getColumn('data_fechamento').numFmt = 'dd/mm/yyyy';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lista-inventario-${grupo.grupo}-${periodo.slice(0, 7)}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  },
);
