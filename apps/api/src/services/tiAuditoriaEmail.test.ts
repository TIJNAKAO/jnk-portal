import { describe, expect, test } from 'vitest';
import { montarEmailAuditoria } from './tiAuditoriaEmail.js';

describe('montarEmailAuditoria', () => {
  test('informa os dias sem coletar e a data da última coleta', () => {
    const { assunto, html } = montarEmailAuditoria({
      nomeResponsavel: 'Maria',
      nomeEquipamento: 'NB1020',
      diasSemColetar: 7,
      ultimaColetaEm: new Date('2026-11-09T15:00:00Z'),
    });
    expect(assunto).toBe('Inventário pendente: NB1020');
    expect(html).toContain('Olá, Maria!');
    expect(html).toContain('7 dia(s)');
    expect(html).toContain('09/11/2026');
  });

  test('equipamento que nunca coletou não cita dias nem data', () => {
    const { html } = montarEmailAuditoria({
      nomeResponsavel: null,
      nomeEquipamento: 'PC1',
      diasSemColetar: null,
      ultimaColetaEm: null,
    });
    expect(html).toContain('ainda não enviou nenhum inventário');
    expect(html).toContain('Olá!');
    expect(html).not.toContain('dia(s)');
  });

  test('escapa HTML do apelido e do nome do responsável', () => {
    const { html } = montarEmailAuditoria({
      nomeResponsavel: '<b>X</b>',
      nomeEquipamento: '<script>alert(1)</script>',
      diasSemColetar: 4,
      ultimaColetaEm: new Date('2026-11-12T15:00:00Z'),
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('&lt;script&gt;');
  });
});
