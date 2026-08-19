import type { CategoriaParametro } from '@jnk-portal/shared';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { criptografar, descriptografar } from './crypto.js';

interface DefinicaoCampo {
  chave: string;
  sensivel: boolean;
}

/** Lista fechada de campos válidos por categoria — evita gravar chaves arbitrárias. */
export const DEFINICAO_CAMPOS: Record<CategoriaParametro, DefinicaoCampo[]> = {
  EMAIL: [
    { chave: 'SMTP_HOST', sensivel: false },
    { chave: 'SMTP_PORT', sensivel: false },
    { chave: 'SMTP_USER', sensivel: false },
    { chave: 'SMTP_PASSWORD', sensivel: true },
    { chave: 'SMTP_FROM', sensivel: false },
  ],
  WHATSAPP: [{ chave: 'API_TOKEN', sensivel: true }],
  TELEGRAM: [{ chave: 'BOT_TOKEN', sensivel: true }],
  TI: [
    { chave: 'TERMO_POLITICA_TEXTO', sensivel: false },
    { chave: 'AGENTE_DOWNLOAD_URL', sensivel: false },
    { chave: 'AGENTE_API_URL', sensivel: false },
    { chave: 'AGENTE_API_KEY', sensivel: true },
  ],
  SYSEMP: [
    { chave: 'BASE_URL', sensivel: false },
    { chave: 'TOKEN', sensivel: true },
    { chave: 'TIMEOUT_SEGUNDOS', sensivel: false },
    { chave: 'PEDIDOS_DIAS_RETROATIVOS', sensivel: false },
  ],
  MERCADO_LIVRE: [
    { chave: 'APP_ID', sensivel: false },
    { chave: 'SECRET', sensivel: true },
    { chave: 'REDIRECT_URI', sensivel: false },
  ],
};

interface ParametroRow extends RowDataPacket {
  categoria: CategoriaParametro;
  chave: string;
  valor: string | null;
  sensivel: number;
}

export interface ParametroExposto {
  categoria: CategoriaParametro;
  chave: string;
  sensivel: boolean;
  /** Valor em texto plano, só presente quando `sensivel` é falso. */
  valor: string | null;
  /** Quando `sensivel` é verdadeiro, indica se já existe um valor salvo — nunca expõe o valor. */
  definido: boolean;
}

export async function listarParametros(categoria: CategoriaParametro): Promise<ParametroExposto[]> {
  const [rows] = await pool.query<ParametroRow[]>('SELECT * FROM parametros_sistema WHERE categoria = ?', [
    categoria,
  ]);
  const porChave = new Map(rows.map((r) => [r.chave, r]));

  return DEFINICAO_CAMPOS[categoria].map(({ chave, sensivel }) => {
    const row = porChave.get(chave);
    return {
      categoria,
      chave,
      sensivel,
      valor: sensivel ? null : (row?.valor ?? null),
      definido: Boolean(row?.valor),
    };
  });
}

/** `valor` vazio/undefined = "não alterar" (preserva o valor existente), nunca "apagar". */
export async function salvarParametros(categoria: CategoriaParametro, campos: Record<string, string | undefined>) {
  const definicoes = DEFINICAO_CAMPOS[categoria];

  for (const { chave, sensivel } of definicoes) {
    const valorRecebido = campos[chave];
    if (valorRecebido === undefined || valorRecebido === '') continue;

    const valorGravado = sensivel ? criptografar(valorRecebido) : valorRecebido;
    await pool.query(
      `INSERT INTO parametros_sistema (categoria, chave, valor, sensivel)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor), atualizado_em = CURRENT_TIMESTAMP`,
      [categoria, chave, valorGravado, sensivel],
    );
  }
}

/** Ponto de leitura interno para qualquer campo de Parâmetros — descriptografa se `sensivel`. */
export async function obterParametro(categoria: CategoriaParametro, chave: string): Promise<string | null> {
  return valorDescriptografado(categoria, chave);
}

async function valorDescriptografado(categoria: CategoriaParametro, chave: string): Promise<string | null> {
  const [rows] = await pool.query<ParametroRow[]>(
    'SELECT valor, sensivel FROM parametros_sistema WHERE categoria = ? AND chave = ? LIMIT 1',
    [categoria, chave],
  );
  const row = rows[0];
  if (!row?.valor) return null;
  return row.sensivel ? descriptografar(row.valor) : row.valor;
}

export interface ConfigEmail {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/** Ponto de leitura interno usado pelo fluxo de "Esqueci a Senha" (seção 9). */
export async function obterConfigEmail(): Promise<ConfigEmail | null> {
  const [host, port, user, password, from] = await Promise.all([
    valorDescriptografado('EMAIL', 'SMTP_HOST'),
    valorDescriptografado('EMAIL', 'SMTP_PORT'),
    valorDescriptografado('EMAIL', 'SMTP_USER'),
    valorDescriptografado('EMAIL', 'SMTP_PASSWORD'),
    valorDescriptografado('EMAIL', 'SMTP_FROM'),
  ]);

  if (!host || !port || !user || !password || !from) return null;
  return { host, port: Number(port), user, password, from };
}
