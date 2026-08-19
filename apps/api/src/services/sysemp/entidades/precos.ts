import type { RowDataPacket } from 'mysql2';
import { pool, withTransaction } from '../../../config/database.js';
import * as integracaoLog from '../../integracaoLog.js';
import type { ResultadoSincronizacao } from '../../integracaoLog.js';
import { sysempPost } from '../client.js';
import { inserirEmLote, inteiro, numeroSeguro, valor } from '../dbUtil.js';

const TAMANHO_FAIXA = 1000;

/**
 * `/listarPrecos` não pagina por offset — recebe uma faixa de `id_produto`.
 * Percorre `sysemp_produto` já sincronizado, de 1000 em 1000. Sem chave
 * natural por linha → delete + insert por faixa, não upsert. Ver
 * Specs/spec_modulo_integracao.md, seção 2.4.
 */
export async function sincronizarPrecos(idLog: number): Promise<ResultadoSincronizacao> {
  const [idsProduto] = await pool.query<RowDataPacket[]>('SELECT id_produto FROM sysemp_produto ORDER BY id_produto');
  const ids = idsProduto.map((r) => r.id_produto as number);

  if (ids.length === 0) {
    await integracaoLog.detalhe(idLog, {
      status: 'ok',
      qtdeRegistros: 0,
      mensagem: 'Nenhum produto sincronizado ainda — rode a sincronização de Produtos antes.',
    });
    return { qtde: 0 };
  }

  let total = 0;
  let valoresInvalidos = 0;

  for (let i = 0; i < ids.length; i += TAMANHO_FAIXA) {
    if (await integracaoLog.foiCancelado(idLog)) return { qtde: total, cancelado: true };

    const faixa = ids.slice(i, i + TAMANHO_FAIXA);
    const inicioFaixa = faixa[0]!;
    const fimFaixa = faixa[faixa.length - 1]!;
    const inicio = Date.now();

    try {
      const resposta = await sysempPost<{ retorno: Record<string, unknown>[] }>('/listarPrecos', {
        id_produto_inicio: String(inicioFaixa),
        id_produto_fim: String(fimFaixa),
      });
      const precos = resposta.retorno ?? [];

      await withTransaction(async (connection) => {
        await connection.query('DELETE FROM sysemp_preco WHERE id_produto BETWEEN ? AND ?', [inicioFaixa, fimFaixa]);

        const linhas: unknown[][] = [];
        for (const p of precos) {
          const idProduto = inteiro(p, 'codigo_produto') ?? inteiro(p, 'id_produto');
          if (idProduto === null) continue;

          const precoTabela = numeroSeguro(p, 'preco_tabela');
          const precoPromocao = numeroSeguro(p, 'preco_promocao');
          if (valor(p, 'preco_tabela') !== null && precoTabela === null) valoresInvalidos++;
          if (valor(p, 'preco_promocao') !== null && precoPromocao === null) valoresInvalidos++;

          linhas.push([
            idProduto,
            inteiro(p, 'id_tb_preco'),
            valor(p, 'nome_tabela'),
            valor(p, 'nome_condicao'),
            precoTabela,
            precoPromocao,
            valor(p, 'data_inicio_promocao'),
            valor(p, 'data_termino_promocao'),
            new Date(),
          ]);
        }

        await inserirEmLote(
          connection,
          'sysemp_preco',
          ['id_produto', 'id_tb_preco', 'nome_tabela', 'nome_condicao', 'preco_tabela', 'preco_promocao', 'data_inicio_promocao', 'data_termino_promocao', 'synced_at'],
          linhas,
        );
      });

      total += precos.length;
      await integracaoLog.detalhe(idLog, {
        pagina: inicioFaixa,
        status: 'ok',
        qtdeRegistros: precos.length,
        duracaoMs: Date.now() - inicio,
        mensagem: `Faixa id_produto ${inicioFaixa}-${fimFaixa}.`,
      });
    } catch (error) {
      await integracaoLog.detalhe(idLog, {
        pagina: inicioFaixa,
        status: 'erro',
        mensagem: `Faixa id_produto ${inicioFaixa}-${fimFaixa}: ${(error as Error).message}`,
        duracaoMs: Date.now() - inicio,
      });
      throw error;
    }
  }

  if (valoresInvalidos > 0) {
    await integracaoLog.detalhe(idLog, {
      status: 'ok',
      mensagem: `${valoresInvalidos} valor(es) de preço fora de faixa (lixo de cadastro no ERP de origem) gravados como NULL.`,
    });
  }

  return { qtde: total };
}
