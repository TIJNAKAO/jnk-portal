import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { condicaoEscopoDeUmaOrigem, type EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Comparativo entre o saldo do FULL do Mercado Livre (`ml_estoque_full`,
 * foto diária) e o `saldo_disponivel` do SysEmp (`sysemp_estoque_fisico`).
 * O vínculo é SKU do anúncio = `sysemp_produto.codigo_auxiliar`, na empresa
 * ligada à conta ML em `ml_conta_empresa`.
 * Ver Specs/spec_modulo_estoque.md (Estoque FULL ML x SysEmp).
 */

export type SituacaoFull = 'OK' | 'DIVERGENTE' | 'SO_ML' | 'SO_SYSEMP';

export interface SaldoMl {
  idEmpresa: number;
  sku: string;
  titulo: string;
  disponivel: number;
  total: number;
  naoDisponivel: number;
}

export interface SaldoSysemp {
  idEmpresa: number;
  codigoAuxiliar: string | null;
  descricao: string | null;
  marca: string | null;
  saldo: number | null;
}

export interface LinhaComparativoFull {
  idEmpresa: number;
  empresa: string;
  codigo: string;
  descricao: string;
  marca: string | null;
  qtdeMl: number;
  totalMl: number;
  naoDisponivelMl: number;
  qtdeSysemp: number;
  diferenca: number;
  situacao: SituacaoFull;
}

function normalizar(sku: string | null | undefined): string {
  return (sku ?? '').trim().toUpperCase();
}

interface Acumulado {
  idEmpresa: number;
  codigo: string;
  descricaoMl: string;
  descricaoSys: string | null;
  marca: string | null;
  temMl: boolean;
  temSys: boolean;
  qtdeMl: number;
  totalMl: number;
  naoDisponivelMl: number;
  qtdeSys: number;
}

/**
 * Casa os dois lados por (empresa, SKU normalizado). SKU vazio no ML não casa
 * com nada: vira uma linha "só ML" por anúncio, nunca é descartado.
 */
export function compararSaldosFull(
  ml: SaldoMl[],
  sysemp: SaldoSysemp[],
  nomesEmpresa: Map<number, string>,
): LinhaComparativoFull[] {
  const mapa = new Map<string, Acumulado>();

  const obter = (chave: string, base: Pick<Acumulado, 'idEmpresa' | 'codigo'>): Acumulado => {
    let a = mapa.get(chave);
    if (!a) {
      a = {
        ...base,
        descricaoMl: '',
        descricaoSys: null,
        marca: null,
        temMl: false,
        temSys: false,
        qtdeMl: 0,
        totalMl: 0,
        naoDisponivelMl: 0,
        qtdeSys: 0,
      };
      mapa.set(chave, a);
    }
    return a;
  };

  ml.forEach((linha, indice) => {
    const sku = normalizar(linha.sku);
    const chave = sku === '' ? `${linha.idEmpresa}|#${indice}` : `${linha.idEmpresa}|${sku}`;
    const a = obter(chave, { idEmpresa: linha.idEmpresa, codigo: linha.sku.trim() });
    a.temMl = true;
    a.descricaoMl ||= linha.titulo;
    a.qtdeMl += linha.disponivel;
    a.totalMl += linha.total;
    a.naoDisponivelMl += linha.naoDisponivel;
  });

  for (const linha of sysemp) {
    const sku = normalizar(linha.codigoAuxiliar);
    if (sku === '') continue;
    const chave = `${linha.idEmpresa}|${sku}`;
    // Produto do SysEmp sem contraparte no ML só entra se tiver saldo; a
    // decisão final sai depois, quando se sabe se o ML também o tem.
    const a = obter(chave, { idEmpresa: linha.idEmpresa, codigo: (linha.codigoAuxiliar ?? '').trim() });
    a.temSys = true;
    a.descricaoSys ??= linha.descricao;
    a.marca ??= linha.marca;
    a.qtdeSys += Number(linha.saldo ?? 0);
  }

  const linhas: LinhaComparativoFull[] = [];
  for (const a of mapa.values()) {
    let situacao: SituacaoFull;
    if (a.temMl && a.temSys) situacao = a.qtdeMl === a.qtdeSys ? 'OK' : 'DIVERGENTE';
    else if (a.temMl) situacao = 'SO_ML';
    else if (a.qtdeSys !== 0) situacao = 'SO_SYSEMP';
    else continue;

    linhas.push({
      idEmpresa: a.idEmpresa,
      empresa: nomesEmpresa.get(a.idEmpresa) ?? String(a.idEmpresa),
      codigo: a.codigo,
      descricao: a.descricaoSys ?? a.descricaoMl,
      marca: a.marca,
      qtdeMl: a.qtdeMl,
      totalMl: a.totalMl,
      naoDisponivelMl: a.naoDisponivelMl,
      qtdeSysemp: a.qtdeSys,
      diferenca: a.qtdeMl - a.qtdeSys,
      situacao,
    });
  }

  return linhas.sort((x, y) => {
    const dx = x.situacao === 'OK' ? 1 : 0;
    const dy = y.situacao === 'OK' ? 1 : 0;
    if (dx !== dy) return dx - dy;
    if (dx === 0 && Math.abs(y.diferenca) !== Math.abs(x.diferenca)) return Math.abs(y.diferenca) - Math.abs(x.diferenca);
    return x.empresa.localeCompare(y.empresa) || x.codigo.localeCompare(y.codigo);
  });
}

export interface FiltroFullMl {
  /** `YYYY-MM-DD`; sem valor usa a última foto disponível. */
  data?: string;
  empresas?: number[];
  marcas?: string[];
  busca?: string;
  soDivergencias?: boolean;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Empresas com conta ML vinculada que o usuário pode ver. */
async function empresasVinculadas(escopo: EmpresaPermitida[], pedidas?: number[]): Promise<Map<number, string>> {
  const { where, params } = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'ce.id_empresa');
  const condicoes = [where];
  if (pedidas?.length) {
    condicoes.push(`ce.id_empresa IN (${pedidas.map(() => '?').join(',')})`);
    params.push(...pedidas);
  }

  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT ce.id_empresa, e.fantasia
       FROM ml_conta_empresa ce
       LEFT JOIN sysemp_empresa e ON e.id_empresa = ce.id_empresa
      WHERE ${condicoes.join(' AND ')}
      ORDER BY e.fantasia`,
    params,
  );
  return new Map(linhas.map((l) => [Number(l.id_empresa), String(l.fantasia ?? l.id_empresa).trim()]));
}

async function ultimaData(idsEmpresa: number[]): Promise<string | null> {
  if (idsEmpresa.length === 0) return null;
  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(MAX(m.data_ref), '%Y-%m-%d') AS data
       FROM ml_estoque_full m
       JOIN ml_conta c ON c.user_id_ml = m.user_id_ml
       JOIN ml_conta_empresa ce ON ce.ml_conta_id = c.id
      WHERE ce.id_empresa IN (${idsEmpresa.map(() => '?').join(',')})`,
    idsEmpresa,
  );
  return (linhas[0]?.data as string | null) ?? null;
}

