import './sysemp/entidades/notasFiscais.js'; // side-effect: registra o consumidor de fila (tipo_tabela 2)
import './sysemp/entidades/estoque.js'; // side-effect: registra o consumidor de fila (tipo_tabela 9)
import './sysemp/entidades/pedidos.js'; // side-effect: registra o consumidor de fila (tipo_tabela 7)
import './sysemp/entidades/parceiros.js'; // side-effect: registra o consumidor de fila (tipo_tabela 4)
import { rodarEtlEmpresa } from './etl/empresa.js';
import { rodarEtlFatcom } from './etl/fatcom.js';
import { rodarEtlProduto } from './etl/produto.js';
import type { ResultadoSincronizacao } from './integracaoLog.js';
import { sincronizarMlPedidos } from './mercadoLivre/pedidos.js';
import { sincronizarEmpresas } from './sysemp/entidades/empresas.js';
import { sincronizarPrecos } from './sysemp/entidades/precos.js';
import { sincronizarProdutos } from './sysemp/entidades/produtos.js';
import { sincronizarRepresentantes } from './sysemp/entidades/representantes.js';
import { sincronizarFila } from './sysemp/fila.js';

export interface EntidadeIntegracao {
  chave: string;
  nome: string;
  sincronizar: (idLog: number) => Promise<ResultadoSincronizacao>;
}

/** Registro central de todas as entidades sincronizáveis — usado pelo Painel e pelo endpoint de gatilho manual. */
export const ENTIDADES_INTEGRACAO: EntidadeIntegracao[] = [
  { chave: 'notas_fiscais', nome: 'Notas Fiscais', sincronizar: (idLog) => sincronizarFila('notas_fiscais', idLog) },
  { chave: 'estoque', nome: 'Saldo de Estoque', sincronizar: (idLog) => sincronizarFila('estoque', idLog) },
  { chave: 'produtos', nome: 'Produtos', sincronizar: sincronizarProdutos },
  { chave: 'parceiros', nome: 'Parceiros', sincronizar: (idLog) => sincronizarFila('parceiros', idLog) },
  { chave: 'precos', nome: 'Preços', sincronizar: sincronizarPrecos },
  { chave: 'pedidos', nome: 'Pedidos de Venda', sincronizar: (idLog) => sincronizarFila('pedidos', idLog) },
  { chave: 'empresas', nome: 'Empresas', sincronizar: sincronizarEmpresas },
  { chave: 'representantes', nome: 'Representantes', sincronizar: sincronizarRepresentantes },
  { chave: 'ml_pedidos', nome: 'Pedidos Mercado Livre', sincronizar: sincronizarMlPedidos },
  { chave: 'etl_empresa', nome: 'ETL Empresa', sincronizar: rodarEtlEmpresa },
  { chave: 'etl_produto', nome: 'ETL Produto', sincronizar: rodarEtlProduto },
  { chave: 'etl_fatcom', nome: 'ETL Fatcom', sincronizar: rodarEtlFatcom },
];

export function buscarEntidadeIntegracao(chave: string): EntidadeIntegracao | undefined {
  return ENTIDADES_INTEGRACAO.find((e) => e.chave === chave);
}
