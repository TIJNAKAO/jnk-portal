-- Corrige ti_inventario_coleta.coletado_em, que continuou em UTC depois que
-- o resto do banco passou para o relogio de Brasilia.
--
-- A migration 024 deixou esta coluna de FORA de proposito, na premissa de
-- que ela "vem do payload do agente (hora local da maquina)". A premissa
-- estava errada: das quatro datas que o agente envia, esta e a UNICA em
-- UTC -- Program.cs a monta com DateTime.UtcNow, enquanto data_instalacao,
-- ultimo_boot e ultima_vez_visto saem no relogio local da maquina. Enquanto
-- o banco tambem guardava UTC as duas coisas combinavam; depois da 024, a
-- coleta passou a aparecer 3 horas adiantada na tela.
--
-- O criterio "> NOW()" da migration 027 NAO serve aqui. Naquele caso a
-- janela era de ~30 minutos, entao a linha errada ficava no futuro. Aqui o
-- agente sempre mandou UTC, entao a linha de ontem esta adiantada mas
-- continua no passado, e o filtro nao a alcancaria.
--
-- O criterio certo e comparar com recebido_em, que e DEFAULT
-- CURRENT_TIMESTAMP -- carimbo do proprio servidor, e ja esta em Brasilia
-- desde a 024. Numa linha correta as duas ficam a segundos de distancia;
-- numa linha gravada em UTC, coletado_em fica ~3h a frente. A margem de
-- 2 HOUR e folga proposital: cobre atraso entre coletar e postar sem
-- chegar perto das 3h da diferenca real.
--
-- IDEMPOTENTE, e nao depende de rodar antes ou depois do deploy do codigo
-- que normaliza a data na ingestao (services/tiIngestao.ts,
-- coletadoEmBrasilia): linha ja gravada certa nao entra no filtro, e rodar
-- de novo nao acha mais nada.
--
-- REVERSIVEL: trocar "- INTERVAL 3 HOUR" por "+ INTERVAL 3 HOUR" e inverter
-- a comparacao desfaz.

UPDATE ti_inventario_coleta SET
    coletado_em = coletado_em - INTERVAL 3 HOUR
  WHERE recebido_em IS NOT NULL
    AND coletado_em > recebido_em + INTERVAL 2 HOUR;

-- primeira_coleta_em e ultima_coleta_em recebem copia do mesmo valor em
-- services/tiIngestao.ts. Em vez de repetir o filtro nelas, recalcula a
-- partir das coletas ja corrigidas: fica auto-consistente com a tabela que
-- manda, e conserta de quebra qualquer divergencia anterior.
--
-- atualizado_em entra explicitamente no SET porque e ON UPDATE
-- CURRENT_TIMESTAMP -- sem isso, este UPDATE a sobrescreveria com a hora de
-- agora em todo equipamento (mesmo cuidado da 024).
UPDATE ti_equipamento e
  JOIN (
       SELECT id_equipamento,
              MIN(coletado_em) AS primeira,
              MAX(coletado_em) AS ultima
         FROM ti_inventario_coleta
        GROUP BY id_equipamento
  ) c ON c.id_equipamento = e.id
   SET e.primeira_coleta_em = c.primeira,
       e.ultima_coleta_em   = c.ultima,
       e.atualizado_em      = e.atualizado_em
 WHERE e.primeira_coleta_em <> c.primeira
    OR e.ultima_coleta_em   <> c.ultima
    OR e.primeira_coleta_em IS NULL
    OR e.ultima_coleta_em   IS NULL;
