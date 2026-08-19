import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const integracaoParametrosFilaRouter = Router();

const ROTA = '/integracao/parametros-fila';

integracaoParametrosFilaRouter.use(authTenant);

integracaoParametrosFilaRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>('SELECT * FROM sysemp_fila_config ORDER BY nome');
  res.json(linhas);
});

// Só edição de linhas que já têm suporte no código (consumidor registrado
// pra aquele tipo_tabela) — não cria integração nova do nada. Ver
// Specs/spec_modulo_integracao.md, seção 4.4.
integracaoParametrosFilaRouter.put('/:chave', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { nome, endpointFila, endpointDetalhe, campoIdDetalhe, endpointConfirmacao, limitePagina, ativo, observacoes } = req.body as {
    nome?: string;
    endpointFila?: string;
    endpointDetalhe?: string;
    campoIdDetalhe?: string;
    endpointConfirmacao?: string;
    limitePagina?: number;
    ativo?: boolean;
    observacoes?: string;
  };

  await pool.query(
    `UPDATE sysemp_fila_config SET
       nome = COALESCE(?, nome),
       endpoint_fila = COALESCE(?, endpoint_fila),
       endpoint_detalhe = COALESCE(?, endpoint_detalhe),
       campo_id_detalhe = COALESCE(?, campo_id_detalhe),
       endpoint_confirmacao = COALESCE(?, endpoint_confirmacao),
       limite_pagina = COALESCE(?, limite_pagina),
       ativo = COALESCE(?, ativo),
       observacoes = COALESCE(?, observacoes)
     WHERE chave = ?`,
    [
      nome ?? null,
      endpointFila ?? null,
      endpointDetalhe ?? null,
      campoIdDetalhe ?? null,
      endpointConfirmacao ?? null,
      limitePagina ?? null,
      ativo ?? null,
      observacoes ?? null,
      req.params.chave,
    ],
  );
  res.json({ ok: true });
});
