using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using AgenteInventarioPC.Modelos;

namespace AgenteInventarioPC.Envio;

public class ResultadoEnvio
{
    public bool Sucesso { get; init; }
    public int StatusHttp { get; init; }
    public string? Mensagem { get; init; }
}

public class ApiClient
{
    private static readonly JsonSerializerOptions OpcoesJson = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _http;
    private readonly string _apiUrl;

    public ApiClient(string apiUrl, string apiKey)
    {
        _apiUrl = apiUrl;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(150) };
        _http.DefaultRequestHeaders.Add("X-Api-Key", apiKey);
    }

    public async Task<ResultadoEnvio> EnviarAsync(InventarioPayload payload)
    {
        try
        {
            using var resposta = await _http.PostAsJsonAsync(_apiUrl, payload, OpcoesJson);
            var corpo = await resposta.Content.ReadAsStringAsync();

            return new ResultadoEnvio
            {
                Sucesso = resposta.IsSuccessStatusCode,
                StatusHttp = (int) resposta.StatusCode,
                Mensagem = corpo,
            };
        }
        catch (Exception ex)
        {
            return new ResultadoEnvio { Sucesso = false, StatusHttp = 0, Mensagem = ex.Message };
        }
    }
}
