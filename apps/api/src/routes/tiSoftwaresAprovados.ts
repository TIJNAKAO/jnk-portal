import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiSoftwaresAprovadosRouter = Router();

const ROTA = '/ti/softwares-aprovados';

tiSoftwaresAprovadosRouter.use(authTenant);

// Só o que está instalado AGORA (última coleta de cada equipamento) — não
// "já visto alguma vez". Desinstalou de todo mundo, some da lista sozinho;
// se reinstalar em algum lugar, volta a aparecer (sem aprovação) na
// próxima coleta.
tiSoftwaresAprovadosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { status } = req.query as { status?: string };

  const [todos] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT t.nome, t.versao_recente, t.qtd_maquinas, a.aprovado, a.versao_aprovada
     FROM (
         SELECT s.nome,
                FIRST_VALUE(s.versao) OVER (PARTITION BY s.nome ORDER BY c.coletado_em DESC) AS versao_recente,
                COUNT(*) OVER (PARTITION BY s.nome) AS qtd_maquinas
         FROM ti_equipamento e
         JOIN ti_inventario_coleta c ON c.id = (
             SELECT c2.id FROM ti_inventario_coleta c2
             WHERE c2.id_equipamento = e.id
             ORDER BY c2.coletado_em DESC, c2.id DESC
             LIMIT 1
         )
         JOIN ti_software s ON s.id_coleta = c.id
     ) t
     LEFT JOIN ti_software_aprovado a ON a.nome = t.nome
     ORDER BY t.nome`,
  );

  let linhas = todos;
  if (status === 'aprovados') {
    linhas = todos.filter((l) => Number(l.aprovado ?? 0) === 1);
  } else if (status === 'nao_aprovados') {
    linhas = todos.filter((l) => Number(l.aprovado ?? 0) === 0);
  }

  res.json(linhas);
});

tiSoftwaresAprovadosRouter.get('/maquinas', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const nome = String(req.query.nome ?? '').trim();
  if (!nome) {
    res.status(400).json({ erro: 'Informe o nome do software.' });
    return;
  }

  const [equipamentos] = await pool.query<RowDataPacket[]>(
    `SELECT e.id, e.nome_computador, e.apelido, f.nome AS nome_filial, u.nome AS nome_responsavel,
            s.versao, c.coletado_em
     FROM ti_equipamento e
     JOIN ti_inventario_coleta c ON c.id = (
         SELECT c2.id FROM ti_inventario_coleta c2
         WHERE c2.id_equipamento = e.id
         ORDER BY c2.coletado_em DESC, c2.id DESC
         LIMIT 1
     )
     JOIN ti_software s ON s.id_coleta = c.id AND s.nome = ?
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     ORDER BY e.nome_computador`,
    [nome],
  );
  res.json(equipamentos);
});

interface AprovacaoBody {
  nome: string;
  aprovado: boolean;
  versaoAprovada?: string;
}

tiSoftwaresAprovadosRouter.put('/', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { aprovacoes } = req.body as { aprovacoes?: AprovacaoBody[] };

  await withTransaction(async (connection) => {
    for (const item of aprovacoes ?? []) {
      const nome = item.nome.trim();
      if (!nome) continue;
      await connection.query(
        `INSERT INTO ti_software_aprovado (nome, aprovado, versao_aprovada)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE aprovado = VALUES(aprovado), versao_aprovada = VALUES(versao_aprovada)`,
        [nome, Boolean(item.aprovado), item.versaoAprovada?.trim() || null],
      );
    }
  });

  res.json({ ok: true });
});

tiSoftwaresAprovadosRouter.delete('/', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const nome = String((req.body as { nome?: string })?.nome ?? '').trim();
  if (!nome) {
    res.status(400).json({ erro: 'Informe o nome do software.' });
    return;
  }
  await pool.query('DELETE FROM ti_software_aprovado WHERE nome = ?', [nome]);
  res.json({ ok: true });
});
