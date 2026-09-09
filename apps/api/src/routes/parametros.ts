import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import {
  categoriaValida,
  DEFINICAO_CAMPOS,
  listarParametros,
  salvarParametros,
} from '../services/parametros.js';

export const parametrosRouter = Router();

const ROTA = '/config/parametros';

parametrosRouter.use(authTenant);

parametrosRouter.get('/:categoria', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { categoria } = req.params;
  if (!categoriaValida(categoria)) {
    res.status(400).json({ erro: 'Categoria inválida.' });
    return;
  }
  res.json(await listarParametros(categoria));
});

parametrosRouter.put('/:categoria', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { categoria } = req.params;
  if (!categoriaValida(categoria)) {
    res.status(400).json({ erro: 'Categoria inválida.' });
    return;
  }

  const camposValidos = new Set(DEFINICAO_CAMPOS[categoria].map((c) => c.chave));
  const campos = req.body as Record<string, string | undefined>;
  for (const chave of Object.keys(campos)) {
    if (!camposValidos.has(chave)) {
      res.status(400).json({ erro: `Campo desconhecido para a categoria ${categoria}: ${chave}` });
      return;
    }
  }

  await salvarParametros(categoria, campos);
  res.json({ ok: true });
});
