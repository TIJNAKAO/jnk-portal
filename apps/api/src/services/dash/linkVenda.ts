/**
 * Link da venda no painel do vendedor de cada canal, a partir do número do
 * pedido que a SysEmp grava na nota fiscal.
 * Ver Specs/spec_modulo_dash.md, seção 2.4.
 *
 * Função pura: não consulta nada. O link só existe quando o canal é um dos
 * conhecidos **e** o número tem o formato daquele canal — número em formato
 * estranho não vira link, porque um link que abre a venda errada é pior do
 * que link nenhum.
 *
 * Abrir o link exige estar logado no painel do canal, na conta que fez a
 * venda. O portal não tem como garantir isso.
 */

export type CanalVenda = 'mercadolivre' | 'shopee' | 'amazon';

/** Reconhece o canal pelo nome que vem em `etl_fatcom.canal` (texto livre da SysEmp). */
export function identificarCanal(canal: string): CanalVenda | null {
  const nome = canal.toUpperCase();
  if (nome.includes('MERCADO') || /(^|[^A-Z])ML([^A-Z]|$)/.test(nome)) return 'mercadolivre';
  if (nome.includes('SHOPEE')) return 'shopee';
  if (nome.includes('AMAZON')) return 'amazon';
  return null;
}

const FORMATO: Record<CanalVenda, RegExp> = {
  // Número da venda ou do pacote: só dígitos.
  mercadolivre: /^\d{9,20}$/,
  // order_sn: letras maiúsculas e dígitos.
  shopee: /^[0-9A-Z]{10,20}$/,
  // 3-7-7 dígitos.
  amazon: /^\d{3}-\d{7}-\d{7}$/,
};

const ENDERECO: Record<CanalVenda, (pedido: string) => string> = {
  mercadolivre: (p) => `https://www.mercadolivre.com.br/vendas/${p}/detalhe`,
  shopee: (p) => `https://seller.shopee.com.br/portal/sale/order?keyword=${encodeURIComponent(p)}`,
  amazon: (p) => `https://sellercentral.amazon.com.br/orders-v3/order/${p}`,
};

/**
 * A SysEmp manda o número do pedido em dois campos, e qual deles vem
 * preenchido varia. Fica com o primeiro que tem o formato do canal.
 */
export function montarLinkVenda(canal: string, candidatos: (string | null | undefined)[]): string | null {
  const tipo = identificarCanal(canal);
  if (!tipo) return null;

  for (const candidato of candidatos) {
    const pedido = (candidato ?? '').trim();
    if (pedido && FORMATO[tipo].test(pedido)) return ENDERECO[tipo](pedido);
  }
  return null;
}

/** Primeiro número de pedido preenchido, para mostrar na tela mesmo quando não dá link. */
export function primeiroPedido(candidatos: (string | null | undefined)[]): string | null {
  for (const candidato of candidatos) {
    const pedido = (candidato ?? '').trim();
    if (pedido && pedido !== '0') return pedido;
  }
  return null;
}
