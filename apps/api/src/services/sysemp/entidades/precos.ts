import type { PoolConnection } from '../../../config/database.js';
import { sysempPost } from '../client.js';
import { inserirEmLote, inteiro, numeroSeguro, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Preço (tipo_tabela 6). Migrado da varredura por
 * faixa de `id_produto` (`/listarPrecos`, 1000 em 1000 sobre
 * `sysemp_produto`) pro modelo de fila, seguindo Notas Fiscais/Estoque/
 * Pedidos/Parceiros — ver `sysemp_fila_config`, chave 'precos', e
 * Specs/spec_modulo_integracao.md, seção 3.3.
 *
 * Duas particularidades:
 *
 * 1. Um evento de fila devolve VÁRIAS linhas: `/listarPrecoVenda` traz o
 *    produto em cada combinação de empresa × tabela de preço × condição de
 *    pagamento (11 linhas pro id_produto 13, em produção). O motor genérico
 *    da fila só sabe repassar `retorno[0]`, então `buscarDetalhe`
 *    sobrescreve o fetch e empacota a lista inteira em `{ linhas }`.
 * 2. Não há chave natural por linha — `sysemp_preco` tem PK
 *    auto_increment. Cada evento faz delete+insert do conjunto do produto
 *    (mesmo padrão de `sysemp_pedido_item`), o que também torna o
 *    reprocessamento do mesmo id_fila idempotente.
 */

export const COLUNAS_PRECO = [
  'id_produto',
  'id_empresa',
  'id_tb_preco',
  'id_condpagto',
  'nome_tabela',
  'nome_condicao',
  'preco_tabela',
  'preco_promocao',
  'data_inicio_promocao',
  'data_termino_promocao',
  'synced_at',
] as const;

interface DetalhePreco extends Record<string, unknown> {
  linhas: Record<string, unknown>[];
}

async function buscarDetalhePreco(idRegistro: number): Promise<DetalhePreco> {
  const resposta = await sysempPost<{ retorno: Record<string, unknown>[] }>('/listarPrecoVenda', {
    id_produto: String(idRegistro),
  });
  return { linhas: resposta.retorno ?? [] };
}

/**
 * Payload da SysEmp → tuplas na ordem de `COLUNAS_PRECO`.
 *
 * `id_produto` vem sempre do evento de fila, nunca do `codigo_produto` da
 * resposta: a busca já é filtrada por id, então divergência seria dado
 * inconsistente da origem, e gravá-la sob outro id_produto deixaria uma
 * linha órfã que o DELETE por id_produto do próximo evento não alcança.
 *
 * `numeroSeguro` protege contra lixo de cadastro do ERP de origem (valores
 * absurdos que derrubariam o INSERT inteiro) — vira NULL.
 */
export function montarLinhasPreco(linhas: Record<string, unknown>[], idRegistro: number): unknown[][] {
  const agora = new Date();

  return linhas.map((p) => [
    idRegistro,
    inteiro(p, 'id_empresa'),
    inteiro(p, 'id_tb_preco'),
    inteiro(p, 'id_condpagto'),
    valor(p, 'nome_tabela'),
    valor(p, 'nome_condicao'),
    numeroSeguro(p, 'preco_tabela'),
    numeroSeguro(p, 'preco_promocao'),
    valor(p, 'data_inicio_promocao'),
    valor(p, 'data_termino_promocao'),
    agora,
  ]);
}

async function gravarPreco(
  connection: PoolConnection,
  payload: Record<string, unknown> | null,
  acao: 'I' | 'U' | 'D',
  idRegistro: number,
): Promise<void> {
  // Vale pros três tipos de evento: em 'D' encerra a gravação, em 'I'/'U'
  // abre espaço pro conjunto novo (a resposta é sempre o estado completo
  // dos preços do produto, não um delta).
  await connection.query('DELETE FROM sysemp_preco WHERE id_produto = ?', [idRegistro]);
  if (acao === 'D' || !payload) return;

  const linhas = montarLinhasPreco((payload as DetalhePreco).linhas ?? [], idRegistro);
  await inserirEmLote(connection, 'sysemp_preco', [...COLUNAS_PRECO], linhas);
}

registrarConsumidorFila({ tipoTabela: 6, gravar: gravarPreco, buscarDetalhe: buscarDetalhePreco });
