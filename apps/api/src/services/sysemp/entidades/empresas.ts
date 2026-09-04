import { withTransaction } from '../../../config/database.js';
import * as integracaoLog from '../../integracaoLog.js';
import type { ResultadoSincronizacao } from '../../integracaoLog.js';
import { sysempPost } from '../client.js';
import { inteiro, valor } from '../dbUtil.js';

/**
 * `grupo_empresa` não vem da SysEmp — mapeamento fixo por `id_empresa`,
 * preservado do projeto de origem (spec, seção 7.2 — confirmado manter o
 * mesmo). Ajustar aqui se os códigos de `id_empresa` deste cliente forem
 * diferentes.
 */
function calcularGrupoEmpresa(idEmpresa: number): string {
  if ([1, 2, 5, 6, 7, 8].includes(idEmpresa)) return 'JNK';
  if ([4, 9].includes(idEmpresa)) return 'CNK2';
  if (idEmpresa === 3) return 'NK2';
  return 'N/D';
}

/** Sem paginação — `/listarEmpresas` devolve o cadastro inteiro numa chamada. */
export async function sincronizarEmpresas(idLog: number): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();
  const resposta = await sysempPost<{ retorno: Record<string, unknown>[] }>('/listarEmpresas', {});
  const empresas = resposta.retorno ?? [];

  await withTransaction(async (connection) => {
    for (const emp of empresas) {
      const idEmpresa = inteiro(emp, 'id_empresa');
      if (idEmpresa === null) continue;

      await connection.query(
        `INSERT INTO sysemp_empresa (id_empresa, razao_social, fantasia, cnpj, insc_estadual, endereco, numero, bairro, cep, cidade, uf, telefone, email, ativa, grupo_empresa, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           razao_social = VALUES(razao_social), fantasia = VALUES(fantasia), cnpj = VALUES(cnpj),
           insc_estadual = VALUES(insc_estadual), endereco = VALUES(endereco), numero = VALUES(numero),
           bairro = VALUES(bairro), cep = VALUES(cep), cidade = VALUES(cidade), uf = VALUES(uf),
           telefone = VALUES(telefone), email = VALUES(email), ativa = VALUES(ativa),
           grupo_empresa = VALUES(grupo_empresa), synced_at = CURRENT_TIMESTAMP`,
        [
          idEmpresa,
          valor(emp, 'razao_social'),
          valor(emp, 'fantasia'),
          valor(emp, 'cnpj'),
          valor(emp, 'insc_estadual'),
          valor(emp, 'endereco'),
          valor(emp, 'numero'),
          valor(emp, 'bairro'),
          valor(emp, 'cep'),
          valor(emp, 'cidade'),
          valor(emp, 'uf'),
          valor(emp, 'telefone'),
          valor(emp, 'email'),
          true,
          calcularGrupoEmpresa(idEmpresa),
        ],
      );
    }
  });

  await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: empresas.length, duracaoMs: Date.now() - inicio });
  return { qtde: empresas.length };
}
