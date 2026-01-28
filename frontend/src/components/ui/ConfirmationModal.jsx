import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ConfirmationModal - Enterprise-grade confirmation dialog for critical actions
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal is closed
 * @param {function} onConfirm - Called when action is confirmed
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Text for confirm button (default: "Confirm")
 * @param {string} cancelText - Text for cancel button (default: "Cancel")
 * @param {string} variant - "danger" | "warning" | "info" (default: "danger")
 * @param {boolean} requireCountdown - If true, shows countdown before enabling confirm
 * @param {number} countdownSeconds - Countdown duration (default: 5)
 * @param {string} confirmInput - If provided, user must type this to confirm
 */
export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  requireCountdown = false,
  countdownSeconds = 5,
  confirmInput = null,
  icon = null,
  children
}) {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [inputValue, setInputValue] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCountdown(countdownSeconds);
      setInputValue('');
      setIsConfirming(false);
    }
  }, [isOpen, countdownSeconds]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !requireCountdown || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, requireCountdown, countdown]);

  // Determine if confirm button should be enabled
  const canConfirm =
    (!requireCountdown || countdown <= 0) &&
    (!confirmInput || inputValue === confirmInput);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  // Variant styles
  const variants = {
    danger: {
      iconBg: 'rgba(239, 68, 68, 0.15)',
      iconBorder: 'rgba(239, 68, 68, 0.3)',
      iconColor: '#ef4444',
      confirmBg: 'linear-gradient(135deg, #ef4444, #dc2626)',
      confirmHover: '#dc2626',
    },
    warning: {
      iconBg: 'rgba(245, 158, 11, 0.15)',
      iconBorder: 'rgba(245, 158, 11, 0.3)',
      iconColor: '#f59e0b',
      confirmBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
      confirmHover: '#d97706',
    },
    info: {
      iconBg: 'rgba(20, 184, 166, 0.15)',
      iconBorder: 'rgba(20, 184, 166, 0.3)',
      iconColor: '#14b8a6',
      confirmBg: 'linear-gradient(135deg, #14b8a6, #0d9488)',
      confirmHover: '#0d9488',
    }
  };

  const style = variants[variant] || variants.danger;

  // Default icons by variant
  const defaultIcons = {
    danger: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    warning: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    info: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: `1px solid ${style.iconBorder}`,
                boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${style.iconBg}`,
                backdropFilter: 'blur(20px)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header with Icon */}
              <div className="p-6 text-center">
                <div
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                  style={{
                    background: style.iconBg,
                    border: `1px solid ${style.iconBorder}`,
                  }}
                >
                  <span style={{ color: style.iconColor }}>
                    {icon || defaultIcons[variant]}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
                <p className="text-slate-400 text-sm">{message}</p>
              </div>

              {/* Custom content */}
              {children && (
                <div className="px-6 pb-4">
                  {children}
                </div>
              )}

              {/* Confirm input if required */}
              {confirmInput && (
                <div className="px-6 pb-4">
                  <label className="block text-sm text-slate-400 mb-2">
                    Type <span className="font-mono text-white bg-slate-800 px-2 py-0.5 rounded">{confirmInput}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={confirmInput}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="p-6 pt-2 flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl font-semibold text-slate-300 bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-all"
                >
                  {cancelText}
                </button>

                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm || isConfirming}
                  className="flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: canConfirm ? style.confirmBg : 'rgba(100, 116, 139, 0.5)',
                  }}
                >
                  {isConfirming ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </span>
                  ) : requireCountdown && countdown > 0 ? (
                    `Wait ${countdown}s`
                  ) : (
                    confirmText
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
