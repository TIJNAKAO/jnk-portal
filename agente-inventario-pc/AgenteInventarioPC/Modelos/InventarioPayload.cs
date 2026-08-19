using System.Text.Json.Serialization;

namespace AgenteInventarioPC.Modelos;

/// <summary>
/// Espelha exatamente o corpo JSON esperado por POST /api/ti/inventario
/// (apps/api deste monorepo). Qualquer mudança aqui precisa acompanhar uma
/// mudança lá — os nomes dos campos JSON são o contrato entre as duas
/// pontas.
/// </summary>
public class InventarioPayload
{
    [JsonPropertyName("computador")]
    public ComputadorInfo Computador { get; set; } = new();

    [JsonPropertyName("coleta")]
    public ColetaInfo Coleta { get; set; } = new();

    [JsonPropertyName("sistema_operacional")]
    public SistemaOperacionalInfo? SistemaOperacional { get; set; }

    [JsonPropertyName("processador")]
    public ProcessadorInfo? Processador { get; set; }

    [JsonPropertyName("placa_mae")]
    public PlacaMaeInfo? PlacaMae { get; set; }

    [JsonPropertyName("bios")]
    public BiosInfo? Bios { get; set; }

    [JsonPropertyName("memoria_ram")]
    public List<MemoriaRamInfo> MemoriaRam { get; set; } = new();

    [JsonPropertyName("disco")]
    public List<DiscoInfo> Disco { get; set; } = new();

    [JsonPropertyName("rede")]
    public List<RedeInfo> Rede { get; set; } = new();

    [JsonPropertyName("periferico")]
    public List<PerifericoInfo> Periferico { get; set; } = new();

    [JsonPropertyName("software")]
    public List<SoftwareInfo> Software { get; set; } = new();

    [JsonPropertyName("dispositivo_usb")]
    public List<DispositivoUsbInfo> DispositivoUsb { get; set; } = new();
}

public class ComputadorInfo
{
    [JsonPropertyName("nome")]
    public string Nome { get; set; } = "";

    [JsonPropertyName("id_empresa")]
    public int? IdEmpresa { get; set; }

    [JsonPropertyName("serial_bios")]
    public string? SerialBios { get; set; }

    [JsonPropertyName("serial_placa_mae")]
    public string? SerialPlacaMae { get; set; }
}

public class ColetaInfo
{
    [JsonPropertyName("coletado_em")]
    public string ColetadoEm { get; set; } = "";

    [JsonPropertyName("usuario_windows")]
    public string? UsuarioWindows { get; set; }

    [JsonPropertyName("ip_local")]
    public string? IpLocal { get; set; }

    [JsonPropertyName("versao_agente")]
    public string? VersaoAgente { get; set; }

    [JsonPropertyName("anydesk_id")]
    public string? AnydeskId { get; set; }
}

public class SistemaOperacionalInfo
{
    [JsonPropertyName("caption")]
    public string? Caption { get; set; }

    [JsonPropertyName("versao")]
    public string? Versao { get; set; }

    [JsonPropertyName("build_number")]
    public string? BuildNumber { get; set; }

    [JsonPropertyName("arquitetura")]
    public string? Arquitetura { get; set; }

    [JsonPropertyName("data_instalacao")]
    public string? DataInstalacao { get; set; }

    [JsonPropertyName("ultimo_boot")]
    public string? UltimoBoot { get; set; }

    [JsonPropertyName("usuario_registrado")]
    public string? UsuarioRegistrado { get; set; }

    [JsonPropertyName("numero_serie")]
    public string? NumeroSerie { get; set; }
}

