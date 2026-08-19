using System.Text.Json;

namespace AgenteInventarioPC.Configuracao;

public class ConfiguracaoAgente
{
    public string ApiUrl { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public int? IdEmpresa { get; set; }

    /// <summary>
    /// Lê appsettings.json de ao lado do .exe. Lança exceção se o arquivo
    /// não existir ou faltar ApiUrl/ApiKey — sem isso o agente não tem pra
    /// onde enviar nada, então não faz sentido seguir rodando.
    /// </summary>
    public static ConfiguracaoAgente Carregar()
    {
        var caminho = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        if (!File.Exists(caminho))
        {
            throw new FileNotFoundException($"Arquivo de configuração não encontrado: {caminho}");
        }

        var json = File.ReadAllText(caminho);
        var config = JsonSerializer.Deserialize<ConfiguracaoAgente>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (config is null || string.IsNullOrWhiteSpace(config.ApiUrl) || string.IsNullOrWhiteSpace(config.ApiKey))
        {
            throw new InvalidOperationException("appsettings.json precisa ter ApiUrl e ApiKey preenchidos.");
        }

        return config;
    }
}
