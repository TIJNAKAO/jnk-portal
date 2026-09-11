# Análises TI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o agrupamento de menu "Análises TI" no módulo TI — dashboard executivo, dois relatórios de exceção (programas e drivers desatualizados), e as mudanças de schema/agente que os viabilizam (volumes lógicos, drivers, Número de Ativo).

**Architecture:** Backend segue o padrão já estabelecido no módulo TI — rota Express com SQL inline (sem camada de serviço separada), consultando sempre a última coleta de cada equipamento ativo via subquery correlacionada. Frontend usa os mesmos componentes de grade/ordenação/busca já existentes (`ThOrdenavel`, `CampoBusca`, `useOrdenacao`) e `CardGrafico`/Recharts pro dashboard, igual ao `DashboardPage` de Faturamento. Agente .NET ganha dois coletores WMI novos e um campo a mais no coletor de BIOS, tudo opcional no payload (mesma regra de sempre: uma seção ausente não derruba as outras).

**Tech Stack:** Node/Express + mysql2 (API), React 18 + Vite + Tailwind + Recharts (portal), C#/.NET 8 + `System.Management` (agente), MySQL 8.

**Spec:** `Specs/spec_modulo_ti.md`, seção 10 (Análises TI).

## Global Constraints

- Idioma português em código/comentários/commits; commits sem acentos.
- `apps/api` é ESM — imports com extensão `.js` mesmo para arquivos `.ts`.
- Módulo TI não usa camada de serviço separada pras rotas de consulta — SQL fica inline no arquivo de rota (`tiEquipamentos.ts`, `tiSoftwaresAprovados.ts` são a referência). Não introduzir `services/ti*.ts` novo pra isso.
- Nenhuma rota do módulo TI (nem do resto do projeto) tem teste automatizado — só funções puras ganham teste (ex: `tiIngestaoFuso.test.ts`). Verificação das rotas novas é `npm run typecheck` + suíte completa (sem regressão) + descrição do teste manual esperado.
- O agente .NET não tem framework de teste configurado — verificação é `dotnet build` limpo (0 erros/avisos), mesma regra já documentada na seção 9 do spec.
- Migrations em `apps/api/db/NNN_*.sql`, numeração sequencial e imutável após aplicada. Próximo número livre: `036`.
- Seedar `telas_modulo` não concede permissão a ninguém — migration de seed nunca insere em tabela de perfil/permissão.
- A linha em `telas_modulo` só pode ser seedada depois que a rota/tela existir — a migration de seed do menu é a última tarefa deste plano.
- `ti_equipamento.filial_id`/campos são todos `NULL`-áveis — nenhuma query nova pode assumir presença obrigatória de filial/departamento/coleta.
- Todo campo novo do payload do agente é opcional na ingestão — payload de agente antigo (sem `volume`/`driver`/`asset_tag`) continua sendo aceito integralmente.
- Comparação de versão para "desatualizado" (software e driver) é textual (`MAX()`/`ORDER BY` do MySQL sobre a coluna `VARCHAR`), não semver-aware — limitação aceita e documentada no spec (seção 10.7).

---

### Task 1: Extrair helpers WMI compartilhados no agente

**Files:**
- Create: `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetaWmi.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorHardware.cs`

**Interfaces:**
- Produces: `internal static class ColetaWmi` com `ConsultarUmaLinha(string query)`, `ConsultarVariasLinhas(string query, string? escopo = null)`, `Texto(ManagementBaseObject, string)`, `Inteiro(ManagementBaseObject, string)`, `InteiroGrande(ManagementBaseObject, string)`, `DataWmi(ManagementBaseObject, string)`, `RegistrarErroWmi(string query, Exception ex)` — usados pelas Tasks 3 e 4 via `using static`.

As Tasks 3 e 4 vão precisar exatamente dos mesmos helpers WMI que `ColetorHardware.cs` já tem como métodos privados. Extrair antes evita duplicar esse bloco pela segunda e terceira vez.

- [ ] **Step 1: Criar o arquivo compartilhado**

Crie `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetaWmi.cs` movendo o conteúdo exato dos métodos privados de `ColetorHardware.cs` (`ConsultarUmaLinha`, `ConsultarVariasLinhas`, `RegistrarErroWmi`, `Texto`, `Inteiro`, `InteiroGrande`, `DataWmi`, mais o campo `CaminhoLog` e a constante `Escopo`), trocando `private` por `internal` (visibilidade dentro do projeto, não `public`):

```csharp
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
```

- [ ] **Step 2: Atualizar `ColetorHardware.cs` pra usar o helper compartilhado**

No topo do arquivo, junto dos demais `using`:

```csharp
using static AgenteInventarioPC.Coleta.ColetaWmi;
```

Remova de `ColetorHardware.cs` os métodos/campos que agora moraram em `ColetaWmi.cs`: `ConsultarUmaLinha`, `ConsultarVariasLinhas`, `RegistrarErroWmi`, `CaminhoLog`, `Texto`, `Inteiro`, `InteiroGrande`, `DataWmi`, e a constante `Escopo` (mantenha `EscopoStorage`, que é específica de `ColetorHardware`). Como o `using static` traz os nomes pro escopo, **nenhum call site precisa mudar** — `Texto(linha, "Caption")` continua funcionando igual.

- [ ] **Step 3: Compilar**

```bash
cd agente-inventario-pc/AgenteInventarioPC
dotnet build
```

Esperado: `Build succeeded`, 0 erros, 0 avisos novos.

- [ ] **Step 4: Commit**

```bash
git add agente-inventario-pc/AgenteInventarioPC/Coleta/ColetaWmi.cs agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorHardware.cs
git commit -m "Agente extrai helpers WMI compartilhados para ColetaWmi.cs"
```

---

### Task 2: Schema novo — volumes lógicos, drivers, Número de Ativo

**Files:**
- Create: `apps/api/db/036_ti_analises_schema.sql`

**Interfaces:**
- Produces: tabelas `ti_volume`, `ti_driver`; colunas `ti_bios.asset_tag`, `ti_equipamento.asset_tag`. Consumidas pela Task 6 (ingestão) e pelas Tasks 8/10/12 (relatórios).

- [ ] **Step 1: Escrever a migration**

Crie `apps/api/db/036_ti_analises_schema.sql`:

```sql
-- Analises TI (Specs/spec_modulo_ti.md, secao 10): volumes logicos,
-- drivers instalados e Numero de Ativo (Asset Tag) da BIOS.

-- Volumes logicos (C:, D:...) -- diferente de ti_disco, que e o disco
-- FISICO. Um disco fisico pode ter varios volumes; o agente filtra
-- DriveType=3 (fixo) na coleta.
CREATE TABLE IF NOT EXISTS ti_volume (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta          INT NOT NULL,
    letra_unidade      VARCHAR(5)   NULL,
    rotulo             VARCHAR(100) NULL,
    sistema_arquivos   VARCHAR(20)  NULL,
    tamanho_bytes      BIGINT UNSIGNED NULL,
    espaco_livre_bytes BIGINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Drivers assinados instalados (Win32_PnPSignedDriver). hardware_id e a
-- chave de comparacao entre maquinas para achar "desatualizado" -- nome do
-- dispositivo pode variar um pouco por instancia/fabricante do mesmo chip,
-- hardware_id identifica o componente real.
CREATE TABLE IF NOT EXISTS ti_driver (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta      INT NOT NULL,
    nome           VARCHAR(255) NULL,
    fabricante     VARCHAR(150) NULL,
    versao         VARCHAR(100) NULL,
    data_versao    DATETIME NULL,
    hardware_id    VARCHAR(255) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta),
    INDEX idx_hardware_id (hardware_id(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Numero de Ativo: mesmo tratamento de serial_bios/serial_placa_mae (ver
-- Specs/spec_modulo_ti.md, secao 4) -- capturado por coleta em ti_bios,
-- copiado pra ti_equipamento no upsert da ingestao.
ALTER TABLE ti_bios ADD COLUMN asset_tag VARCHAR(100) NULL AFTER numero_serie;
ALTER TABLE ti_equipamento ADD COLUMN asset_tag VARCHAR(100) NULL AFTER patrimonio;
```

