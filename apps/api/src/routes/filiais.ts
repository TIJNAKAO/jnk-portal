import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const filiaisRouter = Router();

const ROTA = '/config/filiais';

function cnpjLimpo(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

function cnpjValido(cnpj: string): boolean {
  return cnpjLimpo(cnpj).length === 14;
}

filiaisRouter.use(authTenant);

filiaisRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [filiais] = await pool.query<RowDataPacket[]>('SELECT * FROM filiais ORDER BY id');
  res.json(filiais);
});

filiaisRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const { nome, cnpj } = req.body as { nome?: string; cnpj?: string };
  if (!nome || !cnpj || !cnpjValido(cnpj)) {
    res.status(400).json({ erro: 'Nome e CNPJ (14 dígitos) são obrigatórios.' });
    return;
  }

  const [resultado] = await pool.query<import('mysql2').ResultSetHeader>(
    'INSERT INTO filiais (nome, cnpj) VALUES (?, ?)',
    [nome, cnpj],
  );
  res.status(201).json({ id: resultado.insertId });
});

filiaisRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { nome, cnpj, ativa } = req.body as { nome?: string; cnpj?: string; ativa?: boolean };
  if (cnpj && !cnpjValido(cnpj)) {
    res.status(400).json({ erro: 'CNPJ deve ter 14 dígitos.' });
    return;
  }

  await pool.query(
    `UPDATE filiais SET
       nome = COALESCE(?, nome),
       cnpj = COALESCE(?, cnpj),
       ativa = COALESCE(?, ativa)
     WHERE id = ?`,
    [nome ?? null, cnpj ?? null, ativa ?? null, req.params.id],
  );
  res.json({ ok: true });
});

// Soft delete: filiais são referenciadas por FK em usuarios, usuarios_filiais e
// avisos_plataforma (e, pela diretriz da spec, por toda tabela de negócio
// futura) — apagar de verdade quebraria histórico e integridade referencial.
filiaisRouter.delete('/:id', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  await pool.query('UPDATE filiais SET ativa = FALSE WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
