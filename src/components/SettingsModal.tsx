import React, { useState, useEffect, useRef } from 'react';
import {
  Palette,
  Bell,
  Dumbbell,
  Shield,
  Moon,
  Sparkles,
  Volume2,
  Vibrate,
  Search,
  Sliders,
  Database,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { StorageService } from '../services/storage';
import { SafeWriteResult } from '../services/migrations';
import { AppSettings, StorageHealthReport } from '../types/workout';
import { FormSelect } from './common/FormSelect';
import { Modal, ConfirmModal } from './common/Modal';

interface SettingsModalProps {
  onClose: () => void;
  onExportData?: () => void | SafeWriteResult;
  onImportData?: (jsonStr: string) => boolean | SafeWriteResult;
  onResetData?: () => void | SafeWriteResult;
  onDataChanged?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onExportData,
  onImportData,
  onResetData,
  onDataChanged,
}) => {
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());
  const [searchQuery, setSearchQuery] = useState('');
  const [health, setHealth] = useState<StorageHealthReport>(() =>
    StorageService.getStorageHealth()
  );
  const [corruptedKeys, setCorruptedKeys] = useState<string[]>(() =>
    StorageService.getCorruptedKeys()
  );
  const [lastWriteError, setLastWriteError] = useState<string | null>(() =>
    StorageService.getLastWriteError()
  );
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshDiagnostics = () => {
    setHealth(StorageService.getStorageHealth());
    setCorruptedKeys(StorageService.getCorruptedKeys());
    setLastWriteError(StorageService.getLastWriteError());
    setSettings(StorageService.getSettings());
  };

  useEffect(() => {
    const unsub = StorageService.subscribe(() => {
      refreshDiagnostics();
    });
    return () => unsub();
  }, []);

  const handleUpdate = (partial: Partial<AppSettings>) => {
    const updated = StorageService.updateSettings(partial);
    const err = StorageService.getLastWriteError();
    if (err) {
      setStatusNotice({ type: 'error', message: err });
      setLastWriteError(err);
      return;
    }
    setSettings(updated);
    onDataChanged?.();
  };

  const handleExportClick = () => {
    setStatusNotice(null);
    try {
      if (onExportData) {
        const res = onExportData();
        if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
          setStatusNotice({
            type: 'error',
            message: res.error || 'Не удалось экспортировать резервную копию.',
          });
          return;
        }
      } else {
        const json = StorageService.exportBackupJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FORM_workout_backup.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setStatusNotice({
        type: 'success',
        message: 'Резервная копия JSON сформирована и выгружена.',
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        message: err?.message || 'Ошибка при экспорте резервной копии.',
      });
    }
  };

  const runImportString = (rawJson: string) => {
    setStatusNotice(null);
    if (!rawJson || !rawJson.trim()) {
      setStatusNotice({
        type: 'error',
        message: 'Файл или текст резервной копии пуст.',
      });
      return;
    }

    let ok = false;
    let errorMsg: string | null = null;

    if (onImportData) {
      const res = onImportData(rawJson);
      if (typeof res === 'boolean') {
        ok = res;
        if (!ok) {
          errorMsg = StorageService.getLastWriteError();
        }
      } else if (res && typeof res === 'object') {
        ok = res.ok;
        errorMsg = res.error;
      }
    } else {
      const res = StorageService.importBackupJsonWithResult(rawJson);
      ok = res.ok;
      errorMsg = res.error;
    }

    refreshDiagnostics();

    if (ok) {
      setStatusNotice({
        type: 'success',
        message: 'Резервная копия успешно проверена и восстановлена.',
      });
      setPasteJsonText('');
      setShowPasteImport(false);
      onDataChanged?.();
    } else {
      setStatusNotice({
        type: 'error',
        message:
          errorMsg ||
          'Импорт отклонён: некорректный файл или нехватка памяти устройства. Исходные данные сохранены.',
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const content = await file.text();
      runImportString(content);
    } catch {
      setStatusNotice({
        type: 'error',
        message: 'Не удалось прочитать выбранный файл резервной копии.',
      });
    }
  };

  const handleConfirmReset = () => {
    setStatusNotice(null);
    let ok = true;
    let errorMsg: string | null = null;

    if (onResetData) {
      const res = onResetData();
      if (res && typeof res === 'object' && 'ok' in res) {
        ok = res.ok;
        errorMsg = res.error;
      }
    } else {
      const res = StorageService.resetAllData();
      ok = res.ok;
      errorMsg = res.error;
    }

    refreshDiagnostics();

    if (ok) {
      setStatusNotice({
        type: 'success',
        message: 'Все локальные данные и блокировки карантина полностью очищены.',
      });
      onDataChanged?.();
    } else {
      setStatusNotice({
        type: 'error',
        message: errorMsg || 'Не удалось полностью сбросить данные.',
      });
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const matchSection = (...keywords: string[]) =>
    !q || keywords.some((kw) => kw.toLowerCase().includes(q));

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Настройки"
        subtitle="FORM Core • Build 2026.11"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
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

          {/* SECTION 1: ВНЕШНИЙ ВИД */}
          {matchSection('интерфейс', 'оформление', 'тема', 'шрифт', 'акцентный цвет', 'движение') && (
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
          )}

          {/* SECTION 2: ТРЕНИРОВКИ */}
          {matchSection('тренировки', 'параметры', 'вес', 'отдых', 'таймер', 'подход', 'вибрация') && (
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
          )}

          {/* SECTION 3: УВЕДОМЛЕНИЯ */}
          {matchSection('уведомления', 'напоминания', 'время') && (
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
                    onClick={() =>
                      handleUpdate({ notificationsEnabled: !settings.notificationsEnabled })
                    }
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
          )}

          {/* SECTION 4: УПРАВЛЕНИЕ ДАННЫМИ, РЕЗЕРВНЫЕ КОПИИ И ДИАГНОСТИКА */}
          {matchSection(
            'данные',
            'безопасность',
            'резервная',
            'экспорт',
            'импорт',
            'сброс',
            'диагностика',
            'карантин',
            'память'
          ) && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-1">
                Управление данными и диагностика
              </span>

              <div className="bg-[#141416] border border-[#222226] rounded-2xl p-4 space-y-3">
                {/* Privacy Info */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-[#58C995] flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">Локальное хранилище (v{health.schemaVersion})</div>
                      <div className="text-[10px] text-zinc-400">
                        Данные хранятся только на вашем устройстве
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshDiagnostics}
                    className="p-2 rounded-xl bg-[#1C1C20] border border-[#2A2A30] text-zinc-400 hover:text-[#58C995] cursor-pointer transition-colors"
                    title="Обновить диагностику"
                    aria-label="Обновить диагностику хранилища"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Storage Health Metrics */}
                <div className="grid grid-cols-3 gap-2 bg-[#0D1011] border border-[#1E2426] rounded-xl p-2.5 text-center">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Тренировок</span>
                    <span className="text-xs font-bold text-white font-mono">
                      {health.sessionsCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Программ</span>
                    <span className="text-xs font-bold text-white font-mono">
                      {health.programsCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Спорт</span>
                    <span className="text-xs font-bold text-white font-mono">
                      {health.sportSessionsCount}
                    </span>
                  </div>
                </div>

                {/* Active Health / Corruption / Write Error Warnings */}
                {corruptedKeys.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#2A1C12] border border-[#6E441F] text-xs text-[#FCD34D] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#FBBF24]">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Обнаружены повреждённые разделы (карантин)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#FDE68A]">
                      Запись заблокирована для защиты исходных данных: {corruptedKeys.join(', ')}.
                      Восстановите данные из резервной копии JSON или выполните сброс.
                    </p>
                  </div>
                )}

                {lastWriteError && (
                  <div className="p-3 rounded-xl bg-[#2B1414] border border-[#5C2626] text-xs text-[#FCA5A5] space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-[#F87171]">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Последняя ошибка сохранения</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">{lastWriteError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        StorageService.clearLastWriteError();
                        refreshDiagnostics();
                      }}
                      className="text-[10px] font-bold text-[#F87171] underline cursor-pointer"
                    >
                      Скрыть предупреждение
                    </button>
                  </div>
                )}

                {!lastWriteError && corruptedKeys.length === 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-[#58C995] px-1">
                    <Database className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Состояние памяти: норма
                      {health.hasPreMigrationBackup ? ' • есть автоснимок до v11' : ''}
                    </span>
                  </div>
                )}

                {/* Status feedback for export/import/reset */}
                {statusNotice && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      statusNotice.type === 'success'
                        ? 'bg-[#12261C] border-[#26543E] text-[#7BE3B0]'
                        : 'bg-[#2B1414] border-[#5C2626] text-[#FCA5A5]'
                    }`}
                  >
                    {statusNotice.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#58C995]" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#F87171]" />
                    )}
                    <span className="leading-relaxed">{statusNotice.message}</span>
                  </div>
                )}

                {/* Export & Import Buttons */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleExportClick}
                    className="py-2.5 px-3 bg-[#152820] hover:bg-[#1B352A] border border-[#285440] text-[#58C995] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Экспорт JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2.5 px-3 bg-[#192226] hover:bg-[#222E33] border border-[#2C3A40] text-[#E8E9E7] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#58C995]" />
                    <span>Импорт файла</span>
                  </button>
                </div>

                {/* Paste JSON toggle (convenient on mobile) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPasteImport((prev) => !prev)}
                    className="text-[11px] font-semibold text-zinc-400 hover:text-[#58C995] transition-colors cursor-pointer"
                  >
                    {showPasteImport
                      ? 'Скрыть вставку JSON текстом'
                      : 'Вставить резервную копию текстом JSON'}
                  </button>

                  {showPasteImport && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={4}
                        value={pasteJsonText}
                        onChange={(e) => setPasteJsonText(e.target.value)}
                        placeholder='Вставьте содержимое JSON резервной копии сюда...'
                        className="w-full bg-[#0D1011] border border-[#262D30] rounded-xl p-2.5 text-[11px] font-mono text-white focus:outline-none focus:border-[#58C995]"
                      />
                      <button
                        type="button"
                        onClick={() => runImportString(pasteJsonText)}
                        className="w-full py-2 bg-[#58C995] hover:bg-[#6AD5A4] text-[#08100D] font-bold text-xs rounded-xl cursor-pointer transition-colors"
                      >
                        Восстановить из вставленного JSON
                      </button>
                    </div>
                  )}
                </div>

                {/* Reset All Data with mandatory confirmation */}
                <div className="pt-2 border-t border-[#222226]">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full py-2.5 px-3 bg-[#241414] hover:bg-[#311A1A] border border-[#4D2424] text-[#F87171] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Сбросить все данные</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmReset}
        title="Сбросить все данные?"
        description="Все ваши тренировки, программы, настройки, пользовательские упражнения и карантинные копии будут безвозвратно удалены. Перед сбросом рекомендуется сделать Экспорт JSON."
        confirmText="Удалить всё"
        cancelText="Отмена"
        variant="danger"
      />
    </>
  );
};

