/**
 * Espelha o JSON que o agente Windows (agente-inventario-pc/, .NET) já
 * envia hoje — contrato inalterado, ver Specs/spec_modulo_ti.md, seção 4.
 */
export interface TiInventarioPayload {
  computador: {
    nome: string;
    id_empresa?: number | null; // interpretado como filial_id
    serial_bios?: string | null;
    serial_placa_mae?: string | null;
  };
  coleta: {
    coletado_em: string;
    usuario_windows?: string | null;
    ip_local?: string | null;
    versao_agente?: string | null;
    anydesk_id?: string | null;
  };
  sistema_operacional?: Record<string, unknown> | null;
  processador?: Record<string, unknown> | null;
  placa_mae?: Record<string, unknown> | null;
  bios?: Record<string, unknown> | null;
  memoria_ram?: Record<string, unknown>[];
  disco?: Record<string, unknown>[];
  rede?: Record<string, unknown>[];
  periferico?: Record<string, unknown>[];
  software?: Record<string, unknown>[];
  dispositivo_usb?: Record<string, unknown>[];
}
