import type { TipoEventoLog } from '@jnk-portal/shared';
import { pool } from '../config/database.js';

interface RegistrarAcessoParams {
  usuarioId: number;
  filialId: number | null;
  tipoEvento: TipoEventoLog;
  rotaTela?: string;
  ipOrigem?: string;
}

/**
 * Fire-and-forget: nunca deve ser `await`ada pelos chamadores. Erros de
 * gravação do log só vão pro console do servidor e nunca derrubam a
 * requisição principal. Ver spec, seção 8.
 */
export function registrarAcesso(params: RegistrarAcessoParams): void {
  gravar(params).catch((error) => {
    console.error('[logAcesso] falha ao gravar log de acesso:', error);
  });
}

async function gravar({ usuarioId, filialId, tipoEvento, rotaTela, ipOrigem }: RegistrarAcessoParams) {
  let telaId: number | null = null;

  if (rotaTela) {
    const [rows] = await pool.query<import('mysql2').RowDataPacket[]>(
      'SELECT id FROM telas_modulo WHERE rota_tela = ? LIMIT 1',
      [rotaTela],
    );
    telaId = rows[0]?.id ?? null;
  }

  await pool.query(
    `INSERT INTO logs_acesso (usuario_id, filial_id, tela_id, tipo_evento, ip_origem)
     VALUES (?, ?, ?, ?, ?)`,
    [usuarioId, filialId, telaId, tipoEvento, ipOrigem ?? null],
  );
}
