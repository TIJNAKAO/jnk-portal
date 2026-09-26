/**************************************************************************************************
PROGRAMA	: spSsrsGerarUltCompra
OBJETIVO	: Gerar tabela RDW.dbo.KPL_ULT_COMPRA com os dados da última entrada do produto KPL e TOTVS
AUTOR		: Ricardo Barbosa
VERSAO		: 20/03/2019 - Primeira versão.
			 14/10/2010 - Alterado procedure para dividir os valor pela QuantidadeFiscal e não mais pela QuantidadeFisica
			  (campos do XML), pois em algumas NF a quantidade Fisica esta erra (Ex.: NF 185447 da 
			  BELFIX). 
			  25/11/2019 - Alterado para pegar a ultima compra da NK2 a partir da tabela de 
						   KPL_PLANILHA_DESPACHANTE e nao mais da NF de Importação do KPL pois 
						   está errada no sistema.
			 11/12/2019 - Alteração: Data do movimento passa ser campo DataEntradaSaida e nao mais
						   DataCadastro. Na integração o SSIS já coloca DataEntradaSaida = DataCadastro
						   caso DataEntradaSaida = '' (branco).
			 16/12/2019 - Alteração: Incluída tratativa para substituir os dados de uma NF de importação
						 pelos dados da planilha do despachante.
			 05/02/2020 - Incluida tratativa para colocar o valor total FOB em EURO nas ultimas compras
						  da NK2.
			03/08/2020 - Incluido campo PERIODO
			05/08/2020 - Corrigido formado do periodo na clausula WHERE no bloco da KPL_PLANILHA_DESPACHANTE
			27/11/2020 - Inlcuido campo CST da NF apedido do Julinho para comparar com as NF de venda.
			16/12/2020 - Alterado formato campo DT_MOVTO e DT_EMISSAO de VARCHAR(10) para DATE
			28/12/2020 - Alterado para compor os dados primeiramente em uma tabela temporária e depois
				         fazer a atualização na tabela em produção utilizando BEGIN TRANS/COMMITED TRANS.
			07/04/2021 - Alterações conforme conceito GGP (Jefferson) - Notas de Entrada ***SOMENTE JNK***: 
							- Valor da base do PIS/COFINS irá considerar o IPI para as Notas Fiscais
							  movimentadas a partir de 01/01/2021.
							- Considerar 1,65% PIS e 7,6% COFINS para todas as NF de Compras (Grupo 
							  comercialização 11) independentemente do que estiver destacado na NF de 
							  entrada, mesmo o fornecedor sendo Simples Nacional.
			19/07/2021 - Inclusão UPDATE das Datas de Entrada das NF de importação.
			05/09/2022 - Alteração tamanho campo CD_PROD de 15 para 50 pois estava truncado 
					   produtos da NK2.
			30/01/2023 - Inclusão para gerar ultimo custo de entrada baseado na tabela de preço
				       CUSTO_JNK (Mandatória).
			18/12/2023 - Correção DT_MOVTO tabela CUSTO_JNK
			22/07/2024 - Ricardo Barbosa: Alterada tabela KPL_PRECO para o banco API.
			08/08/2024 - Ricardo BArbosa - Alterada tabela KPL_PRODUTO para o banco API.
			11/12/2024 - Ricardo Barbosa - Solicito pelo Julinho via WZ para que despreze produtos
			NKF da planilha de CUSTO_JNK (Tabela do KPL). 
			18/12/2024 - Ricardo Barbosa - Reorganização geral do fonte.

EXECUÇÃO	: 
	/*
	EXEC spSsrsGerarUltCompra @PERIODO = '202501'
	EXEC spSsrsGerarUltCompra @PERIODO = '202502'
	EXEC spSsrsGerarUltCompra @PERIODO = '202503'
	EXEC spSsrsGerarUltCompra @PERIODO = '202504'
	EXEC spSsrsGerarUltCompra @PERIODO = '202505'
	EXEC spSsrsGerarUltCompra @PERIODO = '202506'
	EXEC spSsrsGerarUltCompra @PERIODO = '202507'
	EXEC spSsrsGerarUltCompra @PERIODO = '202508'
	EXEC spSsrsGerarUltCompra @PERIODO = '202509'
	EXEC spSsrsGerarUltCompra @PERIODO = '202510'
	EXEC spSsrsGerarUltCompra @PERIODO = '202511'
	EXEC spSsrsGerarUltCompra @PERIODO = '202512'
	EXEC spSsrsGerarUltCompra @PERIODO = '202601'
	EXEC spSsrsGerarUltCompra @PERIODO = '202602'
	EXEC spSsrsGerarUltCompra @PERIODO = '202603'
	*/

**************************************************************************************************/
USE [RDW]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
IF OBJECT_ID (N'dbo.spSsrsGerarUltCompra') IS NOT NULL
   DROP PROCEDURE dbo.spSsrsGerarUltCompra
GO
CREATE PROCEDURE dbo.spSsrsGerarUltCompra
	@PERIODO VARCHAR(06) --aaaamm
