using AgenteInventarioPC.Coleta;
using AgenteInventarioPC.Configuracao;
using AgenteInventarioPC.Envio;
using AgenteInventarioPC.Modelos;

const string VersaoAgente = "1.2.1";

// Log em arquivo ao lado do .exe, além do console — rodando via Tarefa
// Agendada (principalmente como SYSTEM/onstart) não existe console
// nenhum visível, então sem isto uma falha ali é invisível: o site
// simplesmente não recebe nada e não sobra pista de por quê.
var caminhoLog = Path.Combine(AppContext.BaseDirectory, "agente.log");

void Log(string mensagem)
{
    var linha = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {mensagem}";
    Console.WriteLine(linha);
    try
    {
        File.AppendAllText(caminhoLog, linha + Environment.NewLine);
    }
    catch
    {
        // Se nem o log em arquivo funcionar (ex: pasta sem permissão de
        // escrita), não tem mais pra onde reportar — segue sem travar.
    }
}

Log("=== Agente de Inventário de TI — RRCM ===");

try
{
    var config = ConfiguracaoAgente.Carregar();

    Log("Coletando informações do computador...");

    var payload = new InventarioPayload
    {
        Computador = new ComputadorInfo
        {
            Nome = Environment.MachineName,
            IdEmpresa = config.IdEmpresa,
        },
        Coleta = new ColetaInfo
        {
            // UTC, nao hora local -- o resto do sistema (banco com timezone
            // 'Z', frontend convertendo pra hora do navegador) assume que
            // todo timestamp salvo ja esta em UTC. Mandar DateTime.Now aqui
            // fazia a hora exibida ficar errada pelo offset do fuso da
            // maquina que roda o agente.
            ColetadoEm = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            UsuarioWindows = Environment.UserName,
            VersaoAgente = VersaoAgente,
            AnydeskId = ColetorAnydesk.Coletar(),
        },
        SistemaOperacional = ColetorHardware.ColetarSistemaOperacional(),
        Processador = ColetorHardware.ColetarProcessador(),
        PlacaMae = ColetorHardware.ColetarPlacaMae(),
        Bios = ColetorHardware.ColetarBios(),
        MemoriaRam = ColetorHardware.ColetarMemoriaRam(),
        Disco = ColetorHardware.ColetarDiscos(),
        Rede = ColetorHardware.ColetarRede(),
        Periferico = ColetorHardware.ColetarPerifericos(),
        Software = ColetorSoftware.ColetarProgramasInstalados(),
        DispositivoUsb = ColetorUsb.ColetarDispositivosArmazenamento(),
    };

    // Serial do BIOS/placa-mãe também vai no bloco "computador" — é o que
    // tb_pc_maquina usa como referência mais estável que o nome do PC.
    payload.Computador.SerialBios = payload.Bios?.NumeroSerie;
    payload.Computador.SerialPlacaMae = payload.PlacaMae?.NumeroSerie;

    Log(
        $"  {payload.MemoriaRam.Count} pente(s) de memória, {payload.Disco.Count} disco(s), " +
        $"{payload.Rede.Count} rede(s) conectada(s), {payload.Software.Count} programa(s) instalado(s), " +
        $"{payload.DispositivoUsb.Count} dispositivo(s) USB conhecido(s), " +
        $"AnyDesk ID: {payload.Coleta.AnydeskId ?? "não encontrado"}.");

    Log($"Enviando para {config.ApiUrl} (usuário do processo: {Environment.UserName}) ...");
    var cliente = new ApiClient(config.ApiUrl, config.ApiKey);
    var resultado = await cliente.EnviarAsync(payload);

    if (resultado.Sucesso)
    {
        Log($"OK ({resultado.StatusHttp}): {resultado.Mensagem}");
        return 0;
    }

    Log($"FALHA ({resultado.StatusHttp}): {resultado.Mensagem}");
    return 1;
}
catch (Exception ex)
{
    Log($"ERRO: {ex}");
    return 1;
}
