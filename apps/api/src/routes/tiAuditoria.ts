import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiAuditoriaRouter = Router();

const ROTA = '/ti/auditoria-coleta';

tiAuditoriaRouter.use(authTenant);

// Equipamentos ativos, ordenados por dias desde a última coleta — quem
// nunca coletou aparece primeiro (pior caso). Front-end colore por faixa
// (até 2 dias = normal, 3–5 = atenção, mais de 5 ou nunca = crítico).
tiAuditoriaRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [equipamentos] = await pool.query<RowDataPacket[]>(
    `SELECT
        e.id, e.nome_computador, e.apelido, e.ultima_coleta_em,
        f.nome AS nome_filial, u.nome AS nome_responsavel, d.nome AS nome_departamento,
        CASE WHEN e.ultima_coleta_em IS NULL THEN NULL ELSE DATEDIFF(NOW(), e.ultima_coleta_em) END AS dias_sem_coletar
     FROM ti_equipamento e
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     LEFT JOIN ti_departamento d ON d.id = e.id_departamento
     WHERE e.ativo = TRUE
     ORDER BY (e.ultima_coleta_em IS NULL) DESC, dias_sem_coletar DESC, e.nome_computador`,
  );
  res.json(equipamentos);
});
