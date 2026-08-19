import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiResponsaveisRouter = Router();

const ROTA = '/ti/responsaveis';

tiResponsaveisRouter.use(authTenant);

tiResponsaveisRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { filialId } = req.query as { filialId?: string };

  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (filialId) {
    condicoes.push('e.filial_id = ?');
    params.push(filialId);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const [equipamentos] = await pool.query<RowDataPacket[]>(
    `SELECT e.id, e.nome_computador, f.nome AS nome_filial, e.id_usuario_responsavel
     FROM ti_equipamento e
     LEFT JOIN filiais f ON f.id = e.filial_id
     ${where}
     ORDER BY e.nome_computador`,
    params,
  );
  res.json(equipamentos);
});

// Grade única (um <select> por equipamento) com um "Salvar" só — mais
// rápido que editar equipamento por equipamento quando é preciso atribuir
// vários de uma vez.
tiResponsaveisRouter.put('/', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const atribuicoes = req.body as Record<string, number | null>;

  await withTransaction(async (connection) => {
    for (const [idEquipamento, idUsuario] of Object.entries(atribuicoes)) {
      await connection.query('UPDATE ti_equipamento SET id_usuario_responsavel = ? WHERE id = ?', [
        idUsuario || null,
        Number(idEquipamento),
      ]);
    }
  });

  res.json({ ok: true });
});
