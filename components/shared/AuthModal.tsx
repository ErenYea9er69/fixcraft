import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import { DeviceCategory } from '../../types';
import { Lock, Mail, User, Phone, MapPin, Building, Wrench, Loader2, AlertTriangle, X, Check } from 'lucide-react';

// Authentication modal providing sign-in, account registration, and demo account switching
export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, authModalMode, closeAuthModal, login, register } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>(authModalMode || 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Register fields
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'shop'>('customer');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [specialties, setSpecialties] = useState<DeviceCategory[]>(['phone', 'laptop']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync mode when parent opens
  React.useEffect(() => {
    if (authModalMode) {
      setMode(authModalMode);
      setErrorMessage(null);
    }
  }, [authModalMode]);

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const hasLength = password.length >= 8 && password.length <= 128;
  const isPasswordValid = hasLength && hasUpper && hasLower && hasDigit && hasSpecial;

  // Handles user login submission and session initialization
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      showToast('Welcome back! Logged in successfully.', 'success');
    } catch (err: any) {
      const msg = err.message || 'Login failed. Please check your credentials.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validates registration inputs, verifies password complexity, and registers user via API
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isPasswordValid) {
      const msg = 'Password must be between 8 and 128 characters and include uppercase, lowercase, a digit, and a special character.';
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        name,
        email,
        password,
        role,
        phone: phone || undefined,
        shopName: role === 'shop' ? shopName : undefined,
        address: role === 'shop' ? address : undefined,
        city: role === 'shop' ? city : undefined,
        specialties: role === 'shop' ? specialties : undefined,
      });
      showToast(
        role === 'shop'
          ? 'Workshop account registered! Profile published.'
          : 'Customer account created! You can now request repairs.',
        'success'
      );
    } catch (err: any) {
      const msg = err.message || 'Registration failed.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggles selection of repair specialty categories for workshop registration
  const toggleSpecialty = (cat: DeviceCategory) => {
    setSpecialties((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  if (!isAuthModalOpen) return null;

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      title={mode === 'login' ? 'Sign In to FixCraft' : 'Create an Account'}
      subtitle={
        mode === 'login'
          ? 'Enter your credentials or choose a quick demo account to test any role.'
          : 'Join as a customer or register a certified diagnostic workshop.'
      }
      maxWidth={mode === 'register' && role === 'shop' ? '2xl' : 'md'}
    >
      <div className="space-y-5">
        {/* Mode Toggle */}
        <div className="grid grid-cols-2 p-1 bg-neutral-100 dark:bg-[#161616] rounded-xl text-xs font-semibold border border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`py-2.5 rounded-lg transition-all min-h-[44px] flex items-center justify-center ${
              mode === 'login'
                ? 'bg-black dark:bg-white text-white dark:text-black shadow-xs font-bold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`py-2.5 rounded-lg transition-all min-h-[44px] flex items-center justify-center ${
              mode === 'register'
                ? 'bg-black dark:bg-white text-white dark:text-black shadow-xs font-bold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Register Account
          </button>
        </div>

        {/* Inline Error Banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 text-xs flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-neutral-400 hover:text-black dark:hover:text-white p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {mode === 'login' ? (
          <>
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label htmlFor="auth-login-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
                  <input
                    id="auth-login-email"
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-login-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
                  <input
                    id="auth-login-password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 mt-4 min-h-[44px]"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign In
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            {/* Account Type Selector */}
            <div>
              <span className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Account Type
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('customer')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all min-h-[44px] ${
                    role === 'customer'
                      ? 'border-black dark:border-white bg-neutral-100 dark:bg-[#1e1e1e] ring-1 ring-black dark:ring-white'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#161616]'
                  }`}
                >
                  <User className={`w-4 h-4 mt-0.5 ${role === 'customer' ? 'text-black dark:text-white' : 'text-neutral-400'}`} />
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-white">Customer</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Need devices repaired</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('shop')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all min-h-[44px] ${
                    role === 'shop'
                      ? 'border-black dark:border-white bg-neutral-100 dark:bg-[#1e1e1e] ring-1 ring-black dark:ring-white'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#161616]'
                  }`}
                >
                  <Wrench className={`w-4 h-4 mt-0.5 ${role === 'shop' ? 'text-black dark:text-white' : 'text-neutral-400'}`} />
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-white">Repair Workshop</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Provide repair services</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="auth-register-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {role === 'shop' ? 'Owner / Contact Name' : 'Full Name'}
                </label>
                <input
                  id="auth-register-name"
                  type="text"
                  required
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="auth-register-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Email Address
                </label>
                <input
                  id="auth-register-email"
                  type="email"
                  required
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="auth-register-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Password
                </label>
                <input
                  id="auth-register-password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="auth-register-phone" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Phone Number
                </label>
                <input
                  id="auth-register-phone"
                  type="text"
                  placeholder="(415) 555-0199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                />
              </div>
            </div>

            {/* Password Requirement / Strength Indicator */}
            {password.length > 0 && (
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800 text-[11px] space-y-1">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Password Complexity Criteria:
                </span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <span className={`flex items-center gap-1 ${hasLength ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-400'}`}>
                    <Check className={`w-3 h-3 ${hasLength ? 'opacity-100' : 'opacity-30'}`} /> 8–128 characters
                  </span>
                  <span className={`flex items-center gap-1 ${hasUpper ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-400'}`}>
                    <Check className={`w-3 h-3 ${hasUpper ? 'opacity-100' : 'opacity-30'}`} /> Uppercase letter
                  </span>
                  <span className={`flex items-center gap-1 ${hasLower ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-400'}`}>
                    <Check className={`w-3 h-3 ${hasLower ? 'opacity-100' : 'opacity-30'}`} /> Lowercase letter
                  </span>
                  <span className={`flex items-center gap-1 ${hasDigit && hasSpecial ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-400'}`}>
                    <Check className={`w-3 h-3 ${hasDigit && hasSpecial ? 'opacity-100' : 'opacity-30'}`} /> Digit & special symbol
                  </span>
                </div>
              </div>
            )}

            {/* Shop specific fields */}
            {role === 'shop' && (
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                <div>
                  <label htmlFor="auth-register-shop-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Workshop / Laboratory Name
                  </label>
                  <input
                    id="auth-register-shop-name"
                    type="text"
                    required
                    placeholder="e.g. Apex Precision Diagnostics"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="auth-register-shop-address" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Street Address
                    </label>
                    <input
                      id="auth-register-shop-address"
                      type="text"
                      required
                      placeholder="742 Market St, Suite 400"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-register-shop-city" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      City & State
                    </label>
                    <input
                      id="auth-register-shop-city"
                      type="text"
                      required
                      placeholder="San Francisco, CA"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Repair Specialties (Select all that apply)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(['phone', 'laptop', 'appliance', 'audio', 'gaming', 'other'] as DeviceCategory[]).map(
                      (cat) => {
                        const isSelected = specialties.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleSpecialty(cat)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize border transition-all min-h-[44px] flex items-center ${
                              isSelected
                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-xs'
                                : 'bg-neutral-50 dark:bg-[#161616] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-[#202020]'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 mt-4 min-h-[44px]"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {role === 'shop' ? 'Create Workshop Profile' : 'Register Account'}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
};
