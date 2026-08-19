import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiDepartamentosRouter = Router();

const ROTA = '/ti/departamentos';

tiDepartamentosRouter.use(authTenant);

tiDepartamentosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [departamentos] = await pool.query<RowDataPacket[]>('SELECT * FROM ti_departamento ORDER BY nome');
  res.json(departamentos);
});

tiDepartamentosRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { nome } = req.body as { nome?: string };
  if (!nome) {
    res.status(400).json({ erro: 'Nome é obrigatório.' });
    return;
  }

  try {
    const [resultado] = await pool.query<ResultSetHeader>('INSERT INTO ti_departamento (nome) VALUES (?)', [nome]);
    res.status(201).json({ id: resultado.insertId });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ erro: 'Já existe um departamento com esse nome.' });
      return;
    }
    throw error;
  }
});

tiDepartamentosRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { nome, ativo } = req.body as { nome?: string; ativo?: boolean };
  await pool.query(
    'UPDATE ti_departamento SET nome = COALESCE(?, nome), ativo = COALESCE(?, ativo) WHERE id = ?',
    [nome ?? null, ativo ?? null, req.params.id],
  );
  res.json({ ok: true });
});

// Exclusão física — FOREIGN KEY ... ON DELETE SET NULL em ti_equipamento.id_departamento,
// então excluir não quebra equipamento nenhum, só some a classificação.
tiDepartamentosRouter.delete('/:id', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('DELETE FROM ti_departamento WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
