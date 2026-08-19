import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const perfisRouter = Router();

const ROTA = '/config/perfis';

interface TelaPermissao {
  telaId: number;
  podeVisualizar?: boolean;
  podeCriar?: boolean;
  podeEditar?: boolean;
  podeDeletar?: boolean;
}

perfisRouter.use(authTenant);

perfisRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [perfis] = await pool.query<RowDataPacket[]>('SELECT * FROM perfis ORDER BY nome');
  res.json(perfis);
});

perfisRouter.get('/:id/telas', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [telas] = await pool.query<RowDataPacket[]>(
    `SELECT t.id AS telaId, t.nome_tela AS nomeTela, t.rota_tela AS rotaTela, m.nome AS nomeModulo,
            COALESCE(pt.pode_visualizar, FALSE) AS podeVisualizar,
            COALESCE(pt.pode_criar, FALSE) AS podeCriar,
            COALESCE(pt.pode_editar, FALSE) AS podeEditar,
            COALESCE(pt.pode_deletar, FALSE) AS podeDeletar
     FROM telas_modulo t
     JOIN modulos_sistema m ON m.id = t.modulo_id
     LEFT JOIN perfis_telas pt ON pt.tela_id = t.id AND pt.perfil_id = ?
     ORDER BY m.id, t.id`,
    [req.params.id],
  );
  res.json(telas);
});

perfisRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { nome, descricao } = req.body as { nome?: string; descricao?: string };
  if (!nome) {
    res.status(400).json({ erro: 'Nome é obrigatório.' });
    return;
  }

  const [resultado] = await pool.query<ResultSetHeader>('INSERT INTO perfis (nome, descricao) VALUES (?, ?)', [
    nome,
    descricao ?? null,
  ]);
  res.status(201).json({ id: resultado.insertId });
});

perfisRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { nome, descricao, ativo } = req.body as { nome?: string; descricao?: string; ativo?: boolean };
  await pool.query(
    `UPDATE perfis SET
       nome = COALESCE(?, nome),
       descricao = COALESCE(?, descricao),
       ativo = COALESCE(?, ativo)
     WHERE id = ?`,
    [nome ?? null, descricao ?? null, ativo ?? null, req.params.id],
  );
  res.json({ ok: true });
});

// Substitui a matriz inteira do perfil (delete + insert em transação).
perfisRouter.put('/:id/telas', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { telas } = req.body as { telas?: TelaPermissao[] };
  const perfilId = Number(req.params.id);

  await withTransaction(async (connection) => {
    await connection.query('DELETE FROM perfis_telas WHERE perfil_id = ?', [perfilId]);
    for (const t of telas ?? []) {
      await connection.query(
        `INSERT INTO perfis_telas (perfil_id, tela_id, pode_visualizar, pode_criar, pode_editar, pode_deletar)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [perfilId, t.telaId, Boolean(t.podeVisualizar), Boolean(t.podeCriar), Boolean(t.podeEditar), Boolean(t.podeDeletar)],
      );
    }
  });

  res.json({ ok: true });
});

perfisRouter.delete('/:id', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('UPDATE perfis SET ativo = FALSE WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
