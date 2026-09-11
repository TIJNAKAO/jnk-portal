using AgenteInventarioPC.Modelos;
using static AgenteInventarioPC.Coleta.ColetaWmi;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Drivers assinados instalados (Win32_PnPSignedDriver). hardware_id é a
/// chave de comparação entre máquinas para achar "desatualizado" (Análises
/// TI, ver Specs/spec_modulo_ti.md seção 10.8) — nome do dispositivo pode
/// variar um pouco por instância/fabricante do mesmo chip, hardware_id
/// identifica o componente real. Sem filtro por classe de dispositivo nesta
/// primeira versão — traz tudo que está assinado.
/// </summary>
public static class ColetorDrivers
{
    public static List<DriverInfo> ColetarDrivers()
    {
        var lista = new List<DriverInfo>();
        foreach (var linha in ConsultarVariasLinhas(
            "SELECT DeviceName, Manufacturer, DriverVersion, DriverDate, HardWareID FROM Win32_PnPSignedDriver WHERE DeviceName IS NOT NULL"))
        {
            lista.Add(new DriverInfo
            {
                Nome = Texto(linha, "DeviceName"),
                Fabricante = Texto(linha, "Manufacturer"),
                Versao = Texto(linha, "DriverVersion"),
                DataVersao = DataWmi(linha, "DriverDate"),
                HardwareId = Texto(linha, "HardWareID"),
            });
        }
        return lista;
    }
}