- [ ] **Step 2: Aplicar e verificar**

```bash
npm run db:migrate
```

Esperado: `036_ti_analises_schema.sql` aplicada.

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/api/db/036_ti_analises_schema.sql
git commit -m "Schema ganha ti_volume, ti_driver e asset_tag para Analises TI"
```

---

### Task 3: Agente — coletor de volumes lógicos

**Files:**
- Create: `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorVolumes.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Program.cs`

**Interfaces:**
- Consumes: `ColetaWmi` (Task 1).
- Produces: `ColetorVolumes.ColetarVolumes(): List<VolumeInfo>`; `InventarioPayload.Volume: List<VolumeInfo>` (JSON `"volume"`). Consumido pela Task 6 (`payload.volume` no backend).

- [ ] **Step 1: Criar o coletor**

Crie `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorVolumes.cs`:

```csharp
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
```

- [ ] **Step 2: Adicionar `VolumeInfo` e o campo `Volume` no payload**

Em `agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs`, dentro da classe `InventarioPayload`, junto dos demais `List<...>`:

```csharp
    [JsonPropertyName("volume")]
    public List<VolumeInfo> Volume { get; set; } = new();
```

E a classe nova, no fim do arquivo:

```csharp
public class VolumeInfo
{
    [JsonPropertyName("letra_unidade")]
    public string? LetraUnidade { get; set; }

    [JsonPropertyName("rotulo")]
    public string? Rotulo { get; set; }

    [JsonPropertyName("sistema_arquivos")]
    public string? SistemaArquivos { get; set; }

    [JsonPropertyName("tamanho_bytes")]
    public ulong? TamanhoBytes { get; set; }

    [JsonPropertyName("espaco_livre_bytes")]
    public ulong? EspacoLivreBytes { get; set; }
}
```

- [ ] **Step 3: Ligar no `Program.cs`**

Em `agente-inventario-pc/AgenteInventarioPC/Program.cs`, no objeto `payload`, junto de `DispositivoUsb = ColetorUsb.ColetarDispositivosArmazenamento(),`:

```csharp
        Volume = ColetorVolumes.ColetarVolumes(),
```

E na linha de log que já conta itens coletados (`Log($"  {payload.MemoriaRam.Count} pente(s)...`), acrescente a contagem de volumes:

```csharp
    Log(
        $"  {payload.MemoriaRam.Count} pente(s) de memória, {payload.Disco.Count} disco(s), " +
        $"{payload.Volume.Count} volume(s), " +
        $"{payload.Rede.Count} rede(s) conectada(s), {payload.Software.Count} programa(s) instalado(s), " +
        $"{payload.DispositivoUsb.Count} dispositivo(s) USB conhecido(s), " +
        $"AnyDesk ID: {payload.Coleta.AnydeskId ?? "não encontrado"}.");
```

- [ ] **Step 4: Compilar**

```bash
cd agente-inventario-pc/AgenteInventarioPC
dotnet build
```

Esperado: `Build succeeded`, 0 erros/avisos.

- [ ] **Step 5: Commit**

```bash
git add agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorVolumes.cs agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs agente-inventario-pc/AgenteInventarioPC/Program.cs
git commit -m "Agente ganha coletor de volumes logicos (espaco usado/livre)"
```

---

### Task 4: Agente — coletor de drivers

**Files:**
- Create: `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorDrivers.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Program.cs`

**Interfaces:**
- Consumes: `ColetaWmi` (Task 1).
- Produces: `ColetorDrivers.ColetarDrivers(): List<DriverInfo>`; `InventarioPayload.Driver: List<DriverInfo>` (JSON `"driver"`). Consumido pela Task 6.

- [ ] **Step 1: Criar o coletor**

Crie `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorDrivers.cs`:

```csharp
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
```

- [ ] **Step 2: Adicionar `DriverInfo` e o campo `Driver` no payload**

Em `InventarioPayload.cs`, dentro da classe `InventarioPayload`:

```csharp
    [JsonPropertyName("driver")]
    public List<DriverInfo> Driver { get; set; } = new();
```

E a classe nova, no fim do arquivo:

```csharp
public class DriverInfo
{
    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    [JsonPropertyName("fabricante")]
    public string? Fabricante { get; set; }

    [JsonPropertyName("versao")]
    public string? Versao { get; set; }

    [JsonPropertyName("data_versao")]
    public string? DataVersao { get; set; }

    [JsonPropertyName("hardware_id")]
    public string? HardwareId { get; set; }
}
```

- [ ] **Step 3: Ligar no `Program.cs`**

Junto de `Volume = ColetorVolumes.ColetarVolumes(),` (Task 3):

```csharp
        Driver = ColetorDrivers.ColetarDrivers(),
```

E na linha de log, acrescente a contagem de drivers junto da de volumes:

```csharp
        $"{payload.Volume.Count} volume(s), {payload.Driver.Count} driver(s), " +
```

- [ ] **Step 4: Compilar**

```bash
cd agente-inventario-pc/AgenteInventarioPC
dotnet build
```

Esperado: `Build succeeded`, 0 erros/avisos.

- [ ] **Step 5: Commit**

```bash
git add agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorDrivers.cs agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs agente-inventario-pc/AgenteInventarioPC/Program.cs
git commit -m "Agente ganha coletor de drivers assinados"
```

---

### Task 5: Agente — Número de Ativo da BIOS e versão 1.4.0

**Files:**
- Modify: `agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorHardware.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs`
- Modify: `agente-inventario-pc/AgenteInventarioPC/Program.cs`

**Interfaces:**
- Produces: `BiosInfo.AssetTag`, `ComputadorInfo.AssetTag` (JSON `bios.asset_tag`, `computador.asset_tag`); `VersaoAgente = "1.4.0"`. Consumido pela Task 6.

- [ ] **Step 1: `ColetarBios()` ganha o Asset Tag**

Em `ColetorHardware.cs`, troque o método `ColetarBios()` inteiro por:

```csharp
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
```

- [ ] **Step 2: `BiosInfo`/`ComputadorInfo` ganham `AssetTag`**

Em `InventarioPayload.cs`, na classe `BiosInfo`:

```csharp
    [JsonPropertyName("asset_tag")]
    public string? AssetTag { get; set; }
```

E na classe `ComputadorInfo` (mesmo padrão de `SerialBios`/`SerialPlacaMae`):

```csharp
    [JsonPropertyName("asset_tag")]
    public string? AssetTag { get; set; }
```

- [ ] **Step 3: Copiar pra `Computador` e subir a versão no `Program.cs`**

Em `Program.cs`, troque:

```csharp
const string VersaoAgente = "1.3.0";
```

por:

```csharp
const string VersaoAgente = "1.4.0";
```

E junto das duas linhas que já copiam serial do Bios pro Computador (`payload.Computador.SerialBios = payload.Bios?.NumeroSerie;`), acrescente:

```csharp
    payload.Computador.AssetTag = payload.Bios?.AssetTag;
```

- [ ] **Step 4: Compilar**

```bash
cd agente-inventario-pc/AgenteInventarioPC
dotnet build
```

Esperado: `Build succeeded`, 0 erros/avisos.

- [ ] **Step 5: Commit**

```bash
git add agente-inventario-pc/AgenteInventarioPC/Coleta/ColetorHardware.cs agente-inventario-pc/AgenteInventarioPC/Modelos/InventarioPayload.cs agente-inventario-pc/AgenteInventarioPC/Program.cs
git commit -m "Agente coleta Numero de Ativo da BIOS e sobe para versao 1.4.0"
```

---

### Task 6: Backend — ingestão aceita volume, driver e asset_tag

**Files:**
- Modify: `apps/api/src/types/tiPayload.ts`
- Modify: `apps/api/src/services/tiIngestao.ts`

**Interfaces:**
- Consumes: contrato JSON das Tasks 3, 4, 5 (`volume[]`, `driver[]`, `bios.asset_tag`, `computador.asset_tag`).
- Produces: linhas em `ti_volume`/`ti_driver`, coluna `asset_tag` preenchida em `ti_bios`/`ti_equipamento`. Consumido pelas Tasks 8/10/12 (relatórios lêem essas tabelas/colunas).

- [ ] **Step 1: Atualizar o tipo do payload**

Em `apps/api/src/types/tiPayload.ts`, troque o bloco `computador` para incluir `asset_tag`:

```ts
  computador: {
    nome: string;
    id_empresa?: number | null; // interpretado como filial_id
    serial_bios?: string | null;
    serial_placa_mae?: string | null;
    asset_tag?: string | null;
  };
```

E acrescente, junto de `dispositivo_usb`:

```ts
  volume?: Record<string, unknown>[];
  driver?: Record<string, unknown>[];
```

- [ ] **Step 2: Upsert de `ti_equipamento` ganha `asset_tag`**

Em `apps/api/src/services/tiIngestao.ts`, dentro de `processarInventario`, junto de `const serialPlacaMae = valor(payload.computador, 'serial_placa_mae');`:

```ts
    const assetTag = valor(payload.computador, 'asset_tag');
```

No `INSERT` (equipamento novo), troque:

```ts
      const [resultado] = await connection.query<ResultSetHeader>(
        `INSERT INTO ti_equipamento (nome_computador, filial_id, serial_bios, serial_placa_mae, primeira_coleta_em, ultima_coleta_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nomeComputador, filialId, serialBios, serialPlacaMae, coletadoEm, coletadoEm],
      );
