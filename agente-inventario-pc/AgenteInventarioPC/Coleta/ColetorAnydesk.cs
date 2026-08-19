namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Lê o ID do AnyDesk direto do arquivo de configuração dele (system.conf),
/// sem precisar rodar o AnyDesk.exe. Fica em ProgramData quando o AnyDesk
/// está instalado como serviço (caso normal de uma instalação via winget),
/// ou em AppData quando é uma instalação por usuário/portátil.
/// </summary>
public static class ColetorAnydesk
{
    private const string ChaveId = "ad.anynet.id=";

    public static string? Coletar()
    {
        var candidatos = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AnyDesk", "system.conf"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AnyDesk", "system.conf"),
        };

        foreach (var caminho in candidatos)
        {
            var id = LerIdDoArquivo(caminho);
            if (id != null)
            {
                return id;
            }
        }

        return null;
    }

    private static string? LerIdDoArquivo(string caminho)
    {
        if (!File.Exists(caminho))
        {
            return null;
        }

        try
        {
            foreach (var linha in File.ReadAllLines(caminho))
            {
                if (linha.StartsWith(ChaveId, StringComparison.OrdinalIgnoreCase))
                {
                    var valor = linha[ChaveId.Length..].Trim();
                    return valor.Length > 0 ? valor : null;
                }
            }
        }
        catch
        {
            // Arquivo bloqueado/sem permissão de leitura — segue sem o ID,
            // não é motivo pra travar a coleta inteira.
        }

        return null;
    }
}
