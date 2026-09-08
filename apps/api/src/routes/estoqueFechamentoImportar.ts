import { Router } from 'express';
import multer from 'multer';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { importarFechamentoMensal } from '../services/estoqueFechamentoMensal.js';
import { PlanilhaForaDoModeloError } from '../services/planilha.js';

export const estoqueFechamentoImportarRouter = Router();

/**
 * As três telas de upload do Fechamento de Custo. Cada endpoint declara a
 * `ROTA` da **sua** tela: permissão de importar fechamento não libera
 * importar inventário.
 *
 * Gate por permissão e não por escopo de empresa — a planilha traz várias
 * empresas por natureza, e importar é operação administrativa, não
 * consulta. Ver Specs/spec_modulo_estoque.md, seção 3.6.
 */

const ROTA_FECHAMENTO = '/estoque/fechamento/importar';

// 25MB: o modelo de inventário físico usado em produção
// (EstoqueFinal_NK2_202608_V01.xlsx) tem 9,4MB, então o teto de 8MB das
// fotos de equipamento de TI não serve aqui.
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

estoqueFechamentoImportarRouter.use(authTenant);

/** Valida o arquivo enviado e devolve o buffer, ou lança 422 com a razão. */
function exigirPlanilha(arquivo: Express.Multer.File | undefined): Express.Multer.File {
  if (!arquivo) {
    throw new PlanilhaForaDoModeloError('Selecione um arquivo .xlsx antes de importar.');
  }
  if (!/\.xlsx$/i.test(arquivo.originalname)) {
    throw new PlanilhaForaDoModeloError('O arquivo precisa ser uma planilha .xlsx (Excel).');
  }
  return arquivo;
}

estoqueFechamentoImportarRouter.post(
  '/fechamento-mensal',
  requirePermissao(ROTA_FECHAMENTO, 'podeCriar'),
  upload.single('arquivo'),
  async (req, res) => {
    const arquivo = exigirPlanilha(req.file);
    res.json(await importarFechamentoMensal(arquivo.buffer, arquivo.originalname, req.usuario!.id));
  },
);
