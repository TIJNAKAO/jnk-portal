import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { destinatariosDeAlerta } from './alertasIntegracao.js';
import { enviarEmail } from './email.js';
import { buscarEntidadeIntegracao } from './integracaoRegistry.js';

/**
 * Resumo diário das integrações, por e-mail à TI. Cobre TODAS as entidades
 * agendadas: o que rodou ontem, o que deu erro, o que está atrasado e o que
 * rodou menos do que devia. É também a rede de segurança do aviso de falha: um
 * job que nunca foi criado/parou de disparar não gera erro nenhum, só silêncio
 * — e silêncio só aparece comparando com o esperado. Ver
 * spec_modulo_integracao.md, seção 8.
 */

/**
 * Execuções esperadas por dia, espelhando os `cron` do `.do/app.yaml`. Quem não
 * está aqui (ex.: `ml_pedidos`, sem job) só tem o que rodou relatado, sem
 * cobrança de frequência. Ao criar um job novo, acrescentar aqui.
 */
export const EXECUCOES_ESPERADAS_POR_DIA: Record<string, number> = {
  notas_fiscais: 24,
  notas_compra: 24,
  estoque: 24,
  produtos: 24,
  parceiros: 24,
  representantes: 24,
  precos: 24,
  pedidos: 24,
  pedidos_compra: 24,
  etl_produto: 24,
  etl_fatcom: 24,
  ml_estoque_full: 24,
  empresas: 1,
  etl_empresa: 1,
};

/** Fração do esperado abaixo da qual o dia é marcado como "rodou pouco". */
const FRACAO_MINIMA = 0.8;

export type SituacaoIntegracao = 'OK' | 'COM_ERRO' | 'ATRASADA' | 'RODOU_POUCO' | 'SEM_EXECUCAO';

export interface DiaIntegracao {
  entidade: string;
  total: number;
  sucesso: number;
  erro: number;
  ultimoErro: string | null;
}

export interface UltimaExecucao {
  entidade: string;
  status: string;
  quando: Date;
}

export interface LinhaResumo {
  entidade: string;
  nome: string;
  esperado: number | null;
  rodou: number;
  sucesso: number;
  erro: number;
  ultimoErro: string | null;
  ultimaExecucao: Date | null;
  situacao: SituacaoIntegracao;
}

/** Horas sem rodar a partir das quais o job é "atrasado": 2,5 ciclos (horário → 2,5 h; diário → 26 h). */
export function limiteAtrasoHoras(esperadoPorDia: number): number {
  return esperadoPorDia >= 12 ? 2.5 : 26;
}

/**
 * Prioridade quando mais de uma condição vale: erro > atrasada > rodou pouco.
 * "Erro" só conta se a ÚLTIMA execução ainda é erro ou houve erro no dia — um
 * erro isolado já recuperado continua aparecendo (para conhecimento), mas
 * com a execução mais recente boa não vira "atrasada".
 */
