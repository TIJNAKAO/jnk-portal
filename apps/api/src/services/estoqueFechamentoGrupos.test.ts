import { describe, expect, test } from 'vitest';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { filtrarGruposPorEscopo, type GrupoEmpresa } from './estoqueFechamentoGrupos.js';

/**
 * A assimetria desta tela, que o spec (seção 3.6) justifica: o escopo
 * filtra QUAIS GRUPOS aparecem, mas não recorta as empresas dentro de um
 * grupo autorizado. A Lista de Inventário é peça contábil entregue para
 * fora — se o recorte do usuário afetasse o resultado, dois usuários
 * gerariam listas diferentes para o mesmo grupo e período, e a diferença
 * passaria despercebida.
 */
const GRUPOS: GrupoEmpresa[] = [
  {
    grupo: 'JNK',
    empresas: [
      { idEmpresa: 1, razaoSocial: 'CASA J NAKAO LTDA' },
      { idEmpresa: 2, razaoSocial: 'FULL SHOPEE CASA J NAKAO' },
    ],
  },
  {
    grupo: 'NK2',
    empresas: [{ idEmpresa: 7, razaoSocial: 'NK2 COMERCIO LTDA' }],
  },
];

describe('filtrarGruposPorEscopo', () => {
  test('uma empresa no escopo já libera o grupo inteiro', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 1 }];

    const resultado = filtrarGruposPorEscopo(GRUPOS, escopo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.grupo).toBe('JNK');
  });

  test('o grupo liberado vem com TODAS as suas empresas, não só as do escopo', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 1 }];

    const [jnk] = filtrarGruposPorEscopo(GRUPOS, escopo);

    expect(jnk?.empresas.map((e) => e.idEmpresa)).toEqual([1, 2]);
  });

  test('escopo vazio devolve lista vazia — falha fechada, nunca tudo', () => {
    expect(filtrarGruposPorEscopo(GRUPOS, [])).toEqual([]);
  });

  test('escopo só do KPL não libera empresa da SysEmp de mesmo código', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'KPL', cdFilial: 1 }];

    expect(filtrarGruposPorEscopo(GRUPOS, escopo)).toEqual([]);
  });

  test('escopo em dois grupos devolve os dois', () => {
    const escopo: EmpresaPermitida[] = [
      { origem: 'SYSEMP', cdFilial: 2 },
      { origem: 'SYSEMP', cdFilial: 7 },
    ];

    expect(filtrarGruposPorEscopo(GRUPOS, escopo).map((g) => g.grupo)).toEqual(['JNK', 'NK2']);
  });

  test('empresa do escopo que não está em grupo nenhum não inventa grupo', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 99 }];

    expect(filtrarGruposPorEscopo(GRUPOS, escopo)).toEqual([]);
  });

  test('lista de grupos vazia devolve vazio mesmo com escopo largo', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 1 }];

    expect(filtrarGruposPorEscopo([], escopo)).toEqual([]);
  });
});
