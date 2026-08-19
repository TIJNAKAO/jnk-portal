import type { PoolConnection } from '../../../config/database.js';
import { inteiro, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Saldo de Estoque (tipo_tabela 9). Payload
 * confirmado contra exemplo real documentado (ver
 * Specs/../spec/IntegracaoSysEmp.md do projeto de origem — resposta de
 * `/listarSaldoEstoqueFisico`).
 */
async function gravarEstoque(connection: PoolConnection, payload: Record<string, unknown> | null, acao: 'I' | 'U' | 'D', idRegistro: number): Promise<void> {
  if (acao === 'D' || !payload) {
    // A fila só informa o protocolo_estoque no evento de exclusão — localizar
    // a linha por ele antes de marcar deleted.
    await connection.query('UPDATE sysemp_estoque_fisico SET deleted = TRUE WHERE protocolo_estoque = ?', [String(idRegistro)]);
    return;
  }

  const idProduto = inteiro(payload, 'codigo_produto');
  const idEmpresa = inteiro(payload, 'id_empresa');
  if (idProduto === null || idEmpresa === null) {
    throw new Error(`Resposta de estoque sem codigo_produto/id_empresa (protocolo_estoque=${idRegistro}).`);
  }

  await connection.query(
    `INSERT INTO sysemp_estoque_fisico (
       id_produto, id_empresa, protocolo_estoque, codigo_produto_pai, estoque_minimo, estoque_maximo,
       saldo_disponivel, estoque_reservado, estoque_principal, estoque_importacao, estoque_avarias,
       estoque_loja, estoque_assistencia, estoque_armazem_externo, custo_formacao, custo_medio,
       deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       protocolo_estoque = VALUES(protocolo_estoque), codigo_produto_pai = VALUES(codigo_produto_pai),
       estoque_minimo = VALUES(estoque_minimo), estoque_maximo = VALUES(estoque_maximo),
       saldo_disponivel = VALUES(saldo_disponivel), estoque_reservado = VALUES(estoque_reservado),
       estoque_principal = VALUES(estoque_principal), estoque_importacao = VALUES(estoque_importacao),
       estoque_avarias = VALUES(estoque_avarias), estoque_loja = VALUES(estoque_loja),
       estoque_assistencia = VALUES(estoque_assistencia), estoque_armazem_externo = VALUES(estoque_armazem_externo),
       custo_formacao = VALUES(custo_formacao), custo_medio = VALUES(custo_medio), deleted = FALSE,
       synced_at = CURRENT_TIMESTAMP`,
    [
      idProduto,
      idEmpresa,
      valor(payload, 'protocolo_estoque'),
      inteiro(payload, 'codigo_produto_pai'),
      valor(payload, 'estoque_minimo'),
      valor(payload, 'estoque_maximo'),
      valor(payload, 'saldo_disponivel'),
      valor(payload, 'estoque_reservado'),
      valor(payload, 'estoque_principal'),
      valor(payload, 'estoque_importacao'),
      valor(payload, 'estoque_avarias'),
      valor(payload, 'estoque_loja'),
      valor(payload, 'estoque_assistencia'),
      valor(payload, 'estoque_armazem_externo'),
      valor(payload, 'custo_formacao'),
      valor(payload, 'custo_medio'),
    ],
  );
}

registrarConsumidorFila({ tipoTabela: 9, gravar: gravarEstoque });
