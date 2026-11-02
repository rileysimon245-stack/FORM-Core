import React, { useState, useMemo } from 'react';
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
  Search,
  ChevronRight,
  Sliders,
  Globe,
  Database,
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
  const [searchQuery, setSearchQuery] = useState('');

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
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 select-none"
    >
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-lg bg-[#0a0a0c] border border-[#222226] rounded-t-3xl sm:rounded-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header with Search Bar (HiOS / Android Reference Style) */}
        <div className="p-4 border-b border-[#222226] bg-[#0a0a0c] z-10 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Настройки</h3>
              <span className="text-[11px] text-zinc-500 font-medium">FORM Core • Build 2026.11</span>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-full bg-[#161618] border border-[#26262a] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Pill Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск в настройках..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#141416] border border-[#26262a] rounded-full pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#58C995] transition-colors"
            />
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-zinc-300"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* SECTION 1: ВНЕШНИЙ ВИД */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-1">
              Интерфейс и оформление
            </span>

            <div className="bg-[#141416] border border-[#222226] rounded-2xl overflow-hidden divide-y divide-[#222226]">
              {/* Theme */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-[#58C995] flex items-center justify-center shrink-0">
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Тема интерфейса</div>
                    <div className="text-[10px] text-zinc-500">Тёмная графитовая (FORM Dark)</div>
                  </div>
                </div>
                <div className="w-40">
                  <FormSelect
                    value={settings.theme}
                    onChange={(val) => handleUpdate({ theme: val as any })}
                    options={[
                      { value: 'dark', label: 'Тёмная' },
                      { value: 'light', label: 'Светлая' },
                      { value: 'system', label: 'Системная' },
                    ]}
                  />
                </div>
              </div>

              {/* Text Size */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Размер шрифта</div>
                    <div className="text-[10px] text-zinc-500">Масштабирование текста</div>
                  </div>
                </div>
                <div className="w-40">
                  <FormSelect
                    value={settings.textSize}
                    onChange={(val) => handleUpdate({ textSize: val as any })}
                    options={[
                      { value: 'compact', label: 'Компактный' },
                      { value: 'normal', label: 'Стандартный' },
                      { value: 'large', label: 'Крупный' },
                    ]}
                  />
                </div>
              </div>

              {/* Accent Color */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Акцентный цвет</div>
                    <div className="text-[10px] text-zinc-500">Изумрудный (#58C995)</div>
                  </div>
                </div>
                <div className="w-40">
                  <FormSelect
                    value={settings.accentColor}
                    onChange={(val) => handleUpdate({ accentColor: val as any })}
                    options={[
                      { value: 'emerald', label: 'Изумрудный' },
                      { value: 'mint', label: 'Мятный' },
                      { value: 'amber', label: 'Янтарный' },
                    ]}
                  />
                </div>
              </div>

              {/* Reduced Motion Toggle */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Уменьшение движения</div>
                    <div className="text-[10px] text-zinc-500">Отключить тяжёлые переходы</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ reducedMotion: !settings.reducedMotion })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.reducedMotion ? 'bg-[#58C995]' : 'bg-[#26262a]'
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
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-1">
              Параметры тренировок
            </span>

            <div className="bg-[#141416] border border-[#222226] rounded-2xl overflow-hidden divide-y divide-[#222226]">
              {/* Weight Unit */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-[#58C995] flex items-center justify-center shrink-0">
                    <Dumbbell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Единица веса</div>
                    <div className="text-[10px] text-zinc-500">Килограммы / Фунты</div>
                  </div>
                </div>
                <div className="w-36">
                  <FormSelect
                    value={settings.weightUnit}
                    onChange={(val) => handleUpdate({ weightUnit: val as any })}
                    options={[
                      { value: 'kg', label: 'Килограммы (кг)' },
                      { value: 'lbs', label: 'Фунты (lbs)' },
                    ]}
                  />
                </div>
              </div>

              {/* Default Rest Time */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Отдых по умолчанию</div>
                    <div className="text-[10px] text-zinc-500">Таймер между подходами</div>
                  </div>
                </div>
                <div className="w-40">
                  <FormSelect
                    value={String(settings.defaultRestSeconds)}
                    onChange={(val) => handleUpdate({ defaultRestSeconds: Number(val) })}
                    options={[
                      { value: '45', label: '45 секунд' },
                      { value: '60', label: '60 секунд' },
                      { value: '90', label: '90 секунд' },
                      { value: '120', label: '120 секунд' },
                    ]}
                  />
                </div>
              </div>

              {/* Auto Advance Set */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Автопереход к подходу</div>
                    <div className="text-[10px] text-zinc-500">Фокус на следующем подходе</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ autoAdvanceSet: !settings.autoAdvanceSet })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.autoAdvanceSet ? 'bg-[#58C995]' : 'bg-[#26262a]'
                  }`}
                >
                  <div
                    className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.autoAdvanceSet ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Vibrate */}
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                    <Vibrate className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Вибрация таймера</div>
                    <div className="text-[10px] text-zinc-500">Тактильный сигнал окончания отдыха</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ vibrateOnTimerEnd: !settings.vibrateOnTimerEnd })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.vibrateOnTimerEnd ? 'bg-[#58C995]' : 'bg-[#26262a]'
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
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-1">
              Уведомления
            </span>

            <div className="bg-[#141416] border border-[#222226] rounded-2xl overflow-hidden divide-y divide-[#222226]">
              <div className="p-3.5 flex items-center justify-between hover:bg-[#1c1c20] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Напоминания о тренировках</div>
                    <div className="text-[10px] text-zinc-500">Локальные оповещения</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdate({ notificationsEnabled: !settings.notificationsEnabled })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.notificationsEnabled ? 'bg-[#58C995]' : 'bg-[#26262a]'
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
                <div className="p-3.5 flex items-center justify-between bg-[#101012]">
                  <span className="text-zinc-300">Время вечернего напоминания</span>
                  <input
                    type="time"
                    value={settings.reminderTime}
                    onChange={(e) => handleUpdate({ reminderTime: e.target.value })}
                    className="bg-[#1c1c20] border border-[#26262a] text-white text-xs px-2.5 py-1 rounded-lg focus:border-[#58C995] outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: КОНФИДЕНЦИАЛЬНОСТЬ */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-1">
              Безопасность и данные
            </span>

            <div className="bg-[#141416] border border-[#222226] rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-[#58C995] flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-white">100% Локальное хранение</div>
                  <div className="text-[10px] text-zinc-500">Защита конфиденциальности</div>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed pl-11">
                Все ваши тренировки, анкета, анатомический атлас и расписание хранятся исключительно в памяти вашего устройства. Данные не передаются на внешние серверы.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
