import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

type Registro = Record<string, unknown> | null;
type Lista = Record<string, unknown>[];

export interface ColetaCompleta {
  sistemaOperacional: Registro;
  processador: Registro;
  placaMae: Registro;
  bios: Registro;
  memoriaRam: Lista;
  disco: Lista;
  rede: Lista;
  periferico: Lista;
  software: Lista;
  dispositivoUsb: Lista;
}

async function buscarUm(tabela: string, idColeta: number): Promise<Registro> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${tabela} WHERE id_coleta = ?`, [idColeta]);
  return rows[0] ?? null;
}

async function buscarVarios(tabela: string, idColeta: number, ordem: string): Promise<Lista> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${tabela} WHERE id_coleta = ? ORDER BY ${ordem}`, [idColeta]);
  return rows;
}

/** Porta de `pc_buscar_coleta_completa` (src/PcInventario.php). */
export async function buscarColetaCompleta(idColeta: number): Promise<ColetaCompleta> {
  const [sistemaOperacional, processador, placaMae, bios, memoriaRam, disco, rede, periferico, software, dispositivoUsb] =
    await Promise.all([
      buscarUm('ti_sistema_operacional', idColeta),
      buscarUm('ti_processador', idColeta),
      buscarUm('ti_placa_mae', idColeta),
      buscarUm('ti_bios', idColeta),
      buscarVarios('ti_memoria_ram', idColeta, 'slot'),
      buscarVarios('ti_disco', idColeta, 'nome'),
      buscarVarios('ti_rede', idColeta, 'nome'),
      buscarVarios('ti_periferico', idColeta, 'tipo, nome'),
      buscarVarios('ti_software', idColeta, 'nome'),
      buscarVarios('ti_dispositivo_usb', idColeta, 'ultima_vez_visto DESC'),
    ]);

  return { sistemaOperacional, processador, placaMae, bios, memoriaRam, disco, rede, periferico, software, dispositivoUsb };
}

export interface DiferencaCampo {
  campo: string;
  de: unknown;
  para: unknown;
}

const CAMPOS_IGNORAR_PADRAO = ['id_coleta', 'id'];

/** Porta de `pc_diff_registro`. */
export function diffRegistro(antigo: Registro, novo: Registro, camposIgnorar: string[] = CAMPOS_IGNORAR_PADRAO): DiferencaCampo[] {
  if (antigo === null && novo === null) return [];

  const campos = new Set([...Object.keys(antigo ?? {}), ...Object.keys(novo ?? {})]);
  const diferencas: DiferencaCampo[] = [];

  for (const campo of campos) {
    if (camposIgnorar.includes(campo)) continue;
    const valorAntigo = antigo?.[campo] ?? null;
    const valorNovo = novo?.[campo] ?? null;
    // Comparação como texto: evita diferenciar tipos vindos do driver (ex:
    // BigInt x number) que não representam uma mudança real.
    if (String(valorAntigo) !== String(valorNovo)) {
      diferencas.push({ campo, de: valorAntigo, para: valorNovo });
    }
  }
  return diferencas;
}

export interface DiffLista {
  adicionados: Lista;
  removidos: Lista;
  alterados: { item: Record<string, unknown>; diferencas: DiferencaCampo[] }[];
}

/** Porta de `pc_diff_lista`: casa itens por uma chave estável, não pela ordem. */
export function diffLista(antigos: Lista, novos: Lista, chave: string, camposIgnorarExtras: string[] = []): DiffLista {
  const porChaveAntigo = new Map<string, Record<string, unknown>>();
  for (const item of antigos) {
    const k = String(item[chave] ?? '').trim();
    if (k !== '') porChaveAntigo.set(k, item);
  }
  const porChaveNovo = new Map<string, Record<string, unknown>>();
  for (const item of novos) {
    const k = String(item[chave] ?? '').trim();
    if (k !== '') porChaveNovo.set(k, item);
  }

  const adicionados: Lista = [];
  const removidos: Lista = [];
  const alterados: DiffLista['alterados'] = [];

  for (const [k, item] of porChaveNovo) {
    if (!porChaveAntigo.has(k)) adicionados.push(item);
  }
  for (const [k, item] of porChaveAntigo) {
    const novo = porChaveNovo.get(k);
    if (!novo) {
      removidos.push(item);
    } else {
      const diferencas = diffRegistro(item, novo, [...CAMPOS_IGNORAR_PADRAO, ...camposIgnorarExtras]);
      if (diferencas.length > 0) alterados.push({ item: novo, diferencas });
    }
  }

  return { adicionados, removidos, alterados };
}

export interface ComparativoColetas {
  sistemaOperacional: DiferencaCampo[];
  processador: DiferencaCampo[];
  placaMae: DiferencaCampo[];
  bios: DiferencaCampo[];
  memoriaRam: DiffLista;
  disco: DiffLista;
  rede: DiffLista;
  periferico: DiffLista;
  software: DiffLista;
  dispositivoUsb: DiffLista;
}

