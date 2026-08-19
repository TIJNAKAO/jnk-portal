import nodemailer from 'nodemailer';
import { obterConfigEmail } from './parametros.js';

interface EnviarEmailParams {
  para: string;
  assunto: string;
  html: string;
}

/**
 * Retorna `false` (sem lançar) se o SMTP não estiver configurado em
 * Parâmetros — o fluxo de "Esqueci a Senha" depende disso para nunca vazar
 * se um e-mail existe, mesmo com o envio indisponível (ver spec, seção 9).
 */
export async function enviarEmail({ para, assunto, html }: EnviarEmailParams): Promise<boolean> {
  const config = await obterConfigEmail();
  if (!config) {
    console.warn('[email] SMTP não configurado em Parâmetros do Sistema — e-mail não enviado.');
    return false;
  }

  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });

  await transporte.sendMail({ from: config.from, to: para, subject: assunto, html });
  return true;
}
