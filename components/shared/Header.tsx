import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { NotificationDrawer } from './NotificationDrawer';
import {
  Wrench,
  ShieldCheck,
  Bell,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';

// Props interface for persistent application header
interface HeaderProps {
  onSelectTicket?: (requestId: string) => void;
}

// Sticky top navigation bar displaying platform branding, active role, theme toggle, notifications, and profile menu
export const Header: React.FC<HeaderProps> = ({ onSelectTicket }) => {
  const {
    user,
    shop,
    unreadCount,
    logout,
    openAuthModal,
    openSettingsModal,
  } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme, isDark } = useTheme();

  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);

  const userRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-900 shadow-2xs transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-xs">
              <Wrench className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-neutral-900 dark:text-white">
                  FixCraft
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800">
                  SQLite Escrow Engine
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 hidden md:block">
                Hardware Diagnostics & Certified Workshop Marketplace
              </p>
            </div>
          </div>

          {/* Center: Active Role Badge */}
          {user && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-black dark:bg-white animate-pulse" />
              <span className="text-neutral-500 dark:text-neutral-400 font-normal">Active Role:</span>
              <span className="font-semibold text-neutral-900 dark:text-white capitalize">
                {user.role === 'admin'
                  ? 'Operations Admin Desk'
                  : user.role === 'shop'
                  ? shop?.name || 'Certified Workshop'
                  : 'Customer Workspace'}
              </span>
              {user.role === 'shop' && shop?.verified && (
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-900 dark:text-white ml-0.5" />
              )}
            </div>
          )}

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Dark / Light Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-white" />
              ) : (
                <Moon className="w-4 h-4 text-black" />
              )}
            </button>

            {/* Notifications Bell */}
            {user && (
              <button
                type="button"
                onClick={() => setIsNotifDrawerOpen(true)}
                className="relative p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="View notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-600 dark:bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center font-mono shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}

            {/* User Profile dropdown or Sign In */}
            {user ? (
              <div className="relative" ref={userRef}>
                <button
                  type="button"
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 border border-transparent hover:border-neutral-200 dark:border-neutral-800 transition-colors min-h-[44px]"
                >
                  <img
                    src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80'}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover border border-neutral-200 dark:border-neutral-800"
                  />
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 max-w-[100px] truncate hidden sm:inline">
                    {user.name.split(' ')[0]}
                  </span>
                  <ChevronDown className="w-3 h-3 text-neutral-500" />
                </button>

                {isUserDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#121212] shadow-xl border border-neutral-200 dark:border-neutral-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3.5 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                      <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">{user.name}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{user.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold border border-neutral-200 dark:border-neutral-700">
                        {user.role}
                      </span>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserDropdownOpen(false);
                          openSettingsModal();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 flex items-center gap-2 transition-colors min-h-[44px]"
                      >
                        <Settings className="w-3.5 h-3.5 text-neutral-500" />
                        Profile & Settings
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserDropdownOpen(false);
                          toggleTheme();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 flex items-center justify-between transition-colors min-h-[44px]"
                      >
                        <span className="flex items-center gap-2">
                          {isDark ? <Sun className="w-3.5 h-3.5 text-white" /> : <Moon className="w-3.5 h-3.5 text-black" />}
                          Theme
                        </span>
                        <span className="text-[10px] text-neutral-500 uppercase font-mono font-bold">
                          {theme}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserDropdownOpen(false);
                          logout();
                          openAuthModal('login');
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 flex items-center gap-2 transition-colors min-h-[44px]"
                      >
                        <User className="w-3.5 h-3.5 text-neutral-500" />
                        Switch Account
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserDropdownOpen(false);
                          logout();
                          showToast('Signed out successfully', 'info');
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-2 transition-colors font-semibold min-h-[44px]"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="px-3 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white transition-colors min-h-[44px] flex items-center"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('register')}
                  className="px-3.5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-semibold rounded-lg transition-colors shadow-xs min-h-[44px] flex items-center"
                >
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        onSelectTicket={onSelectTicket}
      />
    </>
  );
};
