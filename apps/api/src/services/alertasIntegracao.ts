import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { enviarEmail } from './email.js';
import { obterParametro } from './parametros.js';

/**
 * Aviso por e-mail à TI quando um job agendado muda de estado: o PRIMEIRO erro
 * de uma sequência ("falhou") e a primeira rodada boa depois de um erro
 * ("voltou a funcionar"). Erro repetido não reenvia — senão uma queda de
 * horas viraria uma enxurrada de e-mails; quem lembra da pendência é o resumo
 * diário (services/resumoIntegracoes.ts). Ver spec_modulo_integracao.md,
 * seção 8.
 */

export type TipoAviso = 'FALHA' | 'RECUPERADA';

/** Aceita vírgula, ponto e vírgula ou espaço; descarta o que não parece e-mail. */
export function parseDestinatarios(texto: string | null | undefined): string[] {
  const unicos = new Set<string>();
  for (const parte of (texto ?? '').split(/[,;\s]+/)) {
    const email = parte.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) unicos.add(email);
  }
  return [...unicos];
}

/**
 * `statusAnterior` é o resultado da rodada concluída imediatamente antes
 * (sucesso/erro; `cancelado` e `iniciado` não contam), ou null se não houver.
 */
export function decidirAviso(statusAtual: 'sucesso' | 'erro' | 'cancelado', statusAnterior: string | null): TipoAviso | null {
  if (statusAtual === 'erro' && statusAnterior !== 'erro') return 'FALHA';
  if (statusAtual === 'sucesso' && statusAnterior === 'erro') return 'RECUPERADA';
  return null;
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dataHoraBr(data: Date): string {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export interface DadosAviso {
  nomeEntidade: string;
  chave: string;
  mensagem: string | null;
  quando: Date;
}

export function montarEmailAviso(tipo: TipoAviso, dados: DadosAviso): { assunto: string; html: string } {
  const nome = escaparHtml(dados.nomeEntidade);
  const chave = escaparHtml(dados.chave);
  const quando = dataHoraBr(dados.quando);

  if (tipo === 'FALHA') {
    const motivo = escaparHtml((dados.mensagem ?? 'sem mensagem registrada').slice(0, 800));
    return {
      assunto: `[Integração] Falha: ${dados.nomeEntidade}`,
      html: `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
  <p>A integração <strong>${nome}</strong> (<code>${chave}</code>) falhou em ${quando}.</p>
  <p><strong>Erro:</strong> ${motivo}</p>
  <p>Este é o primeiro erro da sequência: se continuar falhando você não receberá novos avisos
     desta integração, só o resumo diário. Quando voltar a funcionar, avisamos.</p>
  <p>Detalhes em Integração → Execuções, no portal.</p>
</div>`.trim(),
    };
  }

  return {
    assunto: `[Integração] Voltou a funcionar: ${dados.nomeEntidade}`,
    html: `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
  <p>A integração <strong>${nome}</strong> (<code>${chave}</code>) voltou a funcionar: a rodada de ${quando} terminou com sucesso.</p>
</div>`.trim(),
  };
}

export async function destinatariosDeAlerta(): Promise<string[]> {
  return parseDestinatarios(await obterParametro('EMAIL', 'ALERTAS_DESTINATARIOS'));
}

interface StatusRow extends RowDataPacket {
  status: string;
}

/**
 * Chamada pelo `cronSincronizar` depois de finalizar a rodada. NUNCA lança:
 * falha ao avisar não pode transformar uma sincronização boa em job com erro.
 */
export async function avisarResultadoDoCron(params: {
  chave: string;
  nome: string;
  idLog: number;
  status: 'sucesso' | 'erro' | 'cancelado';
  mensagem?: string;
}): Promise<void> {
  try {
    const [anteriores] = await pool.query<StatusRow[]>(
      "SELECT status FROM integracao_log WHERE entidade = ? AND id < ? AND status IN ('sucesso', 'erro') ORDER BY id DESC LIMIT 1",
      [params.chave, params.idLog],
    );
    const tipo = decidirAviso(params.status, anteriores[0]?.status ?? null);
    if (!tipo) return;

    const destinatarios = await destinatariosDeAlerta();
    if (destinatarios.length === 0) {
      console.warn('[alerta] ALERTAS_DESTINATARIOS vazio em Parâmetros → E-mail; aviso não enviado.');
      return;
    }

    const { assunto, html } = montarEmailAviso(tipo, {
      nomeEntidade: params.nome,
      chave: params.chave,
      mensagem: params.mensagem ?? null,
      quando: new Date(),
    });
    const enviado = await enviarEmail({ para: destinatarios.join(', '), assunto, html });
    if (!enviado) console.warn('[alerta] SMTP não configurado; aviso não enviado.');
  } catch (error) {
    console.error('[alerta] falha ao enviar aviso (a sincronização não é afetada):', error);
  }
}
