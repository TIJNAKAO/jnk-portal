-- Pedido de Compra: cabecalho + itens, juntos no mesmo JSON de detalhe
-- (como Nota Fiscal). Nao confundir com NF Compra (tipo_tabela=3) - este
-- e o pedido em si, pode nao ter NF nenhuma emitida ainda.
-- Ver Specs/spec_modulo_integracao.md, secoes 3.3 e 4.2.
--
-- id_fornecedor do payload vira id_parceiro_fornecedor, pra bater com a
-- convencao de sysemp_pedido (id_parceiro_cliente/id_parceiro_vendedor).
--
-- Sem FK entre as duas tabelas, mesma razao de Pedido de Venda e Nota
-- Fiscal: chegada fora de ordem entre janelas/paginas da fila.

CREATE TABLE IF NOT EXISTS sysemp_pedido_compra (
    id_pedcompra              INT PRIMARY KEY, -- vem como "id_pedcompra"; a BUSCA usa "id_compra" (secao 3.3)
    id_empresa                INT NULL,
    id_parceiro_fornecedor    INT NULL, -- vem como "id_fornecedor"
    data_pedido               DATE NULL,
    data_prev_entrega         DATE NULL,
    valor_bruto               DECIMAL(14,4) NULL,
    valor_desconto            DECIMAL(14,4) NULL,
    valor_frete               DECIMAL(14,4) NULL,
    valor_ipi                 DECIMAL(14,4) NULL,
    valor_liquido_pedido      DECIMAL(14,4) NULL,
    total_geral               DECIMAL(14,4) NULL,
    comprador                 VARCHAR(150) NULL,
    observacao                VARCHAR(500) NULL,
    tipo_pedido               VARCHAR(30) NULL,
    codigo_status             VARCHAR(10) NULL,
    status_pedido             VARCHAR(60) NULL,
    status_entrega            VARCHAR(60) NULL,
    deleted     BOOLEAN DEFAULT FALSE,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_data_pedido (data_pedido),
    INDEX idx_id_empresa (id_empresa),
    INDEX idx_id_parceiro_fornecedor (id_parceiro_fornecedor),
    INDEX idx_status_pedido (status_pedido),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sysemp_pedido_compra_item (
    id_pedcompra              INT NOT NULL, -- liga a sysemp_pedido_compra.id_pedcompra (sem FK, ver acima)
    item                      INT NOT NULL, -- vem como "item"; chave composta com id_pedcompra, como Nota Fiscal
    id_produto                INT NULL,
    qtde_pedido               DECIMAL(14,4) NULL,
    qtde_pendente             DECIMAL(14,4) NULL,
    qtde_recebido             DECIMAL(14,4) NULL,
    desconto                  DECIMAL(14,4) NULL,
    total_bruto               DECIMAL(14,4) NULL,
    total_liquido             DECIMAL(14,4) NULL,
    valor_unitario_bruto      DECIMAL(14,4) NULL,
    valor_unitario_liquido    DECIMAL(14,4) NULL,
    aliquota_ipi              DECIMAL(9,4) NULL,
    aliquota_icms             DECIMAL(9,4) NULL,
    data_prev_entrega         DATE NULL,
    deleted     BOOLEAN DEFAULT FALSE,
    synced_at   DATETIME NOT NULL,
    PRIMARY KEY (id_pedcompra, item),
    INDEX idx_id_produto (id_produto),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