AS	
BEGIN
	SET NOCOUNT ON

	BEGIN -- VARIAVEIS LOCAIS --------------------------------------------------------------------- 
			
		DECLARE @PRIMEIRO_DIA_MES 	DATE 		= CONVERT(DATE, @PERIODO+'01',112)

		-- 30/01/23-CONFORME SOLICITAÇÃO DO JULINHO, ADOTADO O CUSTO_JNK A PARTIR DE 30/01/22 
		-- DECLARE @DT_INI_CUSTO_JNK DATE = '2023-01-30'
		-- 18/12/2023 - CORREÇÃO: PROBLEMA NO RDW - ESTAVA  SEMPRE BUSCANDO 202301.
		DECLARE @DT_INI_CUSTO_JNK DATE = CONVERT(DATE,@PERIODO+'01',112)
		
		-- TEMP-TABLE
		IF OBJECT_ID('tempdb..#ULT') is not null BEGIN DROP TABLE #ULT END
		CREATE TABLE #ULT(
			CD_EMPRESA 				VARCHAR(003)	NULL
			, PERIODO				VARCHAR(006)	NULL
			, CD_PROD 				VARCHAR(050)	NULL
			, DC_PROD 				VARCHAR(200)	NULL
			, MARCA 				VARCHAR(200)	NULL
			, NCM 					VARCHAR(010)	NULL	
			, DT_MOVTO	 			DATE			NULL
			, DT_EMISSAO			DATE			NULL
			, DOCTO					VARCHAR(009)	NULL
			, SERIE					VARCHAR(003)	NULL
			, CD_CLIFOR				VARCHAR(100)	NULL
			, DC_CLIFOR				VARCHAR(100)	NULL
			, MUN_CLIFOR			VARCHAR(100)	NULL
			, UF_CLIFOR				CHAR(002)		NULL	
			, QTDE 					FLOAT			NULL
			, VU_MERC				FLOAT			NULL
			, ALIQ_ICMS 			FLOAT			NULL
			, ALIQ_RED_ICMS			FLOAT			NULL 
			, VB_ICMS				FLOAT			NULL
			, VT_ICMS 				FLOAT			NULL
			, VT_ICMS_ST 			FLOAT			NULL
			, VT_ST_GNRE			FLOAT			NULL
			, ALIQ_IPI				FLOAT			NULL
			, VB_IPI				FLOAT			NULL
			, VT_IPI 				FLOAT			NULL
			, ALIQ_PIS				FLOAT			NULL
			, VB_PIS				FLOAT			NULL
			, VT_PIS 				FLOAT			NULL
			, ALIQ_COFINS			FLOAT			NULL
			, VB_COFINS				FLOAT			NULL
			, VT_COFINS 			FLOAT			NULL
			, VT_NF 				FLOAT			NULL
			, VT_CUSTO				FLOAT			NULL
			, VU_CUSTO	 			FLOAT			NULL	
			, VT_FOB_EURO			FLOAT			NULL
			, CST			        VARCHAR(3)		NULL
			)
	END

	BEGIN -- TRATAMENTO PERIODO ------------------------------------------------------------------- 
		IF(@PERIODO = '') 
		BEGIN
			SET @PERIODO = CONVERT(VARCHAR(06),GETDATE(),112)
		END
	END
	
	BEGIN -- AJUSTES EM TABELAS ------------------------------------------------------------------- 

		-- PRIMEIRAMENTE ATUALIZO AS DATAS DE ENTRADA DAS NOTAS DE IMPORTAÇÃO
		-- NF 138050 - JNK - NF SOMENTE ENTROU EM 01/07/2021
		UPDATE KPL_NF SET DataEntradaSaida = replace(DataEntradaSaida,'25/06/2021','01/07/2021')
		WHERE NumeroNotaFiscal = '138050' and CodigoUnidadeNegocio = '1'
		UPDATE KPL_ITNF SET DataEntradaSaida = replace(DataEntradaSaida,'25/06/2021','01/07/2021')
		WHERE NumeroNotaFiscal = '138050' and CodigoUnidadeNegocio = '1'
	END
	
	BEGIN -- INSERE PRIMEIRAMENTE CUSTO DA TABELA DE PREÇO CUSTO_JNK ------------------------------ 

		INSERT INTO #ULT
		SELECT
			CD_EMPRESA		= 'JNK'
			, PERIODO		= @PERIODO
			, CD_PROD 		= TRIM(P.CodigoProduto)
			, DC_PROD 		= SUBSTRING(PROD.NomeProduto,1,200)
			, MARCA 		= TRIM(PROD.DescricaoMarca)
			, NCM 			= TRIM(PROD.ClassificacaoFiscal)
			, DT_MOVTO	 	= @DT_INI_CUSTO_JNK
			, DT_EMISSAO	= EOMONTH(@DT_INI_CUSTO_JNK)
			, DOCTO			= '999999999'
			, SERIE			= ''
			, CD_CLIFOR		= ''
			, DC_CLIFOR		= ''
			, MUN_CLIFOR	= ''
			, UF_CLIFOR		= ''
			, QTDE 			= 1
			, VU_MERC		= 0--B.PrecoLiquido
			, ALIQ_ICMS 	= 0--B.AliquotaICMS
			, ALIQ_RED_ICMS = 0--B.AliquotaIcmsReducao
			, VB_ICMS		= 0--B.ValorBaseICMS
			, VT_ICMS 		= 0--B.ValorICMS
			, VT_ICMS_ST 	= 0--B.ValorICMSSusbtitutivo
			, VT_ST_GNRE	= 0--0
			, ALIQ_IPI		= 0--B.AliquotaIPI
			, VB_IPI		= 0--B.BaseIPI
			, VT_IPI 		= 0--B.ValorIPI
			, ALIQ_PIS		= 0--FX1.ALIQ_PIS
			, VB_PIS		= 0--FX1.VB_PIS
			, VT_PIS 		= 0--FX1.VT_PIS_CALC
			, ALIQ_COFINS	= 0--FX1.ALIQ_COFINS
			, VB_COFINS		= 0--FX1.VB_COFINS
			, VT_COFINS 	= 0--FX1.VT_COF_CALC
			, VT_NF 		= 0--(B.TotalBruto + B.ValorIPI + B.ValorICMSSusbtitutivo + B.ValorFrete + B.ValorEncargos)	
			, VT_CUSTO		= P.PrecoTabela
			, VU_CUSTO	 	= P.PrecoTabela
			, VT_FOB_EURO	= 0
			, CST			= 'N/D'--SUBSTRING(B.SituacaoTributaria,1,3)
		FROM
			API.dbo.KPL_PRECO P WITH(NOLOCK)	

			-- PRODUTO
			INNER JOIN ( SELECT CodigoProduto
				, NomeProduto, DescricaoMarca, ClassificacaoFiscal 
				FROM API.dbo.KPL_PRODUTO WITH(NOLOCK)) PROD 
			ON  PROD.CodigoProduto	= P.CodigoProduto
			AND PROD.DescricaoMarca <> 'NKF' --11/12/2024 - Solicito pelo Julinho via WZ.
		WHERE
			P.NomeLista		= 'CUSTO_JNK'
		AND P.PrecoTabela	<> 0
	END

	BEGIN -- CALCULA E GERA DADOS DA ULTIMA NF DE COMPRA POR PRODUTO - EMPRESA JNK ---------------- 

		INSERT INTO #ULT
		SELECT
			CD_EMPRESA		= 'JNK'
			, PERIODO		= @PERIODO
			, CD_PROD 		= RTRIM(SUBSTRING(B.CodigoProduto,1,50))
			, DC_PROD 		= SUBSTRING(B.NomeProduto,1,200)
			, MARCA 		= B1.MARCA
			, NCM 			= RTRIM(B.NCM) 	
			, DT_MOVTO	 	= CONVERT(DATE,SUBSTRING(B.DataEntradaSaida,7,4)+SUBSTRING(B.DataEntradaSaida,4,2)+SUBSTRING(B.DataEntradaSaida,1,2),112)
			, DT_EMISSAO	= CONVERT(DATE,SUBSTRING(B.DataEmissao,7,4)+SUBSTRING(B.DataEmissao,4,2)+SUBSTRING(B.DataEmissao,1,2),112)
			, DOCTO			= A.NumeroNotaFiscal
			, SERIE			= A.SerieNotaFiscal
			, CD_CLIFOR		= A.CodigoExternoCliFor
			, DC_CLIFOR		= A.DestinatarioNome
			, MUN_CLIFOR	= A.DestinatarioMunicipio
			, UF_CLIFOR		= A.DestinatarioEstado
			, QTDE 			= B.QuantidadeFiscal
			, VU_MERC		= B.PrecoLiquido
			, ALIQ_ICMS 	= B.AliquotaICMS
			, ALIQ_RED_ICMS = B.AliquotaIcmsReducao
			, VB_ICMS		= B.ValorBaseICMS
			, VT_ICMS 		= B.ValorICMS
			, VT_ICMS_ST 	= B.ValorICMSSusbtitutivo
			, VT_ST_GNRE	= dbo.fnSsrsStGnre(B.CodigoProduto, B.NumeroNotaFiscal, TRIM(B.NCM)) * B.QuantidadeFiscal
			, ALIQ_IPI		= B.AliquotaIPI
			, VB_IPI		= B.BaseIPI
			, VT_IPI 		= B.ValorIPI
			, ALIQ_PIS		= FX1.ALIQ_PIS
			, VB_PIS		= FX1.VB_PIS
			, VT_PIS 		= FX1.VT_PIS_CALC
			, ALIQ_COFINS	= FX1.ALIQ_COFINS
			, VB_COFINS		= FX1.VB_COFINS
			, VT_COFINS 	= FX1.VT_COF_CALC
			, VT_NF 		= (B.TotalBruto + B.ValorIPI + B.ValorICMSSusbtitutivo + B.ValorFrete + B.ValorEncargos)	
			, VT_CUSTO		= B1.VU_CUSTO * B.QuantidadeFiscal	
			, VU_CUSTO	 	= B1.VU_CUSTO	
			, VT_FOB_EURO	= 0
			, CST			= SUBSTRING(B.SituacaoTributaria,1,3)
		FROM
			KPL_ITNF B WITH(NOLOCK)
			
			--CABECALHO NOTA FISCAL
			INNER JOIN ( SELECT ProtocoloNotaFiscal
				, StatusNota, GrupoComercializacao, NumeroNotaFiscal, SerieNotaFiscal
				, CodigoExternoCliFor, DestinatarioNome, DestinatarioMunicipio
				, DestinatarioEstado
				FROM KPL_NF A WITH(NOLOCK)) A 
			ON  A.ProtocoloNotaFiscal = B.ProtocoloNotaFiscal

			-- FORMULAS
			CROSS APPLY( SELECT -- VALORES DO PIS/COFINS CALCULADOS CONFORME REGRA DA GGP (IPI NA BASE DE CALCULO)
				ALIQ_PIS		= CASE 
								WHEN B.DataMovimento < '20210101' THEN B.AliquotaPIS
								ELSE IIF(B.CFOPItem LIKE '3%', B.AliquotaPIS, 1.65)
								END
				, ALIQ_COFINS	= CASE 
								WHEN B.DataMovimento < '20210101' THEN B.AliquotaCofins
								ELSE IIF(B.CFOPItem LIKE '3%', B.AliquotaCofins, 7.60)
								END
				, VB_PIS		= CASE 
								WHEN B.DataMovimento < '20210101' THEN B.BasePIS
								ELSE IIF(B.CFOPItem LIKE '3%', B.BasePIS,  (B.BasePIS + B.ValorIPI))
								END
				, VB_COFINS		= CASE 
								WHEN B.DataMovimento < '20210101' THEN B.BaseCofins
								ELSE IIF(B.CFOPItem LIKE '3%', B.BaseCofins, (B.BaseCofins + B.ValorIPI))
								END
				, VT_PIS_CALC	= CASE 
								WHEN B.DataMovimento < '20210101' THEN B.ValorPIS
								ELSE IIF(B.CFOPItem LIKE '3%', B.ValorPIS,(B.BasePIS + B.ValorIPI) * 1.65/100)
								END								
				, VT_COF_CALC	= CASE 
								WHEN B.DataMovimento < '20210101' THEN B.ValorCofins
								ELSE IIF(B.CFOPItem LIKE '3%', B.ValorCofins,(B.BaseCofins + B.ValorIPI) * 7.60/100)
								END																
				) FX1
			CROSS APPLY(
				SELECT
					VU_CUSTO	= CASE 
								WHEN B.DataMovimento < '20210101' THEN
									 IIF(B.QuantidadeFiscal <> 0, CASE 
										WHEN B.ValorICMSSusbtitutivo <> 0 THEN  
											(((B.TotalBruto + B.ValorIPI + B.ValorICMSSusbtitutivo) - B.ValorPIS - B.ValorCofins)/B.QuantidadeFiscal)
										WHEN dbo.fnSsrsStGnre(B.CodigoProduto, B.NumeroNotaFiscal, RTRIM(B.NCM)) <> 0 THEN
											(((B.TotalBruto + B.ValorIPI + B.ValorICMSSusbtitutivo + dbo.fnSsrsStGnre(B.CodigoProduto, B.NumeroNotaFiscal, RTRIM(B.NCM)) * B.QuantidadeFiscal) - B.ValorPIS - B.ValorCofins)/B.QuantidadeFiscal)
										ELSE 
											((B.TotalBruto + B.ValorIPI) - B.ValorPIS - B.ValorCofins - B.ValorICMS )/B.QuantidadeFiscal
									END
									,0) 
								ELSE 
									IIF(B.QuantidadeFiscal <> 0, CASE 
										WHEN B.ValorICMSSusbtitutivo <> 0 THEN  
											(((B.TotalBruto + B.ValorIPI + B.ValorICMSSusbtitutivo) - FX1.VT_PIS_CALC - FX1.VT_COF_CALC)/B.QuantidadeFiscal)
										WHEN dbo.fnSsrsStGnre(B.CodigoProduto, B.NumeroNotaFiscal, RTRIM(B.NCM)) <> 0 THEN
											(((B.TotalBruto + B.ValorIPI + B.ValorICMSSusbtitutivo + dbo.fnSsrsStGnre(B.CodigoProduto, B.NumeroNotaFiscal, RTRIM(B.NCM)) * B.QuantidadeFiscal) - FX1.VT_PIS_CALC - FX1.VT_COF_CALC)/B.QuantidadeFiscal)
										ELSE 
											((B.TotalBruto + B.ValorIPI) - FX1.VT_PIS_CALC - FX1.VT_COF_CALC - B.ValorICMS )/B.QuantidadeFiscal
									END
									,0) 
								END

					, MARCA		= ISNULL((SELECT TOP 1 RTRIM(P.DescricaoMarca) FROM API.dbo.KPL_PRODUTO P WHERE P.CodigoProduto = B.CodigoProduto),'')
					) B1	
			, (SELECT
					CHAVE			= MAX(SUBSTRING(BB.DataEntradaSaida,7,4)
									+ SUBSTRING(BB.DataEntradaSaida,4,2)
									+ SUBSTRING(BB.DataEntradaSaida,1,2)
									+ SUBSTRING(BB.DataEntradaSaida,12,5)
									+ RTRIM(CONVERT(VARCHAR(10),BB.CodigoItem))
									+ RTRIM(CONVERT(VARCHAR(5),BB.Sequencial)))
					, CodigoProduto	= BB.CodigoProduto
				FROM 
					KPL_ITNF AS BB
					JOIN ( -- CABEÇALHO DA NF
						SELECT ProtocoloNotaFiscal, StatusNota, GrupoComercializacao
						FROM KPL_NF WITH(NOLOCK)				
						) AA ON
						AA.ProtocoloNotaFiscal = BB.ProtocoloNotaFiscal	
				WHERE
					BB.CodigoUnidadeNegocio	<> '2'  -- DIFERENTE DE NK2			
				AND BB.EntradaSaida			= 'E'
				AND AA.StatusNota			= 'FINALIZADA'
				AND AA.GrupoComercializacao	= '11'	-- COMPRA			
				AND BB.QuantidadeFiscal		<> 0	-- PARA NAO BUSCAR NOTAS DE COMPLEMENTO
				AND CONVERT(VARCHAR(6), SUBSTRING(BB.DataEntradaSaida,7,4)+SUBSTRING(BB.DataEntradaSaida,4,2),112) <= @PERIODO	
				GROUP BY 
					BB.CodigoProduto) AS C
		WHERE
			B.CodigoUnidadeNegocio	<> '2'  -- DIFERENTE DE NK2	
		AND C.CHAVE					= (SUBSTRING(B.DataEntradaSaida,7,4)
									+ SUBSTRING(B.DataEntradaSaida,4,2)
									+ SUBSTRING(B.DataEntradaSaida,1,2)
									+ SUBSTRING(B.DataEntradaSaida,12,5)
									+ RTRIM(CONVERT(VARCHAR(10),B.CodigoItem))
									+ RTRIM(CONVERT(VARCHAR(5),B.Sequencial)))		
		AND C.CodigoProduto			= B.CodigoProduto	
		AND B.QuantidadeFiscal		<> 0	-- PARA NAO BUSCAR NOTAS DE COMPLEMENTO	
		AND	B.EntradaSaida			= 'E'
		AND A.StatusNota			= 'FINALIZADA'			
		AND A.GrupoComercializacao	= '11'	-- COMPRA	
		AND SUBSTRING(B.DataMovimento,1,6) <= @PERIODO	
		AND NOT EXISTS ( -- SE NAO EXISTIR POIS PODE TER VINDO DA TABELA ARBITRARIA CUSTO_JNK
			SELECT 1
			FROM #ULT X
			WHERE X.CD_EMPRESA = 'JNK'
			AND X.PERIODO = @PERIODO
			AND X.CD_PROD	= B.CodigoProduto
		)
	END
	
	BEGIN -- CALCULA E GERA DADOS DA ULTIMA NF DE COMPRA POR PRODUTO - EMPRESA NK2 ---------------- 

		INSERT INTO #ULT	
		SELECT
			CD_EMPRESA		= 'NK2'
			, PERIODO		= @PERIODO
			, CD_PROD 		= RTRIM(SUBSTRING(B.SKU,1,50))
			, DC_PROD 		= SUBSTRING(PROD.NomeProduto,1,200)
			, MARCA 		= PROD.DescricaoMarca
			, NCM 			= RTRIM(B.NCM) 	
			, DT_MOVTO	 	= B.DataCadastro -- este pega DataCadastro pois é da Planilha do Despachante
			, DT_EMISSAO	= B.DataCadastro -- este pega DataCadastro pois é da Planilha do Despachante
			, DOCTO			= B.NumeroNotaFiscal
			, SERIE			= B.SerieNotaFiscal
			, CD_CLIFOR		= B.CodigoInternoCliFor
			, DC_CLIFOR		= B.DestinatarioNome
			, MUN_CLIFOR	= ''
			, UF_CLIFOR		= 'EX'
			, QTDE 			= B.QTDE
			, VU_MERC		= B.VL_UNIT
			, ALIQ_ICMS 	= B.ALIQ_ICMS * 100
			, ALIQ_RED_ICMS = 0
			, VB_ICMS		= B.BC_ICMS_ICMS
			, VT_ICMS 		= B.VT_ICMS
			, VT_ICMS_ST 	= 0
			, VT_ST_GNRE	= 0 -- Considerado que compra somente via importação e nao pagamos complemento de ST via GNRE
			, ALIQ_IPI		= B.ALIQ_IPI
			, VB_IPI		= B.BC_IPI
			, VT_IPI 		= B.VT_IPI
			, ALIQ_PIS		= B.ALIQ_PIS
			, VB_PIS		= B.VT_CIF_ADUANEIRO -- CONFORME FORMULA DA PLANILHA DO DESPACHANTE
			, VT_PIS 		= B.VT_PIS
			, ALIQ_COFINS	= B.ALIQ_COFINS	
			, VB_COFINS		= B.VT_CIF_ADUANEIRO -- CONFORME FORMULA DA PLANILHA DO DESPACHANTE
			, VT_COFINS 	= B.VT_COFINS
			, VT_NF 		= B.BC_ICMS_ICMS -- TUDO IMBUTIDO
			, VT_CUSTO		= B.VT_CUSTO
			, VU_CUSTO	 	= B.VU_CUSTO	
			, VT_FOB_EURO   = B.FOB_EURO
			, CST			= '' --SUBSTRING(B.SituacaoTributaria,1,3)
		FROM
			KPL_PLANILHA_DESPACHANTE B WITH(NOLOCK)		
			LEFT JOIN API.dbo.KPL_PRODUTO PROD WITH(NOLOCK) ON
				PROD.CodigoProduto = B.SKU
			, (SELECT -- ULTIMA NF
					CHAVE			= MAX(CONVERT(VARCHAR(8),BB.DataCadastro,112)+CONVERT(VARCHAR(5),BB.Sequencial))
					, CodigoProduto	= BB.SKU
				FROM 
					KPL_PLANILHA_DESPACHANTE BB
						LEFT JOIN( -- PRODUTO
							SELECT CodigoProduto, DescricaoMarca
							FROM API.dbo.KPL_PRODUTO A WITH(NOLOCK)
							) PROD ON
							PROD.CodigoProduto = BB.SKU				
				WHERE
					BB.EntradaSaida			= 'E'
				AND BB.CodigoUnidadeNegocio	= '2'	-- NK2
				AND CONVERT(VARCHAR(6),BB.DataCadastro,112) <= @PERIODO
				GROUP BY 
					BB.SKU) AS C
		WHERE
			C.CHAVE					= (CONVERT(VARCHAR(8),B.DataCadastro,112)+CONVERT(VARCHAR(5),B.Sequencial))
		AND C.CodigoProduto			= B.SKU
		AND	B.EntradaSaida			= 'E'
		AND B.CodigoUnidadeNegocio	= '2'	-- NK2
		AND CONVERT(VARCHAR(6),DataCadastro,112) <= @PERIODO	
	END
		
	BEGIN -- CALCULA E GERA DADOS DA ULTIMA NF DE COMPRA POR PRODUTO - EMPRESA JNK - TOTVS -------- 
		
		-- DADOS DA ULTIMA COMPRA DO TOTVS
		-- NESTE CASO PEGUEI AS TABELAS DO TOTVS E REPLIQUEI PARA O SERVIDOR 252 PARA FICAR MAIS PERFORMATICO.
		-- RENOMEIE DE TOTVS_SD1010 (ITENS DA NF), TOTVS_SF1010 (CABEÇALHO DA NF) E TOTVS_SB1010 (PRODUTO)
		-- GERO AS ULTIMAS ENTRADAS PELO CÓDIGO DO PRODUTO E INSIRO NA TABELA #ULT SOMENTE
		-- SE NAO HOUVE O PRODUTO LÁ ESPECIFICADO.
		-- NAO FAZ-SE PARA NK2 POIS TEM MUITO LIXO 
		
		INSERT INTO #ULT
		SELECT
			CD_EMPRESA 		= 'JNK'	
			, PERIODO		= @PERIODO
			, CD_PROD 		= RTRIM(SD1.D1_COD)	
			, DC_PROD 		= RTRIM(SB1.B1_DESC)	
			, MARCA 		= ISNULL(PROD.DescricaoMarca,'TOTVS')
			, NCM 			= RTRIM(SB1.B1_POSIPI)	
			, DT_MOVTO	 	= CONVERT(DATE,SD1.D1_DTDIGIT,112)	
			, DT_EMISSAO	= CONVERT(DATE,SD1.D1_EMISSAO,112)
			, DOCTO			= SD1.D1_DOC	
			, SERIE			= SD1.D1_SERIE	
			, CD_CLIFOR		= SD1.D1_FORNECE
			, DC_CLIFOR		= RTRIM(IIF(SD1.D1_TIPO IN ('D','B'),SA1.A1_NOME,SA2.A2_NOME))	
			, MUN_CLIFOR	= IIF(SD1.D1_TIPO IN ('D','B'),SA1.A1_MUN,SA2.A2_MUN)			
			, UF_CLIFOR		= IIF(SD1.D1_TIPO IN ('D','B'),SA1.A1_EST,SA2.A2_EST)		
			, QTDE 			= SD1.D1_QUANT 	
			, VU_MERC		= SD1.D1_VUNIT	
			, ALIQ_ICMS 	= SD1.D1_PICM	
			, ALIQ_RED_ICMS = (1-(SD1.D1_BASEICM / SD1.D1_TOTAL)) * 100
			, VB_ICMS		= SD1.D1_BRICMS	
			, VT_ICMS 		= SD1.D1_VALICM	
			, VT_ICMS_ST 	= SD1.D1_ICMSRET
			, VT_ST_GNRE	= 0	
			, ALIQ_IPI		= SD1.D1_IPI	
			, VB_IPI		= SD1.D1_BASEIPI
			, VT_IPI 		= SD1.D1_VALIPI	
			, ALIQ_PIS		= SD1.D1_ALQPIS
			, VB_PIS		= SD1.D1_BASIMP6
			, VT_PIS 		= SD1.D1_VALIMP6	
			, ALIQ_COFINS	= SD1.D1_ALQCOF
			, VB_COFINS		= SD1.D1_BASIMP5
			, VT_COFINS 	= SD1.D1_VALIMP5	
			, VT_NF 		= SD1.D1_TOTAL + SD1.D1_VALIPI	
			, VT_CUSTO		= SD11.VU_CUSTO * SD1.D1_QUANT 	
			, VU_CUSTO	 	= SD11.VU_CUSTO		
			, VT_FOB_EURO	= 0
			, CST			= SUBSTRING(SD1.D1_CLASFIS,1,3)
		FROM
			TOTVS_SD1010 SD1 WITH(NOLOCK)	
			LEFT JOIN TOTVS_SA1010 SA1 WITH(NOLOCK) ON 
				SA1.A1_FILIAL	= SUBSTRING(SD1.D1_FILIAL,1,2)
			AND SA1.A1_COD		= SD1.D1_FORNECE                 
			AND SA1.A1_LOJA		= SD1.D1_LOJA                
			AND SA1.D_E_L_E_T_  = '' 
			LEFT JOIN TOTVS_SA2010 SA2 WITH(NOLOCK) ON 
				SA2.A2_FILIAL	= SUBSTRING(SD1.D1_FILIAL,1,2)
			AND SA2.A2_COD		= SD1.D1_FORNECE                   
			AND SA2.A2_LOJA		= SD1.D1_LOJA                 
			AND SA2.D_E_L_E_T_  = '' 
			LEFT JOIN API.dbo.KPL_PRODUTO PROD WITH(NOLOCK) ON
				RTRIM(PROD.CodigoProduto) = RTRIM(SD1.D1_COD)
			CROSS APPLY(
				SELECT
					VU_CUSTO	= IIF(SD1.D1_QUANT <> 0,
									CASE 
										WHEN SD1.D1_ICMSRET <> 0 THEN  ((SD1.D1_TOTAL + SD1.D1_ICMSRET + SD1.D1_VALIPI - SD1.D1_VALIMP5 - SD1.D1_VALIMP6)/SD1.D1_QUANT)
										ELSE (SD1.D1_TOTAL + SD1.D1_VALIPI - SD1.D1_VALIMP5 - SD1.D1_VALIMP6 - SD1.D1_VALICM )/SD1.D1_QUANT
									END
									,0)					
					) SD11		
			, TOTVS_SF4010 SF4 WITH(NOLOCK) 									
			, TOTVS_SB1010 SB1 WITH(NOLOCK)			
			, ( SELECT 
					DOC_ITEM		= MAX(SD1A.D1_DOC + SD1A.D1_ITEM)
					, CD_PRODUTO	= SD1A.D1_COD   
				FROM 
					TOTVS_SD1010 SD1A WITH(NOLOCK)
				WHERE
					SD1A.D_E_L_E_T_	= ''
				AND SD1A.D1_FILIAL	<> '020101' -- DIFERENTE DE NK2
				GROUP BY 
					SD1A.D1_COD) AS C
		WHERE
			C.DOC_ITEM		= SD1.D1_DOC + SD1.D1_ITEM
		AND C.CD_PRODUTO	= SD1.D1_COD
		AND SB1.B1_FILIAL	= SUBSTRING(SD1.D1_FILIAL,1,2)
		AND SB1.B1_COD		= SD1.D1_COD
		AND SB1.D_E_L_E_T_	= ''
		AND SF4.F4_FILIAL	= SUBSTRING(SD1.D1_FILIAL,1,2)
		AND SF4.F4_CODIGO	= SD1.D1_TES
		AND SF4.F4_DUPLIC	= 'S'
		AND SF4.D_E_L_E_T_	= ''
		AND SD1.D1_FILIAL	<> '020101' -- DIFERENTE DE NK2
		AND SUBSTRING(D1_DTDIGIT,1,6) <= @PERIODO	
		AND SD1.D_E_L_E_T_	= ''
		AND NOT EXISTS(
			SELECT 'X' FROM #ULT U
			WHERE
				U.CD_EMPRESA	= 'JNK'
			AND U.PERIODO		= @PERIODO
			AND U.CD_PROD		= RTRIM(SD1.D1_COD)	
			)
	END
	
	BEGIN -- UPDATE PARA ACERTAR UNIDADE DE MEDIDA DE NF QUE DERAM ENTRADA ERRADA ----------------- 

		UPDATE #ULT
		SET 
			QTDE		= QTDE * 100
			, VU_MERC	= VU_MERC / 100
			, VU_CUSTO	= VU_CUSTO / 100
		WHERE DOCTO = '187550'
		AND CD_PROD = 'J5650'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT
		SET 
			QTDE = QTDE * 10
			, VU_MERC	= VU_MERC / 10
			, VU_CUSTO	= VU_CUSTO / 10
		WHERE DOCTO = '281880'
		AND CD_PROD = 'J6905'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT
		SET 
			QTDE = QTDE * 10
			, VU_MERC	= VU_MERC / 10
			, VU_CUSTO	= VU_CUSTO / 10
		WHERE DOCTO = '278205'
		AND CD_PROD = 'J6905'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		--Conforme informação do Julinho em 18/08/2020 veio pacotes com 10 peças cada e é vendido separado.
		UPDATE #ULT
		SET 
			QTDE = QTDE * 10
			, VU_MERC	= VU_MERC / 10
			, VU_CUSTO	= VU_CUSTO / 10
		WHERE DOCTO = '577431'
		AND CD_PROD = '027926'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- Produto comprado em pacote de 100peças e dado entrar em unitario. 
		SET 
			QTDE = QTDE * 100
			, VU_MERC	= VU_MERC / 100
			, VU_CUSTO	= VU_CUSTO / 100
		WHERE DOCTO = '138838'
		AND CD_PROD = 'J7818'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- Produto comprado em pacote de 1000peças e dado entrar em unitario. 
		SET 
			QTDE = QTDE * 1000
			, VU_MERC	= VU_MERC / 1000
			, VU_CUSTO	= VU_CUSTO / 1000
		WHERE DOCTO = '000074477'
		AND CD_PROD = '011736'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- Produto comprado em pacote de 10peças e dado entrar em unitario. 
		SET 
			QTDE = QTDE * 10
			, VU_MERC	= VU_MERC / 10
			, VU_CUSTO	= VU_CUSTO / 10
		WHERE DOCTO = '000410868'
		AND CD_PROD = '027885'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- Produto comprado em pacote de 100peças e dado entrar em unitario. 
		SET 
			QTDE = QTDE * 100
			, VU_MERC	= VU_MERC / 100
			, VU_CUSTO	= VU_CUSTO / 100
		WHERE DOCTO = '136276'
		AND CD_PROD = 'J7819'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- Produto comprado em pacote de 10peças e dado entrar em unitario. 
		SET 
			QTDE = QTDE * 10
			, VU_MERC	= VU_MERC / 10
			, VU_CUSTO	= VU_CUSTO / 10
		WHERE DOCTO = '578166'
		AND CD_PROD = '028363'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		
		UPDATE #ULT -- conforme email do Marcelo Liobino de 10/12/2019
		SET 
			QTDE = QTDE * 50
			, VU_MERC	= VU_MERC / 50
			, VU_CUSTO	= VU_CUSTO / 50
		WHERE DOCTO = '169668'
		AND CD_PROD = '034258'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- conforme email do Marcelo Liobino de 16/09/2020
		SET 
			QTDE = QTDE * 25
			, VU_MERC	= VU_MERC / 25
			, VU_CUSTO	= VU_CUSTO / 25
		WHERE DOCTO = '556389'
		AND CD_PROD = '033963'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

	
		UPDATE #ULT -- conforme email do Marcelo Liobino de 23/09/2020
		SET 
			QTDE = QTDE * 5
			, VU_MERC	= VU_MERC / 5
			, VU_CUSTO	= VU_CUSTO / 5
		WHERE DOCTO = '713199'
		AND CD_PROD = 'J8115'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		UPDATE #ULT -- conforme email do Felipe Oliveira de 04/11/2020
		SET 
			QTDE = QTDE * 5
			, VU_MERC	= VU_MERC / 5
			, VU_CUSTO	= VU_CUSTO / 5
		WHERE DOCTO = '737084'
		AND CD_PROD = 'J8115'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO
		UPDATE KPL_ULT_COMPRA -- segunda NF
		SET 
			QTDE = QTDE * 5
			, VU_MERC	= VU_MERC / 5
			, VU_CUSTO	= VU_CUSTO / 5
		WHERE DOCTO = '737565'
		AND CD_PROD = 'J8115'
		AND CD_EMPRESA = 'JNK'
		AND PERIODO = @PERIODO

		/*01/09/2021 - Conforme informou Edmilson que a unidade de medida está errado - */
		/* Confirmado que a compra foi de 01 pote com 250 peças */
		UPDATE #ULT
		SET 
			QTDE		= QTDE * 250
			, VU_MERC	= VU_MERC / 250
			, VU_CUSTO	= VU_CUSTO / 250
		WHERE 
			DOCTO		= '000419710'
		AND CD_PROD		= '035108'
		AND CD_EMPRESA	= 'JNK'
		AND PERIODO		= @PERIODO
		/*01/09/2021 - Conforme informou Edmilson que a unidade de medida está errado - */
		/* Confirmado que a compra foi de 01 pote com 100 peças */
		UPDATE #ULT
		SET 
			QTDE		= QTDE * 100
			, VU_MERC	= VU_MERC / 100
			, VU_CUSTO	= VU_CUSTO / 100
		WHERE 
			DOCTO		= '000419710'
		AND CD_PROD		= '035121'
		AND CD_EMPRESA	= 'JNK'
		AND PERIODO		= @PERIODO
	END

	BEGIN -- PRODUTO DESATIVADO E RENOMEADO. PROBLEMA DE INTEGRIDADE RELACIONAL ENTRE TABELAS ----- 
			
		UPDATE KPL_ITNF
		SET CodigoProduto = 'P519'
		WHERE CodigoProduto = 'DESATIVP519'
		AND CodigoProdutoAbacos = '7532'

		UPDATE KPL_ITNF
		SET CodigoProduto = 'J5871X'
		WHERE CodigoProduto = 'J5871DESATIVADO'
		AND CodigoProdutoAbacos = '18439'

		UPDATE KPL_ITNF
		SET CodigoProduto = 'J5927X'
		WHERE CodigoProduto = 'J5927DESATIVADO'
		AND CodigoProdutoAbacos = '18506'

		UPDATE KPL_ITNF
		SET CodigoProduto = 'J5928X'
		WHERE CodigoProduto = 'J5928DESATIVADO'
		AND CodigoProdutoAbacos = '18505'

		UPDATE KPL_ITNF
		SET CodigoProduto = 'J5870X'
		WHERE CodigoProduto = 'J5870DESATIVADO'
		AND CodigoProdutoAbacos = '18438'

		UPDATE KPL_ITNF
		SET CodigoProduto = 'J5932X'
		WHERE CodigoProduto = 'J5932DESATIVADO'
		AND CodigoProdutoAbacos = '18510'	
	END

	BEGIN -- ATUALIZA CUSTO DA NF DE IMPORTAÇÃO DA JNK -------------------------------------------- 
			
		-- Atualiza o valor do custo da NF da JNK de acordo com a planilha do despachante caso a mesma tenha sido Importação
		-- A planilha do despachante inclui outros custos nao inseridos na NF de entrada (importação).

		BEGIN TRANSACTION UPD_NFI
			UPDATE #ULT
			SET
				QTDE 			= I.QTDE
				, VU_MERC		= I.VL_UNIT
				, ALIQ_ICMS 	= I.ALIQ_ICMS * 100
				, ALIQ_RED_ICMS = 0
				, VB_ICMS		= I.BC_ICMS_ICMS
				, VT_ICMS 		= I.VT_ICMS
				, VT_ICMS_ST 	= 0
				, VT_ST_GNRE	= 0 -- Considerado que compra somente via importação e nao pagamos complemento de ST via GNRE
				, ALIQ_IPI		= I.ALIQ_IPI * 100
				, VB_IPI		= I.BC_IPI
				, VT_IPI 		= I.VT_IPI
				, ALIQ_PIS		= I.ALIQ_PIS
				, VB_PIS		= I.VT_CIF_ADUANEIRO -- CONFORME FORMULA DA PLANILHA DO DESPACHANTE
				, VT_PIS 		= I.VT_PIS
				, ALIQ_COFINS	= I.ALIQ_COFINS	
				, VB_COFINS		= I.VT_CIF_ADUANEIRO -- CONFORME FORMULA DA PLANILHA DO DESPACHANTE
				, VT_COFINS 	= I.VT_COFINS
				, VT_NF 		= I.BC_ICMS_ICMS -- TUDO IMBUTIDO
				, VT_CUSTO		= I.VT_CUSTO
				, VU_CUSTO	 	= I.VU_CUSTO	
			FROM 
				#ULT A
				, (SELECT * FROM KPL_PLANILHA_DESPACHANTE WHERE EMPRESA = 'JNK') I
			WHERE
				A.CD_EMPRESA	= 'JNK'	
			AND A.DOCTO			= I.NumeroNotaFiscal
			AND A.SERIE			= I.SerieNotaFiscal
			AND A.CD_PROD		= I.SKU
			
		COMMIT TRANSACTION UPD_NFI
	END

	BEGIN -- APAGA OS DADOS DA TABELA EXISTENTE PARA RECEBER AS NOVAS INFORMAÇÕES ----------------- 
		BEGIN TRANSACTION DEL_ULT
			DELETE A
			FROM KPL_ULT_COMPRA A
			WHERE A.PERIODO = @PERIODO
		COMMIT TRANSACTION DEL_ULT
	END

	BEGIN -- INSERE OS NOVOS REGISTRO NA TABELA KPL_ULT_COMPRA ------------------------------------ 									
		BEGIN TRANSACTION ADD_ULT_COMPRA
			INSERT INTO KPL_ULT_COMPRA
			SELECT * FROM #ULT
		COMMIT TRANSACTION ADD_ULT_COMPRA
	END

	SET NOCOUNT OFF
END
