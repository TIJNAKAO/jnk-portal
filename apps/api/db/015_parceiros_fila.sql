-- Converte Parceiros de sync por lote/offset pra fila (mesmo conceito de
-- Notas Fiscais/Estoque/Pedidos): lista a fila, busca detalhe por evento,
-- confirma consumido. tipo_tabela 4.
--
-- ATENCAO: campo_id_detalhe = 'codigo' e uma inferencia por consistencia
-- com os outros consumidores (o nome do campo de filtro geralmente repete
-- o nome do campo identificador na resposta - confirmado em NF Venda e
-- Estoque). NAO confirmado com a SysEmp ainda. Linha comeca INATIVA
-- (ativo=FALSE) de proposito: um nome de campo errado faz a SysEmp ignorar
-- o filtro e devolver o primeiro parceiro do lote inteiro, gravando dado
-- errado sob o id_registro errado. So ativar (UPDATE sysemp_fila_config
-- SET ativo = TRUE WHERE chave = 'parceiros') depois de confirmar/testar
-- o parametro certo contra a API real.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, ativo, observacoes)
VALUES (
    'parceiros',
    'Parceiros',
    4,
    '/listarParceiros',
    'codigo',
    50,
    FALSE,
    'campo_id_detalhe nao confirmado com a SysEmp - ver comentario no topo do arquivo de migration antes de ativar.'
);
