import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiProgramasDesatualizadosRouter = Router();

const ROTA = '/ti/programas-desatualizados';

tiProgramasDesatualizadosRouter.use(authTenant);

/**
 * "Desatualizado" aqui é comparação com o PARQUE, não com fonte externa —
 * não existe fonte confiável de versão mais recente por fabricante (ver
 * Specs/spec_modulo_ti.md, seção 5.8/10.7). Para cada nome de software,
 * acha a maior versão instalada em qualquer máquina ativa hoje e marca
 * como desatualizada toda máquina abaixo disso. Comparação é textual
 * (MAX() sobre VARCHAR) — não entende semver de verdade, limitação aceita.
 */
const CTE_SOFTWARE_ATUAL = `
  WITH ultima_coleta AS (
      SELECT e.id AS id_equipamento,
             (SELECT c2.id FROM ti_inventario_coleta c2
              WHERE c2.id_equipamento = e.id
              ORDER BY c2.coletado_em DESC, c2.id DESC LIMIT 1) AS id_coleta
      FROM ti_equipamento e
      WHERE e.ativo = TRUE
  ),
  software_atual AS (
      SELECT s.nome, s.versao, uc.id_equipamento
      FROM ultima_coleta uc
      JOIN ti_software s ON s.id_coleta = uc.id_coleta
      WHERE s.nome IS NOT NULL AND s.versao IS NOT NULL AND s.versao <> ''
  ),
  maximos AS (
      SELECT nome, MAX(versao) AS versao_maxima
      FROM software_atual
      GROUP BY nome
  )`;

tiProgramasDesatualizadosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_SOFTWARE_ATUAL}
     SELECT sa.nome, m.versao_maxima,
            COUNT(*) AS qtd_total,
            SUM(sa.versao = m.versao_maxima) AS qtd_atualizadas
     FROM software_atual sa
     JOIN maximos m ON m.nome = sa.nome
     GROUP BY sa.nome, m.versao_maxima
     HAVING qtd_atualizadas < qtd_total
     ORDER BY (qtd_total - qtd_atualizadas) DESC, sa.nome`,
  );
  res.json(linhas);
});

tiProgramasDesatualizadosRouter.get('/maquinas', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const nome = String(req.query.nome ?? '').trim();
  if (!nome) {
    res.status(400).json({ erro: 'Informe o nome do software.' });
    return;
  }

  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_SOFTWARE_ATUAL}
     SELECT e.id, e.nome_computador, e.apelido, f.nome AS nome_filial, u.nome AS nome_responsavel,
            sa.versao, m.versao_maxima, (sa.versao = m.versao_maxima) AS atualizado
     FROM software_atual sa
     JOIN maximos m ON m.nome = sa.nome
     JOIN ti_equipamento e ON e.id = sa.id_equipamento
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     WHERE sa.nome = ?
     ORDER BY atualizado ASC, e.nome_computador`,
    [nome],
  );
  res.json(linhas);
});