public class ProcessadorInfo
{
    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("processor_id")]
    public string? ProcessorId { get; set; }

    [JsonPropertyName("velocidade_atual_mhz")]
    public uint? VelocidadeAtualMhz { get; set; }

    [JsonPropertyName("velocidade_maxima_mhz")]
    public uint? VelocidadeMaximaMhz { get; set; }

    [JsonPropertyName("cache_l2_kb")]
    public uint? CacheL2Kb { get; set; }

    [JsonPropertyName("cache_l3_kb")]
    public uint? CacheL3Kb { get; set; }

    [JsonPropertyName("numero_nucleos")]
    public uint? NumeroNucleos { get; set; }

    [JsonPropertyName("numero_nucleos_habilitados")]
    public uint? NumeroNucleosHabilitados { get; set; }

    [JsonPropertyName("numero_processadores_logicos")]
    public uint? NumeroProcessadoresLogicos { get; set; }
}

public class PlacaMaeInfo
{
    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("modelo")]
    public string? Modelo { get; set; }

    [JsonPropertyName("produto")]
    public string? Produto { get; set; }

    [JsonPropertyName("numero_serie")]
    public string? NumeroSerie { get; set; }

    [JsonPropertyName("versao")]
    public string? Versao { get; set; }
}

public class BiosInfo
{
    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("numero_serie")]
    public string? NumeroSerie { get; set; }

    [JsonPropertyName("versao")]
    public string? Versao { get; set; }
}

public class MemoriaRamInfo
{
    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("banco")]
    public string? Banco { get; set; }

    [JsonPropertyName("slot")]
    public string? Slot { get; set; }

    [JsonPropertyName("capacidade_bytes")]
    public ulong? CapacidadeBytes { get; set; }

    [JsonPropertyName("velocidade_mhz")]
    public uint? VelocidadeMhz { get; set; }

    [JsonPropertyName("part_number")]
    public string? PartNumber { get; set; }

    [JsonPropertyName("numero_serie")]
    public string? NumeroSerie { get; set; }
}

public class DiscoInfo
{
    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("modelo")]
    public string? Modelo { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    // "interface" é palavra reservada em C# — o nome da propriedade é
    // diferente, só o JSON enviado usa "interface" (via JsonPropertyName).
    [JsonPropertyName("interface")]
    public string? TipoInterface { get; set; }

    [JsonPropertyName("firmware")]
    public string? Firmware { get; set; }

    [JsonPropertyName("numero_serie")]
    public string? NumeroSerie { get; set; }

    [JsonPropertyName("tamanho_bytes")]
    public ulong? TamanhoBytes { get; set; }

    [JsonPropertyName("numero_particoes")]
    public uint? NumeroParticoes { get; set; }

    [JsonPropertyName("tipo_midia")]
    public string? TipoMidia { get; set; }

    [JsonPropertyName("barramento")]
    public string? Barramento { get; set; }
}

public class RedeInfo
{
    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("tipo_adaptador")]
    public string? TipoAdaptador { get; set; }

    [JsonPropertyName("mac_address")]
    public string? MacAddress { get; set; }

    [JsonPropertyName("velocidade_bps")]
    public ulong? VelocidadeBps { get; set; }
}

public class PerifericoInfo
{
    [JsonPropertyName("tipo")]
    public string Tipo { get; set; } = "";

    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("descricao")]
    public string? Descricao { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("device_id")]
    public string? DeviceId { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }
}

public class SoftwareInfo
{
    [JsonPropertyName("nome")]
    public string Nome { get; set; } = "";

    [JsonPropertyName("versao")]
    public string? Versao { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("data_instalacao")]
    public string? DataInstalacao { get; set; }

    [JsonPropertyName("local_instalacao")]
    public string? LocalInstalacao { get; set; }

    [JsonPropertyName("tamanho_estimado_kb")]
    public ulong? TamanhoEstimadoKb { get; set; }
}

public class DispositivoUsbInfo
{
    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("modelo")]
    public string? Modelo { get; set; }

    [JsonPropertyName("revisao")]
    public string? Revisao { get; set; }

    [JsonPropertyName("numero_serie")]
    public string? NumeroSerie { get; set; }

    [JsonPropertyName("nome_amigavel")]
    public string? NomeAmigavel { get; set; }

    [JsonPropertyName("ultima_vez_visto")]
    public string? UltimaVezVisto { get; set; }
}
