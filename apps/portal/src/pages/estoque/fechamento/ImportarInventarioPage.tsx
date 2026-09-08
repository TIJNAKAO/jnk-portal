import { FormularioImportacao } from './FormularioImportacao';

export function ImportarInventarioPage() {
  return (
    <FormularioImportacao
      titulo="Importar Inventário Físico"
      descricao="Contagem física do estoque, com até cinco rodadas mais a contagem final. O mesmo produto pode aparecer em almoxarifados diferentes."
      endpoint="inventario-fisico"
      colunas={[
        'ID_EMPRESA',
        'PERIODO',
        'CD_PRODUTO',
        'DC_PRODUTO',
        'MARCA',
        'ALMOX',
        'CONTAGEM_1',
        'CONTAGEM_2',
        'CONTAGEM_3',
        'CONTAGEM_4',
        'CONTAGEM_5',
        'CONTAGEM_FINAL',
        'SALDO_SYSEMP',
        'DIVERGENCIA',
        'ANALISE',
        'ACAO',
      ]}
    />
  );
}