/** Porta de `pc_comparar_coletas`. */
export async function compararColetas(idColetaAntiga: number, idColetaNova: number): Promise<ComparativoColetas> {
  const [antiga, nova] = await Promise.all([buscarColetaCompleta(idColetaAntiga), buscarColetaCompleta(idColetaNova)]);

  return {
    sistemaOperacional: diffRegistro(antiga.sistemaOperacional, nova.sistemaOperacional),
    processador: diffRegistro(antiga.processador, nova.processador),
    placaMae: diffRegistro(antiga.placaMae, nova.placaMae),
    bios: diffRegistro(antiga.bios, nova.bios),
    memoriaRam: diffLista(antiga.memoriaRam, nova.memoriaRam, 'slot'),
    disco: diffLista(antiga.disco, nova.disco, 'numero_serie'),
    rede: diffLista(antiga.rede, nova.rede, 'mac_address'),
    periferico: diffLista(antiga.periferico, nova.periferico, 'device_id'),
    software: diffLista(antiga.software, nova.software, 'nome'),
    dispositivoUsb: diffLista(antiga.dispositivoUsb, nova.dispositivoUsb, 'numero_serie', ['ultima_vez_visto']),
  };
}

const ROTULO_CAMPO: Record<string, string> = {
  caption: 'Descrição',
  versao: 'Versão',
  build_number: 'Build',
  arquitetura: 'Arquitetura',
  data_instalacao: 'Data de instalação',
  ultimo_boot: 'Último boot',
  usuario_registrado: 'Usuário registrado',
  numero_serie: 'Número de série',
  nome: 'Nome',
  fabricante: 'Fabricante',
  processor_id: 'Processor ID',
  velocidade_atual_mhz: 'Velocidade atual (MHz)',
  velocidade_maxima_mhz: 'Velocidade máxima (MHz)',
  cache_l2_kb: 'Cache L2 (KB)',
  cache_l3_kb: 'Cache L3 (KB)',
  numero_nucleos: 'Núcleos',
  numero_nucleos_habilitados: 'Núcleos habilitados',
  numero_processadores_logicos: 'Processadores lógicos',
  modelo: 'Modelo',
  produto: 'Produto',
  banco: 'Banco',
  slot: 'Slot',
  capacidade_bytes: 'Capacidade',
  velocidade_mhz: 'Velocidade (MHz)',
  part_number: 'Part Number',
  interface: 'Interface',
  tipo_midia: 'Tipo',
  barramento: 'Barramento',
  firmware: 'Firmware',
  tamanho_bytes: 'Tamanho',
  numero_particoes: 'Partições',
  tipo_adaptador: 'Tipo de adaptador',
  mac_address: 'MAC',
  velocidade_bps: 'Velocidade (bps)',
  tipo: 'Tipo',
  descricao: 'Descrição',
  device_id: 'Device ID',
  status: 'Status',
  tamanho_estimado_kb: 'Tamanho estimado (KB)',
  local_instalacao: 'Local de instalação',
  revisao: 'Revisão',
  nome_amigavel: 'Nome',
  ultima_vez_visto: 'Última vez visto',
};

function rotuloCampo(campo: string): string {
  return ROTULO_CAMPO[campo] ?? campo;
}

function fmtBytesGb(bytes: unknown): string {
  const n = Number(bytes ?? 0);
  return n > 0 ? `${(n / 1073741824).toFixed(1)} GB` : '—';
}

export interface LinhaDiff {
  categoria: string;
  item: string;
  tipo: 'Adicionado' | 'Removido' | 'Alterado' | 'Instalado' | 'Desinstalado';
  campo: string;
  de: string;
  para: string;
}