```

por:

```ts
      const [resultado] = await connection.query<ResultSetHeader>(
        `INSERT INTO ti_equipamento (nome_computador, filial_id, serial_bios, serial_placa_mae, asset_tag, primeira_coleta_em, ultima_coleta_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nomeComputador, filialId, serialBios, serialPlacaMae, assetTag, coletadoEm, coletadoEm],
      );
```

E no `UPDATE` (equipamento existente), troque:

```ts
      await connection.query(
        `UPDATE ti_equipamento SET
           filial_id = COALESCE(?, filial_id),
           serial_bios = COALESCE(?, serial_bios),
           serial_placa_mae = COALESCE(?, serial_placa_mae),
           ultima_coleta_em = ?
         WHERE id = ?`,
        [filialId, serialBios, serialPlacaMae, coletadoEm, idEquipamento],
      );
```

por:

```ts
      await connection.query(
        `UPDATE ti_equipamento SET
           filial_id = COALESCE(?, filial_id),
           serial_bios = COALESCE(?, serial_bios),
           serial_placa_mae = COALESCE(?, serial_placa_mae),
           asset_tag = COALESCE(?, asset_tag),
           ultima_coleta_em = ?
         WHERE id = ?`,
        [filialId, serialBios, serialPlacaMae, assetTag, coletadoEm, idEquipamento],
      );
```

- [ ] **Step 3: Insert de `ti_bios` ganha `asset_tag`**

Troque:

```ts
    const bios = payload.bios;
    if (bios) {
      await connection.query(
        `INSERT INTO ti_bios (id_coleta, fabricante, numero_serie, versao) VALUES (?, ?, ?, ?)`,
        [idColeta, valor(bios, 'fabricante'), valor(bios, 'numero_serie'), valor(bios, 'versao')],
      );
    }
```

por:

```ts
    const bios = payload.bios;
    if (bios) {
      await connection.query(
        `INSERT INTO ti_bios (id_coleta, fabricante, numero_serie, versao, asset_tag) VALUES (?, ?, ?, ?, ?)`,
        [idColeta, valor(bios, 'fabricante'), valor(bios, 'numero_serie'), valor(bios, 'versao'), valor(bios, 'asset_tag')],
      );
    }
```

- [ ] **Step 4: Gravar `ti_volume`/`ti_driver` em lote**

Logo após o bloco que insere `ti_dispositivo_usb` (último `inserirEmLote` da função, antes do `return`), acrescente:

```ts
    await inserirEmLote(
      connection,
      'ti_volume',
      ['id_coleta', 'letra_unidade', 'rotulo', 'sistema_arquivos', 'tamanho_bytes', 'espaco_livre_bytes'],
      (payload.volume ?? []).map((item) => [
        idColeta,
        valor(item, 'letra_unidade'),
        valor(item, 'rotulo'),
        valor(item, 'sistema_arquivos'),
        valor(item, 'tamanho_bytes'),
        valor(item, 'espaco_livre_bytes'),
      ]),
    );

    await inserirEmLote(
      connection,
      'ti_driver',
      ['id_coleta', 'nome', 'fabricante', 'versao', 'data_versao', 'hardware_id'],
      (payload.driver ?? []).map((item) => [
        idColeta,
        valor(item, 'nome'),
        valor(item, 'fabricante'),
        valor(item, 'versao'),
        valor(item, 'data_versao'),
        valor(item, 'hardware_id'),
      ]),
    );
```

- [ ] **Step 5: Verificar tipos e a suíte inteira**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando (nenhum teste cobre `tiIngestao.ts` diretamente hoje — `tiIngestaoFuso.test.ts` testa só `coletadoEmBrasilia`, que não muda aqui — então o esperado é "sem regressão", não novos testes passando).

- [ ] **Step 6: Teste manual**

Com a API rodando localmente (`npm run dev:api`) e um token válido em `ti_api_token`, envie um payload de teste incluindo `volume`/`driver`/`bios.asset_tag`/`computador.asset_tag` pra `POST /api/ti/inventario` (header `X-Api-Key`) e confirme nas tabelas `ti_volume`, `ti_driver`, `ti_bios.asset_tag`, `ti_equipamento.asset_tag` que os dados chegaram. Confirme também que um payload **sem** esses três campos (payload antigo) continua sendo aceito sem erro.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types/tiPayload.ts apps/api/src/services/tiIngestao.ts
git commit -m "Ingestao de TI grava volumes, drivers e numero de ativo"
```

---

### Task 7: Equipamentos ganha resumo de disco na lista

**Files:**
- Modify: `apps/api/src/routes/tiEquipamentos.ts`
- Modify: `apps/portal/src/pages/ti/EquipamentosPage.tsx`

**Interfaces:**
- Produces: campo `disco_total_bytes` em `GET /api/ti/equipamentos`.

Completa o requisito de "lista resumo com HD" (spec, seção 10.1) sem tela nova — a consulta já soma RAM da mesma forma.

- [ ] **Step 1: Backend — somar `ti_disco.tamanho_bytes` da última coleta**

Em `apps/api/src/routes/tiEquipamentos.ts`, no `SELECT` da rota `GET '/'`, troque:

```ts
        (SELECT COALESCE(SUM(r.capacidade_bytes), 0) FROM ti_memoria_ram r WHERE r.id_coleta = uc.id) AS ram_total_bytes
```

por:

```ts
        (SELECT COALESCE(SUM(r.capacidade_bytes), 0) FROM ti_memoria_ram r WHERE r.id_coleta = uc.id) AS ram_total_bytes,
        (SELECT COALESCE(SUM(dk.tamanho_bytes), 0) FROM ti_disco dk WHERE dk.id_coleta = uc.id) AS disco_total_bytes
```

- [ ] **Step 2: Frontend — interface e coluna**

Em `apps/portal/src/pages/ti/EquipamentosPage.tsx`, na interface `Equipamento`, junto de `ram_total_bytes`:

```ts
  disco_total_bytes: number | null;
```

No `useOrdenacao`, junto de `ram_total_bytes: (e) => e.ram_total_bytes,`:

```ts
    disco_total_bytes: (e) => e.disco_total_bytes,
```

No `<thead>`, depois da coluna RAM:

```tsx
              <ThOrdenavel campo="disco_total_bytes" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>HD</ThOrdenavel>
```

No `<tbody>`, depois da célula de RAM:

```tsx
                <td className="p-3 text-slate-500">{fmtBytes(e.disco_total_bytes)}</td>
```

E o `colSpan` do estado vazio sobe de `9` pra `10`:

```tsx
                <td colSpan={10} className="p-4 text-center text-slate-400">
```

- [ ] **Step 3: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tiEquipamentos.ts apps/portal/src/pages/ti/EquipamentosPage.tsx
git commit -m "Lista de Equipamentos ganha coluna de HD total"
```

---

### Task 8: Backend — rota do Dashboard TI

**Files:**
- Create: `apps/api/src/routes/tiDashboard.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `const tiDashboardRouter: Router`, montado em `/api/ti/dashboard`. Resposta (snake_case, mesma convenção do resto do módulo TI): `{ total_equipamentos, equipamentos_com_coleta, por_sistema_operacional, por_processador, por_faixa_ram, disco: { total_bytes, livre_bytes, maquinas_com_dado }, maquinas_criticas }`.
- Consumido pela Task 9 (frontend).

- [ ] **Step 1: Escrever a rota**

Crie `apps/api/src/routes/tiDashboard.ts`:

```ts
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiDashboardRouter = Router();

const ROTA = '/ti/dashboard';

tiDashboardRouter.use(authTenant);

interface Contagem extends RowDataPacket {
  rotulo: string;
  quantidade: number;
}

/**
 * Top N por quantidade + um "Outros" com a soma do resto — evita o gráfico
 * de processador virar uma lista enorme quando o parque tem muitos modelos
 * diferentes com 1-2 máquinas cada.
 */
function agruparTopNMaisOutros(linhas: Contagem[], n: number): { rotulo: string; quantidade: number }[] {
  const ordenadas = [...linhas].sort((a, b) => Number(b.quantidade) - Number(a.quantidade));
  const topN = ordenadas.slice(0, n).map((l) => ({ rotulo: l.rotulo, quantidade: Number(l.quantidade) }));
  const somaResto = ordenadas.slice(n).reduce((soma, l) => soma + Number(l.quantidade), 0);
  if (somaResto > 0) topN.push({ rotulo: 'Outros', quantidade: somaResto });
  return topN;
}

tiDashboardRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const { filialId, departamentoId } = req.query as Record<string, string | undefined>;

  const condicoes: string[] = ['e.ativo = TRUE'];
  const params: unknown[] = [];
  if (filialId) {
    condicoes.push('e.filial_id = ?');
    params.push(filialId);
  }
  if (departamentoId) {
    condicoes.push('e.id_departamento = ?');
    params.push(departamentoId);
  }
  const where = condicoes.join(' AND ');

  // Mesma subquery correlacionada de "última coleta" usada em GET
  // /ti/equipamentos e /ti/softwares-aprovados — repetida aqui porque o
  // módulo TI não tem camada de serviço compartilhada pras rotas de
  // consulta (ver Global Constraints).
  const ultimaColeta = `
    LEFT JOIN ti_inventario_coleta uc ON uc.id = (
        SELECT c2.id FROM ti_inventario_coleta c2
        WHERE c2.id_equipamento = e.id
        ORDER BY c2.coletado_em DESC, c2.id DESC
        LIMIT 1
    )`;

  const [totalLinhas] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ti_equipamento e WHERE ${where}`, params);
  const totalEquipamentos = Number(totalLinhas[0]?.total ?? 0);

  const [comColetaLinhas] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ti_equipamento e ${ultimaColeta} WHERE ${where} AND uc.id IS NOT NULL`,
    params,
  );
  const equipamentosComColeta = Number(comColetaLinhas[0]?.total ?? 0);

  const [porSistemaOperacional] = await pool.query<Contagem[]>(
    `SELECT COALESCE(so.caption, 'Sem dado') AS rotulo, COUNT(*) AS quantidade
     FROM ti_equipamento e ${ultimaColeta}
     LEFT JOIN ti_sistema_operacional so ON so.id_coleta = uc.id
     WHERE ${where}
     GROUP BY rotulo
     ORDER BY quantidade DESC`,
    params,
  );

  const [porProcessadorBruto] = await pool.query<Contagem[]>(
    `SELECT COALESCE(proc.nome, 'Sem dado') AS rotulo, COUNT(*) AS quantidade
     FROM ti_equipamento e ${ultimaColeta}
     LEFT JOIN ti_processador proc ON proc.id_coleta = uc.id
     WHERE ${where}
     GROUP BY rotulo
     ORDER BY quantidade DESC`,
    params,
  );

  const [porFaixaRam] = await pool.query<Contagem[]>(
    `SELECT
        CASE
          WHEN ram.total_bytes IS NULL THEN 'Sem dado'
          WHEN ram.total_bytes < 8589934592 THEN '< 8 GB'
          WHEN ram.total_bytes < 17179869184 THEN '8–16 GB'
          WHEN ram.total_bytes < 34359738368 THEN '16–32 GB'
          ELSE '> 32 GB'
        END AS rotulo,
        COUNT(*) AS quantidade
     FROM ti_equipamento e ${ultimaColeta}
     LEFT JOIN (
         SELECT id_coleta, SUM(capacidade_bytes) AS total_bytes
         FROM ti_memoria_ram GROUP BY id_coleta
     ) ram ON ram.id_coleta = uc.id
     WHERE ${where}
     GROUP BY rotulo`,
    params,
  );

  const [discoLinhas] = await pool.query<RowDataPacket[]>(
    `SELECT
        COALESCE(SUM(v.tamanho_bytes), 0) AS totalBytes,
        COALESCE(SUM(v.espaco_livre_bytes), 0) AS livreBytes,
        COUNT(DISTINCT e.id) AS maquinasComDado
     FROM ti_equipamento e ${ultimaColeta}
     JOIN ti_volume v ON v.id_coleta = uc.id
     WHERE ${where}`,
    params,
  );
  const disco = discoLinhas[0] ?? { totalBytes: 0, livreBytes: 0, maquinasComDado: 0 };

  const [maquinasCriticas] = await pool.query<RowDataPacket[]>(
    `SELECT e.id, e.apelido, e.nome_computador,
            SUM(v.tamanho_bytes) AS total_bytes, SUM(v.espaco_livre_bytes) AS livre_bytes
     FROM ti_equipamento e ${ultimaColeta}
     JOIN ti_volume v ON v.id_coleta = uc.id
     WHERE ${where}
     GROUP BY e.id, e.apelido, e.nome_computador
     HAVING total_bytes > 0
     ORDER BY (livre_bytes / total_bytes) ASC
     LIMIT 10`,
    params,
  );

  res.json({
    total_equipamentos: totalEquipamentos,
    equipamentos_com_coleta: equipamentosComColeta,
    por_sistema_operacional: porSistemaOperacional,
    por_processador: agruparTopNMaisOutros(porProcessadorBruto, 8),
    por_faixa_ram: porFaixaRam,
    disco: {
      total_bytes: Number(disco.totalBytes),
      livre_bytes: Number(disco.livreBytes),
      maquinas_com_dado: Number(disco.maquinasComDado),
    },
    maquinas_criticas: maquinasCriticas,
  });
});
```

- [ ] **Step 2: Montar a rota**

Em `apps/api/src/app.ts`, acrescente o import (ordem alfabética, junto dos demais `ti*`):

```ts
import { tiDashboardRouter } from './routes/tiDashboard.js';
```

E o `app.use`, junto dos demais `/api/ti/*`:

```ts
app.use('/api/ti/dashboard', tiDashboardRouter);
```

- [ ] **Step 3: Verificar tipos e a suíte inteira**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando, sem regressão.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tiDashboard.ts apps/api/src/app.ts
git commit -m "Rota do Dashboard TI: SO, processador, memoria e disco"
```

---

### Task 9: Frontend — página do Dashboard TI

**Files:**
- Create: `apps/portal/src/pages/ti/AnalisesDashboardPage.tsx`
- Modify: `apps/portal/src/App.tsx`

**Interfaces:**
- Consumes: `GET /ti/dashboard` (Task 8); `GET /filiais`; `GET /ti/departamentos`.
- Produces: `function AnalisesDashboardPage()`, roteada em `/ti/dashboard`.

O nome do componente é `AnalisesDashboardPage`, não `DashboardPage` — `App.tsx` já importa um `DashboardPage` do Faturamento (`lazy`), reaproveitar o mesmo nome criaria colisão de identificador no import.

- [ ] **Step 1: Escrever a página**

Crie `apps/portal/src/pages/ti/AnalisesDashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CardGrafico } from '../../components/CardGrafico';
import { EIXO, GRADE, SERIE_1, SERIE_2, TEXTO_EIXO } from '../../lib/paletaViz';
import { useApi } from '../../lib/useApi';

interface Contagem {
  rotulo: string;
  quantidade: number;
}

interface MaquinaCritica {
  id: number;
  apelido: string | null;
  nome_computador: string;
  total_bytes: number;
  livre_bytes: number;
}

interface DashboardResposta {
  total_equipamentos: number;
  equipamentos_com_coleta: number;
  por_sistema_operacional: Contagem[];
  por_processador: Contagem[];
  por_faixa_ram: Contagem[];
  disco: { total_bytes: number; livre_bytes: number; maquinas_com_dado: number };
  maquinas_criticas: MaquinaCritica[];
}

interface OpcaoSimples {
  id: number;
  nome: string;
}

const CORES_PIZZA = [SERIE_1, SERIE_2, '#8b5cf6', '#22c55e', '#f59e0b', '#64748b'];

function fmtBytes(v: number): string {
  if (!v || v <= 0) return '—';
  return `${(v / 1073741824).toFixed(1)} GB`;
}

function fmtPercentual(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function AnalisesDashboardPage() {
  const api = useApi();
  const [dados, setDados] = useState<DashboardResposta | null>(null);
  const [filiais, setFiliais] = useState<OpcaoSimples[]>([]);
  const [departamentos, setDepartamentos] = useState<OpcaoSimples[]>([]);
  const [filialId, setFilialId] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    Promise.all([api<OpcaoSimples[]>('/filiais'), api<OpcaoSimples[]>('/ti/departamentos')])
      .then(([f, d]) => {
        setFiliais(f);
        setDepartamentos(d);
      })
      .catch(console.error);
  }, [api]);

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (filialId) params.set('filialId', filialId);
    if (departamentoId) params.set('departamentoId', departamentoId);

    api<DashboardResposta>(`/ti/dashboard?${params.toString()}`)
      .then(setDados)
      .catch(console.error)
      .finally(() => setCarregando(false));
  }, [api, filialId, departamentoId]);

  const percentualLivre = dados && dados.disco.total_bytes > 0 ? (dados.disco.livre_bytes / dados.disco.total_bytes) * 100 : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Dashboard TI</h1>
        <p className="text-sm text-slate-500">
          Visão agregada do parque de equipamentos — sistema operacional, processador, memória e disco.
          {dados && ` ${dados.equipamentos_com_coleta} de ${dados.total_equipamentos} equipamento(s) com coleta.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filialId} onChange={(e) => setFilialId(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as filiais</option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <select
          value={departamentoId}
          onChange={(e) => setDepartamentoId(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
      </div>

      {dados && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CardGrafico
            titulo="Por Sistema Operacional"
            dados={dados.por_sistema_operacional}
            carregando={carregando}
            colunas={[
              { titulo: 'Sistema', valor: (l) => l.rotulo },
              { titulo: 'Máquinas', valor: (l) => l.quantidade, alinharDireita: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={dados.por_sistema_operacional} dataKey="quantidade" nameKey="rotulo" outerRadius={90} label={(l) => l.rotulo}>
                  {dados.por_sistema_operacional.map((entrada, i) => (
                    <Cell key={entrada.rotulo} fill={CORES_PIZZA[i % CORES_PIZZA.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardGrafico>

          <CardGrafico
            titulo="Por Processador"
            descricao="Top 8, restante agrupado em Outros"
            dados={dados.por_processador}
            carregando={carregando}
            colunas={[
              { titulo: 'Processador', valor: (l) => l.rotulo },
              { titulo: 'Máquinas', valor: (l) => l.quantidade, alinharDireita: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dados.por_processador} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={GRADE} horizontal={false} />
                <XAxis type="number" stroke={EIXO} tick={{ fill: TEXTO_EIXO, fontSize: 12 }} />
                <YAxis type="category" dataKey="rotulo" stroke={EIXO} width={160} tick={{ fill: TEXTO_EIXO, fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill={SERIE_1} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardGrafico>

          <CardGrafico
            titulo="Por Faixa de Memória RAM"
            dados={dados.por_faixa_ram}
            carregando={carregando}
            colunas={[
              { titulo: 'Faixa', valor: (l) => l.rotulo },
              { titulo: 'Máquinas', valor: (l) => l.quantidade, alinharDireita: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dados.por_faixa_ram}>
                <CartesianGrid stroke={GRADE} vertical={false} />
                <XAxis dataKey="rotulo" stroke={EIXO} tick={{ fill: TEXTO_EIXO, fontSize: 12 }} />
                <YAxis stroke={EIXO} tick={{ fill: TEXTO_EIXO, fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill={SERIE_2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardGrafico>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 font-medium text-slate-900">Espaço em Disco (parque)</h2>
            <p className="mb-4 text-xs text-slate-500">
              {dados.disco.maquinas_com_dado} máquina(s) com dado de volume — o restante ainda não recebeu o agente 1.4.0.
            </p>
            {dados.disco.maquinas_com_dado === 0 ? (
              <p className="text-sm text-slate-400">Sem dado — aguardando atualização do agente.</p>
            ) : (
              <>
                <p className="mb-4 text-2xl font-semibold text-slate-900">
                  {fmtBytes(dados.disco.livre_bytes)} livres de {fmtBytes(dados.disco.total_bytes)}
                  {percentualLivre !== null && <span className="ml-2 text-sm font-normal text-slate-500">({fmtPercentual(percentualLivre)})</span>}
                </p>
                <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Máquinas com menos espaço livre</h3>
                <ul className="space-y-1 text-sm">
                  {dados.maquinas_criticas.map((m) => {
                    const percentual = m.total_bytes > 0 ? (m.livre_bytes / m.total_bytes) * 100 : 0;
                    return (
                      <li key={m.id} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
                        <span className="text-slate-700">{m.apelido || m.nome_computador}</span>
                        <span className="text-slate-500">
                          {fmtBytes(m.livre_bytes)} livres ({fmtPercentual(percentual)})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rotear**

Em `apps/portal/src/App.tsx`, junto dos demais imports de `pages/ti/*` (ordem alfabética):

```tsx
import { AnalisesDashboardPage } from './pages/ti/AnalisesDashboardPage';
```

E a rota, junto das demais `/ti/*`:

```tsx
            <Route path="/ti/dashboard" element={<AnalisesDashboardPage />} />
```

- [ ] **Step 3: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 4: Teste manual**

Suba `npm run dev:portal` + `npm run dev:api`, entre em `/ti/dashboard` (precisa de permissão liberada — ver Task 14) e confirme que os quatro cards carregam, o alternador Gráfico/Tabela do `CardGrafico` funciona, e os filtros de filial/departamento recarregam os dados.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/pages/ti/AnalisesDashboardPage.tsx apps/portal/src/App.tsx
git commit -m "Portal ganha a tela de Dashboard TI"
```

---

### Task 10: Backend — rota de Programas Desatualizados

**Files:**
- Create: `apps/api/src/routes/tiProgramasDesatualizados.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `const tiProgramasDesatualizadosRouter: Router`, montado em `/api/ti/programas-desatualizados`. `GET /` devolve `{ nome, versao_maxima, qtd_total, qtd_atualizadas }[]`; `GET /maquinas?nome=` devolve `{ id, nome_computador, apelido, nome_filial, nome_responsavel, versao, versao_maxima, atualizado }[]`.
- Consumido pela Task 11 (frontend).

- [ ] **Step 1: Escrever a rota**

Crie `apps/api/src/routes/tiProgramasDesatualizados.ts`:

```ts
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiProgramasDesatualizadosRouter = Router();

const ROTA = '/ti/programas-desatualizados';

tiProgramasDesatualizadosRouter.use(authTenant);

/**
 * "Desatualizado" aqui é comparação com o PARQUE, não com fonte externa —
 * não existe fonte confiável de versão mais recente por fabricante (ver
 * Specs/spec_modulo_ti.md, seção 5.8/10.7). Para cada nome de software,
 * acha a maior versão instalada em qualquer máquina ativa hoje e marca
 * como desatualizada toda máquina abaixo disso. Comparação é textual
 * (MAX() sobre VARCHAR) — não entende semver de verdade, limitação aceita.
 */
