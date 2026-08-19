import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  usuarioId: number;
  filialAtivaId: number;
}

export function assinarToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret(), { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verificarToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret()) as JwtPayload;
}
