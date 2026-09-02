import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import {
  buscarFiltrosSaldos,
  buscarSaldosCompletos,
  buscarSaldosPaginados,
  type FiltroSaldos,
  type Ordenacao,
} from '../services/estoqueSaldos.js';

export const estoqueSaldosRouter = Router();

const ROTA = '/estoque/saldos';

estoqueSaldosRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroSaldos {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));

  return {
    empresas: empresas?.length ? empresas : undefined,
    marcas: lista(query.marcas),
    busca: query.busca?.trim() || undefined,
    soComSaldo: query.soComSaldo === 'true',
  };
}

function extrairOrdenacao(query: Record<string, string | undefined>): Ordenacao {
  return { coluna: query.ordenarPor, direcao: query.direcao === 'desc' ? 'desc' : 'asc' };
}

estoqueSaldosRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosSaldos(await buscarEmpresasPermitidas(req.usuario!.id)));
});

estoqueSaldosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total } = await buscarSaldosPaginados(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    pagina,
    tamanhoPagina,
    extrairOrdenacao(query),
  );

  res.json({ linhas, total, pagina, tamanhoPagina });
});

estoqueSaldosRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;

  // O escopo do usuário entra aqui igual à consulta da tela — a exportação
  // não é uma porta lateral que devolve o que a tela não mostraria.
  const linhas = await buscarSaldosCompletos(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    extrairOrdenacao(query),
  );

  const qtde = { width: 14, style: { numFmt: '#,##0.0000' } };
  const valor = { width: 16, style: { numFmt: '#,##0.0000' } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Estoque');
  sheet.columns = [
    { header: 'EMPRESA', key: 'empresa', width: 40 },
    { header: 'CODIGO PRODUTO', key: 'id_produto', width: 16 },
    { header: 'DESCRICAO DO PRODUTO', key: 'nome_produto', width: 45 },
    { header: 'MARCA', key: 'marca', width: 20 },
    { header: 'QTDE DISPONIVEL', key: 'saldo_disponivel', ...qtde },
    { header: 'QTDE PRINCIPAL', key: 'estoque_principal', ...qtde },
    { header: 'QTDE RESERVADA', key: 'estoque_reservado', ...qtde },
    { header: 'QTDE IMPORTACAO', key: 'estoque_importacao', ...qtde },
    { header: 'QTDE AVARIAS', key: 'estoque_avarias', ...qtde },
    { header: 'QTDE LOJA', key: 'estoque_loja', ...qtde },
    { header: 'QTDE ASSISTENCIA', key: 'estoque_assistencia', ...qtde },
    { header: 'QTDE ARMAZEM EXTERNO', key: 'estoque_armazem_externo', ...qtde },
    { header: 'VALOR CUSTO FORMACAO', key: 'custo_formacao', ...valor },
    { header: 'VALOR CUSTO MEDIO', key: 'custo_medio', ...valor },
    { header: 'DATA INTEGRACAO', key: 'synced_at', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    linhas.map((l) => ({
      ...l,
      empresa: l.empresa?.trim() || String(l.id_empresa),
      synced_at: l.synced_at ? new Date(l.synced_at) : null,
    })),
  );
  sheet.getColumn('synced_at').numFmt = 'dd/mm/yyyy hh:mm';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="estoque-saldos.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
