-- Corrige a janela de ~30 minutos entre a migration 024 (que passou os
-- carimbos gravados para o horario de Brasilia) e o deploy do codigo que
-- passou a GRAVAR em Brasilia. Nesse intervalo a versao antiga continuou
-- em producao escrevendo UTC numa tabela ja convertida, deixando aquelas
-- linhas 3 horas adiantadas.
--
-- O criterio e a assinatura dessas linhas: elas ficam NO FUTURO em
-- relacao a NOW(). Carimbo de "momento em que o registro passou por aqui"
-- nunca fica no futuro numa linha legitima.
--
-- Por isso expira_em (tokens_reset_senha e ml_conta) esta FORA: token
-- expira no futuro por definicao, e ali o criterio nao distinguiria linha
-- errada de linha certa. Idem para as colunas que a 024 ja nao converteu
-- (bkpkpl_, datas de NFe, Mercado Livre e agente de inventario).
--
-- Idempotente: rodar de novo nao acha mais nada. Em ambiente que nunca
-- passou pela janela, e no-op.
--
-- CASE por coluna porque, numa mesma linha, uma coluna pode estar
-- adiantada e outra nao. atualizado_em entra explicitamente no SET: e
-- ON UPDATE CURRENT_TIMESTAMP e seria sobrescrita com a hora de agora.

UPDATE avisos_plataforma SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE etl_empresa SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE etl_fatcom SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE etl_produto SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE filiais SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE integracao_log SET
    executado_em = CASE WHEN executado_em > NOW() THEN executado_em - INTERVAL 3 HOUR ELSE executado_em END
  WHERE executado_em > NOW();

UPDATE integracao_log_detalhe SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE logs_acesso SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE ml_conta SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE atualizado_em > NOW() OR criado_em > NOW();

UPDATE ml_pedido SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE parametros_sistema SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE perfis SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE schema_migrations SET
    aplicado_em = CASE WHEN aplicado_em > NOW() THEN aplicado_em - INTERVAL 3 HOUR ELSE aplicado_em END
  WHERE aplicado_em > NOW();

UPDATE sysemp_empresa SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_estoque_fisico SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_fila SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    confirmado_em = CASE WHEN confirmado_em > NOW() THEN confirmado_em - INTERVAL 3 HOUR ELSE confirmado_em END,
    consumido_em = CASE WHEN consumido_em > NOW() THEN consumido_em - INTERVAL 3 HOUR ELSE consumido_em END,
    datahora_criacao_sysemp = CASE WHEN datahora_criacao_sysemp > NOW() THEN datahora_criacao_sysemp - INTERVAL 3 HOUR ELSE datahora_criacao_sysemp END,
    datahora_processamento_sysemp = CASE WHEN datahora_processamento_sysemp > NOW() THEN datahora_processamento_sysemp - INTERVAL 3 HOUR ELSE datahora_processamento_sysemp END,
    importado_em = CASE WHEN importado_em > NOW() THEN importado_em - INTERVAL 3 HOUR ELSE importado_em END
  WHERE atualizado_em > NOW() OR confirmado_em > NOW() OR consumido_em > NOW() OR datahora_criacao_sysemp > NOW() OR datahora_processamento_sysemp > NOW() OR importado_em > NOW();

UPDATE sysemp_fila_config SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE sysemp_nota_fiscal SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_nota_fiscal_item SET
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE synced_at > NOW();

UPDATE sysemp_parceiro SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_pedido SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_pedido_item SET
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE synced_at > NOW();

UPDATE sysemp_preco SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_produto SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE sysemp_produto_categoria_fiscal SET
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE synced_at > NOW();

UPDATE sysemp_produto_estoque SET
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE synced_at > NOW();

UPDATE sysemp_produto_origem SET
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE synced_at > NOW();

UPDATE sysemp_representante SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    synced_at = CASE WHEN synced_at > NOW() THEN synced_at - INTERVAL 3 HOUR ELSE synced_at END
  WHERE atualizado_em > NOW() OR criado_em > NOW() OR synced_at > NOW();

UPDATE ti_api_token SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    ultimo_uso_em = CASE WHEN ultimo_uso_em > NOW() THEN ultimo_uso_em - INTERVAL 3 HOUR ELSE ultimo_uso_em END
  WHERE criado_em > NOW() OR ultimo_uso_em > NOW();

UPDATE ti_catalogo_programa SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE ti_departamento SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE ti_equipamento SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END,
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE atualizado_em > NOW() OR criado_em > NOW();

UPDATE ti_equipamento_foto SET
    enviado_em = CASE WHEN enviado_em > NOW() THEN enviado_em - INTERVAL 3 HOUR ELSE enviado_em END
  WHERE enviado_em > NOW();

UPDATE ti_inventario_coleta SET
    recebido_em = CASE WHEN recebido_em > NOW() THEN recebido_em - INTERVAL 3 HOUR ELSE recebido_em END
  WHERE recebido_em > NOW();

UPDATE ti_software_aprovado SET
    atualizado_em = CASE WHEN atualizado_em > NOW() THEN atualizado_em - INTERVAL 3 HOUR ELSE atualizado_em END
  WHERE atualizado_em > NOW();

UPDATE tokens_reset_senha SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END,
    usado_em = CASE WHEN usado_em > NOW() THEN usado_em - INTERVAL 3 HOUR ELSE usado_em END
  WHERE criado_em > NOW() OR usado_em > NOW();

UPDATE usuarios SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();

UPDATE usuarios_empresas SET
    criado_em = CASE WHEN criado_em > NOW() THEN criado_em - INTERVAL 3 HOUR ELSE criado_em END
  WHERE criado_em > NOW();
