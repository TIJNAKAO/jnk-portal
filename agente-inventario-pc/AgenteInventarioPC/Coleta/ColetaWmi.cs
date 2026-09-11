using System.Management;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Helpers de consulta WMI compartilhados entre os coletores
/// (ColetorHardware, ColetorVolumes, ColetorDrivers). Extraído daqui pra não
/// duplicar a mesma leitura defensiva de propriedade em cada arquivo novo.
/// </summary>
internal static class ColetaWmi
{
    internal const string Escopo = @"root\cimv2";

    internal static ManagementBaseObject? ConsultarUmaLinha(string query)
    {
        foreach (var linha in ConsultarVariasLinhas(query))
        {
            return linha;
        }
        return null;
    }

    internal static IEnumerable<ManagementBaseObject> ConsultarVariasLinhas(string query, string? escopo = null)
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

    internal static void RegistrarErroWmi(string query, Exception ex)
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

    internal static string? Texto(ManagementBaseObject linha, string propriedade)
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

    internal static uint? Inteiro(ManagementBaseObject linha, string propriedade)
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

    internal static ulong? InteiroGrande(ManagementBaseObject linha, string propriedade)
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

    internal static string? DataWmi(ManagementBaseObject linha, string propriedade)
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
