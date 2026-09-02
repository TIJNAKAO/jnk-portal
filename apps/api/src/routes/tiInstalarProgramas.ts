import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { CATALOGO_INDESEJADOS, empacotarComoBat, gerarScriptInstalarProgramas } from '../services/tiScripts.js';

export const tiInstalarProgramasRouter = Router();

const ROTA = '/ti/instalar-programas';

tiInstalarProgramasRouter.use(authTenant);

tiInstalarProgramasRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [programas] = await pool.query<RowDataPacket[]>(
    'SELECT id, nome, winget_id FROM ti_catalogo_programa WHERE ativo = TRUE ORDER BY nome',
  );
  res.json({ programas, catalogoIndesejados: CATALOGO_INDESEJADOS.map(({ id, nome }) => ({ id, nome })) });
});

// Nada roda automaticamente a partir do clique — é só a geração do arquivo.
// Rodar o script é sempre uma ação manual de quem estiver na máquina.
tiInstalarProgramasRouter.post('/script', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { programaIds, desinstalarIds, habilitarAdmin } = req.body as {
    programaIds?: number[];
    desinstalarIds?: string[];
    habilitarAdmin?: boolean;
  };

  const idsIndesejadosValidos = new Set(CATALOGO_INDESEJADOS.map((i) => i.id));
  const idsIndesejados = (desinstalarIds ?? []).filter((id) => idsIndesejadosValidos.has(id));

  let selecionados: { nome: string; wingetId: string; configurarAcessoRemoto: boolean }[] = [];
  if (programaIds && programaIds.length > 0) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT nome, winget_id, configurar_acesso_remoto FROM ti_catalogo_programa WHERE id IN (?) AND ativo = TRUE ORDER BY nome`,
      [programaIds],
    );
    selecionados = rows.map((r) => ({
      nome: r.nome as string,
      wingetId: r.winget_id as string,
      configurarAcessoRemoto: Boolean(r.configurar_acesso_remoto),
    }));
  }

  if (selecionados.length === 0 && idsIndesejados.length === 0 && !habilitarAdmin) {
    res.status(400).json({
      erro: 'Selecione pelo menos uma opção: programa pra instalar, programa indesejado pra remover, ou habilitar o Administrador local.',
    });
    return;
  }

  const script = gerarScriptInstalarProgramas({
    selecionados,
    idsIndesejados,
    habilitarAdmin: Boolean(habilitarAdmin),
  });

  // .bat em vez de .ps1: um .ps1 abre no Bloco de Notas no duplo clique, e
  // mesmo por "Executar com PowerShell" esbarra em ExecutionPolicy e falta
  // de elevacao. Ver empacotarComoBat.
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="instalar_programas.bat"');
  res.send(empacotarComoBat('instalar_programas', script));
});
