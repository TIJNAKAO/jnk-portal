import { describe, expect, test } from 'vitest';
import {
  LIMITE_LINHA_CMD,
  empacotarComoBat,
  gerarScriptAtualizarProgramas,
  gerarScriptConfigurarAgente,
} from './tiScripts.js';

/**
 * O `.bat` existe para que o usuário final consiga dar duplo clique: um
 * `.ps1` abre no Bloco de Notas em vez de executar, e mesmo pelo menu
 * "Executar com PowerShell" esbarra em ExecutionPolicy e em falta de
 * elevação.
 *
 * O empacotamento carrega o PowerShell em **base64**, e não colado como
 * texto, porque o `cmd.exe` reinterpretaria `%`, `&`, `|`, `>` e `^` do
 * script, e ainda leria acento no codepage errado. Em base64 o corpo é
 * ASCII puro e chega intacto.
 */

/**
 * Reconstrói o que o .bat vai gravar em disco, a partir do próprio .bat.
 *
 * O prefixo `"%B64%" echo ` é obrigatório no casamento: sem ele, a linha
 * `@echo off` também casa e entra como primeiro pedaço do base64.
 */
function decodificar(bat: string): string {
  const pedacos = [...bat.matchAll(/"%B64%" echo ([A-Za-z0-9+/=]+)\r?$/gm)].map((m) => m[1]);
  return Buffer.from(pedacos.join(''), 'base64').toString('utf8');
}

const SCRIPT = '﻿# Script de teste\r\nWrite-Host "Programas & Drivers 100% >> ok"\r\n';

describe('empacotarComoBat', () => {
  test('o script volta byte a byte, incluindo o BOM', () => {
    // O BOM é o que faz o Windows PowerShell 5.1 ler o arquivo como UTF-8;
    // perdê-lo aqui corromperia todo acento na execução.
    expect(decodificar(empacotarComoBat('teste', SCRIPT))).toBe(SCRIPT);
  });

  test('preserva caracteres que o cmd.exe destruiria se fossem colados como texto', () => {
    const perigoso = '﻿Write-Host "50% & 100% ^ > < | \\" acentuação"\r\n';

    expect(decodificar(empacotarComoBat('teste', perigoso))).toBe(perigoso);
  });

  test('o .bat em si é ASCII puro e não começa com BOM', () => {
    // BOM no início de um .bat faz o cmd.exe tentar executar os bytes do
    // BOM como comando e falhar logo na primeira linha.
    const bat = empacotarComoBat('teste', SCRIPT);

    expect(bat.startsWith('@echo off')).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(bat)).toBe(false);
  });

  test('nenhuma linha passa do limite de 8191 caracteres do cmd.exe', () => {
    // Um script grande vira um base64 grande; em uma linha só, o cmd
    // truncaria silenciosamente e o arquivo gravado sairia corrompido.
    const grande = '﻿' + 'Write-Host "linha"\r\n'.repeat(2000);
    const bat = empacotarComoBat('grande', grande);

    expect(grande.length).toBeGreaterThan(LIMITE_LINHA_CMD);
    for (const linha of bat.split('\r\n')) {
      expect(linha.length).toBeLessThan(LIMITE_LINHA_CMD);
    }
    expect(decodificar(bat)).toBe(grande);
  });

  test('pede elevação sozinho quando não estiver como administrador', () => {
    const bat = empacotarComoBat('teste', SCRIPT);

    expect(bat).toContain('net session');
    expect(bat).toContain('-Verb RunAs');
  });

  test('roda o PowerShell ignorando a ExecutionPolicy da máquina', () => {
    expect(empacotarComoBat('teste', SCRIPT)).toContain('-ExecutionPolicy Bypass');
  });

  test('apaga o .ps1 temporário depois de rodar', () => {
    const bat = empacotarComoBat('teste', SCRIPT);

    expect(bat).toContain('del ');
  });

  test('o nome do temporário sai do nome base, sem caractere que quebre caminho', () => {
    const bat = empacotarComoBat('Configurar Agente/v2', SCRIPT);

    expect(bat).toContain('configurar_agente_v2');
    expect(bat).not.toContain('Configurar Agente/v2');
  });

  test('linhas terminam em CRLF — cmd.exe não lê arquivo com LF sozinho de forma confiável', () => {
    const bat = empacotarComoBat('teste', SCRIPT);

    expect(bat).toContain('\r\n');
    expect(bat.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });
});

/**
 * Regressao de campo, em duas etapas.
 *
 * 1. Numa maquina onde o winget nunca tinha rodado, o script morria com
 *    `0x8A15000F` ("os dados exigidos pela origem estao ausentes"). A
 *    primeira tentativa foi preparar a fonte com `winget source update` --
 *    e nao resolveu.
 *
 * 2. O log do winget deu a causa real: o indice da fonte e um pacote
 *    **MSIX registrado por usuario**, e registrar MSIX exige **sessao
 *    interativa**. O `.bat` elevava com `-Verb RunAs`, o operador digitava
 *    a conta `Administrador` (RID 500), que tem token mas nunca fez logon
 *    naquela maquina, e a implantacao falhava com `0x80073D19`, "usuario
 *    foi desconectado". Nenhuma flag do winget alcanca isso.
 *
 * Dai a divisao: o winget roda na **sessao do usuario logado**, onde a
 * fonte registra normalmente, e so o bloco de drivers eleva -- a COM do
 * Windows Update depende de privilegio, nao de MSIX, e sempre funcionou
 * mesmo na conta sem sessao.
 */
