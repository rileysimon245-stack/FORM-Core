import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Info, HelpCircle } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-lg', 'max-w-sm', 'max-w-xl'
  maxHeight?: string; // default: 'max-h-[85dvh]'
  showCloseButton?: boolean;
  preventBackdropClose?: boolean;
  zIndex?: string; // default: 'z-[100]'
  className?: string;
  bodyClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  headerActions,
  maxWidth = 'max-w-md',
  maxHeight = 'max-h-[85dvh]',
  showCloseButton = true,
  preventBackdropClose = false,
  zIndex = 'z-[100]',
  className = '',
  bodyClassName = '',
}) => {
  // Prevent background scrolling while modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <div
          className={`fixed inset-0 ${zIndex} flex items-center justify-center p-3 sm:p-4 select-none font-sans overflow-hidden pointer-events-auto`}
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop Overlay: 60% opacity (within 55–65%), allows main interface to remain visible */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => {
              if (!preventBackdropClose) onClose();
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2.5px] cursor-pointer"
            aria-hidden="true"
          />

          {/* Modal Container: strictly centered, fits viewport, internal scroll with sticky footer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className={`relative w-full ${maxWidth} ${maxHeight} bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[#56CC97]/25 rounded-[32px] text-[#F2F5F3] shadow-[0_24px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden z-10 ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            {(title || showCloseButton || headerActions) && (
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#1F3A30] bg-[#10201A] shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {icon && (
                    <div className="w-10 h-10 rounded-[18px] bg-[#10221A] border border-[#56CC97]/30 text-[#56CC97] shadow-[0_0_16px_rgba(86,204,151,0.15)] flex items-center justify-center shrink-0">
                      {icon}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {typeof title === 'string' ? (
                      <h2 className="text-base sm:text-lg font-black uppercase text-[#F2F5F3] tracking-tight truncate leading-tight">
                        {title}
                      </h2>
                    ) : (
                      title
                    )}
                    {subtitle && (
                      <p className="text-xs text-[#C9D3CE] mt-0.5 truncate leading-tight font-medium">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-9 h-9 rounded-full bg-white text-[#08100D] hover:bg-zinc-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
                      title="Закрыть"
                      aria-label="Закрыть"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable Content Area: compact paddings, auto shrink */}
            <div
              className={`flex-1 overflow-y-auto px-5 py-4 space-y-3.5 no-scrollbar text-xs sm:text-sm leading-relaxed min-h-0 [overscroll-behavior:contain] ${bodyClassName}`}
            >
              {children}
            </div>

            {/* Sticky Footer: buttons always in view */}
            {footer && (
              <div className="px-5 py-4 border-t border-[#1F3A30] bg-[#0A1310] shrink-0 mt-auto">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};

// ============================================================================
// Unified Confirm Modal (Replaces window.confirm)
// ============================================================================
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'mint' | 'info';
  icon?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'mint',
  icon,
}) => {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-[#2B1414] border-[#4A2020]',
          iconColor: 'text-[#E05353]',
          defaultIcon: <AlertTriangle className="w-5 h-5 text-[#E05353]" />,
          btnClass:
            'bg-[#E05353] hover:bg-[#eb6767] text-white shadow-[0_4px_16px_rgba(224,83,83,0.35)]',
        };
      case 'warning':
        return {
          iconBg: 'bg-[#2A2312] border-[#4A3C1E]',
          iconColor: 'text-[#EAB308]',
          defaultIcon: <AlertTriangle className="w-5 h-5 text-[#EAB308]" />,
          btnClass:
            'bg-[#EAB308] hover:bg-[#facc15] text-[#080D0E] shadow-[0_4px_16px_rgba(234,179,8,0.35)]',
        };
      case 'info':
        return {
          iconBg: 'bg-[#12202A] border-[#1F394A]',
          iconColor: 'text-[#38BDF8]',
          defaultIcon: <Info className="w-5 h-5 text-[#38BDF8]" />,
          btnClass:
            'bg-[#38BDF8] hover:bg-[#7dd3fc] text-[#080D0E] shadow-[0_4px_16px_rgba(56,189,248,0.35)]',
        };
      case 'mint':
      default:
        return {
          iconBg: 'bg-[#14261E] border-[#234736]',
          iconColor: 'text-[#58C995]',
          defaultIcon: <HelpCircle className="w-5 h-5 text-[#58C995]" />,
          btnClass:
            'bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] shadow-[0_4px_20px_rgba(88,201,149,0.35)]',
        };
    }
  };

  const v = getVariantStyles();

  const content = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 select-none font-sans overflow-hidden pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          {/* Overlay: 60% opacity */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2.5px] cursor-pointer"
            aria-hidden="true"
          />

          {/* Dialog Window: strictly compact, buttons always visible */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="relative w-full max-w-sm max-h-[82dvh] bg-[#13171B] border border-[#1F2730] rounded-[32px] p-5 sm:p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.85)] flex flex-col z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3.5 border-b border-[#182027] shrink-0">
              <div
                className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${v.iconBg}`}
              >
                {icon || v.defaultIcon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-white tracking-tight leading-tight">
                  {title}
                </h3>
              </div>
            </div>

            <p className="py-4 text-xs text-[#8E9CA3] leading-relaxed">
              {description}
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#182027] shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-[#1C232B] hover:bg-[#252F3A] border border-[#27323D] text-[#E8E9E7] font-bold text-xs rounded-2xl cursor-pointer active:scale-95 transition-all text-center"
              >
                {cancelText}
              </button>

              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`w-full py-3 font-black text-xs uppercase tracking-wider rounded-2xl cursor-pointer active:scale-95 transition-all text-center ${v.btnClass}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};

// ============================================================================
// Unified Prompt Modal (Replaces window.prompt)
// ============================================================================
export interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  description?: string;
  defaultValue?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  defaultValue = '',
  initialValue,
  placeholder = 'Введите текст...',
  confirmText = 'Сохранить',
  cancelText = 'Отмена',
}) => {
  const initialText = initialValue !== undefined ? initialValue : defaultValue;
  const [value, setValue] = React.useState(initialText);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue !== undefined ? initialValue : defaultValue);
    }
  }, [isOpen, defaultValue, initialValue]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit(value);
    onClose();
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 select-none font-sans overflow-hidden pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          {/* Overlay: 60% opacity */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2.5px] cursor-pointer"
            aria-hidden="true"
          />

          {/* Dialog Window */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="relative w-full max-w-sm max-h-[82dvh] bg-[#11171A] border border-[#253338] rounded-[26px] p-4.5 sm:p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.75)] flex flex-col z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1E282D] shrink-0">
              <h3 className="text-sm sm:text-base font-bold text-[#E8E9E7] tracking-tight">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#182327] text-[#869194] hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {description && (
              <p className="pt-2.5 text-xs text-[#869194] leading-relaxed">
                {description}
              </p>
            )}

            <form onSubmit={handleSubmit} className="pt-3 space-y-3">
              <input
                type="text"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#080D0E] border border-[#253338] focus:border-[#58C995] rounded-xl px-3.5 py-2 text-xs text-[#E8E9E7] outline-none transition-colors"
              />

              <div className="grid grid-cols-2 gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-[#182327] hover:bg-[#202E34] text-[#C2C8C9] font-bold text-xs rounded-xl cursor-pointer active:scale-95 transition-all text-center"
                >
                  {cancelText}
                </button>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 transition-all text-center shadow-md"
                >
                  {confirmText}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};
