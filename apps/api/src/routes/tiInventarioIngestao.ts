import { Router } from 'express';
import { apiKeyAgente } from '../middlewares/apiKeyAgente.js';
import { marcarTokenUsado, processarInventario } from '../services/tiIngestao.js';
import type { TiInventarioPayload } from '../types/tiPayload.js';

export const tiInventarioIngestaoRouter = Router();

// Nota: o endpoint PHP original precisou de set_time_limit(120) porque o
// padrão do PHP-FPM é 30s — Node/Express não tem esse limite baixo por
// padrão, então não é necessário replicar aqui.
tiInventarioIngestaoRouter.post('/', apiKeyAgente, async (req, res) => {
  const payload = req.body as TiInventarioPayload;

  const nomeComputador = String(payload?.computador?.nome ?? '').trim();
  const coletadoEm = String(payload?.coleta?.coletado_em ?? '').trim();

  if (!nomeComputador) {
    res.status(422).json({ erro: 'computador.nome é obrigatório.' });
    return;
  }
  if (!coletadoEm || Number.isNaN(Date.parse(coletadoEm))) {
    res.status(422).json({ erro: 'coleta.coletado_em é obrigatório e precisa ser uma data/hora válida.' });
    return;
  }

  const resultado = await processarInventario(payload, JSON.stringify(req.body));
  await marcarTokenUsado(res.locals.tiApiTokenId as number);

  res.status(201).json({
    ok: true,
    id_equipamento: resultado.idEquipamento,
    id_coleta: resultado.idColeta,
    total_software: resultado.totalSoftware,
  });
});
