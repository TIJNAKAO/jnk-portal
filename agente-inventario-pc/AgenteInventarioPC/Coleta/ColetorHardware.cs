using System.Management;
using AgenteInventarioPC.Modelos;
using static AgenteInventarioPC.Coleta.ColetaWmi;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Consultas WMI (root\cimv2) pra hardware/SO. Cada método devolve null (ou
/// lista vazia) se a consulta falhar — uma classe WMI indisponível numa
/// máquina não pode derrubar a coleta inteira das outras.
/// </summary>
public static class ColetorHardware
{
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

        // Número de Ativo (Asset Tag) é um campo SMBIOS Type 3 (chassi), não
        // do BIOS — consulta separada. É padrão do SMBIOS, não proprietário
        // de fabricante: funciona igual em Dell/HP/Lenovo/montada.
        var chassi = ConsultarUmaLinha("SELECT SMBIOSAssetTag FROM Win32_SystemEnclosure");

        return new BiosInfo
        {
            Fabricante = Texto(linha, "Manufacturer"),
            NumeroSerie = Texto(linha, "SerialNumber")?.Trim(),
            Versao = Texto(linha, "Version"),
            AssetTag = chassi is null ? null : NormalizarAssetTag(Texto(chassi, "SMBIOSAssetTag")),
        };
    }

    // Fabricantes de placa-mãe deixam esse campo com um valor-padrão quando
    // ninguém nunca gravou um Número de Ativo de verdade — tratar como
    // "sem dado" evita a lista de Análises TI ficar cheia desses
    // placeholders assim que o agente 1.4.0 chegar no parque.
    private static readonly HashSet<string> PlaceholdersAssetTag = new(StringComparer.OrdinalIgnoreCase)
    {
        "No Asset Tag", "Not Specified", "Default string", "To Be Filled By O.E.M.", "0", "",
    };

    private static string? NormalizarAssetTag(string? valor)
    {
        var texto = valor?.Trim();
        if (string.IsNullOrEmpty(texto) || PlaceholdersAssetTag.Contains(texto)) return null;
        return texto;
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
}
