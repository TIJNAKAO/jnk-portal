import { withTransaction } from '../../../config/database.js';
import * as integracaoLog from '../../integracaoLog.js';
import type { ResultadoSincronizacao } from '../../integracaoLog.js';
import { obterParametro } from '../../parametros.js';
import { sysempPost } from '../client.js';
import { inteiro, valor } from '../dbUtil.js';

const TAMANHO_JANELA_DIAS = 7;

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * `/listarPedidos` + `/listarPedidosItens` não paginam por offset — cada um
 * recebe uma faixa de data. Percorre o período configurável (Parâmetros,
 * categoria SYSEMP, PEDIDOS_DIAS_RETROATIVOS) em janelas de 7 dias. Sem FK
 * entre cabeçalho e item de propósito — ver
 * Specs/spec_modulo_integracao.md, seção 2.4.
 */
export async function sincronizarPedidos(idLog: number): Promise<ResultadoSincronizacao> {
  const diasRetroativos = Number((await obterParametro('SYSEMP', 'PEDIDOS_DIAS_RETROATIVOS')) ?? 45);

  const hoje = new Date();
  const inicioPeriodo = new Date(hoje);
  inicioPeriodo.setDate(inicioPeriodo.getDate() - diasRetroativos);

  let total = 0;
  let inicioJanela = new Date(inicioPeriodo);

  while (inicioJanela < hoje) {
    if (await integracaoLog.foiCancelado(idLog)) return { qtde: total, cancelado: true };

    const fimJanela = new Date(inicioJanela);
    fimJanela.setDate(fimJanela.getDate() + TAMANHO_JANELA_DIAS);
    const fimEfetivo = fimJanela > hoje ? hoje : fimJanela;

    const dataInicial = formatarData(inicioJanela);
    const dataFinal = formatarData(fimEfetivo);
    const inicio = Date.now();

    try {
      const [respostaCabecalho, respostaItens] = await Promise.all([
        sysempPost<{ retorno: Record<string, unknown>[] }>('/listarPedidos', { data_inicial: dataInicial, data_final: dataFinal }),
        sysempPost<{ retorno: Record<string, unknown>[] }>('/listarPedidosItens', { data_inicial: dataInicial, data_final: dataFinal }),
      ]);
      const cabecalhos = respostaCabecalho.retorno ?? [];
      const itens = respostaItens.retorno ?? [];

      await withTransaction(async (connection) => {
        for (const c of cabecalhos) {
          const idNotaSaida = inteiro(c, 'id_nota_saida');
          if (idNotaSaida === null) continue;

          await connection.query(
            `INSERT INTO sysemp_pedido (
               id_nota_saida, id_empresa, numero_pedido_sysemp, numero_pedido_marketplace, data_pedido, tipo_pedido,
               id_parceiro_cliente, id_parceiro_vendedor, id_parceiro_transportadora, valor_total_nota, valor_frete,
               valor_comissao, valor_desconto, data_venda, canal_venda, data_entrega, mensagem_nota, synced_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
               id_empresa = VALUES(id_empresa), numero_pedido_sysemp = VALUES(numero_pedido_sysemp),
               numero_pedido_marketplace = VALUES(numero_pedido_marketplace), data_pedido = VALUES(data_pedido),
               tipo_pedido = VALUES(tipo_pedido), id_parceiro_cliente = VALUES(id_parceiro_cliente),
               id_parceiro_vendedor = VALUES(id_parceiro_vendedor), id_parceiro_transportadora = VALUES(id_parceiro_transportadora),
               valor_total_nota = VALUES(valor_total_nota), valor_frete = VALUES(valor_frete),
               valor_comissao = VALUES(valor_comissao), valor_desconto = VALUES(valor_desconto),
               data_venda = VALUES(data_venda), canal_venda = VALUES(canal_venda), data_entrega = VALUES(data_entrega),
               mensagem_nota = VALUES(mensagem_nota), synced_at = CURRENT_TIMESTAMP`,
            [
              idNotaSaida,
              inteiro(c, 'codigo_empresa'),
              valor(c, 'numero_pedido_sysemp'),
              valor(c, 'numero_pedido_marketplace'),
              valor(c, 'data_pedido'),
              valor(c, 'tipo_pedido'),
              inteiro(c, 'codigo_cliente'),
              inteiro(c, 'codigo_vendedor'),
              inteiro(c, 'codigo_transportadora'),
              valor(c, 'valor_total_nota'),
              valor(c, 'valor_frete'),
              valor(c, 'valor_comissao'),
              valor(c, 'valor_desconto'),
              valor(c, 'data_venda'),
              valor(c, 'canal_venda'),
              valor(c, 'data_entrega'),
              valor(c, 'mensagem_nota'),
            ],
          );
        }

        // Sem chave natural por item — delete + insert pelos pedidos desta
        // janela, evita duplicar item ao resincronizar a mesma janela.
        const idsNotaSaidaComItens = [...new Set(itens.map((item) => inteiro(item, 'id_nota_saida')).filter((id): id is number => id !== null))];
        if (idsNotaSaidaComItens.length > 0) {
          await connection.query(`DELETE FROM sysemp_pedido_item WHERE id_nota_saida IN (${idsNotaSaidaComItens.map(() => '?').join(',')})`, idsNotaSaidaComItens);
        }

        for (const item of itens) {
          const idNotaSaida = inteiro(item, 'id_nota_saida');
          if (idNotaSaida === null) continue;

          await connection.query(
            `INSERT INTO sysemp_pedido_item (id_nota_saida, id_empresa, numero_pedido_sysemp, id_produto, quantidade, valor_unitario_liquido, valor_unitario_bruto, valor_frete, valor_comissao, quantidade_reservada, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              idNotaSaida,
              inteiro(item, 'codigo_empresa'),
              valor(item, 'numero_pedido_sysemp'),
              inteiro(item, 'codigo_produto'),
              valor(item, 'quantidade'),
              valor(item, 'valor_unitario_liquido'),
              valor(item, 'valor_unitario_bruto'),
              valor(item, 'valor_frete'),
              valor(item, 'valor_comissao'),
              valor(item, 'quantidade_reservada'),
            ],
          );
        }
      });

      total += cabecalhos.length;
      await integracaoLog.detalhe(idLog, {
        pagina: total,
        status: 'ok',
        qtdeRegistros: cabecalhos.length,
        duracaoMs: Date.now() - inicio,
        mensagem: `Janela ${dataInicial} a ${dataFinal}: ${cabecalhos.length} pedido(s), ${itens.length} item(ns).`,
      });
    } catch (error) {
      await integracaoLog.detalhe(idLog, {
        status: 'erro',
        mensagem: `Janela ${dataInicial} a ${dataFinal}: ${(error as Error).message}`,
        duracaoMs: Date.now() - inicio,
      });
      throw error;
    }

    inicioJanela = fimEfetivo;
  }

  return { qtde: total };
}
