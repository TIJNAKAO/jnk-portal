import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiDashboardRouter = Router();

const ROTA = '/ti/dashboard';

tiDashboardRouter.use(authTenant);

interface Contagem extends RowDataPacket {
  rotulo: string;
  quantidade: number;
}

/**
 * Top N por quantidade + um "Outros" com a soma do resto — evita o gráfico
 * de processador virar uma lista enorme quando o parque tem muitos modelos
 * diferentes com 1-2 máquinas cada.
 */
function agruparTopNMaisOutros(linhas: Contagem[], n: number): { rotulo: string; quantidade: number }[] {
  const ordenadas = [...linhas].sort((a, b) => Number(b.quantidade) - Number(a.quantidade));
  const topN = ordenadas.slice(0, n).map((l) => ({ rotulo: l.rotulo, quantidade: Number(l.quantidade) }));
  const somaResto = ordenadas.slice(n).reduce((soma, l) => soma + Number(l.quantidade), 0);
  if (somaResto > 0) topN.push({ rotulo: 'Outros', quantidade: somaResto });
  return topN;
}

tiDashboardRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { filialId, departamentoId } = req.query as Record<string, string | undefined>;

  const condicoes: string[] = ['e.ativo = TRUE'];
  const params: unknown[] = [];
  if (filialId) {
    condicoes.push('e.filial_id = ?');
    params.push(filialId);
  }
  if (departamentoId) {
    condicoes.push('e.id_departamento = ?');
    params.push(departamentoId);
  }
  const where = condicoes.join(' AND ');

  // Mesma subquery correlacionada de "última coleta" usada em GET
  // /ti/equipamentos e /ti/softwares-aprovados — repetida aqui porque o
  // módulo TI não tem camada de serviço compartilhada pras rotas de
  // consulta (ver Global Constraints).
  const ultimaColeta = `
    LEFT JOIN ti_inventario_coleta uc ON uc.id = (
        SELECT c2.id FROM ti_inventario_coleta c2
        WHERE c2.id_equipamento = e.id
        ORDER BY c2.coletado_em DESC, c2.id DESC
        LIMIT 1
    )`;

  const [totalLinhas] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ti_equipamento e WHERE ${where}`, params);
  const totalEquipamentos = Number(totalLinhas[0]?.total ?? 0);

  const [comColetaLinhas] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ti_equipamento e ${ultimaColeta} WHERE ${where} AND uc.id IS NOT NULL`,
    params,
  );
  const equipamentosComColeta = Number(comColetaLinhas[0]?.total ?? 0);

  const [porSistemaOperacional] = await pool.query<Contagem[]>(
    `SELECT COALESCE(so.caption, 'Sem dado') AS rotulo, COUNT(*) AS quantidade
     FROM ti_equipamento e ${ultimaColeta}
     LEFT JOIN ti_sistema_operacional so ON so.id_coleta = uc.id
     WHERE ${where}
     GROUP BY rotulo
     ORDER BY quantidade DESC`,
    params,
  );

  const [porProcessadorBruto] = await pool.query<Contagem[]>(
    `SELECT COALESCE(proc.nome, 'Sem dado') AS rotulo, COUNT(*) AS quantidade
     FROM ti_equipamento e ${ultimaColeta}
     LEFT JOIN ti_processador proc ON proc.id_coleta = uc.id
     WHERE ${where}
     GROUP BY rotulo
     ORDER BY quantidade DESC`,
    params,
  );

  const [porFaixaRam] = await pool.query<Contagem[]>(
    `SELECT
        CASE
          WHEN ram.total_bytes IS NULL THEN 'Sem dado'
          WHEN ram.total_bytes < 8589934592 THEN '< 8 GB'
          WHEN ram.total_bytes < 17179869184 THEN '8–16 GB'
          WHEN ram.total_bytes < 34359738368 THEN '16–32 GB'
          ELSE '> 32 GB'
        END AS rotulo,
        COUNT(*) AS quantidade
     FROM ti_equipamento e ${ultimaColeta}
     LEFT JOIN (
         SELECT id_coleta, SUM(capacidade_bytes) AS total_bytes
         FROM ti_memoria_ram GROUP BY id_coleta
     ) ram ON ram.id_coleta = uc.id
     WHERE ${where}
     GROUP BY rotulo`,
    params,
  );

  const [discoLinhas] = await pool.query<RowDataPacket[]>(
    `SELECT
        COALESCE(SUM(v.tamanho_bytes), 0) AS totalBytes,
        COALESCE(SUM(v.espaco_livre_bytes), 0) AS livreBytes,
        COUNT(DISTINCT e.id) AS maquinasComDado
     FROM ti_equipamento e ${ultimaColeta}
     JOIN ti_volume v ON v.id_coleta = uc.id
     WHERE ${where}`,
    params,
  );
  const disco = discoLinhas[0] ?? { totalBytes: 0, livreBytes: 0, maquinasComDado: 0 };

  const [maquinasCriticas] = await pool.query<RowDataPacket[]>(
    `SELECT e.id, e.apelido, e.nome_computador,
            SUM(v.tamanho_bytes) AS total_bytes, SUM(v.espaco_livre_bytes) AS livre_bytes
     FROM ti_equipamento e ${ultimaColeta}
     JOIN ti_volume v ON v.id_coleta = uc.id
     WHERE ${where}
     GROUP BY e.id, e.apelido, e.nome_computador
     HAVING total_bytes > 0
     ORDER BY (livre_bytes / total_bytes) ASC
     LIMIT 10`,
    params,
  );

  res.json({
    total_equipamentos: totalEquipamentos,
    equipamentos_com_coleta: equipamentosComColeta,
    por_sistema_operacional: porSistemaOperacional,
    por_processador: agruparTopNMaisOutros(porProcessadorBruto, 8),
    por_faixa_ram: porFaixaRam,
    disco: {
      total_bytes: Number(disco.totalBytes),
      livre_bytes: Number(disco.livreBytes),
      maquinas_com_dado: Number(disco.maquinasComDado),
    },
    maquinas_criticas: maquinasCriticas,
  });
});
