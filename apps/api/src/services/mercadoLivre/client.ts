import { createHash, randomBytes } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { ConfiguracaoAusenteError } from '../erros.js';
import { obterParametro } from '../parametros.js';

export const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
const ML_API_URL = 'https://api.mercadolibre.com';
const MARGEM_RENOVACAO_SEGUNDOS = 600;

export class MercadoLivreError extends Error {}

export interface PkcePar {
  verifier: string;
  challenge: string;
}

/** PKCE S256 — aceito sempre pelo Mercado Livre. */
export function gerarPkce(): PkcePar {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function credenciaisApp(): Promise<{ appId: string; secret: string; redirectUri: string }> {
  const [appId, secret, redirectUri] = await Promise.all([
    obterParametro('MERCADO_LIVRE', 'APP_ID'),
    obterParametro('MERCADO_LIVRE', 'SECRET'),
    obterParametro('MERCADO_LIVRE', 'REDIRECT_URI'),
  ]);
  if (!appId || !secret || !redirectUri) {
    throw new ConfiguracaoAusenteError('Configure APP_ID, SECRET e REDIRECT_URI do Mercado Livre em Parâmetros do Sistema.');
  }
  return { appId, secret, redirectUri };
}

/** Retry de HTTP 429 com backoff linear (5s, 10s, 15s) — até 4 tentativas. Diferente do cliente SysEmp, deliberadamente. */
async function request<T>(url: string, init: RequestInit, tentativa = 1): Promise<T> {
  const resposta = await fetch(url, init);

  if (resposta.status === 429 && tentativa < 4) {
    await new Promise((resolve) => setTimeout(resolve, tentativa * 5000));
    return request<T>(url, init, tentativa + 1);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new MercadoLivreError(`Mercado Livre respondeu HTTP ${resposta.status}: ${corpo.slice(0, 500)}`);
  }

  return resposta.json() as Promise<T>;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  user_id: number;
}

export async function trocarCodigoPorToken(code: string, verifier: string): Promise<TokenResponse> {
  const { appId, secret, redirectUri } = await credenciaisApp();
  return request<TokenResponse>(`${ML_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
}

async function renovarToken(refreshToken: string): Promise<TokenResponse> {
  const { appId, secret } = await credenciaisApp();
  return request<TokenResponse>(`${ML_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: secret,
      refresh_token: refreshToken,
    }),
  });
}

export interface UsuarioMl {
  id: number;
  nickname: string;
}

export async function buscarUsuarioAtual(accessToken: string): Promise<UsuarioMl> {
  return request<UsuarioMl>(`${ML_API_URL}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

interface ContaMlRow extends RowDataPacket {
  id: number;
  user_id_ml: number;
  access_token: string;
  refresh_token: string;
  expira_em: string;
}

export async function salvarConta(userIdMl: number, nickname: string, token: TokenResponse): Promise<void> {
  const expiraEm = new Date(Date.now() + token.expires_in * 1000);
  await pool.query<ResultSetHeader>(
    `INSERT INTO ml_conta (user_id_ml, nickname, access_token, refresh_token, expira_em, scopes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), access_token = VALUES(access_token),
       refresh_token = VALUES(refresh_token), expira_em = VALUES(expira_em), scopes = VALUES(scopes)`,
    [userIdMl, nickname, token.access_token, token.refresh_token, expiraEm, token.scope],
  );
}

export async function listarContas(): Promise<ContaMlRow[]> {
  const [linhas] = await pool.query<ContaMlRow[]>('SELECT * FROM ml_conta ORDER BY nickname');
  return linhas;
}

/** Renova o access_token se estiver perto de expirar, grava o par novo por cima e devolve o token válido. */
export async function accessTokenValido(conta: ContaMlRow): Promise<string> {
  const expiraEm = new Date(conta.expira_em).getTime();
  const faltamSegundos = (expiraEm - Date.now()) / 1000;

  if (faltamSegundos > MARGEM_RENOVACAO_SEGUNDOS) {
    return conta.access_token;
  }

  const tokenNovo = await renovarToken(conta.refresh_token);
  const expiraEmNovo = new Date(Date.now() + tokenNovo.expires_in * 1000);
  await pool.query('UPDATE ml_conta SET access_token = ?, refresh_token = ?, expira_em = ? WHERE id = ?', [
    tokenNovo.access_token,
    tokenNovo.refresh_token,
    expiraEmNovo,
    conta.id,
  ]);
  return tokenNovo.access_token;
}

export async function buscarPedidosMl<T>(accessToken: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  return request<T>(`${ML_API_URL}/orders/search?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function desconectarConta(id: number): Promise<void> {
  await pool.query('DELETE FROM ml_conta WHERE id = ?', [id]);
}
