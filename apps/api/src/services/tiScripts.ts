/**
 * Windows PowerShell 5.1 (ainda comum em máquina de usuário final, fora do
 * PowerShell 7+) só detecta UTF-8 corretamente num arquivo `.ps1` se ele
 * começar com BOM — sem isso, cai num codepage de 1 byte e qualquer
 * caractere acentuado (nome de programa com acento cadastrado no catálogo,
 * por exemplo) vem corrompido na hora de rodar. Prefixar aqui, uma vez só,
 * em todo script gerado — mais robusto que depender de nunca digitar um
 * caractere não-ASCII nestes templates.
 */
const BOM_UTF8 = String.fromCharCode(0xfeff);

function comBom(script: string): string {
  return BOM_UTF8 + script;
}

/**
 * `cmd.exe` trunca linha de comando acima disto. Um base64 de script grande
 * passa fácil, então o corpo é quebrado em pedaços bem menores.
 */
export const LIMITE_LINHA_CMD = 8191;

/** Folga generosa sobre o limite: cabe o `>>"%B64%" echo ` e sobra. */
const TAMANHO_PEDACO_BASE64 = 500;

/**
 * Embrulha um script PowerShell num `.bat` que o usuário final executa com
 * duplo clique.
 *
 * Um `.ps1` não é executável no Windows: duplo clique abre o Bloco de
 * Notas, e mesmo por "Executar com PowerShell" ele esbarra em
 * ExecutionPolicy e na falta de elevação. O `.bat` resolve os três — pede
 * elevação sozinho, chama o PowerShell com `-ExecutionPolicy Bypass` e roda.
 *
 * O PowerShell viaja em **base64**, não colado como texto, e essa é a
 * decisão central: dentro de um `.bat` o `cmd.exe` interpretaria `%`, `&`,
 * `|`, `>` e `^` do script (o de atualizar programas tem todos), e leria
 * acento no codepage do console em vez de UTF-8. Em base64 o corpo é ASCII
 * puro, chega intacto e o BOM que o PowerShell 5.1 precisa vai junto.
 *
 * Por isso também o `.bat` não pode ter BOM próprio nem caractere
 * acentuado: o `cmd.exe` tentaria executar os bytes do BOM como comando.
 */
export interface EmpacotarComoBatOpcoes {
  /**
   * Auto-elevar via UAC na primeira linha do `.bat`. Padrão `true`.
   *
   * `false` existe por causa do `winget`: elevar entrega o script à conta
   * digitada no UAC, que tem token mas **não tem sessão interativa**. O
   * índice do winget é um MSIX registrado por usuário, e registrar MSIX
   * exige sessão — sem ela a implantação falha com `0x80073D19` ("usuário
   * foi desconectado") e o `winget` morre em `0x8A15000F`. Ver
   * `gerarScriptAtualizarProgramas`.
   */
  elevar?: boolean;
}

