import { createHash } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withTransaction, type PoolConnection } from '../config/database.js';
import type { TiInventarioPayload } from '../types/tiPayload.js';

function valor(origem: Record<string, unknown> | null | undefined, chave: string): unknown {
  const v = origem?.[chave];
  return v === '' || v === undefined ? null : v;
}

function inteiro(origem: Record<string, unknown> | null | undefined, chave: string): number | null {
  const v = valor(origem, chave);
  return v === null ? null : Number(v);
}

/**
 * Insere várias linhas de uma vez (`VALUES (...),(...),...` em blocos de
 * 200) em vez de um INSERT por linha — uma máquina com 200+ programas
 * instalados já estourou o tempo de execução fazendo um round-trip de rede
 * por linha até um banco gerenciado (mesma característica de latência no
 * MySQL da DigitalOcean). Ver Specs/spec_modulo_ti.md, seção 3.
 */
async function inserirEmLote(
  connection: PoolConnection,
  tabela: string,
  colunas: string[],
  linhas: unknown[][],
): Promise<void> {
  if (linhas.length === 0) return;

  for (let i = 0; i < linhas.length; i += 200) {
    const bloco = linhas.slice(i, i + 200);
    const placeholders = bloco.map(() => `(${colunas.map(() => '?').join(',')})`).join(',');
    const valores = bloco.flat();
    await connection.query(
      `INSERT INTO ${tabela} (${colunas.join(',')}) VALUES ${placeholders}`,
      valores,
    );
  }
}

export interface ResultadoIngestao {
  idEquipamento: number;
  idColeta: number;
  totalSoftware: number;
}