export async function buscarComparativoFull(
  filtro: FiltroFullMl,
  escopo: EmpresaPermitida[],
): Promise<{ linhas: LinhaComparativoFull[]; dataRef: string | null; atualizadoEm: string | null }> {
  const nomes = await empresasVinculadas(escopo, filtro.empresas);
  const ids = [...nomes.keys()];
  if (ids.length === 0) return { linhas: [], dataRef: null, atualizadoEm: null };

  const disponivel = await ultimaData(ids);
  const dataRef = filtro.data && FORMATO_DATA.test(filtro.data) ? filtro.data : disponivel;
  if (!dataRef) return { linhas: [], dataRef: null, atualizadoEm: null };

  const marcadores = ids.map(() => '?').join(',');

  const [linhasMl] = await pool.query<RowDataPacket[]>(
    `SELECT ce.id_empresa, m.sku, m.titulo, m.disponivel, m.total, m.nao_disponivel, m.atualizado_em
       FROM ml_estoque_full m
       JOIN ml_conta c ON c.user_id_ml = m.user_id_ml
       JOIN ml_conta_empresa ce ON ce.ml_conta_id = c.id
      WHERE m.data_ref = ? AND ce.id_empresa IN (${marcadores})`,
    [dataRef, ...ids],
  );
  // Sem foto na data pedida: devolve vazio, mas informa a última disponível.
  if (linhasMl.length === 0) return { linhas: [], dataRef: disponivel, atualizadoEm: null };

  const [linhasSys] = await pool.query<RowDataPacket[]>(
    `SELECT ef.id_empresa, pr.codigo_auxiliar, pr.nome_produto, pr.descricao_marca, ef.saldo_disponivel
       FROM sysemp_estoque_fisico ef
       JOIN sysemp_produto pr ON pr.id_produto = ef.id_produto
      WHERE ef.deleted = FALSE
        AND ef.id_empresa IN (${marcadores})
        AND pr.codigo_auxiliar IS NOT NULL AND pr.codigo_auxiliar <> ''`,
    ids,
  );

  let linhas = compararSaldosFull(
    linhasMl.map((l) => ({
      idEmpresa: Number(l.id_empresa),
      sku: String(l.sku ?? ''),
      titulo: String(l.titulo ?? ''),
      disponivel: Number(l.disponivel),
      total: Number(l.total),
      naoDisponivel: Number(l.nao_disponivel),
    })),
    linhasSys.map((l) => ({
      idEmpresa: Number(l.id_empresa),
      codigoAuxiliar: l.codigo_auxiliar as string | null,
      descricao: l.nome_produto as string | null,
      marca: l.descricao_marca as string | null,
      saldo: l.saldo_disponivel === null ? null : Number(l.saldo_disponivel),
    })),
    nomes,
  );

  // Marca e busca filtram o resultado já comparado: o lado "só ML" não tem marca.
  if (filtro.marcas?.length) linhas = linhas.filter((l) => l.marca !== null && filtro.marcas!.includes(l.marca));
  if (filtro.busca) {
    const termo = filtro.busca.toUpperCase();
    linhas = linhas.filter((l) => l.codigo.toUpperCase().includes(termo) || l.descricao.toUpperCase().includes(termo));
  }
  if (filtro.soDivergencias) linhas = linhas.filter((l) => l.situacao !== 'OK');

  const atualizadoEm = linhasMl.reduce<string | null>((maior, l) => {
    const v = l.atualizado_em ? new Date(l.atualizado_em as string | Date).toISOString() : null;
    return v && (!maior || v > maior) ? v : maior;
  }, null);

  return { linhas, dataRef, atualizadoEm };
}

