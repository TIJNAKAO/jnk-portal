import type { PoolConnection } from '../../../config/database.js';
import { booleano, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Parceiro (tipo_tabela 4). Migrado de sync por
 * lote/offset (`/listarParceiros` paginado) pra fila, seguindo o mesmo
 * padrão de Notas Fiscais/Estoque/Pedidos — ver `sysemp_fila_config`,
 * chave 'parceiros'.
 *
 * Sem sub-tabelas: cliente/fornecedor/transportadora são flags booleanas
 * na mesma linha, não entidades separadas. `sysemp_parceiro` não tem
 * coluna `deleted` (diferente de NF/Estoque/Pedido) — evento `acao='D'`
 * reaproveita a flag `ativo` já existente.
 *
 * `campo_id_detalhe` da config ('codigo') é uma inferência por
 * consistência com os outros consumidores (o filtro de busca por id
 * geralmente repete o nome do campo identificador da resposta — confirmado
 * em NF Venda e Estoque). Não confirmado com a SysEmp — a linha em
 * `sysemp_fila_config` começa com `ativo=FALSE` de propósito. Ver
 * `apps/api/db/015_parceiros_fila.sql`.
 */
async function gravarParceiro(connection: PoolConnection, payload: Record<string, unknown> | null, acao: 'I' | 'U' | 'D', idRegistro: number): Promise<void> {
  if (acao === 'D' || !payload) {
    await connection.query('UPDATE sysemp_parceiro SET ativo = FALSE WHERE id_parceiro = ?', [idRegistro]);
    return;
  }

  await connection.query(
    `INSERT INTO sysemp_parceiro (
       id_parceiro, class_cliente, class_fornecedor, class_transportadora, razao_social, fantasia, cpf_cnpj,
       tipo_pessoa, insc_estadual, insc_municipal, contato_nome, sexo, data_nascimento, telefone1, telefone2,
       data_cadastro, logradouro, logradouro_numero, logradouro_complemento, logradouro_bairro,
       logradouro_municipio, logradouro_uf, logradouro_cep, ativo, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       class_cliente = VALUES(class_cliente), class_fornecedor = VALUES(class_fornecedor),
       class_transportadora = VALUES(class_transportadora), razao_social = VALUES(razao_social),
       fantasia = VALUES(fantasia), cpf_cnpj = VALUES(cpf_cnpj), tipo_pessoa = VALUES(tipo_pessoa),
       insc_estadual = VALUES(insc_estadual), insc_municipal = VALUES(insc_municipal),
       contato_nome = VALUES(contato_nome), sexo = VALUES(sexo), data_nascimento = VALUES(data_nascimento),
       telefone1 = VALUES(telefone1), telefone2 = VALUES(telefone2), data_cadastro = VALUES(data_cadastro),
       logradouro = VALUES(logradouro), logradouro_numero = VALUES(logradouro_numero),
       logradouro_complemento = VALUES(logradouro_complemento), logradouro_bairro = VALUES(logradouro_bairro),
       logradouro_municipio = VALUES(logradouro_municipio), logradouro_uf = VALUES(logradouro_uf),
       logradouro_cep = VALUES(logradouro_cep), ativo = TRUE, synced_at = CURRENT_TIMESTAMP`,
    [
      idRegistro,
      booleano(payload, 'class_cliente'),
      booleano(payload, 'class_fornecedor'),
      booleano(payload, 'class_transportadora'),
      valor(payload, 'razao_social'),
      valor(payload, 'fantasia'),
      valor(payload, 'cpf_cnpj'),
      valor(payload, 'tipopessoa'),
      valor(payload, 'insc_estadual'),
      valor(payload, 'inscr_municipal'),
      valor(payload, 'contato_nome'),
      valor(payload, 'sexo'),
      valor(payload, 'data_nascimento'),
      valor(payload, 'telefone1'),
      valor(payload, 'telefone2'),
      valor(payload, 'data_cadastro'),
      valor(payload, 'logradouro'),
      valor(payload, 'logradouro_numero'),
      valor(payload, 'logradouro_complemento'),
      valor(payload, 'logradouro_bairro'),
      valor(payload, 'logradouro_municipio'),
      valor(payload, 'logradouro_uf'),
      valor(payload, 'logradouro_cep'),
    ],
  );
}

registrarConsumidorFila({ tipoTabela: 4, gravar: gravarParceiro });