const CTE_SOFTWARE_ATUAL = `
  WITH ultima_coleta AS (
      SELECT e.id AS id_equipamento,
             (SELECT c2.id FROM ti_inventario_coleta c2
              WHERE c2.id_equipamento = e.id
              ORDER BY c2.coletado_em DESC, c2.id DESC LIMIT 1) AS id_coleta
      FROM ti_equipamento e
      WHERE e.ativo = TRUE
  ),
  software_atual AS (
      SELECT s.nome, s.versao, uc.id_equipamento
      FROM ultima_coleta uc
      JOIN ti_software s ON s.id_coleta = uc.id_coleta
      WHERE s.nome IS NOT NULL AND s.versao IS NOT NULL AND s.versao <> ''
  ),
  maximos AS (
      SELECT nome, MAX(versao) AS versao_maxima
      FROM software_atual
      GROUP BY nome
  )`;

tiProgramasDesatualizadosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_SOFTWARE_ATUAL}
     SELECT sa.nome, m.versao_maxima,
            COUNT(*) AS qtd_total,
            SUM(sa.versao = m.versao_maxima) AS qtd_atualizadas
     FROM software_atual sa
     JOIN maximos m ON m.nome = sa.nome
     GROUP BY sa.nome, m.versao_maxima
     HAVING qtd_atualizadas < qtd_total
     ORDER BY (qtd_total - qtd_atualizadas) DESC, sa.nome`,
  );
  res.json(linhas);
});

tiProgramasDesatualizadosRouter.get('/maquinas', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const nome = String(req.query.nome ?? '').trim();
  if (!nome) {
    res.status(400).json({ erro: 'Informe o nome do software.' });
    return;
  }

  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_SOFTWARE_ATUAL}
     SELECT e.id, e.nome_computador, e.apelido, f.nome AS nome_filial, u.nome AS nome_responsavel,
            sa.versao, m.versao_maxima, (sa.versao = m.versao_maxima) AS atualizado
     FROM software_atual sa
     JOIN maximos m ON m.nome = sa.nome
     JOIN ti_equipamento e ON e.id = sa.id_equipamento
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     WHERE sa.nome = ?
     ORDER BY atualizado ASC, e.nome_computador`,
    [nome],
  );
  res.json(linhas);
});
```

- [ ] **Step 2: Montar a rota**

Em `apps/api/src/app.ts`, import (ordem alfabética):

```ts
import { tiProgramasDesatualizadosRouter } from './routes/tiProgramasDesatualizados.js';
```

E `app.use`:

```ts
app.use('/api/ti/programas-desatualizados', tiProgramasDesatualizadosRouter);
```

- [ ] **Step 3: Verificar tipos e a suíte inteira**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; sem regressão.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tiProgramasDesatualizados.ts apps/api/src/app.ts
git commit -m "Rota de Programas Desatualizados: comparacao com o parque"
```

