import { ConfiguracaoAusenteError } from '../erros.js';
import { obterParametro } from '../parametros.js';

/**
 * Cliente HTTP da SysEmp — porta de `src/SysempClient.php` do projeto de
 * origem. Ver Specs/spec_modulo_integracao.md, seção 3.1.
 *
 * Autenticação por header fixo `Token`, sempre POST, sem retry automático
 * (diferente do cliente do Mercado Livre — decisão deliberada: quem decide
 * se tenta de novo é o motor de sincronização, registrando o erro no log).
 */
export class SysempError extends Error {}

interface RespostaSysemp {
  status: boolean;
  qtde?: number;
  retorno?: unknown;
  mensagem?: string;
}

async function config(): Promise<{ baseUrl: string; token: string; timeoutMs: number }> {
  const [baseUrl, token, timeoutSegundos] = await Promise.all([
    obterParametro('SYSEMP', 'BASE_URL'),
    obterParametro('SYSEMP', 'TOKEN'),
    obterParametro('SYSEMP', 'TIMEOUT_SEGUNDOS'),
  ]);

  if (!baseUrl || !token) {
    throw new ConfiguracaoAusenteError('Configure BASE_URL e TOKEN da SysEmp em Parâmetros do Sistema antes de sincronizar.');
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), token, timeoutMs: Number(timeoutSegundos ?? 80) * 1000 };
}

export async function sysempPost<T = unknown>(endpoint: string, corpo: Record<string, unknown>): Promise<T> {
  const { baseUrl, token, timeoutMs } = await config();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let resposta: Response;
  try {
    resposta = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: token },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
  } catch (error) {
    throw new SysempError(`Falha de rede ao chamar ${endpoint}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!resposta.ok) {
    const corpoErro = (await resposta.text()).slice(0, 500);
    throw new SysempError(`SysEmp respondeu HTTP ${resposta.status} em ${endpoint}: ${corpoErro}`);
  }

  let json: RespostaSysemp;
  try {
    json = (await resposta.json()) as RespostaSysemp;
  } catch {
    throw new SysempError(`Resposta de ${endpoint} não é JSON válido.`);
  }

  if (json.status !== true) {
    throw new SysempError(`SysEmp reportou erro em ${endpoint}: ${json.mensagem ?? 'sem mensagem'}`);
  }

  return json as T;
}
