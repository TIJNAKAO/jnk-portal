import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const logsAcessoRouter = Router();

const ROTA = '/config/logs';

logsAcessoRouter.use(authTenant);

logsAcessoRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { usuarioId } = req.query as { usuarioId?: string };

  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (usuarioId) {
    condicoes.push('l.usuario_id = ?');
    params.push(usuarioId);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const [logs] = await pool.query<RowDataPacket[]>(
    `SELECT l.id, l.tipo_evento, l.ip_origem, l.criado_em,
            u.nome AS nomeUsuario, f.nome AS nomeFilial, t.nome_tela AS nomeTela
     FROM logs_acesso l
     JOIN usuarios u ON u.id = l.usuario_id
     LEFT JOIN filiais f ON f.id = l.filial_id
     LEFT JOIN telas_modulo t ON t.id = l.tela_id
     ${where}
     ORDER BY l.criado_em DESC
     LIMIT 200`,
    params,
  );
  res.json(logs);
});
