-- Seed do módulo Integração e suas telas. Ver Specs/spec_modulo_integracao.md.

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('Integração', 'INTEGRACAO', 'Workflow', 'Sincronização com o ERP SysEmp e o Mercado Livre, e a camada de dados pronta pra relatórios (ETL).');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Painel de Integrações' AS nome_tela, '/integracao/painel' AS rota_tela
    UNION ALL SELECT 'Histórico de Execuções', '/integracao/execucoes'
    UNION ALL SELECT 'Fila SysEmp', '/integracao/fila'
    UNION ALL SELECT 'Parâmetros de Fila SysEmp', '/integracao/parametros-fila'
    UNION ALL SELECT 'Conexão Mercado Livre', '/integracao/mercado-livre'
) t ON m.chave_modulo = 'INTEGRACAO'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);

-- Config de fila só pra Notas Fiscais e Estoque nesta v1 (spec, seção 7.1).
INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES
    ('notas_fiscais', 'Notas Fiscais', 2, '/listarNotasFiscais', 'id_nota_saida', 50, 'tipo_tabela=2 (NF Venda). NF Compra (3) usa o mesmo endpoint — adicionar linha própria se for preciso tratar separado.'),
    ('estoque', 'Saldo de Estoque', 9, '/listarSaldoEstoqueFisico', 'protocolo_estoque', 50, NULL);
