import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEntidadeIntegracao, ENTIDADES_INTEGRACAO } from '../services/integracaoRegistry.js';
import { executarEmBackground } from '../services/integracaoLog.js';

export const integracaoPainelRouter = Router();

const ROTA = '/integracao/painel';

integracaoPainelRouter.use(authTenant);

integracaoPainelRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const cards = await Promise.all(
    ENTIDADES_INTEGRACAO.map(async (entidade) => {
      const [ultimaExecucao] = await pool.query<RowDataPacket[]>(
        'SELECT id, status, qtde_registros, executado_em FROM integracao_log WHERE entidade = ? ORDER BY executado_em DESC LIMIT 1',
        [entidade.chave],
      );
      return {
        chave: entidade.chave,
        nome: entidade.nome,
        ultimaExecucao: ultimaExecucao[0] ?? null,
      };
    }),
  );
  res.json(cards);
});

integracaoPainelRouter.post('/:chave/sincronizar', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const entidade = buscarEntidadeIntegracao(req.params.chave!);
  if (!entidade) {
    res.status(404).json({ erro: `Entidade '${req.params.chave}' não encontrada.` });
    return;
  }

  const idLog = await executarEmBackground(entidade.chave, entidade.sincronizar);
  res.status(202).json({ idLog });
});
