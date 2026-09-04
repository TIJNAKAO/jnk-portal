# Agente de Inventário de TI

Console app .NET 8 (Windows) que coleta hardware/software da máquina via
WMI e registro, e envia por HTTP pro endpoint `POST /api/ti/inventario`
da API do jnk-portal (`apps/api`, Node/Express). Reaproveitado sem nenhuma
mudança de código de `jnakao-digital-ocean/agente-inventario-pc` (onde o
mesmo agente enviava pra um endpoint PHP equivalente,
`api/inventario_pc.php`) — o contrato JSON do payload é idêntico, só o lado
que recebe mudou de linguagem. Ver `Specs/spec_modulo_ti.md`, seção 4.

## Compilar

```
cd agente-inventario-pc/AgenteInventarioPC
dotnet build
```

## Publicar (um único .exe, sem precisar instalar runtime na máquina do usuário)

```
dotnet publish -c Release
```

Gera o executável em
`bin/Release/net8.0-windows/win-x64/publish/AgenteInventarioPC.exe`.
Copie esse `.exe` junto com o `appsettings.json` (preenchido — ver abaixo)
pra máquina de destino.

## Configurar (`appsettings.json`, ao lado do .exe)

```json
{
  "ApiUrl": "https://SEU-DOMINIO-AQUI/api/ti/inventario",
  "ApiKey": "token gerado em ti_api_token",
  "IdEmpresa": 3
}
```

- `ApiUrl`: endereço público do endpoint (produção).
- `ApiKey`: token válido em `ti_api_token` (`ativo = TRUE`). Gerar um por
  `INSERT INTO ti_api_token (token, descricao) VALUES (...)` — usar um hex
  aleatório de 24+ bytes (ex: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).
- `IdEmpresa`: continua se chamando assim no JSON por compatibilidade com o
  agente já compilado — no jnk-portal é interpretado como `filial_id`
  (`filiais.id`). Opcional: se souber a qual filial o computador pertence,
  preenche aqui; senão deixa `null` e ajusta depois direto na tela
  Equipamentos de TI.

## Rodar na inicialização do Windows

**Recomendado: script automatizado.** No Portal, em TI → Gerar Scripts →
card "Configurar Agente de Inventário", baixa/copia o `.exe`, grava o
`appsettings.json` e registra a tarefa agendada tudo de uma vez — via
`Register-ScheduledTask -Xml` (não `schtasks.exe`), importando a definição
de `ModeloJob/RRCM - Inventario de TI.xml` (export de uma tarefa que já
funcionava). Evita de propósito o problema de parsing descrito abaixo, já
que não monta a tarefa a partir de uma linha de comando com aspas. Ver
`Specs/spec_modulo_ti.md`, seção 5.7.

As instruções manuais abaixo continuam valendo como alternativa/fallback,
ou pra quem quiser configurar direto na máquina sem passar pelo Portal.

Recomendado: Tarefa Agendada (Task Scheduler), não atalho na pasta
Inicializar — mais confiável (roda mesmo sem o usuário logar
interativamente, tem log de execução, permite atraso/retry).

**Pela interface gráfica:**
1. Criar tarefa → Disparador: "Ao iniciar o computador". Ação: "Iniciar um
   programa".
2. No campo "Programa/script", clique em **"Procurar..."** e selecione o
   `.exe` diretamente (não digite o caminho à mão). Deixe "Adicione
   argumentos" vazio.
3. Segurança: "Executar estando o usuário conectado ou não", usuário
   `SYSTEM` (ou `AUTORIDADE NT\SISTEMA`).

⚠️ **Cuidado com caminho que tem espaço** (ex: `C:\Program Files\...`):
se o caminho for digitado à mão em vez de escolhido pelo "Procurar...", o
Agendador de Tarefas às vezes "corrige" errado ao salvar, cortando o
caminho no primeiro espaço e jogando o resto pro campo de argumentos —
resultado: a tarefa falha sempre com "Valor de Erro: 2147942402"
(`0x80070002`, arquivo não encontrado), mesmo com o `.exe` existindo no
lugar certo. Pra conferir se foi isso, exporte a tarefa (botão direito →
Exportar) e olhe o XML: se `<Command>` estiver cortado (ex:
`C:\Program`) e o resto foi parar em `<Arguments>`, é exatamente esse
problema — corrija pelo "Procurar..." em vez de digitar.

**Por linha de comando** (equivalente, rode num `cmd.exe` como
administrador — não no PowerShell, que escapa aspas diferente):

```
schtasks /create /tn "RRCM - Inventario de TI" /tr "\"C:\Program Files\RRCMTOOLS\AgenteInventarioPC.exe\"" /sc onstart /ru SYSTEM
```

(ajuste o caminho do `.exe` pra onde for instalado — mantenha as aspas
duplas escapadas em volta do caminho se ele tiver espaço).

## O que é coletado

- Sistema operacional, processador, placa-mãe, BIOS (1 registro cada).
- Memória RAM, discos (exceto USB), placas de rede conectadas, periféricos
  (teclado/mouse/monitor/CD-DVD) — vários registros cada.
- Programas instalados (via registro, chaves Uninstall 32/64-bit).

Cada execução envia um snapshot completo — não é preciso o agente saber o
que mudou desde a última vez, isso fica pro lado do relatório (a construir)
comparando duas coletas de `tb_pc_inventario_coleta`.

## Testado

Validado ponta a ponta contra o banco de produção (dados reais desta
máquina de desenvolvimento): coleta + envio completo em ~8s, 203 programas
instalados, todas as tabelas conferidas.