---

### Task 11: Frontend — Programas Desatualizados (lista + drill-down)

**Files:**
- Create: `apps/portal/src/pages/ti/ProgramasDesatualizadosPage.tsx`
- Create: `apps/portal/src/pages/ti/ProgramaMaquinasPage.tsx`
- Modify: `apps/portal/src/App.tsx`

**Interfaces:**
- Consumes: `GET /ti/programas-desatualizados`, `GET /ti/programas-desatualizados/maquinas?nome=` (Task 10).
- Produces: `function ProgramasDesatualizadosPage()` roteada em `/ti/programas-desatualizados`; `function ProgramaMaquinasPage()` roteada em `/ti/programas-desatualizados/maquinas`.

- [ ] **Step 1: Lista**

Crie `apps/portal/src/pages/ti/ProgramasDesatualizadosPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface ProgramaDesatualizado {
  nome: string;
  versao_maxima: string;
  qtd_total: number;
  qtd_atualizadas: number;
}

export function ProgramasDesatualizadosPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<ProgramaDesatualizado[]>([]);

  useEffect(() => {
    api<ProgramaDesatualizado[]>('/ti/programas-desatualizados').then(setLinhas).catch(console.error);
  }, [api]);

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(linhas, busca), {
    nome: (l) => l.nome,
    versao_maxima: (l) => l.versao_maxima,
    qtd_total: (l) => l.qtd_total,
    qtd_atualizadas: (l) => l.qtd_atualizadas,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Programas Desatualizados</h1>
        <p className="text-sm text-slate-500">
          Software cuja versão instalada é menor que a maior versão vista no parque hoje. Comparação é textual, não
          entende versionamento semântico — use como indicativo de disparidade grande, não ranking exato.
        </p>
      </div>

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar programa..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Programa</ThOrdenavel>
              <ThOrdenavel campo="versao_maxima" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Versão máxima no parque</ThOrdenavel>
              <ThOrdenavel campo="qtd_atualizadas" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Atualizadas</ThOrdenavel>
              <ThOrdenavel campo="qtd_total" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Desatualizadas</ThOrdenavel>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  Nenhum programa desatualizado encontrado.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((l) => (
              <tr key={l.nome} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link to={`/ti/programas-desatualizados/maquinas?nome=${encodeURIComponent(l.nome)}`} className="font-medium text-slate-900 hover:underline">
                    {l.nome}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{l.versao_maxima}</td>
                <td className="p-3 text-slate-500">{l.qtd_atualizadas}</td>
                <td className="p-3 text-slate-500">{l.qtd_total - l.qtd_atualizadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Drill-down**

Crie `apps/portal/src/pages/ti/ProgramaMaquinasPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface MaquinaPrograma {
  id: number;
  nome_computador: string;
  apelido: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  versao: string;
  versao_maxima: string;
  atualizado: number;
}

