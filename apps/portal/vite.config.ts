import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Identidade deste build. Preferimos o hash do commit — assim dois builds do
 * mesmo código produzem a mesma versão, e um deploy sem mudança de código não
 * força recarga em ninguém. Sem git disponível (o container de build da
 * DigitalOcean pode não trazer o `.git`), cai no horário do build, que é único
 * o bastante para o propósito.
 */
function versaoDoBuild(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `build-${Date.now().toString(36)}`;
  }
}

const VERSAO = versaoDoBuild();

/**
 * Emite `version.json` com a mesma versão embutida no bundle.
 *
 * Os dois valores saem da MESMA constante deste build, e é isso que torna a
 * comparação confiável: o desenho anterior confrontava duas variáveis de
 * ambiente fixas ("0.1.0" no portal e "0.1.0" na API), de componentes que
 * compilam separadamente — nunca divergiam, então a recarga automática jamais
 * disparava.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emitir-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ versao: VERSAO }),
        });
      },
    },
  ],
  define: {
    __VERSAO_BUILD__: JSON.stringify(VERSAO),
  },
  server: {
    port: 5173,
  },
});
