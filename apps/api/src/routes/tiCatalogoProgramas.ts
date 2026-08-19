import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiCatalogoProgramasRouter = Router();

const ROTA = '/ti/catalogo-programas';

tiCatalogoProgramasRouter.use(authTenant);

tiCatalogoProgramasRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [programas] = await pool.query<RowDataPacket[]>('SELECT * FROM ti_catalogo_programa ORDER BY nome');
  res.json(programas);
});

tiCatalogoProgramasRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { nome, wingetId, configurarAcessoRemoto } = req.body as {
    nome?: string;
    wingetId?: string;
    configurarAcessoRemoto?: boolean;
  };
  if (!nome || !wingetId) {
    res.status(400).json({ erro: 'Nome e ID do winget são obrigatórios.' });
    return;
  }

  try {
    const [resultado] = await pool.query<ResultSetHeader>(
      'INSERT INTO ti_catalogo_programa (nome, winget_id, configurar_acesso_remoto) VALUES (?, ?, ?)',
      [nome, wingetId, Boolean(configurarAcessoRemoto)],
    );
    res.status(201).json({ id: resultado.insertId });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ erro: 'Já existe um programa com esse ID do winget.' });
      return;
    }
    throw error;
  }
});

tiCatalogoProgramasRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { nome, wingetId, ativo, configurarAcessoRemoto } = req.body as {
    nome?: string;
    wingetId?: string;
    ativo?: boolean;
    configurarAcessoRemoto?: boolean;
  };
  await pool.query(
    `UPDATE ti_catalogo_programa SET
       nome = COALESCE(?, nome),
       winget_id = COALESCE(?, winget_id),
       ativo = COALESCE(?, ativo),
       configurar_acesso_remoto = COALESCE(?, configurar_acesso_remoto)
     WHERE id = ?`,
    [nome ?? null, wingetId ?? null, ativo ?? null, configurarAcessoRemoto ?? null, req.params.id],
  );
  res.json({ ok: true });
});

tiCatalogoProgramasRouter.delete('/:id', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('DELETE FROM ti_catalogo_programa WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
