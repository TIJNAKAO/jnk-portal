import type { PoolConnection } from '../../../config/database.js';
import { dataHoraSysemp, inteiro, inteiroNaoZero, numeroSeguro, simNao, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Nota Fiscal (tipo_tabela 2). Cabeçalho e itens vêm
 * juntos no mesmo JSON de `/listarNotasFiscais`.
 *
 * Os nomes dos campos foram conferidos contra três NFs reais de produção em
 * 31/08/2026 (balcão sem imposto, marketplace interestadual com DIFAL,
 * marketplace com IPI). Vários NÃO seguem o padrão das colunas de destino —
 * `valoricms`, `icmsst`, `valorpis`, `valorcofins`, `valoripi`,
 * `valorcomissaoml`, `vr_item_liq`, `vfcpufdest`, `vicmsufdest`,
 * `vicmsufremet`, `vfcpst`, `datacancelamento_nfe`, `chavenfe`,
 * `protocolonfe`. Foi exatamente esse descompasso que fez a versão anterior
 * gravar só 8 colunas do item e descartar todo o bloco fiscal entre
 * 19/08/2026 e 31/08/2026. Ao mexer aqui, confira contra o payload real
 * antes de renomear qualquer chave.
 *
 * Sobre `vr_item_liq`: é base de ICMS (mercadoria − desconto + frete + IPI),
 * NÃO receita líquida. Não usar como "valor líquido" em relatório de margem.
 */

interface NotaFiscalPayload {
  id_nota_saida?: number | string;
  itens?: Record<string, unknown>[];
  [chave: string]: unknown;
}

/**
 * Monta `INSERT ... ON DUPLICATE KEY UPDATE` a partir de um mapa
 * coluna→valor. Com ~46 colunas por item, escrever as duas listas à mão é
 * como o descompasso anterior passou despercebido: aqui elas não podem
 * divergir. `chaves` não entram no UPDATE (são a chave do upsert).
 */
function montarUpsert(
  tabela: string,
  dados: Record<string, unknown>,
  chaves: string[],
): { sql: string; params: unknown[] } {
  const colunas = Object.keys(dados);
  const atualizaveis = colunas.filter((c) => !chaves.includes(c));

  const sql = `INSERT INTO ${tabela} (${colunas.join(', ')}, deleted, synced_at)
     VALUES (${colunas.map(() => '?').join(', ')}, FALSE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       ${atualizaveis.map((c) => `${c} = VALUES(${c})`).join(', ')},
       deleted = FALSE, synced_at = CURRENT_TIMESTAMP`;

  return { sql, params: colunas.map((c) => dados[c]) };
}

function colunasCabecalho(nf: NotaFiscalPayload, idRegistro: number): Record<string, unknown> {
  return {
    id_nota_saida: idRegistro,
    id_empresa: inteiro(nf, 'codigo_empresa') ?? inteiro(nf, 'id_empresa'),
    id_cliente: inteiro(nf, 'codigo_cliente') ?? inteiro(nf, 'id_cliente'),
    id_transportadora: inteiroNaoZero(nf, 'id_transportadora') ?? inteiroNaoZero(nf, 'codigo_transportadora'),
    id_vendedor: inteiroNaoZero(nf, 'id_vendedor') ?? inteiroNaoZero(nf, 'codigo_vendedor'),
    id_vendedor2: inteiroNaoZero(nf, 'id_vendedor2'),

    marketplace_pedido: valor(nf, 'marketplace_pedido'),
    numero_pedido_marketplace: valor(nf, 'numero_pedido_marketplace'),
    tipo_documento: valor(nf, 'tipo_documento'),
    tipo_pedido: valor(nf, 'tipo_pedido'),
    entrada_saida: valor(nf, 'entrada_saida'),

    nota_serie_danfe: valor(nf, 'nota_serie_danfe'),
    nota_numero: valor(nf, 'nota_numero'),
    nota_cfop: valor(nf, 'nota_cfop'),
    cfop_descricao: valor(nf, 'cfop_descricao'),
    status_nota: valor(nf, 'status_nota'),

    nota_cadastro: valor(nf, 'nota_cadastro'),
    nota_emissao: valor(nf, 'nota_emissao'),
    nota_saida: valor(nf, 'nota_saida'),
    data_pedido: valor(nf, 'data_pedido'),
    data_venda: valor(nf, 'data_venda'),
    data_entrega: valor(nf, 'data_entrega'),

    total_produtos: numeroSeguro(nf, 'total_produtos'),
    total_servicos: numeroSeguro(nf, 'total_servicos'),
    total_produtos_servicos: numeroSeguro(nf, 'total_produtos_servicos'),
    vr_frete: numeroSeguro(nf, 'vr_frete'),
    valor_frete_seller: numeroSeguro(nf, 'valor_frete_seller'),
    valor_comissao: numeroSeguro(nf, 'valor_comissao'),
    vr_outros: numeroSeguro(nf, 'vr_outros'),
    vr_acrescimo: numeroSeguro(nf, 'vr_acrescimo'),
    vr_desconto: numeroSeguro(nf, 'vr_desconto'),
    vr_seguro: numeroSeguro(nf, 'vr_seguro'),
    vr_gnre: numeroSeguro(nf, 'vr_gnre'),
    valor_nota: numeroSeguro(nf, 'valor_nota') ?? numeroSeguro(nf, 'valor_total_nota'),

    valor_icms: numeroSeguro(nf, 'valoricms'),
    icms_st: numeroSeguro(nf, 'icmsst'),
    valor_ipi: numeroSeguro(nf, 'valoripi'),
    valor_pis: numeroSeguro(nf, 'valorpis'),
    valor_cofins: numeroSeguro(nf, 'valorcofins'),
    base_icms: numeroSeguro(nf, 'base_icms'),
    base_icms_sub: numeroSeguro(nf, 'base_icms_sub'),
    base_ipi: numeroSeguro(nf, 'base_ipi'),
    v_fcp_uf_dest: numeroSeguro(nf, 'vfcpufdest'),
    v_icms_uf_dest: numeroSeguro(nf, 'vicmsufdest'),
    v_icms_uf_remet: numeroSeguro(nf, 'vicmsufremet'),

    volume_qtde: numeroSeguro(nf, 'volume_qtde'),
    volume_especie: valor(nf, 'volume_especie'),
    volume_numero: valor(nf, 'volume_numero'),
    volume_marca: valor(nf, 'volume_marca'),
    volume_peso_liquido: numeroSeguro(nf, 'volume_peso_liquido'),
    volume_peso_bruto: numeroSeguro(nf, 'volume_peso_bruto'),

    chave_nfe: valor(nf, 'chavenfe') ?? valor(nf, 'chave_nfe'),
    protocolo_nfe: valor(nf, 'protocolonfe') ?? valor(nf, 'protocolo_nfe'),
    protocolo_nfe_canc: valor(nf, 'protocolonfe_canc'),
    // Sinal limpo de cancelamento: `status_nota` fica vazio em milhares de
    // notas, esta data não. É o filtro confiável pro relatório de faturamento.
    data_cancelamento_nfe: dataHoraSysemp(valor(nf, 'datacancelamento_nfe')),
    autorizacao_datahora: dataHoraSysemp(valor(nf, 'autorizacao_datahora')),

    id_finalidade_venda: inteiroNaoZero(nf, 'id_finalidade_venda'),
    finalidade_venda: valor(nf, 'finalidade_venda'),
    finalidade_nfe: valor(nf, 'finalidade_nfe'),
    canal_venda: valor(nf, 'canal_venda'),
    observacao_nf: valor(nf, 'observacao_nf'),
    mensagem_nota: valor(nf, 'mensagem_nota'),
    ref_chave: valor(nf, 'ref_chave'),
    ref_numero_docfiscal: valor(nf, 'ref_numero_docfiscal'),
    ref_serie_docfiscal: valor(nf, 'ref_serie_docfiscal'),
  };
}

function colunasItem(item: Record<string, unknown>, idRegistro: number, numeroItem: number): Record<string, unknown> {
  return {
    id_nota_saida: idRegistro,
    item: numeroItem,
    id_produto: inteiro(item, 'id_produto') ?? inteiro(item, 'codigo_produto'),

    qtde: numeroSeguro(item, 'qtde'),
    quantidade_reservada: numeroSeguro(item, 'quantidade_reservada'),
    unidade: valor(item, 'unidade'),
    ncm: valor(item, 'ncm'),
    cst: valor(item, 'cst'),
    item_cfop: valor(item, 'item_cfop'),
    item_cfop_descricao: valor(item, 'item_cfop_descricao'),
    gera_financeiro: simNao(item, 'gera_financeiro'),

    vr_unitario_bruto: numeroSeguro(item, 'vr_unitario_bruto') ?? numeroSeguro(item, 'valor_unitario_bruto'),
    vr_total_bruto: numeroSeguro(item, 'vr_total_bruto'),
    vr_acrescimo: numeroSeguro(item, 'vr_acrescimo'),
    vr_desconto: numeroSeguro(item, 'vr_desconto'),
    vr_outros: numeroSeguro(item, 'vr_outros'),
    vr_seguro: numeroSeguro(item, 'vr_seguro'),
    // `valor_frete` e `frete_seller` chegam idênticos a `vr_frete` nas
    // amostras; COALESCE cobre o caso de algum canal preencher só um deles.
    vr_frete: numeroSeguro(item, 'vr_frete') ?? numeroSeguro(item, 'valor_frete'),
    frete_seller: numeroSeguro(item, 'frete_seller'),
    valor_comissao_ml: numeroSeguro(item, 'valorcomissaoml') ?? numeroSeguro(item, 'valor_comissao'),
    vr_item_liquido: numeroSeguro(item, 'vr_item_liq'),
    valor_unitario_liquido: numeroSeguro(item, 'valor_unitario_liquido'),

    base_icms: numeroSeguro(item, 'base_icms'),
    aliquota_icms: numeroSeguro(item, 'aliquota_icms'),
    reducao: numeroSeguro(item, 'reducao'),
    valor_icms: numeroSeguro(item, 'valoricms'),
    icms_st: numeroSeguro(item, 'icmsst'),
    difal: numeroSeguro(item, 'difal'),
    fecp: numeroSeguro(item, 'fecp'),

    base_ipi: numeroSeguro(item, 'base_ipi'),
    ipi_percentual: numeroSeguro(item, 'ipi_percentual'),
    valor_ipi: numeroSeguro(item, 'valoripi'),

    base_pis: numeroSeguro(item, 'base_pis'),
    aliq_pis: numeroSeguro(item, 'aliq_pis'),
    valor_pis: numeroSeguro(item, 'valorpis'),

    base_cofins: numeroSeguro(item, 'base_cofins'),
    aliq_cofins: numeroSeguro(item, 'aliq_cofins'),
    valor_cofins: numeroSeguro(item, 'valorcofins'),

    v_icms_uf_dest: numeroSeguro(item, 'vicmsufdest'),
    v_icms_uf_remet: numeroSeguro(item, 'vicmsufremet'),
    v_fcp_uf_dest: numeroSeguro(item, 'vfcpufdest'),
    v_fcp_st: numeroSeguro(item, 'vfcpst'),

    id_nota_origem: inteiroNaoZero(item, 'id_nota_origem'),
    item_origem: inteiroNaoZero(item, 'item_origem'),
    chave_origem: valor(item, 'chave_origem'),
    pedido_venda: valor(item, 'pedido_venda'),
  };
}

/** Exportada também para o backfill (`src/scripts/backfillNotasFiscais.ts`), que regrava NFs já consumidas sem passar pela fila. */
export async function gravarNotaFiscal(
  connection: PoolConnection,
  payload: Record<string, unknown> | null,
  acao: 'I' | 'U' | 'D',
  idRegistro: number,
): Promise<void> {
  if (acao === 'D') {
    await connection.query('UPDATE sysemp_nota_fiscal SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);
    await connection.query('UPDATE sysemp_nota_fiscal_item SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);
    return;
  }

  const nf = payload as NotaFiscalPayload | null;
  if (!nf) return;

  const cabecalho = montarUpsert('sysemp_nota_fiscal', colunasCabecalho(nf, idRegistro), ['id_nota_saida']);
  await connection.query(cabecalho.sql, cabecalho.params);

  // Soft-delete de todos os itens antes do upsert, "revivendo" só os que
  // vêm na resposta atual — item que sumir fica deleted=true.
  await connection.query('UPDATE sysemp_nota_fiscal_item SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);

  for (const item of nf.itens ?? []) {
    const numeroItem = inteiro(item, 'item');
    if (numeroItem === null) continue;

    const linha = montarUpsert('sysemp_nota_fiscal_item', colunasItem(item, idRegistro, numeroItem), [
      'id_nota_saida',
      'item',
    ]);
    await connection.query(linha.sql, linha.params);
  }
}

registrarConsumidorFila({ tipoTabela: 2, gravar: gravarNotaFiscal });
