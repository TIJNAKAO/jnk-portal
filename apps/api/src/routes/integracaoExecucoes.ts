import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { logEmitter } from '../services/integracaoLog.js';

export const integracaoExecucoesRouter = Router();

const ROTA = '/integracao/execucoes';

integracaoExecucoesRouter.use(authTenant);

integracaoExecucoesRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { entidade } = req.query as { entidade?: string };
  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (entidade) {
    condicoes.push('entidade = ?');
    params.push(entidade);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const [execucoes] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM integracao_log ${where} ORDER BY executado_em DESC LIMIT 200`,
    params,
  );
  res.json(execucoes);
});

integracaoExecucoesRouter.get('/:id', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [execucoes] = await pool.query<RowDataPacket[]>('SELECT * FROM integracao_log WHERE id = ?', [req.params.id]);
  const execucao = execucoes[0];
  if (!execucao) {
    res.status(404).json({ erro: 'Execução não encontrada.' });
    return;
  }

  const [detalhes] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM integracao_log_detalhe WHERE id_log = ? ORDER BY id DESC',
    [req.params.id],
  );
  res.json({ execucao, detalhes });
});

// Acompanhamento ao vivo — empurra cada nova linha de detalhe conforme é
// gravada, enquanto a execução estiver rodando. Ver spec, seção 2.7.
integracaoExecucoesRouter.get('/:id/stream', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const idLog = Number(req.params.id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const enviar = (evento: string, dados: unknown) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  };

  const [execucoes] = await pool.query<RowDataPacket[]>('SELECT * FROM integracao_log WHERE id = ?', [idLog]);
  const execucao = execucoes[0];
  if (!execucao) {
    enviar('erro', { erro: 'Execução não encontrada.' });
    res.end();
    return;
  }

  const [detalhesExistentes] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM integracao_log_detalhe WHERE id_log = ? ORDER BY id DESC',
    [idLog],
  );
  for (const linha of detalhesExistentes) enviar('detalhe', linha);

  if (execucao.status !== 'iniciado') {
    enviar('fim', execucao);
    res.end();
    return;
  }

  const aoReceberDetalhe = (linha: unknown) => enviar('detalhe', linha);
  const aoFinalizar = (dados: unknown) => {
    enviar('fim', dados);
    res.end();
  };

  logEmitter.on(`detalhe:${idLog}`, aoReceberDetalhe);
  logEmitter.once(`fim:${idLog}`, aoFinalizar);

  req.on('close', () => {
    logEmitter.off(`detalhe:${idLog}`, aoReceberDetalhe);
    logEmitter.off(`fim:${idLog}`, aoFinalizar);
  });
});

integracaoExecucoesRouter.post('/:id/cancelar', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  await pool.query("UPDATE integracao_log SET status = 'cancelado' WHERE id = ? AND status = 'iniciado'", [req.params.id]);
  res.json({ ok: true });
});
