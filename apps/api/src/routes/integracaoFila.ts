import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const integracaoFilaRouter = Router();

const ROTA = '/integracao/fila';

integracaoFilaRouter.use(authTenant);

integracaoFilaRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { tipoTabela, acao, consumido, confirmado, comErro, idRegistro } = req.query as Record<string, string | undefined>;

  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (tipoTabela) {
    condicoes.push('tipo_tabela = ?');
    params.push(tipoTabela);
  }
  if (acao) {
    condicoes.push('acao = ?');
    params.push(acao);
  }
  if (consumido !== undefined) {
    condicoes.push('consumido = ?');
    params.push(consumido === 'true');
  }
  if (confirmado !== undefined) {
    condicoes.push('confirmado_sysemp = ?');
    params.push(confirmado === 'true');
  }
  if (comErro === 'true') {
    condicoes.push('(erro_consumo IS NOT NULL OR erro_confirmacao IS NOT NULL)');
  }
  if (idRegistro) {
    condicoes.push('id_registro = ?');
    params.push(idRegistro);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM sysemp_fila ${where} ORDER BY id_fila DESC LIMIT 500`,
    params,
  );
  res.json(linhas);
});

// Força reprocessamento — zera consumido (e erro), a linha volta a ser
// pega na próxima sincronização da entidade correspondente.
integracaoFilaRouter.put('/:idFila/reprocessar', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  await pool.query(
    'UPDATE sysemp_fila SET consumido = FALSE, erro_consumo = NULL, confirmado_sysemp = FALSE, erro_confirmacao = NULL WHERE id_fila = ?',
    [req.params.idFila],
  );
  res.json({ ok: true });
});

integracaoFilaRouter.delete('/:idFila', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('DELETE FROM sysemp_fila WHERE id_fila = ?', [req.params.idFila]);
  res.json({ ok: true });
});
