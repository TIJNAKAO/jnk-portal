/** Tipos e parsers puros do estoque FULL do Mercado Livre (sem I/O, testáveis). */

export interface AtributoMl {
  id: string;
  value_name?: string | null;
}

export interface VariacaoMl {
  id: number;
  inventory_id?: string | null;
  seller_custom_field?: string | null;
  attributes?: AtributoMl[];
}

export interface ItemMl {
  id: string;
  title?: string;
  inventory_id?: string | null;
  seller_custom_field?: string | null;
  attributes?: AtributoMl[];
  variations?: VariacaoMl[];
}

export interface EstoqueFulfillmentMl {
  inventory_id: string;
  total: number;
  available_units: number;
  not_available_units: number;
  not_available_detail?: { status: string; quantity: number }[];
}

export interface InventarioItem {
  itemId: string;
  variacaoId: number | null;
  inventoryId: string;
  sku: string;
  titulo: string;
}

function skuDe(origem: { seller_custom_field?: string | null; attributes?: AtributoMl[] }): string {
  const campo = origem.seller_custom_field?.trim();
  if (campo) return campo;
  const atributo = origem.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name;
  return atributo?.trim() ?? '';
}

/** Um anúncio vira uma entrada por `inventory_id`: por variação quando há, senão pelo próprio anúncio. */
export function extrairInventarios(item: ItemMl): InventarioItem[] {
  const titulo = item.title ?? '';

  if (item.variations?.length) {
    return item.variations
      .filter((v) => v.inventory_id)
      .map((v) => ({
        itemId: item.id,
        variacaoId: v.id,
        inventoryId: v.inventory_id as string,
        // Variação sem SKU próprio herda o do anúncio.
        sku: skuDe(v) || skuDe(item),
        titulo,
      }));
  }

  if (!item.inventory_id) return [];
  return [{ itemId: item.id, variacaoId: null, inventoryId: item.inventory_id, sku: skuDe(item), titulo }];
}

/**
 * Dia de Brasília (UTC-3, sem horário de verão) em `YYYY-MM-DD`. Não depende
 * do fuso do processo Node: desloca o instante e lê em UTC.
 */
export function dataRefBrasilia(agora: Date): string {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