export function ProgramaMaquinasPage() {
  const api = useApi();
  const [searchParams] = useSearchParams();
  const nome = searchParams.get('nome') ?? '';
  const [linhas, setLinhas] = useState<MaquinaPrograma[]>([]);

  useEffect(() => {
    if (!nome) return;
    api<MaquinaPrograma[]>(`/ti/programas-desatualizados/maquinas?nome=${encodeURIComponent(nome)}`).then(setLinhas).catch(console.error);
  }, [api, nome]);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/ti/programas-desatualizados" className="text-sm text-slate-500 hover:underline">
          ← Voltar pra Programas Desatualizados
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Máquinas com {nome}</h1>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3 font-medium">Computador</th>
              <th className="p-3 font-medium">Filial</th>
              <th className="p-3 font-medium">Responsável</th>
              <th className="p-3 font-medium">Versão instalada</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link to={`/ti/equipamentos/${l.id}`} className="font-medium text-slate-900 hover:underline">
                    {l.apelido || l.nome_computador}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{l.nome_filial ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.nome_responsavel ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.versao}</td>
                <td className="p-3">
                  {Number(l.atualizado) === 1 ? (
                    <span className="text-emerald-600">Atualizado</span>
                  ) : (
                    <span className="text-amber-600">Desatualizado (máx: {l.versao_maxima})</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rotear**

Em `apps/portal/src/App.tsx`, imports (ordem alfabética):

```tsx
import { ProgramaMaquinasPage } from './pages/ti/ProgramaMaquinasPage';
import { ProgramasDesatualizadosPage } from './pages/ti/ProgramasDesatualizadosPage';
```

E rotas:

```tsx
            <Route path="/ti/programas-desatualizados" element={<ProgramasDesatualizadosPage />} />
            <Route path="/ti/programas-desatualizados/maquinas" element={<ProgramaMaquinasPage />} />
```

- [ ] **Step 4: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/pages/ti/ProgramasDesatualizadosPage.tsx apps/portal/src/pages/ti/ProgramaMaquinasPage.tsx apps/portal/src/App.tsx
git commit -m "Portal ganha a tela de Programas Desatualizados"
```

---

### Task 12: Backend — rota de Drivers Desatualizados

**Files:**
- Create: `apps/api/src/routes/tiDriversDesatualizados.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `const tiDriversDesatualizadosRouter: Router`, montado em `/api/ti/drivers-desatualizados`. `GET /` devolve `{ hardware_id, nome, fabricante, versao_maxima, qtd_total, qtd_atualizadas }[]`; `GET /maquinas?hardwareId=` devolve `{ id, nome_computador, apelido, nome_filial, nome_responsavel, versao, versao_maxima, atualizado }[]`.
- Consumido pela Task 13.

Mesma lógica da Task 10, agrupando por `hardware_id` em vez de `nome` — ver Specs/spec_modulo_ti.md, seção 10.8.

- [ ] **Step 1: Escrever a rota**

Crie `apps/api/src/routes/tiDriversDesatualizados.ts`:

```ts
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const tiDriversDesatualizadosRouter = Router();

const ROTA = '/ti/drivers-desatualizados';

tiDriversDesatualizadosRouter.use(authTenant);

/**
 * Mesma lógica de tiProgramasDesatualizados.ts, agrupando por hardware_id
 * em vez de nome — dois drivers com o mesmo hardware_id são fisicamente o
 * mesmo componente (mesmo chip/modelo), então a comparação de versão faz
 * sentido; nome sozinho pode variar por driver instalado mesmo sendo o
 * mesmo hardware. Linha sem hardware_id fica de fora (sem chave estável,
 * não compara — mesma regra do diff de coletas, ver tiDiff.ts).
 */
const CTE_DRIVER_ATUAL = `
  WITH ultima_coleta AS (
      SELECT e.id AS id_equipamento,
             (SELECT c2.id FROM ti_inventario_coleta c2
              WHERE c2.id_equipamento = e.id
              ORDER BY c2.coletado_em DESC, c2.id DESC LIMIT 1) AS id_coleta
      FROM ti_equipamento e
      WHERE e.ativo = TRUE
  ),
  driver_atual AS (
      SELECT d.hardware_id, d.nome, d.fabricante, d.versao, uc.id_equipamento
      FROM ultima_coleta uc
      JOIN ti_driver d ON d.id_coleta = uc.id_coleta
      WHERE d.hardware_id IS NOT NULL AND d.hardware_id <> '' AND d.versao IS NOT NULL AND d.versao <> ''
  ),
  maximos AS (
      SELECT hardware_id, MAX(versao) AS versao_maxima
      FROM driver_atual
      GROUP BY hardware_id
  )`;

tiDriversDesatualizadosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_DRIVER_ATUAL}
     SELECT da.hardware_id, ANY_VALUE(da.nome) AS nome, ANY_VALUE(da.fabricante) AS fabricante, m.versao_maxima,
            COUNT(*) AS qtd_total,
            SUM(da.versao = m.versao_maxima) AS qtd_atualizadas
     FROM driver_atual da
     JOIN maximos m ON m.hardware_id = da.hardware_id
     GROUP BY da.hardware_id, m.versao_maxima
     HAVING qtd_atualizadas < qtd_total
     ORDER BY (qtd_total - qtd_atualizadas) DESC, nome`,
  );
  res.json(linhas);
});

