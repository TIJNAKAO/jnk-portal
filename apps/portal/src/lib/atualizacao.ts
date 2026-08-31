/**
 * Detecção de versão nova publicada.
 *
 * O build do portal emite `version.json` com a mesma string que embute no
 * bundle (ver `vite.config.ts`). Comparar os dois diz, com certeza, se o
 * JavaScript rodando neste navegador é o que está publicado agora.
 *
 * O desenho anterior comparava duas variáveis de ambiente do App Spec —
 * `VITE_APP_VERSION` no portal e `APP_VERSION` na API. Ambas fixas em "0.1.0"
 * e de componentes que compilam separadamente: nunca divergiam, então a
 * recarga automática nunca acontecia. Aqui os dois valores vêm da mesma
 * constante do mesmo build, então a comparação é sempre significativa.
 */

export type DecisaoAtualizacao = 'nada' | 'recarregar' | 'pedir-recarga-manual';

export interface EstadoVersao {
  /** Versão embutida neste bundle. Vazia em desenvolvimento. */
  versaoLocal: string;
  /** Versão publicada agora, ou `null` se não deu para ler. */
  versaoServidor: string | null;
  /** Versão pela qual já recarregamos nesta aba, se houve. */
  versaoJaTentada: string | null;
}

export function decidirAtualizacao({ versaoLocal, versaoServidor, versaoJaTentada }: EstadoVersao): DecisaoAtualizacao {
  if (!versaoLocal || !versaoServidor) return 'nada';
  if (versaoLocal === versaoServidor) return 'nada';

  // Já recarregamos por esta versão e voltamos na antiga — o problema não é o
  // cache do navegador (a recarga o resolveria). Insistir aqui deixaria a aba
  // recarregando para sempre.
  if (versaoJaTentada === versaoServidor) return 'pedir-recarga-manual';

  return 'recarregar';
}

const CHAVE_TENTATIVA = 'portal:versao-recarregada';

export function versaoJaTentada(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_TENTATIVA);
  } catch {
    // Modo anônimo ou cookies bloqueados: sem memória de tentativa, o pior
    // caso é uma recarga a mais — melhor que quebrar a checagem inteira.
    return null;
  }
}

export function registrarTentativa(versao: string): void {
  try {
    sessionStorage.setItem(CHAVE_TENTATIVA, versao);
  } catch {
    /* ver comentário acima */
  }
}

/**
 * Lê a versão publicada. O parâmetro de tempo na URL é o que garante resposta
 * fresca: a CDN da DigitalOcean guarda arquivos estáticos por até 24h
 * (`s-maxage=86400`), e uma resposta em cache aqui esconderia justamente a
 * mudança que estamos procurando.
 */
export async function buscarVersaoPublicada(): Promise<string | null> {
  try {
    const resposta = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { versao?: string };
    return dados.versao ?? null;
  } catch {
    return null;
  }
}
