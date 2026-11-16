import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { enviarEmail } from '../services/email.js';
import { DIAS_LIMITE_EMAIL, montarEmailAuditoria } from '../services/tiAuditoriaEmail.js';

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
        f.nome AS nome_filial, u.nome AS nome_responsavel, u.email AS email_responsavel, d.nome AS nome_departamento,
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

interface EquipamentoEmailRow extends RowDataPacket {
  nome_computador: string;
  apelido: string | null;
  ultima_coleta_em: Date | null;
  dias_sem_coletar: number | null;
  nome_responsavel: string | null;
  email_responsavel: string | null;
}

// Cobra por e-mail o envio do inventário. Com `teste: true` o e-mail vai para
// o e-mail do usuário logado (não para o responsável) — para conferir o texto
// antes de cobrar alguém de verdade. Só vale para quem está há mais de
// DIAS_LIMITE_EMAIL dias sem coletar (ou nunca coletou).
tiAuditoriaRouter.post('/:id/email', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const teste = req.body?.teste === true;

  const [linhas] = await pool.query<EquipamentoEmailRow[]>(
    `SELECT e.nome_computador, e.apelido, e.ultima_coleta_em,
            CASE WHEN e.ultima_coleta_em IS NULL THEN NULL ELSE DATEDIFF(NOW(), e.ultima_coleta_em) END AS dias_sem_coletar,
            u.nome AS nome_responsavel, u.email AS email_responsavel
     FROM ti_equipamento e
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     WHERE e.id = ? AND e.ativo = TRUE`,
    [req.params.id],
  );
  const equipamento = linhas[0];
  if (!equipamento) {
    res.status(404).json({ erro: 'Equipamento não encontrado.' });
    return;
  }

  const dias = equipamento.dias_sem_coletar;
  if (dias !== null && dias <= DIAS_LIMITE_EMAIL) {
    res.status(422).json({ erro: `Equipamento coletou há ${dias} dia(s); só é cobrado acima de ${DIAS_LIMITE_EMAIL}.` });
    return;
  }

  let destino: string | null;
  if (teste) {
    const [donos] = await pool.query<RowDataPacket[]>('SELECT email FROM usuarios WHERE id = ?', [req.usuario!.id]);
    destino = (donos[0]?.email as string | undefined) ?? null;
    if (!destino) {
      res.status(422).json({ erro: 'Seu usuário não tem e-mail cadastrado para receber o teste.' });
      return;
    }
  } else {
    destino = equipamento.email_responsavel;
    if (!destino) {
      res.status(422).json({ erro: 'O responsável não tem e-mail cadastrado (ou o equipamento não tem responsável).' });
      return;
    }
  }

  const { assunto, html } = montarEmailAuditoria({
    nomeResponsavel: equipamento.nome_responsavel,
    nomeEquipamento: equipamento.apelido || equipamento.nome_computador,
    diasSemColetar: dias,
    ultimaColetaEm: equipamento.ultima_coleta_em,
  });

  const enviado = await enviarEmail({
    para: destino,
    assunto: teste ? `[TESTE] ${assunto}` : assunto,
    html,
  });
  if (!enviado) {
    res.status(422).json({ erro: 'SMTP não configurado. Preencha em Configurador → Parâmetros → E-mail.' });
    return;
  }

  res.json({ enviado: true, para: destino, teste });
});
