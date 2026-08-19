import type { PoolConnection } from '../../../config/database.js';
import { inteiro, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Nota Fiscal (tipo_tabela 2/3). Cabeçalho e itens
 * vêm juntos no mesmo JSON de `/listarNotasFiscais` — o formato exato dos
 * campos do payload não pôde ser confirmado contra a API real (sem
 * credenciais de teste); os nomes usados aqui espelham os nomes de coluna
 * originais do projeto de referência, que por sua vez foram nomeados
 * direto a partir do payload da SysEmp. **Validar contra uma resposta real
 * antes de considerar isto testado.**
 */

interface ItemNotaFiscalPayload {
  item?: number;
  codigo_produto?: number;
  qtde?: number;
  vr_unitario_bruto?: number;
  vr_total_bruto?: number;
  [chave: string]: unknown;
}

interface NotaFiscalPayload {
  id_nota_saida?: number;
  itens?: ItemNotaFiscalPayload[];
  [chave: string]: unknown;
}

async function gravarNotaFiscal(connection: PoolConnection, payload: Record<string, unknown> | null, acao: 'I' | 'U' | 'D', idRegistro: number): Promise<void> {
  if (acao === 'D') {
    await connection.query('UPDATE sysemp_nota_fiscal SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);
    await connection.query('UPDATE sysemp_nota_fiscal_item SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);
    return;
  }

  const nf = payload as NotaFiscalPayload | null;
  if (!nf) return;

  await connection.query(
    `INSERT INTO sysemp_nota_fiscal (
       id_nota_saida, marketplace_pedido, id_empresa, nota_serie_danfe, nota_numero, id_cliente, entrada_saida,
       nota_cfop, nota_cadastro, nota_emissao, nota_saida, cfop_descricao, status_nota, total_produtos, total_servicos,
       total_produtos_servicos, vr_frete, valor_frete_seller, valor_comissao, vr_outros, vr_acrescimo, vr_desconto,
       valor_nota, chave_nfe, protocolo_nfe, valor_icms, valor_ipi, valor_pis, valor_cofins, canal_venda,
       deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       marketplace_pedido = VALUES(marketplace_pedido), id_empresa = VALUES(id_empresa),
       nota_serie_danfe = VALUES(nota_serie_danfe), nota_numero = VALUES(nota_numero), id_cliente = VALUES(id_cliente),
       entrada_saida = VALUES(entrada_saida), nota_cfop = VALUES(nota_cfop), nota_cadastro = VALUES(nota_cadastro),
       nota_emissao = VALUES(nota_emissao), nota_saida = VALUES(nota_saida), cfop_descricao = VALUES(cfop_descricao),
       status_nota = VALUES(status_nota), total_produtos = VALUES(total_produtos), total_servicos = VALUES(total_servicos),
       total_produtos_servicos = VALUES(total_produtos_servicos), vr_frete = VALUES(vr_frete),
       valor_frete_seller = VALUES(valor_frete_seller), valor_comissao = VALUES(valor_comissao),
       vr_outros = VALUES(vr_outros), vr_acrescimo = VALUES(vr_acrescimo), vr_desconto = VALUES(vr_desconto),
       valor_nota = VALUES(valor_nota), chave_nfe = VALUES(chave_nfe), protocolo_nfe = VALUES(protocolo_nfe),
       valor_icms = VALUES(valor_icms), valor_ipi = VALUES(valor_ipi), valor_pis = VALUES(valor_pis),
       valor_cofins = VALUES(valor_cofins), canal_venda = VALUES(canal_venda), deleted = FALSE,
       synced_at = CURRENT_TIMESTAMP`,
    [
      idRegistro,
      valor(nf, 'marketplace_pedido'),
      inteiro(nf, 'codigo_empresa') ?? inteiro(nf, 'id_empresa'),
      valor(nf, 'serie'),
      valor(nf, 'numero'),
      inteiro(nf, 'codigo_cliente') ?? inteiro(nf, 'id_cliente'),
      valor(nf, 'entrada_saida'),
      valor(nf, 'cfop'),
      valor(nf, 'nota_cadastro'),
      valor(nf, 'nota_emissao'),
      valor(nf, 'nota_saida'),
      valor(nf, 'cfop_descricao'),
      valor(nf, 'status_nota'),
      valor(nf, 'total_produtos'),
      valor(nf, 'total_servicos'),
      valor(nf, 'total_produtos_servicos'),
      valor(nf, 'vr_frete'),
      valor(nf, 'valor_frete_seller'),
      valor(nf, 'valor_comissao'),
      valor(nf, 'vr_outros'),
      valor(nf, 'vr_acrescimo'),
      valor(nf, 'vr_desconto'),
      valor(nf, 'valor_nota'),
      valor(nf, 'chavenfe') ?? valor(nf, 'chave_nfe'),
      valor(nf, 'protocolonfe') ?? valor(nf, 'protocolo_nfe'),
      valor(nf, 'valoricms') ?? valor(nf, 'valor_icms'),
      valor(nf, 'valoripi') ?? valor(nf, 'valor_ipi'),
      valor(nf, 'valorpis') ?? valor(nf, 'valor_pis'),
      valor(nf, 'valorcofins') ?? valor(nf, 'valor_cofins'),
      valor(nf, 'canal_venda'),
    ],
  );

  // Soft-delete de todos os itens antes do upsert, "revivendo" só os que
  // vêm na resposta atual — item que sumir fica deleted=true.
  await connection.query('UPDATE sysemp_nota_fiscal_item SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);

  for (const item of nf.itens ?? []) {
    const numeroItem = inteiro(item, 'item');
    if (numeroItem === null) continue;

    await connection.query(
      `INSERT INTO sysemp_nota_fiscal_item (id_nota_saida, item, id_produto, qtde, vr_unitario_bruto, vr_total_bruto, ncm, cst, deleted, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         id_produto = VALUES(id_produto), qtde = VALUES(qtde), vr_unitario_bruto = VALUES(vr_unitario_bruto),
         vr_total_bruto = VALUES(vr_total_bruto), ncm = VALUES(ncm), cst = VALUES(cst), deleted = FALSE,
         synced_at = CURRENT_TIMESTAMP`,
      [
        idRegistro,
        numeroItem,
        inteiro(item, 'codigo_produto') ?? inteiro(item, 'id_produto'),
        valor(item, 'qtde'),
        valor(item, 'vr_unitario_bruto'),
        valor(item, 'vr_total_bruto'),
        valor(item, 'ncm'),
        valor(item, 'cst'),
      ],
    );
  }
}

registrarConsumidorFila({ tipoTabela: 2, gravar: gravarNotaFiscal });
