import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserSettings, RepairShop, AppNotification, DemoAccount, UserRole } from '../types';
import { api, setStoredToken, getStoredToken } from '../services/client';
import { useTheme } from './ThemeContext';

// Context interface defining authenticated user state, permissions, and auth operations
interface AuthContextType {
  user: User | null;
  settings: UserSettings | null;
  shop: RepairShop | null;
  token: string | null;
  isLoading: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  demoAccounts: DemoAccount[];
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
  isSettingsModalOpen: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: 'customer' | 'shop';
    phone?: string;
    shopName?: string;
    address?: string;
    city?: string;
    specialties?: string[];
  }) => Promise<void>;
  logout: () => void;
  switchDemoAccount: (email: string) => Promise<void>;
  updateProfile: (data: {
    name?: string;
    phone?: string;
    avatar?: string;
    defaultAddress?: string;
    defaultCity?: string;
    themePreference?: 'light' | 'dark' | 'system';
    notifyEmail?: boolean;
    notifySms?: boolean;
  }) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Context provider managing authentication state, session persistence, and notifications
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [shop, setShop] = useState<RepairShop | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Syncs user theme preference with document root while respecting active selection
  const applyThemePreference = useCallback((pref?: 'light' | 'dark' | 'system' | null, force = false) => {
    if (!pref) return;

    // Do not clobber user's active client theme selection on login or refresh
    const localTheme = typeof window !== 'undefined' ? (localStorage.getItem('fixcraft_theme') as 'light' | 'dark' | null) : null;
    if (!force && localTheme) {
      // If user is currently in dark mode, never let default server 'light' revert the UI back to light mode
      if (localTheme === 'dark') return;
      return;
    }

    if (pref === 'system') {
      const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
    } else {
      setTheme(pref);
    }
  }, [setTheme]);

  // Fetches preconfigured demo test accounts in development mode
  const fetchDemoAccounts = useCallback(async () => {
    if (import.meta.env.PROD) {
      setDemoAccounts([]);
      return;
    }
    try {
      const accounts = await api.auth.getDemoAccounts();
      setDemoAccounts(accounts);
    } catch (err: any) {
      if (err?.status !== 404) {
        console.warn('Failed to fetch demo accounts:', err);
      }
    }
  }, []);

  // Fetches pending user notifications from the server
  const fetchNotifications = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const notifs = await api.auth.getNotifications();
      setNotifications(notifs);
    } catch {
      // Quiet fail if unauthorized or network dropped
    }
  }, []);

  // Reloads the current authenticated user profile, settings, and shop details
  const refreshUser = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setSettings(null);
      setShop(null);
      return;
    }
    try {
      const res = await api.auth.getMe();
      setUser(res.user);
      setSettings(res.settings);
      setShop(res.shop || null);
      applyThemePreference(res.settings?.theme_preference);
      await fetchNotifications();
    } catch (err) {
      console.warn('Auth token invalid or expired:', err);
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setSettings(null);
      setShop(null);
    }
  }, [applyThemePreference, fetchNotifications]);

  // Global 401 Session Eviction Listener
  useEffect(() => {
    const handleUnauthorized = () => {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setSettings(null);
      setShop(null);
      setNotifications([]);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:unauthorized', handleUnauthorized);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:unauthorized', handleUnauthorized);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      await fetchDemoAccounts();
      const saved = getStoredToken();
      if (saved) {
        try {
          const res = await api.auth.getMe();
          setUser(res.user);
          setSettings(res.settings);
          setShop(res.shop || null);
          applyThemePreference(res.settings?.theme_preference);
          await fetchNotifications();
        } catch {
          setStoredToken(null);
          setToken(null);
          setUser(null);
          setSettings(null);
          setShop(null);
        }
      }
      setIsLoading(false);
    }

    init();
  }, [applyThemePreference, fetchDemoAccounts, fetchNotifications]);

  // Periodic notification polling
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  // Authenticates user credentials, sets auth token, and initializes profile state
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
      setSettings(res.settings);
      setShop(res.shop || null);
      applyThemePreference(res.settings?.theme_preference);
      setIsAuthModalOpen(false);
      await fetchNotifications();
    } finally {
      setIsLoading(false);
    }
  };

  // Registers a new customer or repair workshop account and logs the user in
  const register = async (data: {
    name: string;
    email: string;
    password: string;
    role: 'customer' | 'shop';
    phone?: string;
    shopName?: string;
    address?: string;
    city?: string;
    specialties?: string[];
  }) => {
    setIsLoading(true);
    try {
      const res = await api.auth.register(data);
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
      setSettings(res.settings);
      setShop(res.shop || null);
      setIsAuthModalOpen(false);
      await fetchNotifications();
      await fetchDemoAccounts();
    } finally {
      setIsLoading(false);
    }
  };

  // Terminates the current session, clearing token storage and user state
  const logout = () => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setSettings(null);
    setShop(null);
    setNotifications([]);
  };

  // Switches active session to a selected demo account using preset credentials
  const switchDemoAccount = async (email: string) => {
    const pwd = email.includes('admin') ? 'admin123' : 'password123';
    await login(email, pwd);
  };

  // Updates current user profile fields, notification subscriptions, and theme preferences
  const updateProfile = async (data: {
    name?: string;
    phone?: string;
    avatar?: string;
    defaultAddress?: string;
    defaultCity?: string;
    themePreference?: 'light' | 'dark' | 'system';
    notifyEmail?: boolean;
    notifySms?: boolean;
  }) => {
    if (data.themePreference) {
      applyThemePreference(data.themePreference, true);
    }
    const res = await api.auth.updateProfile(data);
    setUser(res.user);
    setSettings(res.settings);
  };

  // Updates user password with credentials verification and triggers re-login
  const changePassword = async (oldPassword: string, newPassword: string) => {
    await api.auth.changePassword({ oldPassword, newPassword });
    logout();
  };

  // Marks a specific notification as read both locally and on the server
  const markNotificationRead = async (id: string) => {
    await api.auth.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: 1, isRead: true } : n))
    );
  };

  // Displays authentication modal dialog in specified mode (login or register)
  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  // Closes the authentication modal dialog
  const closeAuthModal = () => setIsAuthModalOpen(false);

  // Displays the account profile and security settings modal dialog
  const openSettingsModal = () => setIsSettingsModalOpen(true);
  // Closes the account settings modal dialog
  const closeSettingsModal = () => setIsSettingsModalOpen(false);

  const unreadCount = notifications.filter((n) => !n.is_read && !n.isRead).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        shop,
        token,
        isLoading,
        notifications,
        unreadCount,
        demoAccounts,
        isAuthModalOpen,
        authModalMode,
        isSettingsModalOpen,
        login,
        register,
        logout,
        switchDemoAccount,
        updateProfile,
        changePassword,
        fetchNotifications,
        markNotificationRead,
        openAuthModal,
        closeAuthModal,
        openSettingsModal,
        closeSettingsModal,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to consume authentication state, user profile, and session handlers
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
