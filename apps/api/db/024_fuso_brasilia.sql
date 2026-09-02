-- Passa os carimbos de tempo da aplicacao de UTC pro relogio de Brasilia.
--
-- O cluster MySQL da DigitalOcean roda em UTC (@@system_time_zone) e o pool
-- usava timezone 'Z', entao TODO DATETIME gravado pela aplicacao ficava 3
-- horas adiantado em relacao ao horario local. A correcao no codigo esta em
-- config/database.ts (driver + SET time_zone da sessao); esta migration
-- acerta o que ja estava gravado, senao a mesma coluna passaria a conviver
-- com dois fusos.
--
-- ESCOPO: 64 colunas em 38 tabelas, e SO carimbo gerado pela aplicacao
-- (synced_at, criado_em, atualizado_em, *_em, datahora_*_sysemp). Ficam de
-- FORA, de proposito, as datas que chegam prontas de sistema externo e ja
-- estao no horario local:
--
--   * todas as tabelas bkpkpl_* (KPL legado)
--   * sysemp_nota_fiscal.autorizacao_datahora e .data_cancelamento_nfe
--   * ml_pedido.data_criacao, .data_fechamento, .data_ultima_atualizacao
--   * ti_sistema_operacional.data_instalacao e .ultimo_boot
--   * avisos_plataforma.data_expiracao (digitada no formulario)
--   * ti_equipamento.primeira_coleta_em / .ultima_coleta_em,
--     ti_inventario_coleta.coletado_em e ti_dispositivo_usb.ultima_vez_visto
--     - vem do payload do agente (hora local da maquina), ver
--     services/tiIngestao.ts
--
-- atualizado_em entra explicitamente no SET de cada tabela que a tem: a
-- coluna e ON UPDATE CURRENT_TIMESTAMP, e sem atribuicao explicita o proprio
-- UPDATE a sobrescreveria com a hora de agora.
--
-- REVERSIVEL: trocar "- INTERVAL 3 HOUR" por "+ INTERVAL 3 HOUR" desfaz.

UPDATE avisos_plataforma SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE etl_empresa SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE etl_fatcom SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE etl_produto SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE filiais SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE integracao_log SET
    executado_em = executado_em - INTERVAL 3 HOUR
  WHERE executado_em IS NOT NULL;

UPDATE integracao_log_detalhe SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE logs_acesso SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE ml_conta SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    expira_em = expira_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR expira_em IS NOT NULL;

UPDATE ml_pedido SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE parametros_sistema SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE perfis SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE schema_migrations SET
    aplicado_em = aplicado_em - INTERVAL 3 HOUR
  WHERE aplicado_em IS NOT NULL;

UPDATE sysemp_empresa SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_estoque_fisico SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_fila SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    confirmado_em = confirmado_em - INTERVAL 3 HOUR,
    consumido_em = consumido_em - INTERVAL 3 HOUR,
    datahora_criacao_sysemp = datahora_criacao_sysemp - INTERVAL 3 HOUR,
    datahora_processamento_sysemp = datahora_processamento_sysemp - INTERVAL 3 HOUR,
    importado_em = importado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR confirmado_em IS NOT NULL OR consumido_em IS NOT NULL OR datahora_criacao_sysemp IS NOT NULL OR datahora_processamento_sysemp IS NOT NULL OR importado_em IS NOT NULL;

UPDATE sysemp_fila_config SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE sysemp_nota_fiscal SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_nota_fiscal_item SET
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE synced_at IS NOT NULL;

UPDATE sysemp_parceiro SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_pedido SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_pedido_item SET
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE synced_at IS NOT NULL;

UPDATE sysemp_preco SET
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_produto SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE sysemp_produto_categoria_fiscal SET
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE synced_at IS NOT NULL;

UPDATE sysemp_produto_estoque SET
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE synced_at IS NOT NULL;

UPDATE sysemp_produto_origem SET
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE synced_at IS NOT NULL;

UPDATE sysemp_representante SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR,
    synced_at = synced_at - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL OR synced_at IS NOT NULL;

UPDATE ti_api_token SET
    criado_em = criado_em - INTERVAL 3 HOUR,
    ultimo_uso_em = ultimo_uso_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL OR ultimo_uso_em IS NOT NULL;

UPDATE ti_catalogo_programa SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE ti_departamento SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE ti_equipamento SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR,
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL OR criado_em IS NOT NULL;

UPDATE ti_equipamento_foto SET
    enviado_em = enviado_em - INTERVAL 3 HOUR
  WHERE enviado_em IS NOT NULL;

UPDATE ti_inventario_coleta SET
    recebido_em = recebido_em - INTERVAL 3 HOUR
  WHERE recebido_em IS NOT NULL;

UPDATE ti_software_aprovado SET
    atualizado_em = atualizado_em - INTERVAL 3 HOUR
  WHERE atualizado_em IS NOT NULL;

UPDATE tokens_reset_senha SET
    criado_em = criado_em - INTERVAL 3 HOUR,
    expira_em = expira_em - INTERVAL 3 HOUR,
    usado_em = usado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL OR expira_em IS NOT NULL OR usado_em IS NOT NULL;

UPDATE usuarios SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;

UPDATE usuarios_empresas SET
    criado_em = criado_em - INTERVAL 3 HOUR
  WHERE criado_em IS NOT NULL;
