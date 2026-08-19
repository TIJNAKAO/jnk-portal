import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { OfflineBanner } from './OfflineBanner';
import { Sidebar } from './Sidebar';

export function AppShellLayout() {
  const { usuario } = useAuth();
  const [gavetaAberta, setGavetaAberta] = useState(false);

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <OfflineBanner />

      <div className="hidden md:block">
        <Sidebar />
      </div>

      {gavetaAberta && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-72 bg-white shadow-xl">
            <Sidebar onNavigate={() => setGavetaAberta(false)} />
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            className="flex-1 bg-slate-900/40"
            onClick={() => setGavetaAberta(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setGavetaAberta(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
