-- "Atualizar Programas" vira "Gerar Scripts" — a tela passa a ser um hub de
-- vários scripts PowerShell (cards), não só o de atualizar programas/drivers.
-- Ver Specs/spec_modulo_ti.md, seção 5.7. `tela_id` não muda, então nenhuma
-- permissão já concedida (permissoes_usuario/perfis_telas) se perde.
UPDATE telas_modulo
SET nome_tela = 'Gerar Scripts', rota_tela = '/ti/gerar-scripts'
WHERE rota_tela = '/ti/atualizar-programas';