export function empacotarComoBat(
  nomeBase: string,
  scriptPowerShell: string,
  { elevar = true }: EmpacotarComoBatOpcoes = {},
): string {
  const nomeSeguro = nomeBase
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const base64 = Buffer.from(scriptPowerShell, 'utf8').toString('base64');
  const pedacos: string[] = [];
  for (let i = 0; i < base64.length; i += TAMANHO_PEDACO_BASE64) {
    pedacos.push(base64.slice(i, i + TAMANHO_PEDACO_BASE64));
  }

  const linhasBase64 = pedacos.map((pedaco, indice) => `${indice === 0 ? '>' : '>>'}"%B64%" echo ${pedaco}`);

  return [
    '@echo off',
    'setlocal',
    `rem Gerado pelo Inventario de TI - ${nomeSeguro}`,
    'rem O PowerShell vai embutido em base64: ver services/tiScripts.ts',
    '',
    ...(elevar
      ? [
          'net session >nul 2>&1',
          'if errorlevel 1 (',
          '  echo Solicitando privilegios de administrador...',
          `  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
          '  exit /b',
          ')',
          '',
        ]
      : []),
    `set "B64=%TEMP%\\${nomeSeguro}.b64"`,
    `set "PS1=%TEMP%\\${nomeSeguro}.ps1"`,
    '',
    ...linhasBase64,
    '',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllBytes($env:PS1, [Convert]::FromBase64String(((Get-Content $env:B64 -Raw) -replace '\\s','')))"`,
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"',
    '',
    'del "%B64%" >nul 2>&1',
    'del "%PS1%" >nul 2>&1',
    '',
    'echo.',
    'pause',
    '',
  ].join('\r\n');
}

interface ProgramaCatalogo {
  nome: string;
  wingetId: string;
  configurarAcessoRemoto: boolean;
}

interface ItemIndesejado {
  id: string;
  nome: string;
  appx?: string;
  wingetId?: string;
}

/**
 * Lista fixa de apps/jogos indesejados comuns numa instalação padrão do
 * Windows — não vem do catálogo editável porque não são "instalar via
 * winget", são pacotes built-in removidos via Appx/AppxProvisioned (pra não
 * voltar em perfil de usuário novo), com fallback via winget pros que
 * também têm instalador clássico (Spotify). Ver Specs/spec_modulo_ti.md,
 * seção 5.6.
 */
export const CATALOGO_INDESEJADOS: ItemIndesejado[] = [
  { id: 'xbox_app', nome: 'Xbox (app)', appx: 'Microsoft.GamingApp' },
  { id: 'xbox_game_bar', nome: 'Xbox Game Bar', appx: 'Microsoft.XboxGamingOverlay' },
  { id: 'xbox_speech', nome: 'Xbox Speech To Text Overlay', appx: 'Microsoft.XboxSpeechToTextOverlay' },
  { id: 'solitaire', nome: 'Microsoft Solitaire Collection', appx: 'Microsoft.MicrosoftSolitaireCollection' },
  { id: 'candy_crush', nome: 'Candy Crush Saga', appx: 'king.com.CandyCrushSaga' },
  { id: 'candy_crush_soda', nome: 'Candy Crush Soda Saga', appx: 'king.com.CandyCrushSodaSaga' },
  { id: 'spotify', nome: 'Spotify', appx: 'SpotifyAB.SpotifyMusic', wingetId: 'Spotify.Spotify' },
  { id: 'disney', nome: 'Disney+', appx: 'Disney.37853FC22B2CE' },
  { id: 'mixed_reality', nome: 'Mixed Reality Portal', appx: 'Microsoft.MixedReality.Portal' },
  { id: '3d_viewer', nome: '3D Viewer', appx: 'Microsoft.Microsoft3DViewer' },
  { id: 'skype', nome: 'Skype (Microsoft Store)', appx: 'Microsoft.SkypeApp' },
  { id: 'office_hub', nome: 'Office Hub (atalho promocional)', appx: 'Microsoft.MicrosoftOfficeHub' },
  { id: 'feedback_hub', nome: 'Feedback Hub', appx: 'Microsoft.WindowsFeedbackHub' },
  { id: 'get_help', nome: 'Get Help', appx: 'Microsoft.GetHelp' },
  { id: 'tips', nome: 'Dicas do Windows', appx: 'Microsoft.Getstarted' },
  { id: 'bing_news', nome: 'Bing News', appx: 'Microsoft.BingNews' },
  { id: 'bing_weather', nome: 'Bing Weather', appx: 'Microsoft.BingWeather' },
  { id: 'groove_music', nome: 'Groove Music', appx: 'Microsoft.ZuneMusic' },
  { id: 'filmes_tv', nome: 'Filmes e TV', appx: 'Microsoft.ZuneVideo' },
];

export interface GerarScriptInstalarOpcoes {
  selecionados: ProgramaCatalogo[];
  idsIndesejados: string[];
  habilitarAdmin: boolean;
}

/** Porta de `admin/pc_instalar_programas.php`. Roda é sempre manual, na máquina — nunca automático a partir do clique. */
export function gerarScriptInstalarProgramas({ selecionados, idsIndesejados, habilitarAdmin }: GerarScriptInstalarOpcoes): string {
  const linhas = selecionados.map(
    (p) =>
      `Write-Host "Instalando ${p.nome.replace(/"/g, '\\"')}..." -ForegroundColor Cyan\r\n` +
      `winget install --id ${p.wingetId} --silent --accept-source-agreements --accept-package-agreements\r\n`,
  );
  const precisaConfigurarAnydesk = selecionados.some((p) => p.configurarAcessoRemoto);

  let blocoAcessoRemoto = '';
  if (precisaConfigurarAnydesk) {
    blocoAcessoRemoto =
      '\r\nWrite-Host ""\r\n' +
      'Write-Host "=== Configurando acesso remoto nao supervisionado (AnyDesk) ===" -ForegroundColor Cyan\r\n' +
      '$candidatos = @(\r\n' +
      '    "${env:ProgramFiles(x86)}\\AnyDesk\\AnyDesk.exe",\r\n' +
      '    "$env:ProgramFiles\\AnyDesk\\AnyDesk.exe"\r\n' +
      ')\r\n' +
      '$anydeskPath = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1\r\n' +
      'if ($anydeskPath) {\r\n' +
      '    Write-Host "Configurando AnyDesk para iniciar com o Windows..." -ForegroundColor Cyan\r\n' +
      '    & $anydeskPath --start-with-win\r\n\r\n' +
      '    $senhaSegura = Read-Host "Digite a senha de acesso nao supervisionado do AnyDesk (Enter para pular)" -AsSecureString\r\n' +
      '    $senhaTexto = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSegura))\r\n' +
      '    if ($senhaTexto) {\r\n' +
      '        $senhaTexto | & $anydeskPath --set-password\r\n' +
      '        Write-Host "Senha de acesso nao supervisionado configurada." -ForegroundColor Green\r\n' +
      '    } else {\r\n' +
      '        Write-Host "Senha nao definida - configure manualmente depois em Configuracoes > Acesso Seguro no AnyDesk." -ForegroundColor Yellow\r\n' +
      '    }\r\n\r\n' +
      '    Write-Host "ID do AnyDesk desta maquina:"\r\n' +
      '    & $anydeskPath --get-id\r\n' +
      '} else {\r\n' +
      '    Write-Host "AnyDesk instalado, mas nao encontrei o executavel pra configurar inicio automatico/senha - confira manualmente." -ForegroundColor Yellow\r\n' +
      '}\r\n';
  }

  let blocoAdmin = '';
  if (habilitarAdmin) {
    blocoAdmin =
      '\r\nWrite-Host ""\r\n' +
      'Write-Host "=== Habilitando conta de Administrador local ===" -ForegroundColor Cyan\r\n' +
      'try {\r\n' +
      '    $contaAdmin = Get-LocalUser | Where-Object { $_.SID -like "*-500" } | Select-Object -First 1\r\n' +
      '    if ($contaAdmin) {\r\n' +
      '        $senhaAdmin = Read-Host "Digite a senha para a conta de Administrador local (Enter para pular)" -AsSecureString\r\n' +
      '        if ($senhaAdmin.Length -gt 0) {\r\n' +
      '            Set-LocalUser -Name $contaAdmin.Name -Password $senhaAdmin\r\n' +
      '            Enable-LocalUser -Name $contaAdmin.Name\r\n' +
      '            Write-Host "Conta de Administrador ($($contaAdmin.Name)) habilitada com a senha definida." -ForegroundColor Green\r\n' +
      '        } else {\r\n' +
      '            Write-Host "Senha nao definida - a conta de Administrador NAO foi habilitada." -ForegroundColor Yellow\r\n' +
      '        }\r\n' +
      '    } else {\r\n' +
      '        Write-Host "Nao foi possivel localizar a conta de Administrador local nesta maquina." -ForegroundColor Yellow\r\n' +
      '    }\r\n' +
      '} catch {\r\n' +
      '    Write-Host "Falha ao habilitar a conta de Administrador: $_" -ForegroundColor Red\r\n' +
      '}\r\n';
  }

  let blocoInstalacao = '';
  if (linhas.length > 0) {
    blocoInstalacao =
      'if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {\r\n' +
      '    Write-Host "winget nao encontrado nesta maquina. Instale o \'App Installer\' pela Microsoft Store e tente de novo." -ForegroundColor Red\r\n' +
      '} else {\r\n' +
      linhas.join('\r\n') +
      '}\r\n\r\n';
  }

  let blocoDesinstalar = '';
  if (idsIndesejados.length > 0) {
    const itens = CATALOGO_INDESEJADOS.filter((item) => idsIndesejados.includes(item.id));
    const linhasDesinstalar = itens.map((item) => {
      const partes = [`Write-Host "Removendo ${item.nome}..." -ForegroundColor Cyan\r\n`];
      if (item.appx) {
        partes.push(
          `Get-AppxPackage -AllUsers -Name "${item.appx}" | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue\r\n` +
            `Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like "${item.appx}*" } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue\r\n`,
        );
      }
      if (item.wingetId) {
        partes.push(
          `if (Get-Command winget -ErrorAction SilentlyContinue) { winget uninstall --id ${item.wingetId} --silent --accept-source-agreements --accept-package-agreements 2>$null }\r\n`,
        );
      }
      return partes.join('');
    });

    blocoDesinstalar =
      '\r\nWrite-Host ""\r\n' +
      'Write-Host "=== Removendo programas indesejados ===" -ForegroundColor Cyan\r\n' +
      linhasDesinstalar.join('\r\n') +
      '\r\n';
  }

  return comBom(
    '# Gerado pelo Inventario de TI - Instalar Programas\r\n' +
      `# ${new Date().toLocaleString('pt-BR')}\r\n` +
      '# Entregue dentro de instalar_programas.bat, que ja pede elevacao e\r\n' +
      '# chama este script - ver empacotarComoBat em services/tiScripts.ts.\r\n\r\n' +
      '$ErrorActionPreference = "Continue"\r\n\r\n' +
      blocoDesinstalar +
      blocoInstalacao +
      blocoAcessoRemoto +
      blocoAdmin +
      '\r\nWrite-Host "Concluido." -ForegroundColor Green\r\n',
  );
}

/**
 * Porta de `admin/pc_atualizar_programas.php` — script fixo, não depende de
 * seleção nenhuma.
 *
 * **As duas metades rodam em contextos diferentes, e isso é o ponto do
 * script.** O índice do `winget` é um pacote MSIX registrado *por usuário*,
 * e registrar MSIX exige **sessão interativa**. Enquanto o `.bat` elevava
 * tudo na primeira linha, o operador digitava no UAC uma conta
 * administrativa que tem token mas nunca fez logon naquela máquina — a
 * implantação falhava com `0x80073D19` ("usuário foi desconectado"), o
 * índice nunca era registrado e o `winget` morria em `0x8A15000F`. Nenhuma
 * flag do winget alcança isso: `--accept-source-agreements`,
 * `source update` e `source reset --force` operam todos acima dessa camada,
 * e foram testados em campo sem efeito.
 *
 * Por isso o `winget` roda na sessão do usuário logado (o `.bat` sai com
 * `elevar: false`) e só o bloco de drivers eleva: a COM do Windows Update
 * depende de privilégio, não de MSIX, e funcionava mesmo na conta sem
 * sessão.
 *
 * O preço, assumido: se o usuário logado não for administrador, programa de
 * escopo de máquina pede UAC durante o upgrade. O card é de execução
 * manual, com alguém na frente da máquina.
 */
export function gerarScriptAtualizarProgramas(): string {
  return comBom(`# Gerado pelo Inventario de TI - Atualizar Programas e Drivers
# Entregue dentro de atualizar_programas.bat, que -- de proposito -- NAO
# eleva: ver gerarScriptAtualizarProgramas em services/tiScripts.ts.

param([string]$LogDrivers)

$ErrorActionPreference = "Continue"

if ($LogDrivers) {
    # Segunda passada: este processo foi relancado com elevacao so para os
    # drivers. Escreve tambem num log pra janela original mostrar o
    # resultado, senao a saida sumiria junto com a janela elevada.
    function Registrar($texto, $cor) {
        if ($cor) { Write-Host $texto -ForegroundColor $cor } else { Write-Host $texto }
        Add-Content -Path $LogDrivers -Value $texto -Encoding UTF8
    }

    try {
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $resultado = $searcher.Search("IsInstalled=0 and Type='Driver'")

        if ($resultado.Updates.Count -eq 0) {
            Registrar "Nenhum driver pendente." Green
        } else {
            Registrar "$($resultado.Updates.Count) driver(s) encontrado(s). Baixando e instalando..."
            $paraInstalar = New-Object -ComObject Microsoft.Update.UpdateColl
            foreach ($item in $resultado.Updates) {
                $paraInstalar.Add($item) | Out-Null
                Registrar "  - $($item.Title)"
            }

            $downloader = $session.CreateUpdateDownloader()
            $downloader.Updates = $paraInstalar
            $downloader.Download() | Out-Null

            $instalador = $session.CreateUpdateInstaller()
            $instalador.Updates = $paraInstalar
            $resultadoInstalacao = $instalador.Install()

            Registrar "Resultado: codigo $($resultadoInstalacao.ResultCode) (2 = sucesso)"
        }
    } catch {
        Registrar "Falha ao verificar/instalar drivers: $_" Red
    }

    exit 0
}

Write-Host "=== Atualizando programas (winget) ===" -ForegroundColor Cyan
if (Get-Command winget -ErrorAction SilentlyContinue) {
    # Sem elevacao aqui de proposito: e nesta sessao que o indice do winget
    # consegue se registrar. O source update deixa o indice em dia; a fonte
    # msstore fica de fora com --source winget porque exige regiao
    # geografica e contrato proprio, e nao atualiza programa de desktop.
    winget source update --name winget --disable-interactivity | Out-Null
    winget upgrade --all --source winget --silent --disable-interactivity --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "winget terminou com codigo $LASTEXITCODE - confira acima quais pacotes falharam." -ForegroundColor Yellow
    }
} else {
    Write-Host "winget nao encontrado nesta maquina - pulando atualizacao de programas." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Atualizando drivers (Windows Update) ===" -ForegroundColor Cyan
# Drivers precisam de administrador, entao aqui sim vale elevar -- e a COM do
# Windows Update nao depende de MSIX, logo funciona em conta sem sessao.
$logDrivers = Join-Path $env:TEMP "atualizar_drivers.log"
if (Test-Path $logDrivers) { Remove-Item $logDrivers -Force -ErrorAction SilentlyContinue }
try {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', "\`"$PSCommandPath\`"",
        '-LogDrivers', "\`"$logDrivers\`""
    )
    if (Test-Path $logDrivers) {
        Get-Content $logDrivers -Encoding UTF8 | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "A etapa de drivers nao gerou saida - elevacao recusada?" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Nao foi possivel elevar para atualizar drivers: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Concluido. Pode ser necessario reiniciar o computador pra concluir alguma atualizacao." -ForegroundColor Green
`);
}

export interface GerarScriptConfigurarAgenteOpcoes {
  agenteUrl: string;
  apiUrl: string;
  apiKey: string;
}

/**
 * Gera o script que instala o agente de inventário numa máquina nova:
 * baixa o `.exe`, grava o `appsettings.json` com as credenciais desta
 * instalação e registra a tarefa agendada que roda o agente a cada
 * reinicialização, como SYSTEM.
 *
 * O bloco XML da tarefa é uma cópia fiel de um export real
 * (`agente-inventario-pc/ModeloJob/RRCM - Inventario de TI.xml`, gerado
 * por uma máquina onde a tarefa já funcionava) — importado via
 * `Register-ScheduledTask -Xml`, não via `schtasks.exe` na linha de
 * comando. Isso evita de propósito o bug de parsing que o `schtasks`
 * tem com caminhos com espaço (ver `agente-inventario-pc/README.md`,
 * seção "Cuidado com caminho que tem espaço"): `Register-ScheduledTask`
 * recebe a definição da tarefa já estruturada, sem precisar re-parsear
 * uma linha de comando com aspas.
 */
export function gerarScriptConfigurarAgente({ agenteUrl, apiUrl, apiKey }: GerarScriptConfigurarAgenteOpcoes): string {
  const agora = new Date();
  const carimboIso = agora.toISOString().slice(0, 19);
  // O Agendador de Tarefas do Windows interpreta StartBoundary sem sufixo de
  // fuso ('Z'/offset) como HORA LOCAL da máquina — mas carimboIso vem de
  // Date.toISOString(), que é sempre UTC. Num fuso atrás de UTC (ex: Brasil,
  // UTC-3), isso fazia o Agendador achar que o boot trigger só vale a partir
  // de um horário ainda no futuro, e o job simplesmente não disparava nos
  // reinícios até esse horário chegar. Fixo no passado evita a ambiguidade
  // de fuso inteiramente — só serve como "piso" pro trigger de boot valer
  // sempre, não precisa ser um valor real.
  const inicioTriggerBoot = '2020-01-01T00:00:00';

  const appsettingsJson = JSON.stringify({ ApiUrl: apiUrl, ApiKey: apiKey, IdEmpresa: null }, null, 2);

  const xmlTarefa = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>${carimboIso}</Date>
    <Author>jnk-portal - Modulo TI</Author>
    <URI>\\RRCM - Inventario de TI</URI>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <StartBoundary>${inicioTriggerBoot}</StartBoundary>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT72H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"C:\\Program Files\\RRCMTOOLS\\AgenteInventarioPC.exe"</Command>
    </Exec>
  </Actions>
</Task>`;

  return comBom(`# Gerado pelo Inventario de TI - Configurar Agente de Inventario
# ${agora.toLocaleString('pt-BR')}
# Entregue dentro de configurar_agente.bat, que ja pede elevacao e chama
# este script - ver empacotarComoBat em services/tiScripts.ts.
#
# Faz tres coisas nesta ordem: baixa o AgenteInventarioPC.exe, grava o
# appsettings.json com as credenciais desta instalacao, e registra a
# tarefa agendada que roda o agente a cada reinicializacao da maquina
# (como SYSTEM). Pode ser executado de novo com seguranca.

$ErrorActionPreference = "Stop"

$destino = "C:\\Program Files\\RRCMTOOLS"
$exeDestino = Join-Path $destino "AgenteInventarioPC.exe"
$appsettingsDestino = Join-Path $destino "appsettings.json"
$nomeTarefa = "RRCM - Inventario de TI"

Write-Host "=== Preparando diretorio de instalacao ===" -ForegroundColor Cyan
if (-not (Test-Path $destino)) {
    New-Item -ItemType Directory -Path $destino -Force | Out-Null
    Write-Host "Diretorio criado: $destino" -ForegroundColor Green
} else {
    Write-Host "Diretorio ja existe: $destino"
}

Write-Host ""
Write-Host "=== Baixando o Agente de Inventario ===" -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri "${agenteUrl}" -OutFile $exeDestino -UseBasicParsing
    Write-Host "Agente baixado com sucesso em $exeDestino." -ForegroundColor Green
} catch {
    Write-Host "Falha ao baixar o agente: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Gravando appsettings.json ===" -ForegroundColor Cyan
$appsettingsJson = @'
${appsettingsJson}
'@
Set-Content -Path $appsettingsDestino -Value $appsettingsJson -Encoding UTF8
Write-Host "Configuracao gravada em $appsettingsDestino." -ForegroundColor Green

Write-Host ""
Write-Host "=== Configurando a tarefa agendada (roda ao iniciar o Windows) ===" -ForegroundColor Cyan
try {
    if (Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $nomeTarefa -Confirm:$false
    }
    $xmlTarefa = @'
${xmlTarefa}
'@
    Register-ScheduledTask -TaskName $nomeTarefa -Xml $xmlTarefa -Force | Out-Null
    Write-Host "Tarefa '$nomeTarefa' configurada - vai rodar a cada reinicializacao, como SYSTEM." -ForegroundColor Green

    # Historico da tarefa. Nao e uma propriedade da tarefa: o botao
    # "Habilitar Historico de Todas as Tarefas" do Agendador liga o canal de
    # log do Windows inteiro, que vem desligado por padrao. Sem ele a aba
    # Historico fica vazia e nao da pra saber se a coleta rodou no boot.
    $canalLog = "Microsoft-Windows-TaskScheduler/Operational"
    try {
        $estado = wevtutil get-log $canalLog 2>$null | Select-String -Pattern "^enabled:"
        if ($estado -match "true") {
            Write-Host "Historico de tarefas ja estava habilitado." -ForegroundColor Green
        } else {
            wevtutil set-log $canalLog /enabled:true
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Historico de tarefas habilitado." -ForegroundColor Green
            } else {
                Write-Host "Nao foi possivel habilitar o historico de tarefas (codigo $LASTEXITCODE)." -ForegroundColor Yellow
            }
        }
    } catch {
        # Historico e diagnostico, nao requisito: se falhar, a tarefa segue
        # valida e a instalacao nao deve ser abortada por causa disso.
        Write-Host "Nao foi possivel habilitar o historico de tarefas: $_" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Falha ao configurar a tarefa agendada: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Executando a primeira coleta agora ===" -ForegroundColor Cyan
try {
    Start-ScheduledTask -TaskName $nomeTarefa
    Write-Host "Primeira coleta disparada em segundo plano." -ForegroundColor Green
} catch {
    Write-Host "Nao foi possivel disparar a primeira coleta automaticamente: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Concluido." -ForegroundColor Green
`);
}
