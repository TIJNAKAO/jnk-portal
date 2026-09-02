import { describe, expect, test } from 'vitest';
import { LIMITE_LINHA_CMD, empacotarComoBat } from './tiScripts.js';

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