export async function processarInventario(payload: TiInventarioPayload, corpoBruto: string): Promise<ResultadoIngestao> {
  const nomeComputador = String(payload.computador.nome).trim();
  const coletadoEm = String(payload.coleta.coletado_em).trim();

  return withTransaction(async (connection) => {
    // ---- 1. Equipamento: upsert por nome_computador ----
    const [existentes] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM ti_equipamento WHERE nome_computador = ?',
      [nomeComputador],
    );

    let idEquipamento: number;
    const filialId = inteiro(payload.computador, 'id_empresa');
    const serialBios = valor(payload.computador, 'serial_bios');
    const serialPlacaMae = valor(payload.computador, 'serial_placa_mae');

    if (existentes.length === 0) {
      const [resultado] = await connection.query<ResultSetHeader>(
        `INSERT INTO ti_equipamento (nome_computador, filial_id, serial_bios, serial_placa_mae, primeira_coleta_em, ultima_coleta_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nomeComputador, filialId, serialBios, serialPlacaMae, coletadoEm, coletadoEm],
      );
      idEquipamento = resultado.insertId;
    } else {
      idEquipamento = existentes[0]!.id as number;
      await connection.query(
        `UPDATE ti_equipamento SET
           filial_id = COALESCE(?, filial_id),
           serial_bios = COALESCE(?, serial_bios),
           serial_placa_mae = COALESCE(?, serial_placa_mae),
           ultima_coleta_em = ?
         WHERE id = ?`,
        [filialId, serialBios, serialPlacaMae, coletadoEm, idEquipamento],
      );
    }

    // ---- 2. Cabeçalho da coleta ----
    const [resultadoColeta] = await connection.query<ResultSetHeader>(
      `INSERT INTO ti_inventario_coleta (id_equipamento, coletado_em, usuario_windows, ip_local, versao_agente, anydesk_id, hash_dados)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        idEquipamento,
        coletadoEm,
        valor(payload.coleta, 'usuario_windows'),
        valor(payload.coleta, 'ip_local'),
        valor(payload.coleta, 'versao_agente'),
        valor(payload.coleta, 'anydesk_id'),
        createHash('sha256').update(corpoBruto).digest('hex'),
      ],
    );
    const idColeta = resultadoColeta.insertId;

    // ---- 3. Detalhe 1:1 ----
    const so = payload.sistema_operacional;
    if (so) {
      await connection.query(
        `INSERT INTO ti_sistema_operacional (id_coleta, caption, versao, build_number, arquitetura, data_instalacao, ultimo_boot, usuario_registrado, numero_serie)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idColeta,
          valor(so, 'caption'),
          valor(so, 'versao'),
          valor(so, 'build_number'),
          valor(so, 'arquitetura'),
          valor(so, 'data_instalacao'),
          valor(so, 'ultimo_boot'),
          valor(so, 'usuario_registrado'),
          valor(so, 'numero_serie'),
        ],
      );
    }

    const proc = payload.processador;
    if (proc) {
      await connection.query(
        `INSERT INTO ti_processador (id_coleta, nome, fabricante, processor_id, velocidade_atual_mhz, velocidade_maxima_mhz, cache_l2_kb, cache_l3_kb, numero_nucleos, numero_nucleos_habilitados, numero_processadores_logicos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idColeta,
          valor(proc, 'nome'),
          valor(proc, 'fabricante'),
          valor(proc, 'processor_id'),
          inteiro(proc, 'velocidade_atual_mhz'),
          inteiro(proc, 'velocidade_maxima_mhz'),
          inteiro(proc, 'cache_l2_kb'),
          inteiro(proc, 'cache_l3_kb'),
          inteiro(proc, 'numero_nucleos'),
          inteiro(proc, 'numero_nucleos_habilitados'),
          inteiro(proc, 'numero_processadores_logicos'),
        ],
      );
    }

    const pm = payload.placa_mae;
    if (pm) {
      await connection.query(
        `INSERT INTO ti_placa_mae (id_coleta, nome, fabricante, modelo, produto, numero_serie, versao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idColeta, valor(pm, 'nome'), valor(pm, 'fabricante'), valor(pm, 'modelo'), valor(pm, 'produto'), valor(pm, 'numero_serie'), valor(pm, 'versao')],
      );
    }

    const bios = payload.bios;
    if (bios) {
      await connection.query(
        `INSERT INTO ti_bios (id_coleta, fabricante, numero_serie, versao) VALUES (?, ?, ?, ?)`,
        [idColeta, valor(bios, 'fabricante'), valor(bios, 'numero_serie'), valor(bios, 'versao')],
      );
    }

    // ---- 4. Detalhe 1:N (em lote) ----
    await inserirEmLote(
      connection,
      'ti_memoria_ram',
      ['id_coleta', 'nome', 'fabricante', 'banco', 'slot', 'capacidade_bytes', 'velocidade_mhz', 'part_number', 'numero_serie'],
      (payload.memoria_ram ?? []).map((item) => [
        idColeta,
        valor(item, 'nome'),
        valor(item, 'fabricante'),
        valor(item, 'banco'),
        valor(item, 'slot'),
        valor(item, 'capacidade_bytes'),
        inteiro(item, 'velocidade_mhz'),
        valor(item, 'part_number'),
        valor(item, 'numero_serie'),
      ]),
    );

    await inserirEmLote(
      connection,
      'ti_disco',
      ['id_coleta', 'nome', 'modelo', 'fabricante', 'interface', 'firmware', 'numero_serie', 'tamanho_bytes', 'numero_particoes', 'tipo_midia', 'barramento'],
      (payload.disco ?? []).map((item) => [
        idColeta,
        valor(item, 'nome'),
        valor(item, 'modelo'),
        valor(item, 'fabricante'),
        valor(item, 'interface'),
        valor(item, 'firmware'),
        valor(item, 'numero_serie'),
        valor(item, 'tamanho_bytes'),
        inteiro(item, 'numero_particoes'),
        valor(item, 'tipo_midia'),
        valor(item, 'barramento'),
      ]),
    );

    await inserirEmLote(
      connection,
      'ti_rede',
      ['id_coleta', 'nome', 'tipo_adaptador', 'mac_address', 'velocidade_bps'],
      (payload.rede ?? []).map((item) => [idColeta, valor(item, 'nome'), valor(item, 'tipo_adaptador'), valor(item, 'mac_address'), valor(item, 'velocidade_bps')]),
    );

    await inserirEmLote(
      connection,
      'ti_periferico',
      ['id_coleta', 'tipo', 'nome', 'descricao', 'fabricante', 'device_id', 'status'],
      (payload.periferico ?? [])
        .filter((item) => item['tipo'])
        .map((item) => [
          idColeta,
          String(item['tipo']).toUpperCase(),
          valor(item, 'nome'),
          valor(item, 'descricao'),
          valor(item, 'fabricante'),
          valor(item, 'device_id'),
          valor(item, 'status'),
        ]),
    );

    const softwareValido = (payload.software ?? []).filter((item) => item['nome']);
    await inserirEmLote(
      connection,
      'ti_software',
      ['id_coleta', 'nome', 'versao', 'fabricante', 'data_instalacao', 'local_instalacao', 'tamanho_estimado_kb'],
      softwareValido.map((item) => [
        idColeta,
        valor(item, 'nome'),
        valor(item, 'versao'),
        valor(item, 'fabricante'),
        valor(item, 'data_instalacao'),
        valor(item, 'local_instalacao'),
        valor(item, 'tamanho_estimado_kb'),
      ]),
    );

    await inserirEmLote(
      connection,
      'ti_dispositivo_usb',
      ['id_coleta', 'fabricante', 'modelo', 'revisao', 'numero_serie', 'nome_amigavel', 'ultima_vez_visto'],
      (payload.dispositivo_usb ?? []).map((item) => [
        idColeta,
        valor(item, 'fabricante'),
        valor(item, 'modelo'),
        valor(item, 'revisao'),
        valor(item, 'numero_serie'),
        valor(item, 'nome_amigavel'),
        valor(item, 'ultima_vez_visto'),
      ]),
    );

    return { idEquipamento, idColeta, totalSoftware: softwareValido.length };
  });
}

export async function marcarTokenUsado(idToken: number): Promise<void> {
  await pool.query('UPDATE ti_api_token SET ultimo_uso_em = CURRENT_TIMESTAMP WHERE id = ?', [idToken]);
}
