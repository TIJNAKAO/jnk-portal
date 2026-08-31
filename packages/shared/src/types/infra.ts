export type TemaUI = 'LIGHT' | 'DARK';
export type EstiloBotoes = 'SOLID' | 'OUTLINE' | 'ROUNDED' | 'MINIMAL';

export interface Filial {
  id: number;
  nomeFormatado: string; // Ex: "01 - Filial São Paulo"
  cnpj: string;
}

export interface UsuarioPreferencias {
  temaUi: TemaUI;
  estiloBotoes: EstiloBotoes;
}

export interface PermissaoTela {
  telaId: number;
  nomeTela: string;
  rotaTela: string;
  podeVisualizar: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeDeletar: boolean;
}

export interface ModuloAcesso {
  moduloId: number;
  nomeModulo: string;
  chaveModulo: string; // Ex: 'CONFIG', e futuros módulos de negócio
  iconeModulo: string; // Nome do componente Lucide ou Heroicon
  descricaoModulo: string;
  telas: PermissaoTela[];
}

/** Uma empresa do ERP, identificada pelo par origem + código (o mesmo de `etl_empresa`). */
export interface EmpresaAcesso {
  /** `SYSEMP` ou `KPL`. O código 1 é uma empresa em cada origem — o par é que identifica. */
  origem: string;
  cdFilial: number;
  nome: string;
  grupo: string;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  fotoPerfilBase64?: string;
  ativo: boolean;
  filialAtivaId: number;
  moduloAtivoChave?: string; // Controla qual aplicativo está selecionado na sessão
  filiaisPermitidas: Filial[];
  /**
   * Empresas do ERP que este usuário pode ver nos relatórios.
   *
   * Dimensão separada de `filiaisPermitidas`: filial é unidade organizacional
   * (onde fica um equipamento, o seletor da barra lateral), empresa é entidade
   * do ERP — e cinco das nove empresas da SysEmp são o mesmo CNPJ, apenas
   * contas de fulfillment de marketplace. Lista vazia significa **nenhum
   * acesso**, nunca acesso total.
   */
  empresasPermitidas: EmpresaAcesso[];
  preferencias: UsuarioPreferencias;
  modulosPermitidos: ModuloAcesso[];
  /**
   * Versão da API (`APP_VERSION`). Informativa apenas.
   *
   * Já foi a base da recarga forçada, mas não funcionava: era comparada com o
   * `VITE_APP_VERSION` do portal, e as duas eram constantes fixas do App Spec,
   * de componentes que compilam separadamente — nunca divergiam, então a
   * recarga nunca disparava. Quem detecta versão nova hoje é
   * `apps/portal/src/lib/atualizacao.ts`, comparando o bundle carregado com o
   * `version.json` do próprio build do portal.
   */
  versaoSistema: string;
}

export type AcaoPermissao = 'podeVisualizar' | 'podeCriar' | 'podeEditar' | 'podeDeletar';

export type CategoriaParametro = 'EMAIL' | 'WHATSAPP' | 'TELEGRAM' | 'TI' | 'SYSEMP' | 'MERCADO_LIVRE';

export type TipoEventoLog = 'LOGIN' | 'SWITCH_FILIAL' | 'ACESSO_TELA';