/** Porta de `pc_diff_para_linhas`: achata o comparativo numa lista única pra virar grade. */
export function diffParaLinhas(diff: ComparativoColetas): LinhaDiff[] {
  const linhas: LinhaDiff[] = [];
  const txt = (v: unknown) => (v === null || v === undefined ? '—' : String(v));

  const secoes1a1: [DiferencaCampo[], string][] = [
    [diff.sistemaOperacional, 'Sistema Operacional'],
    [diff.processador, 'Processador'],
    [diff.placaMae, 'Placa-mãe'],
    [diff.bios, 'BIOS'],
  ];
  for (const [diferencas, categoria] of secoes1a1) {
    for (const d of diferencas) {
      linhas.push({ categoria, item: '', tipo: 'Alterado', campo: rotuloCampo(d.campo), de: txt(d.de), para: txt(d.para) });
    }
  }

  for (const item of diff.memoriaRam.adicionados) {
    linhas.push({ categoria: 'Memória RAM', item: txt(item['slot']), tipo: 'Adicionado', campo: '—', de: '—', para: fmtBytesGb(item['capacidade_bytes']) });
  }
  for (const item of diff.memoriaRam.removidos) {
    linhas.push({ categoria: 'Memória RAM', item: txt(item['slot']), tipo: 'Removido', campo: '—', de: fmtBytesGb(item['capacidade_bytes']), para: '—' });
  }
  for (const alt of diff.memoriaRam.alterados) {
    for (const d of alt.diferencas) {
      linhas.push({ categoria: 'Memória RAM', item: txt(alt.item['slot']), tipo: 'Alterado', campo: rotuloCampo(d.campo), de: txt(d.de), para: txt(d.para) });
    }
  }

  for (const item of diff.disco.adicionados) {
    linhas.push({ categoria: 'Disco', item: txt(item['nome']), tipo: 'Adicionado', campo: '—', de: '—', para: txt(item['modelo']) });
  }
  for (const item of diff.disco.removidos) {
    linhas.push({ categoria: 'Disco', item: txt(item['nome']), tipo: 'Removido', campo: '—', de: txt(item['modelo']), para: '—' });
  }
  for (const alt of diff.disco.alterados) {
    for (const d of alt.diferencas) {
      linhas.push({ categoria: 'Disco', item: txt(alt.item['nome']), tipo: 'Alterado', campo: rotuloCampo(d.campo), de: txt(d.de), para: txt(d.para) });
    }
  }

  for (const item of diff.rede.adicionados) {
    linhas.push({ categoria: 'Rede', item: txt(item['nome']), tipo: 'Adicionado', campo: '—', de: '—', para: txt(item['mac_address']) });
  }
  for (const item of diff.rede.removidos) {
    linhas.push({ categoria: 'Rede', item: txt(item['nome']), tipo: 'Removido', campo: '—', de: txt(item['mac_address']), para: '—' });
  }
  for (const alt of diff.rede.alterados) {
    for (const d of alt.diferencas) {
      linhas.push({ categoria: 'Rede', item: txt(alt.item['nome']), tipo: 'Alterado', campo: rotuloCampo(d.campo), de: txt(d.de), para: txt(d.para) });
    }
  }

  for (const item of diff.periferico.adicionados) {
    linhas.push({ categoria: 'Periférico', item: `${txt(item['tipo'])} - ${txt(item['nome'])}`.trim(), tipo: 'Adicionado', campo: '—', de: '—', para: 'Conectado' });
  }
  for (const item of diff.periferico.removidos) {
    linhas.push({ categoria: 'Periférico', item: `${txt(item['tipo'])} - ${txt(item['nome'])}`.trim(), tipo: 'Removido', campo: '—', de: 'Conectado', para: '—' });
  }
  for (const alt of diff.periferico.alterados) {
    for (const d of alt.diferencas) {
      linhas.push({
        categoria: 'Periférico',
        item: `${txt(alt.item['tipo'])} - ${txt(alt.item['nome'])}`.trim(),
        tipo: 'Alterado',
        campo: rotuloCampo(d.campo),
        de: txt(d.de),
        para: txt(d.para),
      });
    }
  }

  for (const item of diff.software.adicionados) {
    linhas.push({ categoria: 'Software', item: txt(item['nome']), tipo: 'Instalado', campo: '—', de: '—', para: txt(item['versao']) });
  }
  for (const item of diff.software.removidos) {
    linhas.push({ categoria: 'Software', item: txt(item['nome']), tipo: 'Desinstalado', campo: '—', de: txt(item['versao']), para: '—' });
  }
  for (const alt of diff.software.alterados) {
    for (const d of alt.diferencas) {
      linhas.push({ categoria: 'Software', item: txt(alt.item['nome']), tipo: 'Alterado', campo: rotuloCampo(d.campo), de: txt(d.de), para: txt(d.para) });
    }
  }

  for (const item of diff.dispositivoUsb.adicionados) {
    const resumo = `${txt(item['fabricante'])} ${txt(item['modelo'])}`.trim();
    linhas.push({ categoria: 'Dispositivo USB', item: txt(item['nome_amigavel']), tipo: 'Adicionado', campo: '—', de: '—', para: resumo || '—' });
  }
  for (const item of diff.dispositivoUsb.removidos) {
    const resumo = `${txt(item['fabricante'])} ${txt(item['modelo'])}`.trim();
    linhas.push({ categoria: 'Dispositivo USB', item: txt(item['nome_amigavel']), tipo: 'Removido', campo: '—', de: resumo || '—', para: '—' });
  }
  for (const alt of diff.dispositivoUsb.alterados) {
    for (const d of alt.diferencas) {
      linhas.push({
        categoria: 'Dispositivo USB',
        item: txt(alt.item['nome_amigavel']),
        tipo: 'Alterado',
        campo: rotuloCampo(d.campo),
        de: txt(d.de),
        para: txt(d.para),
      });
    }
  }

  return linhas;
}
