import type { RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../../config/database.js';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';
import { accessTokenValido, buscarEstoqueFulfillment, buscarItensMl, listarContas, listarIdsItensFull } from './client.js';
import {
  dataRefBrasilia,
  extrairInventarios,
  type EstoqueFulfillmentMl,
  type InventarioItem,
} from './estoqueFullParse.js';

/** Chamadas simultâneas ao ML por conta — poucas, para não bater no 429. */
const CONCORRENCIA = 5;

export interface LinhaEstoqueFull {
  inventoryId: string;
  itemId: string;
  variacaoId: number | null;
  sku: string;
  titulo: string;
  total: number;
  disponivel: number;
  naoDisponivel: number;
  naoDisponivelDetalhe: string | null;
  /** Resposta bruta do ML, para descobrir campos ainda não mapeados. */
  payload: string;
}

export function linhaParaGravacao(inv: InventarioItem, estoque: EstoqueFulfillmentMl): LinhaEstoqueFull {
  const detalhe = estoque.not_available_detail;
  return {
    inventoryId: inv.inventoryId,
    itemId: inv.itemId,
    variacaoId: inv.variacaoId,
    sku: inv.sku,
    titulo: inv.titulo,
    total: estoque.total ?? 0,
    disponivel: estoque.available_units ?? 0,
    naoDisponivel: estoque.not_available_units ?? 0,
    naoDisponivelDetalhe: detalhe?.length ? JSON.stringify(detalhe) : null,
    payload: JSON.stringify(estoque),
  };
}

interface VinculoRow extends RowDataPacket {
  ml_conta_id: number;
}

async function contasComEmpresa(): Promise<Set<number>> {
  const [linhas] = await pool.query<VinculoRow[]>('SELECT ml_conta_id FROM ml_conta_empresa');
  return new Set(linhas.map((l) => l.ml_conta_id));
}

/** Um `inventory_id` pode aparecer em mais de um anúncio; fica o primeiro. */
function inventariosUnicos(itens: Awaited<ReturnType<typeof buscarItensMl>>): InventarioItem[] {
  const vistos = new Map<string, InventarioItem>();
  for (const item of itens) {
    for (const inv of extrairInventarios(item)) {
      if (!vistos.has(inv.inventoryId)) vistos.set(inv.inventoryId, inv);
    }
  }
  return [...vistos.values()];
}

/**
 * Foto diária do estoque FULL por conta com empresa vinculada. Coleta tudo
 * em memória e só então troca a foto do dia da conta numa transação — falha
 * no meio da coleta não apaga nem deixa pela metade o que já estava gravado.
 * Ver Specs/spec_modulo_integracao.md, seção 4.3.
 */
export async function sincronizarMlEstoqueFull(idLog: number): Promise<ResultadoSincronizacao> {
  const contas = await listarContas();
  if (contas.length === 0) {
    await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: 0, mensagem: 'Nenhuma conta do Mercado Livre conectada.' });
    return { qtde: 0 };
  }

  const vinculadas = await contasComEmpresa();
  const dataRef = dataRefBrasilia(new Date());
  let total = 0;

  for (const conta of contas) {
    if (await integracaoLog.foiCancelado(idLog)) return { qtde: total, cancelado: true };

    if (!vinculadas.has(conta.id)) {
      await integracaoLog.detalhe(idLog, {
        status: 'ok',
        qtdeRegistros: 0,
        mensagem: `Conta ${conta.nickname} sem empresa vinculada — ignorada.`,
      });
      continue;
    }

    const inicio = Date.now();
    try {
      const accessToken = await accessTokenValido(conta);
      const ids = await listarIdsItensFull(accessToken, conta.user_id_ml);
      const inventarios = inventariosUnicos(await buscarItensMl(accessToken, ids));

      const linhas: LinhaEstoqueFull[] = [];
      for (let i = 0; i < inventarios.length; i += CONCORRENCIA) {
        const bloco = inventarios.slice(i, i + CONCORRENCIA);
        const estoques = await Promise.all(bloco.map((inv) => buscarEstoqueFulfillment(accessToken, inv.inventoryId)));
        bloco.forEach((inv, k) => linhas.push(linhaParaGravacao(inv, estoques[k] as EstoqueFulfillmentMl)));
      }

      await withTransaction(async (connection) => {
        await connection.query('DELETE FROM ml_estoque_full WHERE data_ref = ? AND user_id_ml = ?', [dataRef, conta.user_id_ml]);
        for (const l of linhas) {
          await connection.query(
            `INSERT INTO ml_estoque_full
               (data_ref, user_id_ml, inventory_id, item_id, variacao_id, sku, titulo, total, disponivel, nao_disponivel, nao_disponivel_detalhe, payload_ml)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              dataRef,
              conta.user_id_ml,
              l.inventoryId,
              l.itemId,
              l.variacaoId,
              l.sku,
              l.titulo.slice(0, 255),
              l.total,
              l.disponivel,
              l.naoDisponivel,
              l.naoDisponivelDetalhe,
              l.payload,
            ],
          );
        }
      });

      total += linhas.length;
      await integracaoLog.detalhe(idLog, {
        status: 'ok',
        qtdeRegistros: linhas.length,
        duracaoMs: Date.now() - inicio,
        mensagem: `Conta ${conta.nickname}.`,
      });
    } catch (error) {
      await integracaoLog.detalhe(idLog, {
        status: 'erro',
        mensagem: `Conta ${conta.nickname}: ${(error as Error).message}`,
        duracaoMs: Date.now() - inicio,
      });
      throw error;
    }
  }

  return { qtde: total };
}