describe('gerarScriptAtualizarProgramas', () => {
  const script = gerarScriptAtualizarProgramas();
  const linhas = script.split('\n');
  const indiceDe = (trecho: string) => linhas.findIndex((linha) => linha.includes(trecho));

  test('o winget roda antes de qualquer elevacao, na sessao do usuario', () => {
    const posicaoWinget = indiceDe('winget upgrade');
    const posicaoElevacao = indiceDe('-Verb RunAs');

    expect(posicaoWinget).toBeGreaterThan(-1);
    expect(posicaoElevacao).toBeGreaterThan(-1);
    expect(posicaoWinget).toBeLessThan(posicaoElevacao);
  });

  test('eleva so o bloco de drivers, e espera ele terminar', () => {
    const elevacao = linhas[indiceDe('-Verb RunAs')] ?? '';
    expect(elevacao).toContain('-Wait');
  });

  test('a COM do Windows Update fica dentro do ramo elevado, nao no fluxo principal', () => {
    // O ramo elevado abre o script (e a segunda passada, relancada com
    // -LogDrivers), entao a COM aparece antes do RunAs no texto de proposito.
    const abreRamoElevado = indiceDe('if ($LogDrivers)');
    const comecaFluxoNormal = indiceDe('=== Atualizando programas (winget) ===');
    const posicaoCom = indiceDe('Microsoft.Update.Session');

    expect(abreRamoElevado).toBeGreaterThan(-1);
    expect(posicaoCom).toBeGreaterThan(abreRamoElevado);
    expect(posicaoCom).toBeLessThan(comecaFluxoNormal);
  });

  test('procura so na fonte winget — a msstore exige regiao geografica e contrato proprio', () => {
    const linhaUpgrade = linhas.find((linha) => linha.includes('winget upgrade'));
    expect(linhaUpgrade).toContain('--source winget');
  });

  test('avisa quando o winget termina com erro, em vez de dizer que concluiu', () => {
    expect(script).toContain('$LASTEXITCODE');
  });
});

describe('empacotarComoBat sem elevacao', () => {
  test('o .bat de winget nao eleva no topo — elevar entrega o winget a uma conta sem sessao', () => {
    const bat = empacotarComoBat('teste', SCRIPT, { elevar: false });

    expect(bat).not.toContain('RunAs');
    expect(bat).not.toContain('net session');
  });

  test('sem a opcao, segue elevando — os outros scripts do modulo dependem disso', () => {
    const bat = empacotarComoBat('teste', SCRIPT);

    expect(bat).toContain('-Verb RunAs');
  });

  test('o script embutido volta intacto tambem sem elevacao', () => {
    const bat = empacotarComoBat('teste', SCRIPT, { elevar: false });

    expect(decodificar(bat)).toBe(SCRIPT);
  });
});

/**
 * O historico da tarefa nao e propriedade dela: o "Habilitar Historico de
 * Todas as Tarefas" do Agendador liga o canal de log
 * `Microsoft-Windows-TaskScheduler/Operational` do Windows inteiro, que vem
 * desligado por padrao. Sem ele a aba Historico fica vazia e nao da pra
 * saber se a coleta rodou no boot.
 */
describe('gerarScriptConfigurarAgente — historico da tarefa', () => {
  const script = gerarScriptConfigurarAgente({
    agenteUrl: 'https://exemplo.test/AgenteInventarioPC.exe',
    apiUrl: 'https://exemplo.test/api/ti/inventario',
    apiKey: 'token-de-teste',
  });
  const linhas = script.split('\n');
  const indiceDe = (trecho: string) => linhas.findIndex((linha) => linha.includes(trecho));

  test('habilita o canal de log do Agendador', () => {
    expect(script).toContain('Microsoft-Windows-TaskScheduler/Operational');
    expect(script).toContain('/enabled:true');
  });

  test('habilita depois de registrar a tarefa', () => {
    expect(indiceDe('/enabled:true')).toBeGreaterThan(indiceDe('Register-ScheduledTask'));
  });

  test('nao repete o trabalho quando o canal ja esta ligado', () => {
    expect(script).toContain('wevtutil get-log');
  });

  test('falhar ao habilitar nao derruba a instalacao — historico e diagnostico', () => {
    // O bloco tem try/catch proprio: registrar a tarefa e o que importa, e
    // o script nao pode abortar por causa de log.
    const posicaoHistorico = indiceDe('/enabled:true');
    const catchDoHistorico = linhas.findIndex(
      (linha, i) => i > posicaoHistorico && linha.includes('} catch {'),
    );
    expect(catchDoHistorico).toBeGreaterThan(posicaoHistorico);
  });
});
