import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShellLayout } from './components/AppShellLayout';
import { ForceUpdateGuard } from './components/ForceUpdateGuard';
import { AuthProvider } from './context/AuthProvider';
import { EsqueciSenhaPage } from './pages/EsqueciSenhaPage';
import { LoginPage } from './pages/LoginPage';
import { ModulesPage } from './pages/ModulesPage';
import { RedefinirSenhaPage } from './pages/RedefinirSenhaPage';
import { AvisosPage } from './pages/config/AvisosPage';
import { FiliaisPage } from './pages/config/FiliaisPage';
import { LogsAcessoPage } from './pages/config/LogsAcessoPage';
import { ParametrosPage } from './pages/config/ParametrosPage';
import { PerfilPermissoesPage } from './pages/config/PerfilPermissoesPage';
import { PerfisPage } from './pages/config/PerfisPage';
import { UsuariosPage } from './pages/config/UsuariosPage';
import { CurvaAbcPage } from './pages/estoque/CurvaAbcPage';
import { ExecucaoDetalhePage } from './pages/integracao/ExecucaoDetalhePage';
import { ExecucoesPage } from './pages/integracao/ExecucoesPage';
import { FilaPage } from './pages/integracao/FilaPage';
import { MercadoLivrePage } from './pages/integracao/MercadoLivrePage';
import { PainelPage } from './pages/integracao/PainelPage';
import { ParametrosFilaPage } from './pages/integracao/ParametrosFilaPage';
import { AuditoriaColetaPage } from './pages/ti/AuditoriaColetaPage';
import { CatalogoProgramasPage } from './pages/ti/CatalogoProgramasPage';
import { CompararColetasPage } from './pages/ti/CompararColetasPage';
import { DepartamentosPage } from './pages/ti/DepartamentosPage';
import { EquipamentoHistoricoPage } from './pages/ti/EquipamentoHistoricoPage';
import { EquipamentosPage } from './pages/ti/EquipamentosPage';
import { GerarScriptsPage } from './pages/ti/GerarScriptsPage';
import { InstalarProgramasPage } from './pages/ti/InstalarProgramasPage';
import { ResponsaveisPage } from './pages/ti/ResponsaveisPage';
import { SoftwareMaquinasPage } from './pages/ti/SoftwareMaquinasPage';
import { SoftwaresAprovadosPage } from './pages/ti/SoftwaresAprovadosPage';
import { TermoEquipamentoPage } from './pages/ti/TermoEquipamentoPage';

export function App() {
  return (
    <AuthProvider>
      <ForceUpdateGuard>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
          <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />

          <Route element={<AppShellLayout />}>
            <Route path="/modules" element={<ModulesPage />} />
            <Route path="/config/filiais" element={<FiliaisPage />} />
            <Route path="/config/usuarios" element={<UsuariosPage />} />
            <Route path="/config/perfis" element={<PerfisPage />} />
            <Route path="/config/perfis/:id" element={<PerfilPermissoesPage />} />
            <Route path="/config/avisos" element={<AvisosPage />} />
            <Route path="/config/logs" element={<LogsAcessoPage />} />
            <Route path="/config/parametros" element={<ParametrosPage />} />

            <Route path="/ti/equipamentos" element={<EquipamentosPage />} />
            <Route path="/ti/equipamentos/:id" element={<EquipamentoHistoricoPage />} />
            <Route path="/ti/equipamentos/:id/comparar" element={<CompararColetasPage />} />
            <Route path="/ti/equipamentos/:id/termo" element={<TermoEquipamentoPage />} />
            <Route path="/ti/departamentos" element={<DepartamentosPage />} />
            <Route path="/ti/responsaveis" element={<ResponsaveisPage />} />
            <Route path="/ti/catalogo-programas" element={<CatalogoProgramasPage />} />
            <Route path="/ti/instalar-programas" element={<InstalarProgramasPage />} />
            <Route path="/ti/gerar-scripts" element={<GerarScriptsPage />} />
            <Route path="/ti/softwares-aprovados" element={<SoftwaresAprovadosPage />} />
            <Route path="/ti/softwares-aprovados/maquinas" element={<SoftwareMaquinasPage />} />
            <Route path="/ti/auditoria-coleta" element={<AuditoriaColetaPage />} />

            <Route path="/integracao/painel" element={<PainelPage />} />
            <Route path="/integracao/execucoes" element={<ExecucoesPage />} />
            <Route path="/integracao/execucoes/:id" element={<ExecucaoDetalhePage />} />
            <Route path="/integracao/fila" element={<FilaPage />} />
            <Route path="/integracao/parametros-fila" element={<ParametrosFilaPage />} />
            <Route path="/integracao/mercado-livre" element={<MercadoLivrePage />} />

            <Route path="/estoque/curva-abc" element={<CurvaAbcPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/modules" replace />} />
        </Routes>
      </ForceUpdateGuard>
    </AuthProvider>
  );
}
