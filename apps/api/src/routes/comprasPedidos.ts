import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import {
  buscarFiltrosPedidosCompra,
  buscarPedidosCompraCompletos,
  buscarPedidosCompraPaginados,
  type FiltroPedidosCompra,
  type Ordenacao,
} from '../services/comprasPedidos.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { numeroXlsx } from '../services/numeroXlsx.js';

export const comprasPedidosRouter = Router();

const ROTA = '/compras/pedidos';

comprasPedidosRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroPedidosCompra {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));
  const fornecedores = lista(query.fornecedores)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));

  return {
    empresas: empresas?.length ? empresas : undefined,
    fornecedores: fornecedores?.length ? fornecedores : undefined,
    statusPedido: lista(query.statusPedido),
    statusEntrega: lista(query.statusEntrega),
    dataInicio: query.dataInicio || undefined,
    dataFim: query.dataFim || undefined,
  };
}

function extrairOrdenacao(query: Record<string, string | undefined>): Ordenacao {
  return { coluna: query.ordenarPor, direcao: query.direcao === 'asc' ? 'asc' : 'desc' };
}

comprasPedidosRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosPedidosCompra(await buscarEmpresasPermitidas(req.usuario!.id)));
});

comprasPedidosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total } = await buscarPedidosCompraPaginados(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    pagina,
    tamanhoPagina,
    extrairOrdenacao(query),
  );

  res.json({ linhas, total, pagina, tamanhoPagina });
});

comprasPedidosRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;

  // O escopo do usuário entra aqui igual à consulta da tela — a exportação
  // não é uma porta lateral que devolve mais dados do que a tela mostraria.
  const linhas = await buscarPedidosCompraCompletos(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    extrairOrdenacao(query),
  );

  const valor = { width: 16, style: { numFmt: '#,##0.0000' } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Pedidos de Compra');
  sheet.columns = [
    { header: 'PEDIDO', key: 'id_pedcompra', width: 12 },
    { header: 'EMPRESA', key: 'empresa', width: 40 },
    { header: 'FORNECEDOR', key: 'fornecedor', width: 45 },
    { header: 'DATA DO PEDIDO', key: 'data_pedido', width: 16 },
    { header: 'PREVISAO DE ENTREGA', key: 'data_prev_entrega', width: 18 },
    { header: 'COMPRADOR', key: 'comprador', width: 22 },
    { header: 'STATUS DO PEDIDO', key: 'status_pedido', width: 20 },
    { header: 'STATUS DA ENTREGA', key: 'status_entrega', width: 22 },
    { header: 'VALOR BRUTO', key: 'valor_bruto', ...valor },
    { header: 'DESCONTO', key: 'valor_desconto', ...valor },
    { header: 'IPI', key: 'valor_ipi', ...valor },
    { header: 'FRETE', key: 'valor_frete', ...valor },
    { header: 'TOTAL GERAL', key: 'total_geral', ...valor },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    linhas.map((l) => ({
      ...l,
      // DECIMAL do mysql2 chega como string — sem isso o Excel grava
      // texto, não número (ver numeroXlsx.ts).
      valor_bruto: numeroXlsx(l.valor_bruto),
      valor_desconto: numeroXlsx(l.valor_desconto),
      valor_ipi: numeroXlsx(l.valor_ipi),
      valor_frete: numeroXlsx(l.valor_frete),
      total_geral: numeroXlsx(l.total_geral),
    })),
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="pedidos-compra.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
