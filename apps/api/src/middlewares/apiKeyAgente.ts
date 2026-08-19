import type { NextFunction, Request, Response } from 'express';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

/**
 * Autenticação do agente de inventário (máquina, não humano) — token fixo
 * no header `X-Api-Key`, validado contra `ti_api_token`. Independente do
 * JWT de sessão: não existe usuário nem tela de login envolvida aqui.
 * Ver Specs/spec_modulo_ti.md, seção 3.
 */
export async function apiKeyAgente(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-api-key'];
  if (!token || typeof token !== 'string') {
    res.status(401).json({ erro: 'Token ausente. Envie o header X-Api-Key.' });
    return;
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM ti_api_token WHERE token = ? AND ativo = TRUE LIMIT 1',
    [token],
  );
  const registro = rows[0];
  if (!registro) {
    res.status(401).json({ erro: 'Token inválido ou inativo.' });
    return;
  }

  res.locals.tiApiTokenId = registro.id;
  next();
}
