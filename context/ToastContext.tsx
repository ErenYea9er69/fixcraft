import React, { createContext, useContext, useState, useCallback } from 'react';

// Supported alert toast notification variants
export type ToastType = 'success' | 'error' | 'info' | 'warning';

// Data structure representing an active toast notification item
export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

// Context interface defining toast state, display trigger, and dismissal handler
interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Context provider managing active toast notifications queue with auto-dismissal
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Removes a specific toast notification from the active queue by ID
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Queues and renders a new toast notification with automatic timeout removal
  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = 'toast-' + Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

// Custom hook to trigger and manage toast notifications across the application
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

