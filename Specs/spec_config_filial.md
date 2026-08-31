# Especificação Técnica: Unificação de Filiais (`config_filial`)

## 0. Problema

O portal tem hoje **três** representações concorrentes da mesma ideia:

| Tabela | Linhas | Para que serve |
|---|---|---|
| `filiais` | 3 (JNakao, NK2, CNK2) | Vínculo do usuário, TI, Avisos, Log de Acesso |
| `etl_empresa` | 13 | Dimensão de empresa dos ERPs (9 SysEmp + 4 KPL) |
| `usuarios_empresas` | 18 | Escopo de empresa nos relatórios (criado em 31/08/2026) |

O cadastro de usuário passou a ter duas seções parecidas — "Filiais" e "Empresas
do ERP" — que o administrador precisa manter em sincronia mentalmente. É a
duplicidade que esta spec elimina.

**Decisão: uma tabela só.** `etl_empresa` é renomeada para `config_filial` e
passa a ser o cadastro único de filiais do portal.

### 0.1. Impacto medido (31/08/2026)

A migração é pequena, o que torna a unificação barata:

| Dependência de `filiais.id` | Linhas |
|---|---|
| `usuarios_filiais` | 2 |
| `usuarios.ultimo_acesso_filial_id` | 0 |
| `ti_equipamento.filial_id` | **0** (de 3 equipamentos) |
| `avisos_plataforma.filial_id` | 0 |
| `sysemp_empresa.filial_id` | 0 |
| `logs_acesso.filial_id` | 1.079 (histórico) |

Uma avaliação anterior desaconselhou unificar filial e empresa, sob o argumento
de que quebraria o módulo TI. **O dado não sustenta o argumento**: nenhum
equipamento está vinculado a filial. A preocupação era teórica.

### 0.2. As 13 linhas são 5 filiais reais

| CNPJ | KPL | SysEmp |
|---|---|---|
| 53.794.996/0001-10 | 1 JNK Barueri | 1 BARUERI CASA J NAKAO |
| 53.794.996/0003-82 | 4 JNK Pinheiro | 2, 5, 6, 7, 8 |
| 53.794.996/0004-63 | 3 JNK Louveira | — |
| 19.933.110/0001-34 | 2 NK2 Barueri | 3 |
| 42.952.280/0001-88 | — | 4, 9 |

**Decisão: manter as 13 linhas**, uma por par (origem, código). O cadastro de
usuário lista as duas visões da mesma empresa, e cabe ao administrador marcar
ambas quando quiser o dado completo dos dois ERPs.

> Consequência aceita: marcar "JNK Barueri" (KPL) sem marcar "BARUERI CASA J
> NAKAO" (SysEmp) dá acesso ao histórico antigo e não ao atual, para a mesma
> empresa. Não há aviso automático disso.

---

## 1. Decisões validadas

1. **`etl_empresa` → `config_filial`**, cadastro único de filiais.
2. **13 linhas**, uma por (origem, código).
3. **Chave primária `recno` sozinho**; `(origem_dados, cd_filial)` continua
   `UNIQUE`. A linha segue identificada pela origem e pelo código, mas as
   chaves estrangeiras ficam com uma coluna só — uma PK composta obrigaria
   `usuarios_filiais`, `logs_acesso` e `ti_equipamento` a carregar duas.
4. **Campo `empresa VARCHAR(50)`** — agrupamento livre, paralelo ao `grupo`
   existente, sem hierarquia definida entre os dois.
5. **CRUD completo na tela de Filiais; ETL desligado nesta tabela.**
6. **Todos os módulos passam a usar todas as filiais permitidas**, no lugar da
   filial ativa.
7. **O seletor da barra lateral permanece**, como filtro de conveniência.
8. **`usuarios_empresas` é descartada.**

---

## 2. Duas dimensões que não se confundem

A distinção governa todo o resto do desenho:

| | O que é | Onde vive | Quem controla |
|---|---|---|---|
| **Permissão** | o que o usuário **pode** ver | `usuarios_filiais` | administrador |
| **Foco** | o que ele **está** vendo agora | seletor da barra lateral | o próprio usuário |

Permissão é fronteira de segurança: aplicada no servidor, falha fechada, não
contornável pela query string. Foco é conveniência: o usuário troca à vontade,
e escolher "Todas as filiais" volta ao conjunto inteiro que ele pode ver.

Um usuário com acesso a nove filiais que queira olhar só uma usa o seletor.
Um usuário com acesso a uma filial não enxerga as outras nem trocando.

---

## 3. Modelo de dados

### 3.1. `config_filial`

Renomeada de `etl_empresa`, preservando as 13 linhas e os `recno` atuais.

| Coluna | Tipo | Observação |
|---|---|---|
| `recno` | INT AI PK | referenciada pelas demais tabelas |
| `origem_dados` | VARCHAR(6) | `SYSEMP`, `KPL` ou `MANUAL` |
| `cd_filial` | INT | código no ERP de origem |
| `grupo` | VARCHAR(5) | JNK / NK2 / CNK2 |
| **`empresa`** | **VARCHAR(50) NULL** | **novo** — agrupamento livre |
| `dc_filial` | VARCHAR(80) | razão social |
| `dc_fantasia` | VARCHAR(**100**) | era 25, truncava "FULL ML CNK2 COM, IMP E E" |
| `cnpj`, `ie` | VARCHAR(20) | |
| **`ativa`** | **BOOLEAN DEFAULT TRUE** | **novo** — desativar sem excluir |
| `atualizado_em` | DATETIME | |

`UNIQUE (origem_dados, cd_filial)` permanece.