tiDriversDesatualizadosRouter.get('/maquinas', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const hardwareId = String(req.query.hardwareId ?? '').trim();
  if (!hardwareId) {
    res.status(400).json({ erro: 'Informe o hardware_id.' });
    return;
  }

  const [linhas] = await pool.query<RowDataPacket[]>(
    `${CTE_DRIVER_ATUAL}
     SELECT e.id, e.nome_computador, e.apelido, f.nome AS nome_filial, u.nome AS nome_responsavel,
            da.versao, m.versao_maxima, (da.versao = m.versao_maxima) AS atualizado
     FROM driver_atual da
     JOIN maximos m ON m.hardware_id = da.hardware_id
     JOIN ti_equipamento e ON e.id = da.id_equipamento
     LEFT JOIN filiais f ON f.id = e.filial_id
     LEFT JOIN usuarios u ON u.id = e.id_usuario_responsavel
     WHERE da.hardware_id = ?
     ORDER BY atualizado ASC, e.nome_computador`,
    [hardwareId],
  );
  res.json(linhas);
});
```

- [ ] **Step 2: Montar a rota**

Em `apps/api/src/app.ts`, import (ordem alfabética):

```ts
import { tiDriversDesatualizadosRouter } from './routes/tiDriversDesatualizados.js';
```

E `app.use`:

```ts
app.use('/api/ti/drivers-desatualizados', tiDriversDesatualizadosRouter);
```

- [ ] **Step 3: Verificar tipos e a suíte inteira**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; sem regressão.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tiDriversDesatualizados.ts apps/api/src/app.ts
git commit -m "Rota de Drivers Desatualizados: comparacao por hardware_id"
```

---

### Task 13: Frontend — Drivers Desatualizados (lista + drill-down)

**Files:**
- Create: `apps/portal/src/pages/ti/DriversDesatualizadosPage.tsx`
- Create: `apps/portal/src/pages/ti/DriverMaquinasPage.tsx`
- Modify: `apps/portal/src/App.tsx`

**Interfaces:**
- Consumes: `GET /ti/drivers-desatualizados`, `GET /ti/drivers-desatualizados/maquinas?hardwareId=` (Task 12).
- Produces: `function DriversDesatualizadosPage()` roteada em `/ti/drivers-desatualizados`; `function DriverMaquinasPage()` roteada em `/ti/drivers-desatualizados/maquinas`.

- [ ] **Step 1: Lista**

