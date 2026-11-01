import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface FormSelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  subtitle?: string;
}

interface FormSelectProps<T extends string | number = string | number> {
  value: T;
  onChange: (value: T) => void;
  options: FormSelectOption<T>[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  align?: 'left' | 'right' | 'full';
}

export function FormSelect<T extends string | number = string | number>({
  value,
  onChange,
  options,
  placeholder = 'Выберите...',
  label,
  disabled = false,
  className = '',
  buttonClassName = '',
  align = 'full',
}: FormSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close when tapping outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-[#92999A] mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <motion.button
        type="button"
        whileTap={{ scale: disabled ? 1 : 0.98 }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full bg-[#080D0E] border border-[#252D2F] hover:border-[#384346] focus:border-[#58C995] rounded-xl px-3 py-2.5 text-xs text-left flex items-center justify-between gap-2 transition-colors cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${isOpen ? 'border-[#58C995] ring-1 ring-[#58C995]/20' : ''} ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {selectedOption?.icon && (
            <span className="shrink-0">{selectedOption.icon}</span>
          )}
          <span
            className={`truncate font-medium ${
              selectedOption ? 'text-[#E8E9E7]' : 'text-[#697174]'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="shrink-0 text-[#92999A]"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.button>

      {/* FORM Core Graphite Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute z-50 mt-1.5 min-w-full w-max max-w-[92vw] bg-[#101719] border border-[#252D2F] rounded-xl shadow-2xl overflow-hidden py-1 max-h-60 overflow-y-auto no-scrollbar ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <div className="flex flex-col divide-y divide-[#1b2325]">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-[#14231b] text-[#58C995] font-semibold'
                        : 'text-[#E8E9E7] hover:bg-[#172023] active:bg-[#1a2529]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      {opt.icon && (
                        <span
                          className={`shrink-0 ${
                            isSelected ? 'text-[#58C995]' : 'text-[#92999A]'
                          }`}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <div className="truncate">
                        <span className="block truncate">{opt.label}</span>
                        {opt.subtitle && (
                          <span className="block text-[10px] text-[#92999A] truncate">
                            {opt.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-[#58C995] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
