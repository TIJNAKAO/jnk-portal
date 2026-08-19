import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { azureAdHabilitado, env } from '../config/env.js';
import { pool, withTransaction } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { enviarEmail } from '../services/email.js';
import { registrarAcesso } from '../services/logAcesso.js';
import { assinarToken } from '../services/jwt.js';
import { montarUsuarioSessao } from '../services/sessao.js';

export const authRouter = Router();

interface UsuarioAuthRow extends RowDataPacket {
  id: number;
  senha_hash: string;
  ativo: number;
  ultimo_acesso_filial_id: number | null;
}

const MENSAGEM_ESQUECI_SENHA_GENERICA =
  'Se esse e-mail estiver cadastrado, você receberá um link de redefinição de senha em instantes.';

authRouter.post('/login', async (req, res) => {
  const { email, senha } = req.body as { email?: string; senha?: string };
  if (!email || !senha) {
    res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    return;
  }

  const [usuarios] = await pool.query<UsuarioAuthRow[]>(
    'SELECT id, senha_hash, ativo, ultimo_acesso_filial_id FROM usuarios WHERE email = ? LIMIT 1',
    [email],
  );
  const usuario = usuarios[0];

  if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senha_hash))) {
    res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    return;
  }

  const [filiaisPermitidas] = await pool.query<RowDataPacket[]>(
    `SELECT f.id FROM filiais f
     JOIN usuarios_filiais uf ON uf.filial_id = f.id
     WHERE uf.usuario_id = ? AND f.ativa = TRUE
     ORDER BY f.id`,
    [usuario.id],
  );

  if (filiaisPermitidas.length === 0) {
    res.status(403).json({ erro: 'Usuário sem filial vinculada. Contate um administrador.' });
    return;
  }

  const idsPermitidos = filiaisPermitidas.map((f) => f.id as number);
  const filialAtivaId = idsPermitidos.includes(usuario.ultimo_acesso_filial_id ?? -1)
    ? (usuario.ultimo_acesso_filial_id as number)
    : idsPermitidos[0]!;

  const token = assinarToken({ usuarioId: usuario.id, filialAtivaId });
  const usuarioSessao = await montarUsuarioSessao(usuario.id, filialAtivaId);

  registrarAcesso({ usuarioId: usuario.id, filialId: filialAtivaId, tipoEvento: 'LOGIN', ipOrigem: req.ip });

  res.json({ token, usuario: usuarioSessao });
});

authRouter.post('/switch-filial', authTenant, async (req, res) => {
  const { filialId } = req.body as { filialId?: number };
  if (!filialId) {
    res.status(400).json({ erro: 'filialId é obrigatório.' });
    return;
  }

  const usuarioId = req.usuario!.id;
  const [vinculo] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM usuarios_filiais uf
     JOIN filiais f ON f.id = uf.filial_id
     WHERE uf.usuario_id = ? AND uf.filial_id = ? AND f.ativa = TRUE
     LIMIT 1`,
    [usuarioId, filialId],
  );

  if (vinculo.length === 0) {
    res.status(403).json({ erro: 'Usuário não tem acesso a esta filial.' });
    return;
  }

  await pool.query('UPDATE usuarios SET ultimo_acesso_filial_id = ? WHERE id = ?', [filialId, usuarioId]);

  const token = assinarToken({ usuarioId, filialAtivaId: filialId });
  const usuarioSessao = await montarUsuarioSessao(usuarioId, filialId);

  registrarAcesso({ usuarioId, filialId, tipoEvento: 'SWITCH_FILIAL', ipOrigem: req.ip });

  res.json({ token, usuario: usuarioSessao });
});

authRouter.post('/esqueci-senha', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ erro: 'E-mail é obrigatório.' });
    return;
  }

  try {
    const [usuarios] = await pool.query<UsuarioAuthRow[]>(
      'SELECT id, ativo FROM usuarios WHERE email = ? LIMIT 1',
      [email],
    );
    const usuario = usuarios[0];

    if (usuario?.ativo) {
      const tokenCru = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(tokenCru).digest('hex');
      const expiraEm = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        'INSERT INTO tokens_reset_senha (usuario_id, token_hash, expira_em) VALUES (?, ?, ?)',
        [usuario.id, tokenHash, expiraEm],
      );

      const link = `${env.frontendUrl}/redefinir-senha?token=${tokenCru}`;
      await enviarEmail({
        para: email,
        assunto: 'Redefinição de senha — Portal',
        html: `<p>Clique no link abaixo para redefinir sua senha (válido por 1 hora):</p><p><a href="${link}">${link}</a></p>`,
      });
    }
  } catch (error) {
    console.error('[auth] falha no fluxo de esqueci-senha:', error);
  }

  // Sempre a mesma resposta — nunca vaza se o e-mail existe ou se o envio falhou.
  res.json({ mensagem: MENSAGEM_ESQUECI_SENHA_GENERICA });
});

authRouter.post('/redefinir-senha', async (req, res) => {
  const { token, novaSenha } = req.body as { token?: string; novaSenha?: string };
  if (!token || !novaSenha || novaSenha.length < 8) {
    res.status(400).json({ erro: 'Token e nova senha (mínimo 8 caracteres) são obrigatórios.' });
    return;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const [tokens] = await pool.query<RowDataPacket[]>(
    `SELECT id, usuario_id, expira_em, usado_em FROM tokens_reset_senha WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const registro = tokens[0];

  if (!registro || registro.usado_em || new Date(registro.expira_em) < new Date()) {
    res.status(400).json({ erro: 'Link inválido, já utilizado ou expirado.' });
    return;
  }

  const senhaHash = await bcrypt.hash(novaSenha, 10);

  await withTransaction(async (connection) => {
    await connection.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senhaHash, registro.usuario_id]);
    // Marca TODOS os tokens pendentes do usuário como usados, não só o apresentado.
    await connection.query(
      'UPDATE tokens_reset_senha SET usado_em = CURRENT_TIMESTAMP WHERE usuario_id = ? AND usado_em IS NULL',
      [registro.usuario_id],
    );
  });

  res.json({ mensagem: 'Senha redefinida com sucesso.' });
});

authRouter.get('/config', (_req, res) => {
  res.json({ azureAdHabilitado });
});
