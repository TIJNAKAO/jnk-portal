import ExcelJS from 'exceljs';

/**
 * Leitura de planilha `.xlsx` das telas de importação do Fechamento de
 * Custo. Ver Specs/spec_modulo_estoque.md, seção 3.4.
 *
 * Substitui o `src/XlsxReader.php` caseiro do portal PHP anterior, que
 * existia só porque aquele projeto não tinha biblioteca de planilha
 * nenhuma. Aqui o exceljs já é dependência, usada nas exportações.
 *
 * Tudo sai como **texto**: o parse de número e de data é responsabilidade
 * de quem importa, que sabe o significado da coluna. Célula que o Excel
 * guardou como número (código de produto sem zero à esquerda, por
 * exemplo) chega igual a uma que ele guardou como texto.
 */

/** Planilha fora do modelo esperado — erro do usuário, não do servidor. */
export class PlanilhaForaDoModeloError extends Error {
  statusCode = 422;
}

export interface PlanilhaLida {
  /** Primeira linha, aparada. */
  cabecalho: string[];
  /** Demais linhas. Célula vazia é `null`, preservando a posição das outras. */
  linhas: (string | null)[][];
}

/**
 * Normaliza o que o exceljs devolve numa célula. O tipo `CellValue` cobre
 * texto, número, data, fórmula (com resultado), hyperlink e rich text — e
 * a planilha real traz vários deles na mesma coluna.
 */
function celulaParaTexto(valor: ExcelJS.CellValue): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === 'object') {
    if ('richText' in valor) {
      return (
        valor.richText
          .map((t) => t.text)
          .join('')
          .trim() || null
      );
    }
    if ('text' in valor && typeof valor.text === 'string') {
      return valor.text.trim() || null;
    }
    if ('result' in valor) {
      return celulaParaTexto(valor.result as ExcelJS.CellValue);
    }
    if ('error' in valor) {
      return null; // #N/D, #VALOR! etc — trata como célula vazia
    }
  }

  return null;
}

export async function lerPlanilha(buffer: Buffer): Promise<PlanilhaLida> {
  const workbook = new ExcelJS.Workbook();

  try {
    // O exceljs declara um `interface Buffer extends ArrayBuffer` próprio,
    // que não é o Buffer do Node (um Uint8Array). Em runtime ele aceita o
    // do Node sem problema — a divergência é só de tipagem, e o cast fica
    // nesta fronteira em vez de contaminar a assinatura da função.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    // Arquivo corrompido ou que não é xlsx de verdade. Vira erro de
    // modelo (422) e não 500: o problema está no que o usuário mandou.
    throw new PlanilhaForaDoModeloError('Não foi possível ler o arquivo. Ele é mesmo uma planilha .xlsx?');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new PlanilhaForaDoModeloError('A planilha não tem nenhuma aba.');
  }

  const todas: (string | null)[][] = [];
  const largura = sheet.columnCount;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const celulas: (string | null)[] = [];
    for (let coluna = 1; coluna <= largura; coluna++) {
      celulas.push(celulaParaTexto(row.getCell(coluna).value));
    }
    // Linha em branco no meio ou no fim do arquivo não é dado.
    if (celulas.some((c) => c !== null)) todas.push(celulas);
  });

  const cabecalho = todas.shift();
  if (!cabecalho) {
    throw new PlanilhaForaDoModeloError('A planilha está vazia — nem o cabeçalho foi encontrado.');
  }

  return { cabecalho: cabecalho.map((c) => c ?? ''), linhas: todas };
}

/**
 * Índice de cada coluna esperada dentro do cabeçalho, **por nome**.
 * Reordenar colunas na planilha não quebra a importação; faltar coluna
 * derruba a importação inteira antes de gravar qualquer linha.
 */
export function mapearColunas(cabecalho: string[], esperadas: readonly string[]): Record<string, number> {
  const normalizado = cabecalho.map((c) => c.trim());
  const indices: Record<string, number> = {};
  const faltando: string[] = [];

  for (const nome of esperadas) {
    const posicao = normalizado.indexOf(nome);
    if (posicao === -1) faltando.push(nome);
    else indices[nome] = posicao;
  }

  if (faltando.length > 0) {
    throw new PlanilhaForaDoModeloError(
      `Planilha fora do modelo esperado — colunas não encontradas: ${faltando.join(', ')}.`,
    );
  }

  return indices;
}

/** `MM/AAAA` da planilha para o primeiro dia do mês (`AAAA-MM-01`). */
export function parsePeriodo(valor: string | null | undefined): string | null {
  const texto = valor?.trim() ?? '';
  const partes = /^(\d{1,2})\/(\d{4})$/.exec(texto);
  if (!partes) return null;

  const mes = Number(partes[1] ?? '');
  const ano = Number(partes[2] ?? '');
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;

  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`;
}

/**
 * Número da planilha. Vazio vira `null` e **não** zero — a diferença
 * entre "não informado" e "contou zero" é o que o inventário compara.
 * Aceita vírgula decimal porque o Excel em pt-BR escreve assim quando a
 * célula é texto.
 */
export function parseNumero(valor: string | null | undefined): number | null {
  const texto = valor?.trim() ?? '';
  if (texto === '') return null;

  const numero = Number(texto.replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

export function parseTexto(valor: string | null | undefined): string | null {
  return valor?.trim() || null;
}
