import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface FormSelectOption<T extends string | number = string> {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface FormSelectProps<T extends string | number = string> {
  value: T;
  onChange: (value: T) => void;
  options: FormSelectOption<T>[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  size?: 'sm' | 'md';
}

export function FormSelect<T extends string | number = string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Выберите...',
  disabled = false,
  className = '',
  menuClassName = '',
  size = 'md',
}: FormSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
  };

  const isSmall = size === 'sm';

  return (
    <div className={`relative w-full text-left ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-[#92999A] mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <motion.button
        type="button"
        whileTap={{ scale: disabled ? 1 : 0.985 }}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 bg-[#101719] border ${
          isOpen ? 'border-[#58C995] ring-1 ring-[#58C995]/30' : 'border-[#252D2F] hover:border-[#384346]'
        } rounded-xl ${
          isSmall ? 'py-1.5 px-3 text-xs' : 'py-2.5 px-3.5 text-sm'
        } text-[#E8E9E7] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-[#92999A] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#58C995]' : ''
          }`}
        />
      </motion.button>

      {/* Animated Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className={`absolute left-0 right-0 mt-1.5 z-50 bg-[#141C1E] border border-[#2A3437] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md max-h-60 overflow-y-auto overscroll-contain ${menuClassName}`}
          >
            <div className="p-1 space-y-0.5">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#182821] text-[#58C995] font-semibold'
                        : 'text-[#C5CBCD] hover:bg-[#1A2326] hover:text-[#E8E9E7]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {option.icon && (
                        <span className={`shrink-0 ${isSelected ? 'text-[#58C995]' : 'text-[#8A9395]'}`}>
                          {option.icon}
                        </span>
                      )}
                      <div>
                        <div className="truncate">{option.label}</div>
                        {option.sublabel && (
                          <div className="text-[10px] text-[#788284] truncate">{option.sublabel}</div>
                        )}
                      </div>
                    </div>

                    {isSelected && <Check className="w-3.5 h-3.5 text-[#58C995] shrink-0" />}
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
