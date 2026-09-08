import { FormularioImportacao } from './FormularioImportacao';

export function ImportarEstoqueFullPage() {
  return (
    <FormularioImportacao
      titulo="Importar Estoque FULL"
      descricao="Saldo por conta e canal (Amazon, Shopee, Axado, lojas físicas). Só tem quantidade — o custo é atribuído depois, no Cálculo de Custo."
      endpoint="estoque-full"
      colunas={['ID_EMPRESA', 'CONTA', 'PERIODO', 'TIPO_SALDO', 'CD_PRODUTO', 'DC_PRODUTO', 'QTDE']}
    />
  );
}