`MANUAL` como terceira origem permite cadastrar uma unidade que não existe em
ERP nenhum, sem que o código precise tratá-la como exceção.

### 3.2. `usuarios_filiais`

`filial_id` passa a referenciar `config_filial(recno)`. A tabela em si não muda
de forma — muda para onde aponta.

### 3.3. Tabelas que repontam

`usuarios.ultimo_acesso_filial_id`, `avisos_plataforma.filial_id`,
`logs_acesso.filial_id`, `ti_equipamento.filial_id` e
`sysemp_empresa.filial_id` passam a referenciar `config_filial(recno)`. Todas
estão vazias exceto `logs_acesso`.

### 3.4. Removidas

`filiais` e `usuarios_empresas`.

---

## 4. Migração

Ordem obrigatória — as chaves estrangeiras impedem qualquer outra:

1. Renomear `etl_empresa` → `config_filial`; acrescentar `empresa` e `ativa`;
   ampliar `dc_fantasia`.
2. Remover as chaves estrangeiras que apontam para `filiais`.
3. **Remapear os valores.** Só `logs_acesso` tem dado: 1.079 linhas apontando
   para as filiais 1, 2 e 3. O de-para sai do CNPJ, escolhendo o **menor
   código** de cada um:
   - JNakao (…0003-82) → SysEmp 2
   - NK2 (…0001-34) → SysEmp 3
   - CNK2 (…0001-88) → SysEmp 4

   O CNPJ de "JNakao" corresponde a cinco empresas SysEmp; o menor código é o
   critério determinístico, e o histórico de acesso é informativo — não alimenta
   relatório nem cálculo.
4. **Migrar os vínculos de usuário.** Os 2 vínculos atuais são de "JNakao";
   cada usuário passa a ter as **9 filiais do grupo JNK** (6 SysEmp + 3 KPL),
   preservando exatamente o acesso de hoje.
5. Recriar as chaves estrangeiras apontando para `config_filial(recno)`.
6. `DROP TABLE filiais`, `DROP TABLE usuarios_empresas`.

### 4.1. Desligar o ETL de empresa

`rodarEtlEmpresa` e o card "ETL Empresa" do Painel de Integrações são removidos.

> **Consequência aceita:** empresa nova cadastrada na SysEmp deixa de aparecer
> sozinha. Alguém precisa cadastrá-la em `/config/filiais`. Hoje isso acontece
> automaticamente de hora em hora.

Não afeta o Faturamento: `etl_fatcom` monta `dc_filial` a partir de
`sysemp_empresa`, nunca de `etl_empresa`.

---

## 5. Aplicação nos módulos

O escopo continua vindo de `services/escopoEmpresas.ts`, com as mesmas regras
já cobertas por teste — falha fechada, interseção nunca substituição, origem
como parte da identidade. Muda só a fonte: `usuarios_filiais` + `config_filial`
no lugar de `usuarios_empresas`.

| Módulo | Antes | Depois |
|---|---|---|
| Faturamento, Estoque | todas as empresas vinculadas | idem, via `config_filial` |
| TI (equipamentos) | filial ativa | todas as permitidas, com o seletor filtrando |
| Avisos | filial ativa | idem |
| Log de Acesso | exibição | idem |

**O seletor:** ganha a opção "Todas as filiais" além de cada filial individual.
Escolher uma restringe as telas àquela; "Todas" volta ao conjunto permitido.
Nunca amplia além do permitido — é filtro, não permissão.

---

## 6. Telas

### 6.1. `/config/filiais`

CRUD completo sobre `config_filial`: origem, código, razão social, fantasia,
CNPJ, IE, grupo, empresa e ativa.

Excluir uma filial vinculada a usuários é bloqueado com mensagem explícita —
a alternativa (cascata) removeria acesso sem que ninguém percebesse.

### 6.2. `/config/usuarios`

**Filiais e perfis passam a vir marcados com o que está configurado.** O texto
"(deixe em branco para manter)" sai.

A regra atual — lista vazia significa "não mexer" — esconde do administrador o
que já está configurado e torna impossível *remover* todos os vínculos pela
tela. Depois da mudança, o formulário mostra o estado real e desmarcar tudo
remove o acesso, que é o comportamento honesto.

Filiais aparecem agrupadas por origem e grupo, com o CNPJ visível: sem ele,
"JNK Barueri" e "BARUERI CASA J NAKAO" parecem coisas diferentes.

---

## 7. Testes

A camada de escopo já tem 15 testes; eles continuam valendo com a fonte nova.
Acrescentar:

- **De-para da migração** — o remapeamento por CNPJ com menor código, testado
  sobre os dados reais das 3 filiais.
- **Seletor como filtro, nunca como permissão** — pedir uma filial fora do
  vínculo pelo seletor não pode ampliar o acesso. É a regressão mais provável
  desta mudança: um filtro de conveniência que vira brecha.

---

## 8. Riscos

1. **Migração irreversível de FKs.** Fazer backup do banco antes; a ordem da
   seção 4 não admite improviso.
2. **Empresa nova do ERP não aparece mais sozinha** (seção 4.1). Se passar
   despercebido, o faturamento de uma filial nova fica invisível até alguém
   cadastrá-la — e o sintoma é dado faltando, não erro.
3. **Duas visões da mesma empresa** (seção 0.2). Marcar só uma dá acesso
   parcial sem aviso. Mitigado pelo CNPJ visível na tela.
4. **`grupo` e `empresa` sem hierarquia definida.** Convivem como agrupamentos
   paralelos; se o uso mostrar que um deles basta, vale consolidar depois.
