using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using Microsoft.Win32;
using AgenteInventarioPC.Modelos;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Histórico de dispositivos de armazenamento USB (pendrive/HD externo) já
/// conectados na máquina, lido de
/// HKLM\SYSTEM\CurrentControlSet\Enum\USBSTOR — o Windows preenche essa
/// chave sozinho pra todo pendrive/HD externo já plugado, mesmo sem
/// instalar nada (por isso não aparece na lista de programas instalados).
///
/// Não é log de todas as conexões — cada dispositivo tem uma linha só,
/// que o Windows atualiza a cada nova conexão. "Última vez visto" vem da
/// data de escrita da chave do registro (não exposta pelo
/// Microsoft.Win32.Registry — por isso o P/Invoke em RegQueryInfoKey).
/// </summary>
public static class ColetorUsb
{
    private const string ChaveUsbStor = @"SYSTEM\CurrentControlSet\Enum\USBSTOR";

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegQueryInfoKey(
        SafeHandle hKey,
        StringBuilder? lpClass,
        ref uint lpcchClass,
        IntPtr lpReserved,
        out uint lpcSubKeys,
        out uint lpcbMaxSubKeyLen,
        out uint lpcbMaxClassLen,
        out uint lpcValues,
        out uint lpcbMaxValueNameLen,
        out uint lpcbMaxValueLen,
        out uint lpcbSecurityDescriptor,
        out FILETIME lpftLastWriteTime);

    public static List<DispositivoUsbInfo> ColetarDispositivosArmazenamento()
    {
        var lista = new List<DispositivoUsbInfo>();
        try
        {
            using var chaveUsbStor = Registry.LocalMachine.OpenSubKey(ChaveUsbStor);
            if (chaveUsbStor is null)
            {
                return lista;
            }

            foreach (var nomeClasse in chaveUsbStor.GetSubKeyNames())
            {
                try
                {
                    using var chaveClasse = chaveUsbStor.OpenSubKey(nomeClasse);
                    if (chaveClasse is null)
                    {
                        continue;
                    }

                    var (fabricante, modelo, revisao) = InterpretarNomeClasse(nomeClasse);

                    foreach (var idInstancia in chaveClasse.GetSubKeyNames())
                    {
                        try
                        {
                            using var chaveInstancia = chaveClasse.OpenSubKey(idInstancia);
                            if (chaveInstancia is null)
                            {
                                continue;
                            }

                            // Windows usa sufixo "&0" quando o dispositivo não informa
                            // um número de série de verdade — nesse caso não dá pra
                            // rastrear esse item com segurança entre coletas.
                            var numeroSerie = idInstancia.EndsWith("&0", StringComparison.Ordinal) ? null : idInstancia;

                            lista.Add(new DispositivoUsbInfo
                            {
                                Fabricante = fabricante,
                                Modelo = modelo,
                                Revisao = revisao,
                                NumeroSerie = numeroSerie,
                                NomeAmigavel = chaveInstancia.GetValue("FriendlyName") as string,
                                UltimaVezVisto = ObterUltimaEscrita(chaveInstancia)?.ToString("yyyy-MM-dd HH:mm:ss"),
                            });
                        }
                        catch
                        {
                            // Uma instância corrompida/sem permissão não pode travar o resto da lista.
                        }
                    }
                }
                catch
                {
                }
            }
        }
        catch
        {
            // Chave inexistente (nunca usou USB) ou sem permissão — devolve lista vazia.
        }
        return lista;
    }

    private static (string? fabricante, string? modelo, string? revisao) InterpretarNomeClasse(string nomeClasse)
    {
        // Formato típico: "Disk&Ven_Kingston&Prod_DataTraveler_3.0&Rev_PMAP"
        string? fabricante = null;
        string? modelo = null;
        string? revisao = null;

        foreach (var parte in nomeClasse.Split('&'))
        {
            if (parte.StartsWith("Ven_", StringComparison.OrdinalIgnoreCase))
            {
                fabricante = parte[4..].Replace('_', ' ').Trim();
            }
            else if (parte.StartsWith("Prod_", StringComparison.OrdinalIgnoreCase))
            {
                modelo = parte[5..].Replace('_', ' ').Trim();
            }
            else if (parte.StartsWith("Rev_", StringComparison.OrdinalIgnoreCase))
            {
                revisao = parte[4..].Trim();
            }
        }

        return (fabricante, modelo, revisao);
    }

    private static DateTime? ObterUltimaEscrita(RegistryKey chave)
    {
        try
        {
            uint lpcchClass = 0;
            var resultado = RegQueryInfoKey(
                chave.Handle, null, ref lpcchClass, IntPtr.Zero,
                out _, out _, out _, out _, out _, out _, out _,
                out var filetime);

            if (resultado != 0)
            {
                return null;
            }

            long ft = ((long) filetime.dwHighDateTime << 32) | (uint) filetime.dwLowDateTime;
            if (ft <= 0)
            {
                return null;
            }

            return DateTime.FromFileTime(ft);
        }
        catch
        {
            return null;
        }
    }
}
