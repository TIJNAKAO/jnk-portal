/** Limite a partir do qual o equipamento é cobrado por e-mail (mais de N dias). */
export const DIAS_LIMITE_EMAIL = 3;

export interface DadosEmailAuditoria {
  nomeResponsavel: string | null;
  nomeEquipamento: string;
  diasSemColetar: number | null;
  ultimaColetaEm: Date | null;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarData(data: Date): string {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Texto do e-mail cobrando o envio do inventário. Função pura (sem acesso a
 * banco/SMTP) para ser testável. Dados vindos do banco são escapados: o
 * apelido do equipamento e o nome do responsável são texto livre.
 */
export function montarEmailAuditoria(dados: DadosEmailAuditoria): { assunto: string; html: string } {
  const equipamento = escaparHtml(dados.nomeEquipamento);
  const saudacao = dados.nomeResponsavel ? `Olá, ${escaparHtml(dados.nomeResponsavel)}!` : 'Olá!';

  const situacao =
    dados.diasSemColetar === null || dados.ultimaColetaEm === null
      ? 'ainda não enviou nenhum inventário'
      : `está há <strong>${dados.diasSemColetar} dia(s)</strong> sem enviar o inventário (última coleta em ${formatarData(dados.ultimaColetaEm)})`;

  const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
  <p>${saudacao}</p>
  <p>O equipamento <strong>${equipamento}</strong>, sob a sua responsabilidade, ${situacao}.</p>
  <p>O inventário automático é necessário para manter o controle de hardware e software da empresa.
     Para regularizar, deixe o computador ligado e conectado à internet por alguns minutos,
     de preferência durante o expediente, para que o agente envie a coleta.</p>
  <p>Se o equipamento foi trocado, está desligado há muito tempo ou não está mais em uso,
     responda este e-mail informando a situação para a equipe de TI.</p>
  <p>Obrigado,<br>Equipe de TI</p>
</div>`.trim();

  return { assunto: `Inventário pendente: ${dados.nomeEquipamento}`, html };
}
