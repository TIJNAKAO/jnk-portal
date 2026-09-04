import type { AcaoPermissao, ModuloAcesso } from '@jnk-portal/shared';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

interface PermissaoEfetivaRow extends RowDataPacket {
  telaId: number;
  nomeTela: string;
  rotaTela: string;
  moduloId: number;
  nomeModulo: string;
  chaveModulo: string;
  iconeModulo: string;
  descricaoModulo: string;
  podeVisualizar: number;
  podeCriar: number;
  podeEditar: number;
  podeDeletar: number;
}

/**
 * Fonte única da regra de permissão efetiva: união (OR) entre atribuição
 * direta (`permissoes_usuario`) e a de todos os Perfis ativos vinculados ao
 * usuário (`usuarios_perfis` → `perfis_telas`, só considerando `perfis.ativo`).
 *
 * `requirePermissao` (gate de rota) e `buscarModulosPermitidos` (monta o Hub
 * no login) usam ESTA MESMA função — não duplicar esta query em outro lugar.
 * Ver Specs/spec_infra_portal_base_monorepo.md, seção 7, "Cuidado ao
 * implementar esta regra".
 */
export async function buscarPermissoesEfetivas(usuarioId: number): Promise<PermissaoEfetivaRow[]> {
  const [rows] = await pool.query<PermissaoEfetivaRow[]>(
    `
    WITH combinado AS (
        SELECT tela_id, pode_visualizar, pode_criar, pode_editar, pode_deletar
        FROM permissoes_usuario
        WHERE usuario_id = ?

        UNION ALL

        SELECT pt.tela_id, pt.pode_visualizar, pt.pode_criar, pt.pode_editar, pt.pode_deletar
        FROM perfis_telas pt
        JOIN usuarios_perfis up ON up.perfil_id = pt.perfil_id AND up.usuario_id = ?
        JOIN perfis p ON p.id = pt.perfil_id AND p.ativo = TRUE
    )
    SELECT
        t.id AS telaId,
        t.nome_tela AS nomeTela,
        t.rota_tela AS rotaTela,
        m.id AS moduloId,
        m.nome AS nomeModulo,
        m.chave_modulo AS chaveModulo,
        m.icone AS iconeModulo,
        m.descricao AS descricaoModulo,
        MAX(c.pode_visualizar) AS podeVisualizar,
        MAX(c.pode_criar) AS podeCriar,
        MAX(c.pode_editar) AS podeEditar,
        MAX(c.pode_deletar) AS podeDeletar
    FROM combinado c
    JOIN telas_modulo t ON t.id = c.tela_id
    JOIN modulos_sistema m ON m.id = t.modulo_id
    GROUP BY t.id, t.nome_tela, t.rota_tela, m.id, m.nome, m.chave_modulo, m.icone, m.descricao
    HAVING MAX(c.pode_visualizar) = 1
    ORDER BY m.id, t.id
    `,
    [usuarioId, usuarioId],
  );
  return rows;
}

export async function temPermissao(usuarioId: number, rotaTela: string, acao: AcaoPermissao): Promise<boolean> {
  const permissoes = await buscarPermissoesEfetivas(usuarioId);
  const tela = permissoes.find((p) => p.rotaTela === rotaTela);
  if (!tela) return false;
  const campo = {
    podeVisualizar: tela.podeVisualizar,
    podeCriar: tela.podeCriar,
    podeEditar: tela.podeEditar,
    podeDeletar: tela.podeDeletar,
  } satisfies Record<AcaoPermissao, number>;
  return Boolean(campo[acao]);
}

export async function buscarModulosPermitidos(usuarioId: number): Promise<ModuloAcesso[]> {
  const permissoes = await buscarPermissoesEfetivas(usuarioId);
  const modulosPorId = new Map<number, ModuloAcesso>();

  for (const p of permissoes) {
    let modulo = modulosPorId.get(p.moduloId);
    if (!modulo) {
      modulo = {
        moduloId: p.moduloId,
        nomeModulo: p.nomeModulo,
        chaveModulo: p.chaveModulo,
        iconeModulo: p.iconeModulo,
        descricaoModulo: p.descricaoModulo,
        telas: [],
      };
      modulosPorId.set(p.moduloId, modulo);
    }
    modulo.telas.push({
      telaId: p.telaId,
      nomeTela: p.nomeTela,
      rotaTela: p.rotaTela,
      podeVisualizar: Boolean(p.podeVisualizar),
      podeCriar: Boolean(p.podeCriar),
      podeEditar: Boolean(p.podeEditar),
      podeDeletar: Boolean(p.podeDeletar),
    });
  }

  return Array.from(modulosPorId.values());
}
