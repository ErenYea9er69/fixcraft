import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { Modal } from '../common/Modal';
import { User, Lock, Mail, Phone, MapPin, Bell, Shield, Loader2, Sun, Moon, Check, LogOut, AlertCircle } from 'lucide-react';

// User account management modal configuring profile fields, theme mode, and security credentials
export const AccountSettingsModal: React.FC = () => {
  const {
    user,
    settings,
    isSettingsModalOpen,
    closeSettingsModal,
    updateProfile,
    changePassword,
    logout,
    openAuthModal,
  } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

  // Profile form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [defaultCity, setDefaultCity] = useState('');
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>(theme);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setAvatar(user.avatar || '');
    }
    if (settings) {
      setDefaultAddress(settings.default_address || '');
      setDefaultCity(settings.default_city || '');
      setThemePref(settings.theme_preference || theme);
      setNotifyEmail(Boolean(settings.notify_email));
      setNotifySms(Boolean(settings.notify_sms));
    }
  }, [user, settings, isSettingsModalOpen, theme]);

  // Selects and applies theme preference to local state and DOM root
  const handleSelectTheme = (selectedTheme: 'light' | 'dark' | 'system') => {
    setThemePref(selectedTheme);
    if (selectedTheme === 'system') {
      const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
    } else {
      setTheme(selectedTheme);
    }
  };

  // Saves updated profile info, notification settings, and theme preferences via API
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateProfile({
        name,
        phone,
        avatar,
        defaultAddress,
        defaultCity,
        themePreference: themePref,
        notifyEmail,
        notifySms,
      });
      showToast('Profile and theme preferences updated successfully.', 'success');
      closeSettingsModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Validates password complexity requirements and updates credentials via API
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      showToast('Both old and new passwords are required', 'warning');
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      showToast('New password must be between 8 and 128 characters long', 'warning');
      return;
    }

    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasDigit = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);

    if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      showToast(
        'New password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character',
        'warning'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'warning');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      showToast('Password changed successfully. Please sign in with your new credentials.', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      closeSettingsModal();
      openAuthModal('login');
    } catch (err: any) {
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!isSettingsModalOpen) return null;

  return (
    <Modal
      isOpen={isSettingsModalOpen}
      onClose={closeSettingsModal}
      title="Account Settings & Security"
      subtitle="Manage your personal details, workspace theme preference, and login credentials."
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Tab navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-1.5 min-h-[44px] ${
              activeTab === 'profile'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Profile & Theme
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-1.5 min-h-[44px] ${
              activeTab === 'security'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Password & Security
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Theme Preference Selector */}
            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800">
              <span className="block text-xs font-semibold text-neutral-900 dark:text-white mb-2">
                Interface Color Scheme
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectTheme('light')}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all min-h-[44px] ${
                    themePref === 'light'
                      ? 'border-black bg-white shadow-xs ring-2 ring-neutral-300'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-[#161616] hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-300 flex items-center justify-center text-black">
                      <Sun className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900 dark:text-white">Light Mode</p>
                      <p className="text-[10px] text-neutral-500">Pure White / Minimal Contrast</p>
                    </div>
                  </div>
                  {themePref === 'light' && <Check className="w-4 h-4 text-black" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTheme('dark')}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all min-h-[44px] ${
                    themePref === 'dark'
                      ? 'border-white bg-[#1a1a1a] shadow-xs ring-2 ring-neutral-700'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-[#161616] hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-black border border-neutral-700 flex items-center justify-center text-white">
                      <Moon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900 dark:text-white">Dark Mode</p>
                      <p className="text-[10px] text-neutral-400">Deep Neutral / High Clarity</p>
                    </div>
                  </div>
                  {themePref === 'dark' && <Check className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                  <input
                    id="settings-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="settings-phone" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                  <input
                    id="settings-phone"
                    type="text"
                    placeholder="(415) 555-0199"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="settings-avatar" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Avatar Image URL
              </label>
              <input
                id="settings-avatar"
                type="url"
                placeholder="https://..."
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label htmlFor="settings-address" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Default Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                  <input
                    id="settings-address"
                    type="text"
                    placeholder="450 Mission St"
                    value={defaultAddress}
                    onChange={(e) => setDefaultAddress(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="settings-city" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Default City / Area
                </label>
                <input
                  id="settings-city"
                  type="text"
                  placeholder="San Francisco, CA"
                  value={defaultCity}
                  onChange={(e) => setDefaultCity(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none min-h-[44px]"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <span className="block text-xs font-semibold text-neutral-900 dark:text-white mb-2">
                Notification Subscriptions
              </span>
              <div className="space-y-2">
                <label htmlFor="settings-notify-email" className="flex items-center gap-2.5 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer min-h-[32px]">
                  <input
                    id="settings-notify-email"
                    type="checkbox"
                    checked={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.checked)}
                    className="w-4 h-4 rounded text-black border-neutral-300 dark:border-neutral-700 dark:bg-[#161616]"
                  />
                  <span>Email notifications for quote arrivals and bench status changes</span>
                </label>
                <label htmlFor="settings-notify-sms" className="flex items-center gap-2.5 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer min-h-[32px]">
                  <input
                    id="settings-notify-sms"
                    type="checkbox"
                    checked={notifySms}
                    onChange={(e) => setNotifySms(e.target.checked)}
                    className="w-4 h-4 rounded text-black border-neutral-300 dark:border-neutral-700 dark:bg-[#161616]"
                  />
                  <span>SMS alerts when device is ready for customer handover / collection</span>
                </label>
              </div>
            </div>

            {/* Session Management */}
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <span className="block text-xs font-semibold text-neutral-900 dark:text-white">Active Session</span>
                <span className="text-[11px] text-neutral-500">Sign out of this workstation</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeSettingsModal();
                  logout();
                  showToast('Signed out of session', 'info');
                }}
                className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 min-h-[44px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={closeSettingsModal}
                className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingProfile}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-semibold rounded-lg transition-colors shadow-2xs disabled:opacity-50 min-h-[44px]"
              >
                {isSavingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="settings-old-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Current Existing Password
              </label>
              <input
                id="settings-old-password"
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-colors min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="settings-new-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                New Password (8–128 characters)
              </label>
              <input
                id="settings-new-password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-colors min-h-[44px]"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Must include uppercase, lowercase, digit, and special character.
              </p>
            </div>

            <div>
              <label htmlFor="settings-confirm-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Confirm New Password
              </label>
              <input
                id="settings-confirm-password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-colors min-h-[44px]"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={closeSettingsModal}
                className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isChangingPassword}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-semibold rounded-lg transition-colors shadow-2xs disabled:opacity-50 min-h-[44px]"
              >
                {isChangingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Update Password
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
