using System.Management;
using AgenteInventarioPC.Modelos;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Consultas WMI (root\cimv2) pra hardware/SO. Cada método devolve null (ou
/// lista vazia) se a consulta falhar — uma classe WMI indisponível numa
/// máquina não pode derrubar a coleta inteira das outras.
/// </summary>
public static class ColetorHardware
{
    private const string Escopo = @"root\cimv2";
    private const string EscopoStorage = @"root\Microsoft\Windows\Storage";

    public static SistemaOperacionalInfo? ColetarSistemaOperacional()
    {
        var linha = ConsultarUmaLinha(
            "SELECT Caption, Version, BuildNumber, InstallDate, LastBootUpTime, OSArchitecture, RegisteredUser, SerialNumber FROM Win32_OperatingSystem");
        if (linha is null) return null;

        return new SistemaOperacionalInfo
        {
            Caption = Texto(linha, "Caption"),
            Versao = Texto(linha, "Version"),
            BuildNumber = Texto(linha, "BuildNumber"),
            Arquitetura = Texto(linha, "OSArchitecture"),
            DataInstalacao = DataWmi(linha, "InstallDate"),
            UltimoBoot = DataWmi(linha, "LastBootUpTime"),
            UsuarioRegistrado = Texto(linha, "RegisteredUser"),
            NumeroSerie = Texto(linha, "SerialNumber"),
        };
    }

    public static ProcessadorInfo? ColetarProcessador()
    {
        var linha = ConsultarUmaLinha(
            "SELECT Name, Manufacturer, ProcessorId, CurrentClockSpeed, MaxClockSpeed, L2CacheSize, L3CacheSize, NumberOfCores, NumberOfEnabledCore, NumberOfLogicalProcessors FROM Win32_Processor");
        if (linha is null) return null;

        return new ProcessadorInfo
        {
            Nome = Texto(linha, "Name"),
            Fabricante = Texto(linha, "Manufacturer"),
            ProcessorId = Texto(linha, "ProcessorId"),
            VelocidadeAtualMhz = Inteiro(linha, "CurrentClockSpeed"),
            VelocidadeMaximaMhz = Inteiro(linha, "MaxClockSpeed"),
            CacheL2Kb = Inteiro(linha, "L2CacheSize"),
            CacheL3Kb = Inteiro(linha, "L3CacheSize"),
            NumeroNucleos = Inteiro(linha, "NumberOfCores"),
            NumeroNucleosHabilitados = Inteiro(linha, "NumberOfEnabledCore"),
            NumeroProcessadoresLogicos = Inteiro(linha, "NumberOfLogicalProcessors"),
        };
    }

    public static PlacaMaeInfo? ColetarPlacaMae()
    {
        var linha = ConsultarUmaLinha("SELECT Manufacturer, Product, SerialNumber, Version FROM Win32_BaseBoard");
        if (linha is null) return null;

        return new PlacaMaeInfo
        {
            Nome = Texto(linha, "Product"),
            Fabricante = Texto(linha, "Manufacturer"),
            Modelo = Texto(linha, "Product"),
            Produto = Texto(linha, "Product"),
            NumeroSerie = Texto(linha, "SerialNumber")?.Trim(),
            Versao = Texto(linha, "Version"),
        };
    }

    public static BiosInfo? ColetarBios()
    {
        var linha = ConsultarUmaLinha("SELECT Manufacturer, SerialNumber, Version FROM Win32_BIOS");
        if (linha is null) return null;

        return new BiosInfo
        {
            Fabricante = Texto(linha, "Manufacturer"),
            NumeroSerie = Texto(linha, "SerialNumber")?.Trim(),
            Versao = Texto(linha, "Version"),
        };
    }

    public static List<MemoriaRamInfo> ColetarMemoriaRam()
    {
        var lista = new List<MemoriaRamInfo>();
        foreach (var linha in ConsultarVariasLinhas(
            "SELECT Manufacturer, BankLabel, DeviceLocator, Capacity, Speed, PartNumber, SerialNumber FROM Win32_PhysicalMemory"))
        {
            lista.Add(new MemoriaRamInfo
            {
                Nome = "Physical Memory",
                Fabricante = Texto(linha, "Manufacturer"),
                Banco = Texto(linha, "BankLabel"),
                Slot = Texto(linha, "DeviceLocator"),
                CapacidadeBytes = InteiroGrande(linha, "Capacity"),
                VelocidadeMhz = Inteiro(linha, "Speed"),
                PartNumber = Texto(linha, "PartNumber")?.Trim(),
                NumeroSerie = Texto(linha, "SerialNumber")?.Trim(),
            });
        }
        return lista;
    }

    public static List<DiscoInfo> ColetarDiscos()
    {
        var lista = new List<DiscoInfo>();
        var midiaEBarramentoPorIndice = MapearMidiaEBarramentoPorIndice();

        // USB fica de fora (pen drive/HD externo não é o equipamento em si).
        foreach (var linha in ConsultarVariasLinhas(
            "SELECT Index, Caption, Manufacturer, Model, InterfaceType, FirmwareRevision, SerialNumber, Size, Partitions FROM Win32_DiskDrive WHERE InterfaceType != 'USB'"))
        {
            var indice = Texto(linha, "Index");
            var (tipoMidia, barramento) = (indice is not null && midiaEBarramentoPorIndice.TryGetValue(indice, out var info))
                ? info
                : ((string?) null, (string?) null);

            lista.Add(new DiscoInfo
            {
                Nome = Texto(linha, "Caption"),
                Modelo = Texto(linha, "Model"),
                Fabricante = Texto(linha, "Manufacturer"),
                TipoInterface = Texto(linha, "InterfaceType"),
                Firmware = Texto(linha, "FirmwareRevision"),
                NumeroSerie = Texto(linha, "SerialNumber")?.Trim(),
                TamanhoBytes = InteiroGrande(linha, "Size"),
                NumeroParticoes = Inteiro(linha, "Partitions"),
                TipoMidia = tipoMidia,
                Barramento = barramento,
            });
        }
        return lista;
    }

    /// <summary>
    /// MSFT_PhysicalDisk (namespace separado, root\Microsoft\Windows\Storage)
    /// é quem sabe dizer SSD x HDD e o barramento real (NVMe entra aqui, não
    /// dá pra confiar só no InterfaceType do Win32_DiskDrive pra isso).
    /// DeviceId desse WMI bate com o "Index" do Win32_DiskDrive (mesmo
    /// número do \\.\PHYSICALDRIVEn) — é a chave usada pra correlacionar.
    /// Indisponível em SO mais antigo (pré-Windows 8/2012) — nesse caso
    /// devolve vazio e os discos ficam sem tipo/barramento, sem quebrar nada.
    /// </summary>
    private static Dictionary<string, (string? tipoMidia, string? barramento)> MapearMidiaEBarramentoPorIndice()
    {
        var mapa = new Dictionary<string, (string?, string?)>();
        foreach (var linha in ConsultarVariasLinhas("SELECT DeviceId, MediaType, BusType FROM MSFT_PhysicalDisk", EscopoStorage))
        {
            var deviceId = Texto(linha, "DeviceId");
            if (deviceId is null)
            {
                continue;
            }

            var mediaType = Inteiro(linha, "MediaType");
            var busType = Inteiro(linha, "BusType");

            string? tipoMidia = mediaType switch
            {
                3 => "HDD",
                4 => "SSD",
                5 => "SCM",
                _ => null,
            };

            string? barramento = busType switch
            {
                1 => "SCSI",
                2 => "ATAPI",
                3 => "ATA",
                4 => "1394",
                6 => "Fibre Channel",
                7 => "USB",
                8 => "RAID",
                9 => "iSCSI",
                10 => "SAS",
                11 => "SATA",
                17 => "NVMe",
                _ => null,
            };

            // NVMe quase sempre é SSD — WMI às vezes devolve MediaType
            // "Unspecified" pra NVMe mesmo assim, então completa aqui.
            if (barramento == "NVMe" && tipoMidia is null)
            {
                tipoMidia = "SSD";
            }

            mapa[deviceId] = (tipoMidia, barramento);
        }
        return mapa;
    }

    public static List<RedeInfo> ColetarRede()
    {
        var lista = new List<RedeInfo>();
        // Só adaptadores conectados (NetConnectionStatus=2) — evita listar
        // dezenas de adaptadores virtuais/desligados sem relevância.
        foreach (var linha in ConsultarVariasLinhas(
            "SELECT Name, AdapterType, MACAddress, Speed FROM Win32_NetworkAdapter WHERE NetConnectionStatus=2"))
        {
            lista.Add(new RedeInfo
            {
                Nome = Texto(linha, "Name"),
                TipoAdaptador = Texto(linha, "AdapterType"),
                MacAddress = Texto(linha, "MACAddress"),
                VelocidadeBps = InteiroGrande(linha, "Speed"),
            });
        }
        return lista;
    }

    public static List<PerifericoInfo> ColetarPerifericos()
    {
        var lista = new List<PerifericoInfo>();

        foreach (var linha in ConsultarVariasLinhas("SELECT Name, DeviceID, Status FROM Win32_Keyboard"))
        {
            lista.Add(new PerifericoInfo { Tipo = "TECLADO", Nome = Texto(linha, "Name"), DeviceId = Texto(linha, "DeviceID"), Status = Texto(linha, "Status") });
        }

        foreach (var linha in ConsultarVariasLinhas("SELECT Name, Manufacturer, DeviceID, Status FROM Win32_PointingDevice"))
        {
            lista.Add(new PerifericoInfo { Tipo = "MOUSE", Nome = Texto(linha, "Name"), Fabricante = Texto(linha, "Manufacturer"), DeviceId = Texto(linha, "DeviceID"), Status = Texto(linha, "Status") });
        }

        foreach (var linha in ConsultarVariasLinhas("SELECT Name, DeviceID, Status FROM Win32_DesktopMonitor"))
        {
            lista.Add(new PerifericoInfo { Tipo = "MONITOR", Nome = Texto(linha, "Name"), DeviceId = Texto(linha, "DeviceID"), Status = Texto(linha, "Status") });
        }

        foreach (var linha in ConsultarVariasLinhas("SELECT Name, DeviceID FROM Win32_CDROMDrive"))
        {
            lista.Add(new PerifericoInfo { Tipo = "CDDVD", Nome = Texto(linha, "Name"), DeviceId = Texto(linha, "DeviceID") });
        }

        return lista;
    }

    // ---- Auxiliares de consulta WMI ----

    private static ManagementBaseObject? ConsultarUmaLinha(string query)
    {
        foreach (var linha in ConsultarVariasLinhas(query))
        {
            return linha;
        }
        return null;
    }

    private static IEnumerable<ManagementBaseObject> ConsultarVariasLinhas(string query, string? escopo = null)
    {
        List<ManagementBaseObject> resultado = new();
        try
        {
            using var pesquisador = new ManagementObjectSearcher(new ManagementScope(escopo ?? Escopo), new ObjectQuery(query));
            using var colecao = pesquisador.Get();
            foreach (ManagementBaseObject linha in colecao)
            {
                resultado.Add(linha);
            }
        }
        catch (Exception ex)
        {
            // Uma classe WMI indisponível/bloqueada nesta máquina não pode
            // impedir a coleta do resto — devolve vazio e segue. Mas sem
            // registrar o motivo, uma falha ampla (ex: WMI inteiro
            // inacessível nesta máquina) fica invisível — snapshot chega
            // vazio no portal e não sobra nenhuma pista de por quê.
            RegistrarErroWmi(query, ex);
        }
        return resultado;
    }

    private static readonly string CaminhoLog = Path.Combine(AppContext.BaseDirectory, "agente.log");

    private static void RegistrarErroWmi(string query, Exception ex)
    {
        try
        {
            var linha = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [WMI] Falha em \"{query}\": {ex.GetType().Name} - {ex.Message}";
            File.AppendAllText(CaminhoLog, linha + Environment.NewLine);
        }
        catch
        {
            // Idem — se nem o log funcionar, não tem mais pra onde reportar.
        }
    }

    private static string? Texto(ManagementBaseObject linha, string propriedade)
    {
        try
        {
            return linha[propriedade]?.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static uint? Inteiro(ManagementBaseObject linha, string propriedade)
    {
        try
        {
            var valor = linha[propriedade];
            return valor is null ? null : Convert.ToUInt32(valor);
        }
        catch
        {
            return null;
        }
    }

    private static ulong? InteiroGrande(ManagementBaseObject linha, string propriedade)
    {
        try
        {
            var valor = linha[propriedade];
            return valor is null ? null : Convert.ToUInt64(valor);
        }
        catch
        {
            return null;
        }
    }

    private static string? DataWmi(ManagementBaseObject linha, string propriedade)
    {
        try
        {
            var valor = linha[propriedade]?.ToString();
            if (string.IsNullOrEmpty(valor)) return null;
            return ManagementDateTimeConverter.ToDateTime(valor).ToString("yyyy-MM-dd HH:mm:ss");
        }
        catch
        {
            return null;
        }
    }
}
