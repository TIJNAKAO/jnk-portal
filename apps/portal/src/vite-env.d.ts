/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Versão deste build, injetada por `vite.config.ts` via `define`. É a mesma
 * string gravada em `version.json`, e a comparação entre as duas é o que
 * detecta que saiu versão nova. Vazia em desenvolvimento.
 */
declare const __VERSAO_BUILD__: string;