Crie `apps/portal/src/pages/ti/DriversDesatualizadosPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '../../components/CampoBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useApi } from '../../lib/useApi';
import { filtrarPorTexto, useOrdenacao } from '../../lib/tabela';

interface DriverDesatualizado {
  hardware_id: string;
  nome: string | null;
  fabricante: string | null;
  versao_maxima: string;
  qtd_total: number;
  qtd_atualizadas: number;
}

export function DriversDesatualizadosPage() {
  const api = useApi();
  const [linhas, setLinhas] = useState<DriverDesatualizado[]>([]);

  useEffect(() => {
    api<DriverDesatualizado[]>('/ti/drivers-desatualizados').then(setLinhas).catch(console.error);
  }, [api]);

  const [busca, setBusca] = useState('');
  const { linhasOrdenadas, campoOrdenado, direcao, ordenarPor } = useOrdenacao(filtrarPorTexto(linhas, busca), {
    nome: (l) => l.nome,
    fabricante: (l) => l.fabricante,
    versao_maxima: (l) => l.versao_maxima,
    qtd_atualizadas: (l) => l.qtd_atualizadas,
    qtd_total: (l) => l.qtd_total,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Drivers Desatualizados</h1>
        <p className="text-sm text-slate-500">
          Driver cuja versão instalada é menor que a maior versão vista no parque, para o mesmo componente de
          hardware. Some da lista até o equipamento receber o agente 1.4.0 (rollout gradual — ver spec).
        </p>
      </div>

      <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar driver..." />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <ThOrdenavel campo="nome" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Dispositivo</ThOrdenavel>
              <ThOrdenavel campo="fabricante" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Fabricante</ThOrdenavel>
              <ThOrdenavel campo="versao_maxima" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Versão máxima no parque</ThOrdenavel>
              <ThOrdenavel campo="qtd_atualizadas" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Atualizadas</ThOrdenavel>
              <ThOrdenavel campo="qtd_total" campoOrdenado={campoOrdenado} direcao={direcao} onOrdenar={ordenarPor}>Desatualizadas</ThOrdenavel>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  Nenhum driver desatualizado encontrado.
                </td>
              </tr>
            )}
            {linhasOrdenadas.map((l) => (
              <tr key={l.hardware_id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link
                    to={`/ti/drivers-desatualizados/maquinas?hardwareId=${encodeURIComponent(l.hardware_id)}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {l.nome ?? '—'}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{l.fabricante ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.versao_maxima}</td>
                <td className="p-3 text-slate-500">{l.qtd_atualizadas}</td>
                <td className="p-3 text-slate-500">{l.qtd_total - l.qtd_atualizadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Drill-down**

Crie `apps/portal/src/pages/ti/DriverMaquinasPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface MaquinaDriver {
  id: number;
  nome_computador: string;
  apelido: string | null;
  nome_filial: string | null;
  nome_responsavel: string | null;
  versao: string;
  versao_maxima: string;
  atualizado: number;
}

export function DriverMaquinasPage() {
  const api = useApi();
  const [searchParams] = useSearchParams();
  const hardwareId = searchParams.get('hardwareId') ?? '';
  const [linhas, setLinhas] = useState<MaquinaDriver[]>([]);

  useEffect(() => {
    if (!hardwareId) return;
    api<MaquinaDriver[]>(`/ti/drivers-desatualizados/maquinas?hardwareId=${encodeURIComponent(hardwareId)}`).then(setLinhas).catch(console.error);
  }, [api, hardwareId]);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/ti/drivers-desatualizados" className="text-sm text-slate-500 hover:underline">
          ← Voltar pra Drivers Desatualizados
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Máquinas com este driver</h1>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3 font-medium">Computador</th>
              <th className="p-3 font-medium">Filial</th>
              <th className="p-3 font-medium">Responsável</th>
              <th className="p-3 font-medium">Versão instalada</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <Link to={`/ti/equipamentos/${l.id}`} className="font-medium text-slate-900 hover:underline">
                    {l.apelido || l.nome_computador}
                  </Link>
                </td>
                <td className="p-3 text-slate-500">{l.nome_filial ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.nome_responsavel ?? '—'}</td>
                <td className="p-3 text-slate-500">{l.versao}</td>
                <td className="p-3">
                  {Number(l.atualizado) === 1 ? (
                    <span className="text-emerald-600">Atualizado</span>
                  ) : (
                    <span className="text-amber-600">Desatualizado (máx: {l.versao_maxima})</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rotear**

Em `apps/portal/src/App.tsx`, imports (ordem alfabética):

```tsx
import { DriverMaquinasPage } from './pages/ti/DriverMaquinasPage';
import { DriversDesatualizadosPage } from './pages/ti/DriversDesatualizadosPage';
```

E rotas:

```tsx
            <Route path="/ti/drivers-desatualizados" element={<DriversDesatualizadosPage />} />
            <Route path="/ti/drivers-desatualizados/maquinas" element={<DriverMaquinasPage />} />
```

- [ ] **Step 4: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/pages/ti/DriversDesatualizadosPage.tsx apps/portal/src/pages/ti/DriverMaquinasPage.tsx apps/portal/src/App.tsx
git commit -m "Portal ganha a tela de Drivers Desatualizados"
```

---

### Task 14: Menu — grupo Análises TI

**Files:**
- Create: `apps/api/db/037_ti_analises_menu_seed.sql`

**Interfaces:**
- Consumes: rotas das Tasks 9, 11, 13 (precisam existir antes desta migration — mesma regra de sempre, seed depois da rota).
- Produces: submenu "Análises TI" visível no menu do módulo TI (depois de liberado em Perfis).

Esta é a última tarefa do plano: junta as três telas novas com as duas reagrupadas.

- [ ] **Step 1: Escrever a migration**

Crie `apps/api/db/037_ti_analises_menu_seed.sql`:

```sql
-- Grupo de menu "Analises TI" (Specs/spec_modulo_ti.md, secao 10.5):
-- reagrupa Equipamentos e Auditoria de Coleta (ja existentes) e semeia as
-- tres telas novas (Dashboard TI, Programas Desatualizados, Drivers
-- Desatualizados).
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar.

UPDATE telas_modulo
   SET grupo_menu = 'Análises TI'
 WHERE rota_tela IN ('/ti/equipamentos', '/ti/auditoria-coleta');

INSERT INTO telas_modulo (modulo_id, nome_tela, grupo_menu, rota_tela)
SELECT m.id, t.nome_tela, 'Análises TI', t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Dashboard TI' AS nome_tela, '/ti/dashboard' AS rota_tela
    UNION ALL SELECT 'Programas Desatualizados', '/ti/programas-desatualizados'
    UNION ALL SELECT 'Drivers Desatualizados', '/ti/drivers-desatualizados'
) t ON m.chave_modulo = 'TI'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
```

- [ ] **Step 2: Aplicar e verificar**

```bash
npm run db:migrate
npm run typecheck
npm run test --workspace=apps/api
npm run test --workspace=apps/portal
```

Esperado: `037` aplicada; typecheck limpo; as duas suítes passando, sem regressão.

- [ ] **Step 3: Conferir no portal**

Suba `npm run dev:api` e `npm run dev:portal`. Entre em **Configurador → Perfis**, marque **Ver** nas cinco telas (Equipamentos, Auditoria de Coleta, Dashboard TI, Programas Desatualizados, Drivers Desatualizados) e **Salve**. Confirme que o módulo TI mostra o submenu "Análises TI" agrupando as cinco, e que cada tela carrega (mesmo com "sem dado" nos cards que dependem do agente 1.4.0, já que o parque real ainda está no agente antigo).

- [ ] **Step 4: Commit**

```bash
git add apps/api/db/037_ti_analises_menu_seed.sql
git commit -m "Modulo TI ganha o submenu Analises TI"
```

---

## Fechamento da entrega

- Verificação final: `npm run typecheck` limpo nos três workspaces; `npm run test --workspace=apps/api` e `npm run test --workspace=apps/portal` sem regressão; `dotnet build` limpo no agente.
- Reconciliação com o spec: se alguma decisão mudou durante a implementação (ex: nome de coluna, formato de resposta), atualizar `Specs/spec_modulo_ti.md` seção 10 no mesmo commit — spec é fonte da verdade (CLAUDE.md).
- Lembrete de permissão manual: nenhuma das cinco telas aparece pra ninguém até alguém marcar em Configurador → Perfis (Task 14, Step 3) — não é bug, é a regra de sempre deste projeto.
- Lembrete de rollout: os cards de disco e a tela de Drivers Desatualizados só têm dado real depois que cada máquina reinicia com o agente 1.4.0 instalado — isso não acontece sozinho, precisa do instalador/script de "Configurar Agente de Inventário" (seção 5.7) rodar de novo, ou reinstalação manual.
- Publicar o `.exe` do agente 1.4.0 em `downloads/AgenteInventarioPC.exe` (mesmo mecanismo já documentado na seção 5.7/`Specs/deploy_digitalocean.md` seção 11) é um passo manual de deploy, fora do escopo deste plano — o plano só entrega o código-fonte do agente atualizado.
