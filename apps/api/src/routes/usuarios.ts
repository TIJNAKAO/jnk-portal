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
}

usuariosRouter.use(authTenant);

usuariosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [usuarios] = await pool.query<RowDataPacket[]>(
    'SELECT id, nome, email, whatsapp, ativo, criado_em FROM usuarios ORDER BY nome',
  );
  res.json(usuarios);
});

usuariosRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { nome, email, senha, whatsapp, filiaisIds = [], perfisIds = [] } = req.body as UsuarioBody;

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
  const { nome, email, senha, whatsapp, filiaisIds, perfisIds, ativo } = req.body as UsuarioBody & {
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
