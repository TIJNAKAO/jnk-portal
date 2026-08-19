import type { NextFunction, Request, Response } from 'express';
import { verificarToken } from '../services/jwt.js';

/**
 * Valida o JWT e popula `req.usuario` com `{ id, filialAtivaId }`.
 * Todas as rotas autenticadas do portal passam por aqui — é a base do
 * isolamento por tenant (filial), já que `filialAtivaId` vem do próprio
 * token, não de um parâmetro que o cliente poderia forjar.
 */
export function authTenant(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  // `EventSource` do navegador não permite header customizado — para o
  // stream SSE de acompanhamento de execuções (seção 2.7 do spec de
  // Integração), aceita o token via query string como alternativa.
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : (req.query.token as string | undefined);

  if (!token) {
    res.status(401).json({ erro: 'Token de autenticação ausente.' });
    return;
  }

  try {
    const payload = verificarToken(token);
    req.usuario = { id: payload.usuarioId, filialAtivaId: payload.filialAtivaId };
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}
