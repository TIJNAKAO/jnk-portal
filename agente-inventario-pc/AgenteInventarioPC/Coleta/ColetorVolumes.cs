using AgenteInventarioPC.Modelos;
using static AgenteInventarioPC.Coleta.ColetaWmi;

namespace AgenteInventarioPC.Coleta;

/// <summary>
/// Volumes lógicos (C:, D:...) — diferente de ColetorHardware.ColetarDiscos(),
/// que traz o disco FÍSICO inteiro. Um disco físico pode ter vários volumes;
/// filtra DriveType=3 (fixo) para deixar de fora unidade de rede, CD/DVD e
/// qualquer partição sem letra (ex: partição de recuperação).
/// Ver Specs/spec_modulo_ti.md, seção 10.3.
/// </summary>
public static class ColetorVolumes
{
    public static List<VolumeInfo> ColetarVolumes()
    {
        var lista = new List<VolumeInfo>();
        foreach (var linha in ConsultarVariasLinhas(
            "SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace FROM Win32_LogicalDisk WHERE DriveType = 3"))
        {
            lista.Add(new VolumeInfo
            {
                LetraUnidade = Texto(linha, "DeviceID"),
                Rotulo = Texto(linha, "VolumeName"),
                SistemaArquivos = Texto(linha, "FileSystem"),
                TamanhoBytes = InteiroGrande(linha, "Size"),
                EspacoLivreBytes = InteiroGrande(linha, "FreeSpace"),
            });
        }
        return lista;
    }
}
