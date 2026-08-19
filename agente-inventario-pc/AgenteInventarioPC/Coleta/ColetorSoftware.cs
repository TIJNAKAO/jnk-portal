using Microsoft.Win32;
using AgenteInventarioPC.Modelos;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Lista de programas instalados via registro (chave Uninstall, 32 e 64
/// bits) — mesma fonte que o Painel de Controle "Programas e Recursos"
/// usa. Entradas sem DisplayName (componentes internos, hotfixes) são
/// ignoradas — não servem pra um relatório de inventário.
/// </summary>
public static class ColetorSoftware
{
    private const string ChaveDesinstalacao = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";

    public static List<SoftwareInfo> ColetarProgramasInstalados()
    {
        var lista = new List<SoftwareInfo>();
        ColetarDeRegistro(RegistryView.Registry32, lista);
        ColetarDeRegistro(RegistryView.Registry64, lista);
        return lista;
    }

    private static void ColetarDeRegistro(RegistryView view, List<SoftwareInfo> lista)
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var chave = baseKey.OpenSubKey(ChaveDesinstalacao);
            if (chave is null) return;

            foreach (var nomeSubchave in chave.GetSubKeyNames())
            {
                try
                {
                    using var subchave = chave.OpenSubKey(nomeSubchave);
                    if (subchave is null) continue;

                    var nome = subchave.GetValue("DisplayName") as string;
                    if (string.IsNullOrWhiteSpace(nome)) continue;

                    lista.Add(new SoftwareInfo
                    {
                        Nome = nome,
                        Versao = subchave.GetValue("DisplayVersion") as string,
                        Fabricante = subchave.GetValue("Publisher") as string,
                        DataInstalacao = subchave.GetValue("InstallDate") as string,
                        LocalInstalacao = subchave.GetValue("InstallLocation") as string,
                        TamanhoEstimadoKb = ConverterParaULong(subchave.GetValue("EstimatedSize")),
                    });
                }
                catch
                {
                    // Uma subchave corrompida/sem permissão não pode travar o resto da lista.
                }
            }
        }
        catch
        {
            // View 32-bit indisponível em alguns cenários (ex: SO 32-bit puro) — segue com a outra.
        }
    }

    private static ulong? ConverterParaULong(object? valor)
    {
        if (valor is null) return null;
        try
        {
            return Convert.ToUInt64(valor);
        }
        catch
        {
            return null;
        }
    }
}
