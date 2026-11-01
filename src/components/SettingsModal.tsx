import React, { useState } from 'react';
import {
  X,
  Palette,
  Bell,
  Dumbbell,
  Shield,
  Info,
  Check,
  Moon,
  Sparkles,
  Volume2,
  Vibrate,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StorageService } from '../services/storage';
import { AppSettings } from '../types/workout';
import { FormSelect } from './common/FormSelect';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface SettingsModalProps {
  onClose: () => void;
  onExportData?: () => void;
  onImportData?: (jsonStr: string) => boolean;
  onResetData?: () => void;
  onDataChanged?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onDataChanged,
}) => {
  const [settings, setSettings] = useState<AppSettings>(StorageService.getSettings());

  const handleUpdate = (partial: Partial<AppSettings>) => {
    const updated = StorageService.updateSettings(partial);
    setSettings(updated);
    onDataChanged?.();
  };

  return (
    <motion.div
      variants={modalBackdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 select-none"
    >
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-md bg-[#101719] border border-[#252D2F] rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#252D2F] shrink-0 bg-[#101719] z-10">
          <div>
            <h3 className="text-base font-bold text-[#E8E9E7]">Настройки FORM Core</h3>
            <span className="text-[11px] text-[#92999A]">Версия 2.4.0 • Build 2026.10</span>
          </div>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] rounded-xl hover:bg-[#1E2628] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Scrollable Central Content Body */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-6 text-xs text-[#C5CBCD]"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* SECTION 1: ВНЕШНИЙ ВИД */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#58C995] uppercase tracking-wider">
              <Palette className="w-4 h-4" />
              <span>Внешний вид и анимация</span>
            </div>

            <div className="p-3.5 bg-[#080D0E] border border-[#202729] rounded-xl space-y-3">
              {/* Theme Selector */}
              <div>
                <FormSelect
                  label="Тема интерфейса"
                  value={settings.theme}
                  onChange={(val) => handleUpdate({ theme: val as any })}
                  options={[
                    { value: 'dark', label: 'Тёмная графитовая (FORM Dark)' },
                    { value: 'light', label: 'Светлая (Экспериментальная)' },
                    { value: 'system', label: 'Как в системе Android' },
                  ]}
                />
              </div>

              {/* Text Size */}
              <div>
                <FormSelect
                  label="Размер шрифта"
                  value={settings.textSize}
                  onChange={(val) => handleUpdate({ textSize: val as any })}
                  options={[
                    { value: 'compact', label: 'Компактный' },
                    { value: 'normal', label: 'Стандартный (Рекомендуется)' },
                    { value: 'large', label: 'Крупный' },
                  ]}
                />
              </div>

              {/* Accent Color */}
              <div>
                <FormSelect
                  label="Акцентный цвет"
                  value={settings.accentColor}
                  onChange={(val) => handleUpdate({ accentColor: val as any })}
                  options={[
                    { value: 'emerald', label: 'Изумрудный (#58C995)' },
                    { value: 'mint', label: 'Мятно-голубой (#4EA5D9)' },
                    { value: 'amber', label: 'Янтарный (#E5A93C)' },
                  ]}
                />
              </div>

              {/* Reduced Motion Toggle */}
              <div className="flex items-center justify-between pt-1 border-t border-[#1C2426]">
                <div>
                  <div className="font-semibold text-[#E8E9E7]">Уменьшение движения</div>
                  <div className="text-[10px] text-[#7A8386]">
                    Отключает тяжёлые анимации переходов (prefers-reduced-motion)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ reducedMotion: !settings.reducedMotion })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.reducedMotion ? 'bg-[#58C995]' : 'bg-[#252D2F]'
                  }`}
                >
                  <div
                    className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.reducedMotion ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 2: ТРЕНИРОВКИ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#58C995] uppercase tracking-wider">
              <Dumbbell className="w-4 h-4" />
              <span>Параметры тренировок</span>
            </div>

            <div className="p-3.5 bg-[#080D0E] border border-[#202729] rounded-xl space-y-3">
              {/* Weight Unit */}
              <div>
                <FormSelect
                  label="Единицы измерения веса"
                  value={settings.weightUnit}
                  onChange={(val) => handleUpdate({ weightUnit: val as any })}
                  options={[
                    { value: 'kg', label: 'Килограммы (кг)' },
                    { value: 'lbs', label: 'Фунты (lbs)' },
                  ]}
                />
              </div>

              {/* Default Rest Time */}
              <div>
                <FormSelect
                  label="Время отдыха по умолчанию"
                  value={String(settings.defaultRestSeconds)}
                  onChange={(val) => handleUpdate({ defaultRestSeconds: Number(val) })}
                  options={[
                    { value: '45', label: '45 секунд' },
                    { value: '60', label: '60 секунд (1 мин)' },
                    { value: '90', label: '90 секунд (1.5 мин)' },
                    { value: '120', label: '120 секунд (2 мин)' },
                    { value: '180', label: '180 секунд (3 мин)' },
                  ]}
                />
              </div>

              {/* Auto Advance Set */}
              <div className="flex items-center justify-between pt-1 border-t border-[#1C2426]">
                <div>
                  <div className="font-semibold text-[#E8E9E7]">Автопереход к подходу</div>
                  <div className="text-[10px] text-[#7A8386]">
                    Фокус на следующем подходе после отметки выполнения
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ autoAdvanceSet: !settings.autoAdvanceSet })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.autoAdvanceSet ? 'bg-[#58C995]' : 'bg-[#252D2F]'
                  }`}
                >
                  <div
                    className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.autoAdvanceSet ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Vibrate on Timer End */}
              <div className="flex items-center justify-between pt-1 border-t border-[#1C2426]">
                <div>
                  <div className="font-semibold text-[#E8E9E7]">Вибрация таймера</div>
                  <div className="text-[10px] text-[#7A8386]">
                    Тактильный сигнал окончания времени отдыха
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ vibrateOnTimerEnd: !settings.vibrateOnTimerEnd })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.vibrateOnTimerEnd ? 'bg-[#58C995]' : 'bg-[#252D2F]'
                  }`}
                >
                  <div
                    className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.vibrateOnTimerEnd ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 3: УВЕДОМЛЕНИЯ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#58C995] uppercase tracking-wider">
              <Bell className="w-4 h-4" />
              <span>Уведомления и напоминания</span>
            </div>

            <div className="p-3.5 bg-[#080D0E] border border-[#202729] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#E8E9E7]">Включить напоминания</div>
                  <div className="text-[10px] text-[#7A8386]">
                    Локальные напоминания о запланированных днях
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ notificationsEnabled: !settings.notificationsEnabled })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.notificationsEnabled ? 'bg-[#58C995]' : 'bg-[#252D2F]'
                  }`}
                >
                  <div
                    className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.notificationsEnabled && (
                <div className="pt-2 border-t border-[#1C2426] flex items-center justify-between">
                  <span className="text-[11px] text-[#C5CBCD]">Время вечернего напоминания</span>
                  <input
                    type="time"
                    value={settings.reminderTime}
                    onChange={(e) => handleUpdate({ reminderTime: e.target.value })}
                    className="bg-[#141C1E] border border-[#252D2F] text-[#E8E9E7] text-xs px-2 py-1 rounded-lg focus:border-[#58C995] outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: О ПРИЛОЖЕНИИ И ПРИВАТНОСТЬ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#58C995] uppercase tracking-wider">
              <Shield className="w-4 h-4" />
              <span>Конфиденциальность и система</span>
            </div>

            <div className="p-3.5 bg-[#080D0E] border border-[#202729] rounded-xl flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-[#58C995] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#E8E9E7]">100% Локальное хранение</span>
                <p className="text-[11px] text-[#92999A] leading-relaxed">
                  Все данные ваших тренировок, анкета, анатомический атлас и расписание хранятся исключительно в изолированном хранилище вашего устройства. Никакие персональные данные не передаются во внешнюю сеть.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#080D0E] border border-[#202729] rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#92999A]" />
                <span className="text-[#92999A]">Архитектура:</span>
              </div>
              <span className="font-semibold text-[#E8E9E7]">FORM Core Modern Mobile Engine</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