export async function buscarFiltrosFullMl(
  escopo: EmpresaPermitida[],
): Promise<{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[]; datas: string[] }> {
  const nomes = await empresasVinculadas(escopo);
  const ids = [...nomes.keys()];
  if (ids.length === 0) return { empresas: [], marcas: [], datas: [] };

  const marcadores = ids.map(() => '?').join(',');
  const [marcas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pr.descricao_marca
       FROM sysemp_estoque_fisico ef
       JOIN sysemp_produto pr ON pr.id_produto = ef.id_produto
      WHERE ef.deleted = FALSE AND ef.id_empresa IN (${marcadores})
        AND pr.descricao_marca IS NOT NULL AND pr.descricao_marca <> ''
      ORDER BY pr.descricao_marca`,
    ids,
  );
  const [datas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT DATE_FORMAT(m.data_ref, '%Y-%m-%d') AS data
       FROM ml_estoque_full m
       JOIN ml_conta c ON c.user_id_ml = m.user_id_ml
       JOIN ml_conta_empresa ce ON ce.ml_conta_id = c.id
      WHERE ce.id_empresa IN (${marcadores})
      ORDER BY data DESC
      LIMIT 60`,
    ids,
  );

  return {
    empresas: [...nomes].map(([valor, rotulo]) => ({ valor: String(valor), rotulo })),
    marcas: marcas.map((m) => ({ valor: String(m.descricao_marca), rotulo: String(m.descricao_marca) })),
    datas: datas.map((d) => String(d.data)),
  };
}
