import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Header } from './components/shared/Header';
import { GuestLanding } from './components/shared/GuestLanding';
import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { RepairShopDashboard } from './components/shop/RepairShopDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { TicketDetailModal } from './components/shared/TicketDetailModal';
import { ShopPublicModal } from './components/shared/ShopPublicModal';
import { AccountSettingsModal } from './components/shared/AccountSettingsModal';
import { AuthModal } from './components/shared/AuthModal';
import { ToastContainer } from './components/common/ToastContainer';
import { Wrench, ShieldCheck, Database, Loader2 } from 'lucide-react';

// Primary workspace shell rendering role-based dashboard, modals, and persistent footer
const WorkspaceShell: React.FC = () => {
  const { user, isLoading } = useAuth();

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  // Opens ticket detail modal for the specified request ID
  const handleOpenTicket = (id: string) => setSelectedRequestId(id);
  // Closes the ticket detail modal
  const handleCloseTicket = () => setSelectedRequestId(null);

  // Opens the public workshop profile modal for the specified shop ID
  const handleOpenShopProfile = (shopId: string) => setSelectedShopId(shopId);
  // Closes the public workshop profile modal
  const handleCloseShopProfile = () => setSelectedShopId(null);

  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#050505] text-neutral-500 dark:text-neutral-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white" />
          <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">Connecting to FixCraft SQLite Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#050505] text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      {/* Top Application Header */}
      <Header onSelectTicket={handleOpenTicket} />

      {/* Main Role-Specific Workspace or Guest Landing */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-12">
        {!user ? (
          <GuestLanding onOpenShopProfile={handleOpenShopProfile} />
        ) : user.role === 'admin' ? (
          <AdminDashboard
            onOpenTicket={handleOpenTicket}
            onOpenShopProfile={handleOpenShopProfile}
          />
        ) : user.role === 'shop' ? (
          <RepairShopDashboard onOpenTicket={handleOpenTicket} />
        ) : (
          <CustomerDashboard
            onOpenTicket={handleOpenTicket}
            onOpenShopProfile={handleOpenShopProfile}
          />
        )}
      </main>

      {/* Persistent Platform Assurance Footer - 70/20/10 Monochromatic */}
      <footer className="bg-neutral-100 dark:bg-[#0a0a0a] border-t border-neutral-200 dark:border-neutral-900 text-neutral-600 dark:text-neutral-400 text-xs py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-xs">
              <Wrench className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-neutral-900 dark:text-white tracking-tight">FixCraft Marketplace</span>
            <span className="text-neutral-500 dark:text-neutral-500 hidden sm:inline">— Hardware Diagnostics & Escrow Restorations</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-[11px]">
            <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />
              Minimum 90-Day Warranty Protection
            </span>
            <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
              <Database className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />
              100% Local SQLite Persistence
            </span>
          </div>
        </div>
      </footer>

      {/* Global Modals */}
      <TicketDetailModal
        requestId={selectedRequestId}
        onClose={handleCloseTicket}
        onOpenShopProfile={handleOpenShopProfile}
      />

      <ShopPublicModal
        shopId={selectedShopId}
        onClose={handleCloseShopProfile}
      />

      <AccountSettingsModal />
      <AuthModal />
      <ToastContainer />
    </div>
  );
};

// Root application component wrapping the workspace shell with global context providers
export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WorkspaceShell />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
