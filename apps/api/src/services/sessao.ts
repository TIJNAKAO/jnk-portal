import type { Filial, UsuarioSessao } from '@jnk-portal/shared';
import type { RowDataPacket } from 'mysql2';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import { buscarModulosPermitidos } from './permissoes.js';

interface UsuarioRow extends RowDataPacket {
  id: number;
  nome: string;
  email: string;
  foto_perfil_base64: string | null;
  ativo: number;
}

interface FilialRow extends RowDataPacket {
  id: number;
  nome: string;
  cnpj: string;
}

interface PreferenciasRow extends RowDataPacket {
  tema_ui: UsuarioSessao['preferencias']['temaUi'];
  estilo_botoes: UsuarioSessao['preferencias']['estiloBotoes'];
}

function formatarNomeFilial(filial: FilialRow): string {
  return `${String(filial.id).padStart(2, '0')} - ${filial.nome}`;
}

/** Monta o payload completo de sessão devolvido pelo login e pela troca de filial. */
export async function montarUsuarioSessao(usuarioId: number, filialAtivaId: number): Promise<UsuarioSessao> {
  const [[usuarioRow], filiaisRows, [preferenciasRow], modulosPermitidos] = await Promise.all([
    pool.query<UsuarioRow[]>('SELECT * FROM usuarios WHERE id = ? LIMIT 1', [usuarioId]).then(([r]) => r),
    pool
      .query<FilialRow[]>(
        `SELECT f.id, f.nome, f.cnpj
         FROM filiais f
         JOIN usuarios_filiais uf ON uf.filial_id = f.id
         WHERE uf.usuario_id = ? AND f.ativa = TRUE
         ORDER BY f.id`,
        [usuarioId],
      )
      .then(([r]) => r),
    pool
      .query<PreferenciasRow[]>('SELECT tema_ui, estilo_botoes FROM preferencias_usuario WHERE usuario_id = ?', [
        usuarioId,
      ])
      .then(([r]) => r),
    buscarModulosPermitidos(usuarioId),
  ]);

  const usuario = usuarioRow;
  if (!usuario) {
    throw new Error(`Usuário ${usuarioId} não encontrado ao montar sessão.`);
  }

  const filiaisPermitidas: Filial[] = filiaisRows.map((f) => ({
    id: f.id,
    nomeFormatado: formatarNomeFilial(f),
    cnpj: f.cnpj,
  }));

  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    fotoPerfilBase64: usuario.foto_perfil_base64 ?? undefined,
    ativo: Boolean(usuario.ativo),
    filialAtivaId,
    filiaisPermitidas,
    preferencias: {
      temaUi: preferenciasRow?.tema_ui ?? 'LIGHT',
      estiloBotoes: preferenciasRow?.estilo_botoes ?? 'SOLID',
    },
    modulosPermitidos,
    versaoSistema: env.appVersion,
  };
}