export function avaliarIntegracoes(params: {
  dia: DiaIntegracao[];
  ultimas: UltimaExecucao[];
  agora: Date;
  nomes?: (chave: string) => string;
}): LinhaResumo[] {
  const nomeDe = params.nomes ?? ((chave: string) => buscarEntidadeIntegracao(chave)?.nome ?? chave);
  const chaves = new Set<string>([...Object.keys(EXECUCOES_ESPERADAS_POR_DIA), ...params.dia.map((d) => d.entidade)]);
  const linhas: LinhaResumo[] = [];

  for (const chave of chaves) {
    const dia = params.dia.find((d) => d.entidade === chave);
    const ultima = params.ultimas.find((u) => u.entidade === chave) ?? null;
    const esperado = EXECUCOES_ESPERADAS_POR_DIA[chave] ?? null;
    const rodou = dia?.total ?? 0;

    let situacao: SituacaoIntegracao = 'OK';
    if ((dia?.erro ?? 0) > 0 || ultima?.status === 'erro') {
      situacao = 'COM_ERRO';
    } else if (!ultima) {
      if (esperado === null) continue;
      situacao = 'SEM_EXECUCAO';
    } else if (esperado !== null) {
      const horasSemRodar = (params.agora.getTime() - ultima.quando.getTime()) / 3_600_000;
      if (horasSemRodar > limiteAtrasoHoras(esperado)) situacao = 'ATRASADA';
      else if (rodou < esperado * FRACAO_MINIMA) situacao = 'RODOU_POUCO';
    }

    linhas.push({
      entidade: chave,
      nome: nomeDe(chave),
      esperado,
      rodou,
      sucesso: dia?.sucesso ?? 0,
      erro: dia?.erro ?? 0,
      ultimoErro: dia?.ultimoErro ?? null,
      ultimaExecucao: ultima?.quando ?? null,
      situacao,
    });
  }

  const peso: Record<SituacaoIntegracao, number> = { COM_ERRO: 0, SEM_EXECUCAO: 1, ATRASADA: 2, RODOU_POUCO: 3, OK: 4 };
  return linhas.sort((a, b) => peso[a.situacao] - peso[b.situacao] || a.nome.localeCompare(b.nome));
}

