import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import {
  accessTokenValido,
  buscarUsuarioAtual,
  credenciaisApp,
  desconectarConta,
  gerarPkce,
  listarContas,
  ML_AUTH_URL,
  salvarConta,
  trocarCodigoPorToken,
} from '../services/mercadoLivre/client.js';

export const mercadoLivreRouter = Router();

const ROTA = '/integracao/mercado-livre';

// Estado do fluxo OAuth em memória — vive só entre "conectar" e "callback"
// (minutos), não precisa de tabela nova. Único processo (sem múltiplas
// instâncias da API atrás de um load balancer nesta v1).
const oauthPendente = new Map<string, { verifier: string; criadoEm: number }>();
const TTL_OAUTH_MS = 10 * 60 * 1000;

function limparOauthExpirado() {
  const agora = Date.now();
  for (const [state, dados] of oauthPendente) {
    if (agora - dados.criadoEm > TTL_OAUTH_MS) oauthPendente.delete(state);
  }
}

mercadoLivreRouter.get('/conectar', authTenant, requirePermissao(ROTA, 'podeEditar'), async (_req, res) => {
  const { appId, redirectUri } = await credenciaisApp();
  limparOauthExpirado();

  const state = randomBytes(24).toString('hex');
  const { verifier, challenge } = gerarPkce();
  oauthPendente.set(state, { verifier, criadoEm: Date.now() });

  const url = new URL(ML_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  res.json({ url: url.toString() });
});

// Callback do Mercado Livre — o navegador chega aqui direto (redirect do
// próprio ML), sem token de sessão do portal. Confia só no `state`
// gerado em /conectar (proteção contra CSRF).
mercadoLivreRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const destino = new URL('/integracao/mercado-livre', env.frontendUrl);

  if (error || !code || !state) {
    destino.searchParams.set('ml', 'erro');
    destino.searchParams.set('mensagem', error ?? 'Parâmetros ausentes no retorno do Mercado Livre.');
    res.redirect(destino.toString());
    return;
  }

  const pendente = oauthPendente.get(state);
  oauthPendente.delete(state); // uso único, independente de sucesso
  if (!pendente) {
    destino.searchParams.set('ml', 'erro');
    destino.searchParams.set('mensagem', 'Sessão de conexão expirada ou inválida. Tente conectar de novo.');
    res.redirect(destino.toString());
    return;
  }

  try {
    const token = await trocarCodigoPorToken(code, pendente.verifier);
    const usuario = await buscarUsuarioAtual(token.access_token);
    await salvarConta(usuario.id, usuario.nickname, token);
    destino.searchParams.set('ml', 'sucesso');
  } catch (error_) {
    destino.searchParams.set('ml', 'erro');
    destino.searchParams.set('mensagem', (error_ as Error).message);
  }

  res.redirect(destino.toString());
});

mercadoLivreRouter.get('/contas', authTenant, requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const contas = await listarContas();
  res.json(contas.map((c) => ({ id: c.id, userIdMl: c.user_id_ml, nickname: c.nickname, expiraEm: c.expira_em })));
});

mercadoLivreRouter.post('/contas/:id/testar', authTenant, requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const contas = await listarContas();
  const conta = contas.find((c) => c.id === Number(req.params.id));
  if (!conta) {
    res.status(404).json({ erro: 'Conta não encontrada.' });
    return;
  }

  const accessToken = await accessTokenValido(conta);
  const usuario = await buscarUsuarioAtual(accessToken);
  res.json({ ok: true, nickname: usuario.nickname });
});

mercadoLivreRouter.delete('/contas/:id', authTenant, requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  await desconectarConta(Number(req.params.id));
  res.json({ ok: true });
});
