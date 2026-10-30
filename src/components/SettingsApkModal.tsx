import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Download,
  Upload,
  RotateCcw,
  Check,
  Copy,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface SettingsApkModalProps {
  onClose: () => void;
  onExportData: () => void;
  onImportData: (json: string) => boolean;
  onResetData: () => void;
}

export const SettingsApkModal: React.FC<SettingsApkModalProps> = ({
  onClose,
  onExportData,
  onImportData,
  onResetData,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [importJsonText, setImportJsonText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [importSuccess, setImportSuccess] = useState<boolean | null>(null);

  const capacitorCommands = [
    'npm install @capacitor/core @capacitor/cli @capacitor/android',
    'npx cap init "FORM" "com.form.workoutapp"',
    'npm run build',
    'npx cap add android',
    'npx cap copy && npx cap open android',
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleImportSubmit = () => {
    if (!importJsonText.trim()) return;
    const ok = onImportData(importJsonText);
    setImportSuccess(ok);
    if (ok) {
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  return (
    <motion.div
      variants={modalBackdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3"
    >
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-md bg-[#161616] border border-[#262626] rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#45A66B]" />
            <h2 className="text-base font-bold text-[#F2F2F2]">
              Настройки & Android APK
            </h2>
          </div>
          <button onClick={onClose} className="text-[#858585] hover:text-[#F2F2F2]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Environment notice */}
          <div className="p-3 bg-[#1c2921] border border-[#2d4d3a] rounded-xl text-[#c0e8cf] space-y-1">
            <span className="font-bold block text-sm text-[#45A66B]">
              Среда выполнения: Web / PWA
            </span>
            <p className="text-[11px] leading-relaxed">
              Приложение создано как полноценное адаптивное Touch-First Web-приложение и PWA. Ниже описано, как скомпилировать его в готовый Android APK (с поддержкой Android 13/14).
            </p>
          </div>

          {/* Option 1: Capacitor */}
          <div className="bg-[#121212] border border-[#242424] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F2F2F2] text-xs">
                Способ 1. Упаковка в APK через Capacitor
              </span>
              <span className="text-[10px] bg-[#222] text-[#A0A0A0] px-2 py-0.5 rounded">
                Рекомендуется
              </span>
            </div>

            <p className="text-[#858585] text-[11px]">
              Выполните эти команды в терминале проекта для генерации нативного Android-проекта:
            </p>

            <div className="space-y-1.5 font-mono text-[10px]">
              {capacitorCommands.map((cmd, idx) => (
                <div
                  key={idx}
                  className="bg-[#181818] border border-[#242424] p-2 rounded-lg flex items-center justify-between gap-2"
                >
                  <span className="text-[#A0A0A0] truncate">{cmd}</span>
                  <button
                    onClick={() => handleCopy(cmd, idx)}
                    className="text-[#858585] hover:text-[#45A66B] shrink-0 p-0.5"
                    title="Копировать"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3.5 h-3.5 text-[#45A66B]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[#858585] text-[10px]">
              После <code className="text-[#A0A0A0]">cap open android</code> откроется Android Studio. Выберите <b>Build &gt; Build Bundle(s) / APK(s) &gt; Build APK(s)</b>.
            </p>
          </div>

          {/* Option 2: Instant PWA install */}
          <div className="bg-[#121212] border border-[#242424] rounded-xl p-3.5 space-y-1.5">
            <span className="font-bold text-[#F2F2F2] text-xs block">
              Способ 2. Установка как PWA прямо на Android смартфон
            </span>
            <p className="text-[#858585] text-[11px]">
              1. Откройте эту ссылку в Chrome на Android.<br />
              2. Нажмите меню «три точки» (⋮).<br />
              3. Выберите «Установить приложение» или «Добавить на главный экран».<br />
              Приложение откроется во весь экран без адресной строки браузера как нативное приложение.
            </p>
          </div>

          {/* Data Backup & Restore */}
          <div className="bg-[#121212] border border-[#242424] rounded-xl p-3.5 space-y-2.5">
            <span className="font-bold text-[#F2F2F2] text-xs block">
              Резервное копирование данных
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onExportData}
                className="py-2 px-3 bg-[#181818] border border-[#262626] rounded-lg text-[#F2F2F2] font-semibold flex items-center justify-center gap-1.5 hover:border-[#45A66B]"
              >
                <Download className="w-3.5 h-3.5 text-[#45A66B]" />
                <span>Скачать JSON</span>
              </button>

              <button
                onClick={() => setShowImportBox(!showImportBox)}
                className="py-2 px-3 bg-[#181818] border border-[#262626] rounded-lg text-[#F2F2F2] font-semibold flex items-center justify-center gap-1.5 hover:border-[#45A66B]"
              >
                <Upload className="w-3.5 h-3.5 text-[#45A66B]" />
                <span>Загрузить JSON</span>
              </button>
            </div>

            {showImportBox && (
              <div className="space-y-2 pt-2 border-t border-[#222]">
                <textarea
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder="Вставьте JSON резервной копии..."
                  rows={3}
                  className="w-full bg-[#161616] border border-[#2c2c2c] rounded-lg p-2 text-[11px] text-[#F2F2F2] focus:outline-none"
                />
                <button
                  onClick={handleImportSubmit}
                  className="w-full py-2 bg-[#45A66B] text-black font-bold rounded-lg text-xs"
                >
                  Применить восстановление
                </button>
                {importSuccess === true && (
                  <p className="text-[#45A66B] text-[11px]">Данные успешно восстановлены!</p>
                )}
                {importSuccess === false && (
                  <p className="text-[#C83232] text-[11px]">Ошибка: невалидный JSON файл.</p>
                )}
              </div>
            )}
          </div>

          {/* Reset app state */}
          <div className="pt-1">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                if (confirm('Сбросить все тренировки и вернуть начальные данные?')) {
                  onResetData();
                  onClose();
                }
              }}
              className="w-full py-2.5 bg-[#201515] border border-[#3b1e1e] hover:bg-[#2d1b1b] text-[#C83232] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить всё к исходным данным</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
