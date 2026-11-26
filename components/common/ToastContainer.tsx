import React from 'react';
import { useToast } from '../../context/ToastContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

// Floating notification toast stack anchored at viewport bottom-right
export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-xl border bg-black dark:bg-[#141414] text-white border-neutral-800 text-sm transition-all duration-200 animate-in slide-in-from-bottom-3"
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-4 h-4 text-white" />}
              {isError && <AlertCircle className="w-4 h-4 text-neutral-300" />}
              {isWarning && <AlertTriangle className="w-4 h-4 text-neutral-300" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4 text-neutral-300" />}
            </div>

            <p className="flex-1 text-xs sm:text-sm font-semibold leading-tight text-white">
              {toast.message}
            </p>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-neutral-400 hover:text-white transition-colors p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
