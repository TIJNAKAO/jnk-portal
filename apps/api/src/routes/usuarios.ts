import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const usuariosRouter = Router();

const ROTA = '/config/usuarios';

interface UsuarioBody {
  nome?: string;
  email?: string;
  senha?: string;
  whatsapp?: string;
  filiaisIds?: number[];
  perfisIds?: number[];
  /**
   * Empresas do ERP que o usuário pode ver nos relatórios, no formato
   * `"SYSEMP:2"`. Dimensão separada da filial: filial é unidade
   * organizacional (onde fica um equipamento), empresa é entidade do ERP.
   * Ver services/escopoEmpresas.ts.
   */
  empresas?: string[];
}

/** `"SYSEMP:2"` → `['SYSEMP', 2]`. Descarta o que não estiver no formato. */
function parEmpresa(valor: string): [string, number] | null {
  const [origem, codigo] = valor.split(':');
  const numero = Number(codigo);
  if (!origem || !codigo || Number.isNaN(numero)) return null;
  return [origem, numero];
}

async function regravarEmpresas(
  connection: Parameters<Parameters<typeof withTransaction>[0]>[0],
  usuarioId: number,
  empresas: string[],
): Promise<void> {
  await connection.query('DELETE FROM usuarios_empresas WHERE usuario_id = ?', [usuarioId]);
  for (const valor of empresas) {
    const par = parEmpresa(valor);
    if (!par) continue;
    await connection.query(
      'INSERT IGNORE INTO usuarios_empresas (usuario_id, origem_dados, cd_filial) VALUES (?, ?, ?)',
      [usuarioId, par[0], par[1]],
    );
  }
}

usuariosRouter.use(authTenant);

/**
 * Empresas do ERP disponíveis para vincular, das duas origens. Vem de
 * `etl_empresa`, que é onde SysEmp e KPL já estão consolidados — daí sair com
 * as 4 filiais do ERP antigo junto das 9 da SysEmp.
 */
usuariosRouter.get('/empresas-erp', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [empresas] = await pool.query<RowDataPacket[]>(
    'SELECT origem_dados, cd_filial, dc_fantasia, dc_filial, grupo FROM etl_empresa ORDER BY origem_dados, grupo, cd_filial',
  );
  res.json(
    empresas.map((e) => ({
      valor: `${e.origem_dados}:${e.cd_filial}`,
      origem: e.origem_dados,
      grupo: e.grupo,
      nome: e.dc_fantasia || e.dc_filial,
    })),
  );
});

/** Empresas já vinculadas a um usuário — usado para marcar o formulário de edição. */
usuariosRouter.get('/:id/empresas-erp', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    'SELECT origem_dados, cd_filial FROM usuarios_empresas WHERE usuario_id = ?',
    [req.params.id],
  );
  res.json(linhas.map((l) => `${l.origem_dados}:${l.cd_filial}`));
});

usuariosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [usuarios] = await pool.query<RowDataPacket[]>(
    'SELECT id, nome, email, whatsapp, ativo, criado_em FROM usuarios ORDER BY nome',
  );
  res.json(usuarios);
});

usuariosRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { nome, email, senha, whatsapp, filiaisIds = [], perfisIds = [], empresas = [] } = req.body as UsuarioBody;

  if (!nome || !email || !senha || senha.length < 8) {
    res.status(400).json({ erro: 'Nome, e-mail e senha (mínimo 8 caracteres) são obrigatórios.' });
    return;
  }
  if (filiaisIds.length === 0) {
    res.status(400).json({ erro: 'É necessário vincular ao menos uma filial.' });
    return;
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  try {
    const usuarioId = await withTransaction(async (connection) => {
      const [resultado] = await connection.query<ResultSetHeader>(
        'INSERT INTO usuarios (nome, email, senha_hash, whatsapp) VALUES (?, ?, ?, ?)',
        [nome, email, senhaHash, whatsapp ?? null],
      );
      const novoId = resultado.insertId;

      await connection.query('INSERT INTO preferencias_usuario (usuario_id) VALUES (?)', [novoId]);

      await regravarEmpresas(connection, novoId, empresas);

      for (const filialId of filiaisIds) {
        await connection.query('INSERT INTO usuarios_filiais (usuario_id, filial_id) VALUES (?, ?)', [
          novoId,
          filialId,
        ]);
      }
      for (const perfilId of perfisIds) {
        await connection.query('INSERT INTO usuarios_perfis (usuario_id, perfil_id) VALUES (?, ?)', [
          novoId,
          perfilId,
        ]);
      }

      return novoId;
    });

    res.status(201).json({ id: usuarioId });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' });
      return;
    }
    throw error;
  }
});

usuariosRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const usuarioId = Number(req.params.id);
  const { nome, email, senha, whatsapp, filiaisIds, perfisIds, empresas, ativo } = req.body as UsuarioBody & {
    ativo?: boolean;
  };

  if (senha && senha.length < 8) {
    res.status(400).json({ erro: 'Senha deve ter no mínimo 8 caracteres.' });
    return;
  }

  await withTransaction(async (connection) => {
    if (senha) {
      const senhaHash = await bcrypt.hash(senha, 10);
      await connection.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senhaHash, usuarioId]);
    }

    await connection.query(
      `UPDATE usuarios SET
         nome = COALESCE(?, nome),
         email = COALESCE(?, email),
         whatsapp = COALESCE(?, whatsapp),
         ativo = COALESCE(?, ativo)
       WHERE id = ?`,
      [nome ?? null, email ?? null, whatsapp ?? null, ativo ?? null, usuarioId],
    );

    // `undefined` significa "não mexer"; lista vazia significa "tirar todas".
    if (empresas) {
      await regravarEmpresas(connection, usuarioId, empresas);
    }

    if (filiaisIds) {
      await connection.query('DELETE FROM usuarios_filiais WHERE usuario_id = ?', [usuarioId]);
      for (const filialId of filiaisIds) {
        await connection.query('INSERT INTO usuarios_filiais (usuario_id, filial_id) VALUES (?, ?)', [
          usuarioId,
          filialId,
        ]);
      }
    }

    if (perfisIds) {
      await connection.query('DELETE FROM usuarios_perfis WHERE usuario_id = ?', [usuarioId]);
      for (const perfilId of perfisIds) {
        await connection.query('INSERT INTO usuarios_perfis (usuario_id, perfil_id) VALUES (?, ?)', [
          usuarioId,
          perfilId,
        ]);
      }
    }
  });

  res.json({ ok: true });
});

// Soft delete — preserva ultimo_acesso_* e criado_em para auditoria.
usuariosRouter.delete('/:id', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('UPDATE usuarios SET ativo = FALSE WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
