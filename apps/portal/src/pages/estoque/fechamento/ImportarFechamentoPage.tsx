import { FormularioImportacao } from './FormularioImportacao';

export function ImportarFechamentoPage() {
  return (
    <FormularioImportacao
      titulo="Importar Fechamento Mensal"
      descricao="Planilha contábil do fechamento de estoque, que já traz o custo de cada produto. Reenviar a mesma planilha atualiza os valores em vez de duplicar."
      endpoint="fechamento-mensal"
      colunas={[
        'EMPRESA',
        'ID Produto',
        'Código Auxiliar',
        'Descrição',
        'NCM',
        'Un',
        'Marca',
        'Estoque',
        'Custo',
        'Total',
        'CST Venda',
        'Mês/Ano',
      ]}
    />
  );
}
