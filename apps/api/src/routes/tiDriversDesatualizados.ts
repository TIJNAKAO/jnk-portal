import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiDriversDesatualizadosRouter = Router();

const ROTA = '/ti/drivers-desatualizados';

tiDriversDesatualizadosRouter.use(authTenant);

/**
 * Mesma lógica de tiProgramasDesatualizados.ts, agrupando por hardware_id
 * em vez de nome — dois drivers com o mesmo hardware_id são fisicamente o
 * mesmo componente (mesmo chip/modelo), então a comparação de versão faz
 * sentido; nome sozinho pode variar por driver instalado mesmo sendo o
 * mesmo hardware. Linha sem hardware_id fica de fora (sem chave estável,
 * não compara — mesma regra do diff de coletas, ver tiDiff.ts).
 */
const CTE_DRIVER_ATUAL = `
  WITH ultima_coleta AS (
      SELECT e.id AS id_equipamento,
             (SELECT c2.id FROM ti_inventario_coleta c2
              WHERE c2.id_equipamento = e.id
              ORDER BY c2.coletado_em DESC, c2.id DESC LIMIT 1) AS id_coleta
      FROM ti_equipamento e
      WHERE e.ativo = TRUE
  ),
  driver_atual AS (
      SELECT d.hardware_id, d.nome, d.fabricante, d.versao, uc.id_equipamento
      FROM ultima_coleta uc
      JOIN ti_driver d ON d.id_coleta = uc.id_coleta
      WHERE d.hardware_id IS NOT NULL AND d.hardware_id <> '' AND d.versao IS NOT NULL AND d.versao <> ''
  ),
  maximos AS (
      SELECT hardware_id, MAX(versao) AS versao_maxima
      FROM driver_atual
      GROUP BY hardware_id
  )`;

tiDriversDesatualizadosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_DRIVER_ATUAL}
     SELECT da.hardware_id, ANY_VALUE(da.nome) AS nome, ANY_VALUE(da.fabricante) AS fabricante, m.versao_maxima,
            COUNT(*) AS qtd_total,
            SUM(da.versao = m.versao_maxima) AS qtd_atualizadas
     FROM driver_atual da
     JOIN maximos m ON m.hardware_id = da.hardware_id
     GROUP BY da.hardware_id, m.versao_maxima
     HAVING qtd_atualizadas < qtd_total
     ORDER BY (qtd_total - qtd_atualizadas) DESC, nome`,
  );
  res.json(linhas);
});

tiDriversDesatualizadosRouter.get('/maquinas', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const hardwareId = String(req.query.hardwareId ?? '').trim();
  if (!hardwareId) {
    res.status(400).json({ erro: 'Informe o hardware_id.' });
    return;
  }

  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_DRIVER_ATUAL}
     SELECT e.id, e.nome_computador, e.apelido, f.nome AS nome_filial, u.nome AS nome_responsavel,
            da.versao, m.versao_maxima, (da.versao = m.versao_maxima) AS atualizado
     FROM driver_atual da
     JOIN maximos m ON m.hardware_id = da.hardware_id
     JOIN ti_equipamento e ON e.id = da.id_equipamento
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     WHERE da.hardware_id = ?
     ORDER BY atualizado ASC, e.nome_computador`,
    [hardwareId],
  );
  res.json(linhas);
});