/** Dia anterior em Brasília, como texto `YYYY-MM-DD` (data pura: UTC de ponta a ponta). */
export function diaAnteriorBrasilia(agora: Date): { data: string; inicio: string; fim: string } {
  const hojeBr = new Date(agora.getTime() - 3 * 3_600_000);
  const hoje = Date.UTC(hojeBr.getUTCFullYear(), hojeBr.getUTCMonth(), hojeBr.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { data: iso(hoje - 86_400_000), inicio: `${iso(hoje - 86_400_000)} 00:00:00`, fim: `${iso(hoje)} 00:00:00` };
}

const ROTULO: Record<SituacaoIntegracao, { texto: string; cor: string }> = {
  OK: { texto: 'OK', cor: '#047857' },
  COM_ERRO: { texto: 'Com erro', cor: '#b91c1c' },
  ATRASADA: { texto: 'Atrasada', cor: '#b45309' },
  RODOU_POUCO: { texto: 'Rodou pouco', cor: '#b45309' },
  SEM_EXECUCAO: { texto: 'Nunca rodou', cor: '#b91c1c' },
};

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dataBr(isoData: string): string {
  const [ano, mes, dia] = isoData.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function montarEmailResumo(dataIso: string, linhas: LinhaResumo[]): { assunto: string; html: string } {
  const problemas = linhas.filter((l) => l.situacao !== 'OK');
  const assunto =
    problemas.length === 0
      ? `[Integração] Resumo de ${dataBr(dataIso)}: tudo certo`
      : `[Integração] Resumo de ${dataBr(dataIso)}: ${problemas.length} com problema`;

  const celula = 'padding:6px 10px;border-bottom:1px solid #e2e8f0;';
  const corpo = linhas
    .map((l) => {
      const r = ROTULO[l.situacao];
      const ultima = l.ultimaExecucao ? l.ultimaExecucao.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
      const erro = l.ultimoErro ? `<br><span style="color:#b91c1c;font-size:12px;">${escaparHtml(l.ultimoErro.slice(0, 200))}</span>` : '';
      return `<tr>
        <td style="${celula}">${escaparHtml(l.nome)}${erro}</td>
        <td style="${celula}text-align:right;">${l.rodou}${l.esperado !== null ? ` / ${l.esperado}` : ''}</td>
        <td style="${celula}text-align:right;">${l.erro}</td>
        <td style="${celula}">${ultima}</td>
        <td style="${celula}color:${r.cor};font-weight:bold;">${r.texto}</td>
      </tr>`;
    })
    .join('');

  const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
  <p>Resumo das integrações de <strong>${dataBr(dataIso)}</strong>${problemas.length === 0 ? ': nenhuma pendência.' : `: <strong>${problemas.length}</strong> com problema (no topo da lista).`}</p>
  <table style="border-collapse:collapse;font-size:13px;">
    <thead><tr style="text-align:left;background:#f1f5f9;">
      <th style="padding:6px 10px;">Integração</th>
      <th style="padding:6px 10px;">Rodou / esperado</th>
      <th style="padding:6px 10px;">Erros</th>
      <th style="padding:6px 10px;">Última execução</th>
      <th style="padding:6px 10px;">Situação</th>
    </tr></thead>
    <tbody>${corpo}</tbody>
  </table>
  <p style="color:#64748b;font-size:12px;">"Atrasada": a última execução tem mais de 2,5 h (jobs de hora em hora) ou 26 h (jobs diários).
     "Rodou pouco": menos de 80% das execuções esperadas no dia. Detalhes em Integração → Execuções.</p>
</div>`.trim();

  return { assunto, html };
}

interface DiaRow extends RowDataPacket {
  entidade: string;
  total: number;
  sucesso: number;
  erro: number;
}
interface UltimaRow extends RowDataPacket {
  entidade: string;
  status: string;
  executado_em: Date;
}
interface ErroRow extends RowDataPacket {
  entidade: string;
  mensagem: string | null;
}

export async function coletarResumo(agora: Date): Promise<{ dataIso: string; linhas: LinhaResumo[] }> {
  const { data, inicio, fim } = diaAnteriorBrasilia(agora);

  const [dias] = await pool.query<DiaRow[]>(
    `SELECT entidade, COUNT(*) AS total, SUM(status = 'sucesso') AS sucesso, SUM(status = 'erro') AS erro
       FROM integracao_log
      WHERE executado_em >= ? AND executado_em < ? AND status <> 'iniciado'
      GROUP BY entidade`,
    [inicio, fim],
  );
  const [erros] = await pool.query<ErroRow[]>(
    `SELECT entidade, mensagem FROM integracao_log
      WHERE status = 'erro' AND executado_em >= ? AND executado_em < ?
      ORDER BY id DESC`,
    [inicio, fim],
  );
  const [ultimas] = await pool.query<UltimaRow[]>(
    `SELECT entidade, status, executado_em FROM integracao_log
      WHERE id IN (SELECT MAX(id) FROM integracao_log WHERE status <> 'iniciado' GROUP BY entidade)`,
  );

  const ultimoErroPorEntidade = new Map<string, string | null>();
  for (const e of erros) if (!ultimoErroPorEntidade.has(e.entidade)) ultimoErroPorEntidade.set(e.entidade, e.mensagem);

  const linhas = avaliarIntegracoes({
    dia: dias.map((d) => ({
      entidade: d.entidade,
      total: Number(d.total),
      sucesso: Number(d.sucesso),
      erro: Number(d.erro),
      ultimoErro: ultimoErroPorEntidade.get(d.entidade) ?? null,
    })),
    ultimas: ultimas.map((u) => ({ entidade: u.entidade, status: u.status, quando: new Date(u.executado_em) })),
    agora,
  });
  return { dataIso: data, linhas };
}

/** Devolve false (e não lança) quando não há destinatário ou SMTP — o script marca o job como falho. */
export async function enviarResumoDiario(agora = new Date()): Promise<boolean> {
  const destinatarios = await destinatariosDeAlerta();
  if (destinatarios.length === 0) {
    console.warn('[resumo] ALERTAS_DESTINATARIOS vazio em Parâmetros → E-mail; resumo não enviado.');
    return false;
  }
  const { dataIso, linhas } = await coletarResumo(agora);
  const { assunto, html } = montarEmailResumo(dataIso, linhas);
  const enviado = await enviarEmail({ para: destinatarios.join(', '), assunto, html });
  if (!enviado) console.warn('[resumo] SMTP não configurado; resumo não enviado.');
  return enviado;
}
