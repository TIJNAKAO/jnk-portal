import { Router } from 'express';
import multer from 'multer';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { compararColetas, diffParaLinhas, buscarColetaCompleta } from '../services/tiDiff.js';
import { listarParametros } from '../services/parametros.js';

const TEXTO_POLITICA_PADRAO =
  '[Cole aqui o texto da política de uso de equipamentos e software já aprovada pela empresa. ' +
  'Edite em TI → Parâmetros — este texto passa a aparecer em todos os termos gerados.]';

export const tiEquipamentosRouter = Router();

const ROTA = '/ti/equipamentos';
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB por foto

tiEquipamentosRouter.use(authTenant);

tiEquipamentosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { filialId, responsavelId, departamentoId } = req.query as Record<string, string | undefined>;

  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (filialId) {
    condicoes.push('e.filial_id = ?');
    params.push(filialId);
  }
  if (responsavelId) {
    condicoes.push('e.id_usuario_responsavel = ?');
    params.push(responsavelId);
  }
  if (departamentoId) {
    condicoes.push('e.id_departamento = ?');
    params.push(departamentoId);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const [equipamentos] = await pool.query<RowDataPacket[]>(
    `SELECT
        e.id, e.nome_computador, e.apelido, e.patrimonio, e.filial_id, f.nome AS nome_filial,
        e.serial_bios, e.serial_placa_mae, e.primeira_coleta_em, e.ultima_coleta_em,
        u.nome AS nome_responsavel, d.nome AS nome_departamento,
        (SELECT COUNT(*) FROM ti_inventario_coleta c WHERE c.id_equipamento = e.id) AS total_coletas,
        uc.id AS ultima_coleta_id,
        so.caption AS so_caption,
        proc.nome AS processador_nome,
        (SELECT COALESCE(SUM(r.capacidade_bytes), 0) FROM ti_memoria_ram r WHERE r.id_coleta = uc.id) AS ram_total_bytes
     FROM ti_equipamento e
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     LEFT JOIN ti_departamento d ON d.id = e.id_departamento
     LEFT JOIN ti_inventario_coleta uc ON uc.id = (
         SELECT c2.id FROM ti_inventario_coleta c2
         WHERE c2.id_equipamento = e.id
         ORDER BY c2.coletado_em DESC, c2.id DESC
         LIMIT 1
     )
     LEFT JOIN ti_sistema_operacional so ON so.id_coleta = uc.id
     LEFT JOIN ti_processador proc ON proc.id_coleta = uc.id
     ${where}
     ORDER BY e.nome_computador`,
    params,
  );
  res.json(equipamentos);
});

tiEquipamentosRouter.get('/:id', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const id = Number(req.params.id);

  const [equipamentos] = await pool.query<RowDataPacket[]>(
    `SELECT e.*, f.nome AS nome_filial, u.nome AS nome_responsavel, d.nome AS nome_departamento
     FROM ti_equipamento e
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     LEFT JOIN ti_departamento d ON d.id = e.id_departamento
     WHERE e.id = ?`,
    [id],
  );
  const equipamento = equipamentos[0];
  if (!equipamento) {
    res.status(404).json({ erro: 'Equipamento não encontrado.' });
    return;
  }

  const [fotos] = await pool.query<RowDataPacket[]>(
    'SELECT id, nome_arquivo, tamanho_bytes, enviado_em FROM ti_equipamento_foto WHERE id_equipamento = ? ORDER BY enviado_em DESC',
    [id],
  );

  const [coletas] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM ti_inventario_coleta WHERE id_equipamento = ? ORDER BY coletado_em DESC, id DESC',
    [id],
  );

  const atual = coletas[0] ? await buscarColetaCompleta(coletas[0].id as number) : null;

  res.json({ equipamento, fotos, coletas, atual });
});

tiEquipamentosRouter.put('/:id', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const { apelido, patrimonio, idDepartamento } = req.body as {
    apelido?: string;
    patrimonio?: string;
    idDepartamento?: number | null;
  };

  await pool.query(
    `UPDATE ti_equipamento SET
       apelido = ?,
       patrimonio = ?,
       id_departamento = ?
     WHERE id = ?`,
    [apelido || null, patrimonio || null, idDepartamento || null, req.params.id],
  );
  res.json({ ok: true });
});

