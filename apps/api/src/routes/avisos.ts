import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const avisosRouter = Router();

const ROTA = '/config/avisos';

avisosRouter.use(authTenant);

// Consumida pelo Quadro de Avisos do Hub (seção 4.3) — qualquer usuário
// logado vê, não é gated por requirePermissao (não é tela administrativa).
avisosRouter.get('/ativos', async (req, res) => {
  const [avisos] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM avisos_plataforma
     WHERE (filial_id IS NULL OR filial_id = ?) AND data_expiracao > CURRENT_TIMESTAMP
     ORDER BY criado_em DESC`,
    [req.usuario!.filialAtivaId],
  );
  res.json(avisos);
});

avisosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [avisos] = await pool.query<RowDataPacket[]>('SELECT * FROM avisos_plataforma ORDER BY criado_em DESC');
  res.json(avisos);
});

avisosRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { filialId, titulo, mensagem, dataExpiracao } = req.body as {
    filialId?: number | null;
    titulo?: string;
    mensagem?: string;
    dataExpiracao?: string;
  };

  if (!titulo || !mensagem || !dataExpiracao) {
    res.status(400).json({ erro: 'Título, mensagem e data de expiração são obrigatórios.' });
    return;
  }

  const [resultado] = await pool.query<ResultSetHeader>(
    'INSERT INTO avisos_plataforma (filial_id, titulo, mensagem, data_expiracao) VALUES (?, ?, ?, ?)',
    [filialId ?? null, titulo, mensagem, dataExpiracao],
  );
  res.status(201).json({ id: resultado.insertId });
});

avisosRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { titulo, mensagem, dataExpiracao } = req.body as {
    titulo?: string;
    mensagem?: string;
    dataExpiracao?: string;
  };

  await pool.query(
    `UPDATE avisos_plataforma SET
       titulo = COALESCE(?, titulo),
       mensagem = COALESCE(?, mensagem),
       data_expiracao = COALESCE(?, data_expiracao)
     WHERE id = ?`,
    [titulo ?? null, mensagem ?? null, dataExpiracao ?? null, req.params.id],
  );
  res.json({ ok: true });
});

// Exclusão física (diferente de Filiais/Usuários/Perfis): avisos são
// efêmeros, já têm expiração própria, e nada mais no schema referencia
// avisos_plataforma.id.
avisosRouter.delete('/:id', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('DELETE FROM avisos_plataforma WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
