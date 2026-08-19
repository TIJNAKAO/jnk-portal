/**
 * Erro de configuração ausente (ex: credencial de integração não
 * preenchida em Parâmetros do Sistema) — o middleware de erro global
 * (`app.ts`) preserva o `statusCode` de erros 4xx em vez de sempre
 * responder 500, então isso chega ao cliente com a mensagem real em vez
 * de "Erro interno do servidor".
 */
export class ConfiguracaoAusenteError extends Error {
  statusCode = 422;
}