tiEquipamentosRouter.get('/:id/comparar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const idEquipamento = Number(req.params.id);
  const idDe = Number(req.query.de);
  const idPara = Number(req.query.para);

  if (idDe === idPara) {
    res.status(400).json({ erro: 'Escolha duas coletas diferentes pra comparar.' });
    return;
  }

  // Confere que as duas coletas realmente pertencem a este equipamento.
  const [coletas] = await pool.query<RowDataPacket[]>(
    'SELECT id, coletado_em FROM ti_inventario_coleta WHERE id_equipamento = ? AND id IN (?, ?)',
    [idEquipamento, idDe, idPara],
  );
  if (coletas.length !== 2) {
    res.status(400).json({ erro: 'Uma das coletas selecionadas não pertence a este equipamento.' });
    return;
  }

  const diff = await compararColetas(idDe, idPara);
  const linhas = diffParaLinhas(diff);
  const coletaDe = coletas.find((c) => c.id === idDe);
  const coletaPara = coletas.find((c) => c.id === idPara);

  res.json({ coletaDe, coletaPara, linhas });
});

tiEquipamentosRouter.post('/:id/fotos', requirePermissao(ROTA, 'podeEditar'), upload.array('fotos', 10), async (req, res) => {
  const id = Number(req.params.id);
  const arquivos = (req.files as Express.Multer.File[]) ?? [];

  let enviadas = 0;
  for (const arquivo of arquivos) {
    if (!arquivo.mimetype.startsWith('image/')) continue; // só foto — evita virar upload genérico de arquivo
    await pool.query(
      `INSERT INTO ti_equipamento_foto (id_equipamento, nome_arquivo, tipo_mime, tamanho_bytes, conteudo)
       VALUES (?, ?, ?, ?, ?)`,
      [id, arquivo.originalname, arquivo.mimetype, arquivo.size, arquivo.buffer],
    );
    enviadas++;
  }

  res.json({ ok: true, enviadas });
});

tiEquipamentosRouter.get('/:id/fotos/:idFoto', async (req, res) => {
  // Exige login (mesma sessão do portal), mas não uma permissão de tela
  // específica — é um recurso auxiliar (<img src>), não uma tela em si.
  const [fotos] = await pool.query<RowDataPacket[]>(
    'SELECT tipo_mime, conteudo FROM ti_equipamento_foto WHERE id = ? AND id_equipamento = ?',
    [req.params.idFoto, req.params.id],
  );
  const foto = fotos[0];
  if (!foto) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', foto.tipo_mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(foto.conteudo);
});

tiEquipamentosRouter.delete('/:id/fotos/:idFoto', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  await pool.query('DELETE FROM ti_equipamento_foto WHERE id = ? AND id_equipamento = ?', [req.params.idFoto, req.params.id]);
  res.json({ ok: true });
});

tiEquipamentosRouter.get('/:id/termo', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const id = Number(req.params.id);

  const [equipamentos] = await pool.query<RowDataPacket[]>(
    `SELECT e.*, f.nome AS nome_filial, u.nome AS nome_responsavel, u.email AS email_responsavel, d.nome AS nome_departamento
     FROM ti_equipamento e
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     LEFT JOIN ti_departamento d ON d.id = e.id_departamento
     WHERE e.id = ?`,
    [id],
  );
  const equipamento = equipamentos[0];
  if (!equipamento) {
    res.status(404).json({ erro: 'Equipamento não encontrado.' });
    return;
  }

  const [coletas] = await pool.query<RowDataPacket[]>(
    'SELECT id, coletado_em FROM ti_inventario_coleta WHERE id_equipamento = ? ORDER BY coletado_em DESC, id DESC',
    [id],
  );
  if (coletas.length === 0) {
    res.status(422).json({ erro: 'Este equipamento ainda não tem nenhuma coleta — não dá pra gerar o termo.' });
    return;
  }

  const idColetaSolicitada = Number(req.query.coleta);
  const coletaEscolhida = coletas.find((c) => c.id === idColetaSolicitada) ?? coletas[0]!;
  const dados = await buscarColetaCompleta(coletaEscolhida.id as number);

  const [fotos] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM ti_equipamento_foto WHERE id_equipamento = ? ORDER BY enviado_em DESC LIMIT 1',
    [id],
  );

  const parametrosTi = await listarParametros('TI');
  const textoPolitica = parametrosTi.find((p) => p.chave === 'TERMO_POLITICA_TEXTO')?.valor || TEXTO_POLITICA_PADRAO;

  res.json({
    equipamento,
    coletas,
    coletaSelecionada: coletaEscolhida,
    dados,
    fotoId: fotos[0]?.id ?? null,
    textoPolitica,
  });
});
