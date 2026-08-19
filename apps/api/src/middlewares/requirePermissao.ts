import type { AcaoPermissao } from '@jnk-portal/shared';
import type { NextFunction, Request, Response } from 'express';
import { registrarAcesso } from '../services/logAcesso.js';
import { temPermissao } from '../services/permissoes.js';

/**
 * Factory de middleware: gate de rota do Configurador (e de módulos de
 * negócio futuros) por tela + ação. Roda depois de `authTenant`.
 * Ver Specs/spec_infra_portal_base_monorepo.md, seção 5.1.
 */
export function requirePermissao(rotaTela: string, acao: AcaoPermissao) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      res.status(401).json({ erro: 'Não autenticado.' });
      return;
    }

    const permitido = await temPermissao(req.usuario.id, rotaTela, acao);
    if (!permitido) {
      res.status(403).json({ erro: 'Sem permissão para executar esta ação.' });
      return;
    }

    if (acao === 'podeVisualizar') {
      registrarAcesso({
        usuarioId: req.usuario.id,
        filialId: req.usuario.filialAtivaId,
        rotaTela,
        tipoEvento: 'ACESSO_TELA',
        ipOrigem: req.ip,
      });
    }

    next();
  };
}
