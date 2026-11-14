import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Download,
  Copy,
  Check,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { RollbackRecoveryState } from '../services/migrations';
import { StorageService } from '../services/storage';
import { formatLocalIsoDate } from '../training-core/dateUtils';

interface RecoveryBlockingScreenProps {
  recoveryState: RollbackRecoveryState;
  initialError?: string | null;
  onRecovered: () => void;
}

export const RecoveryBlockingScreen: React.FC<RecoveryBlockingScreenProps> = ({
  recoveryState,
  initialError,
  onRecovered,
}) => {
  const [currentState, setCurrentState] = useState<RollbackRecoveryState>(recoveryState);
  const [statusError, setStatusError] = useState<string | null>(
    initialError || recoveryState.error || null
  );
  const [statusInfo, setStatusInfo] = useState<string | null>(null);

  useEffect(() => {
    setCurrentState(recoveryState);
    if (initialError || recoveryState.error) {
      setStatusError(initialError || recoveryState.error || null);
    }
  }, [recoveryState, initialError]);

  const [exportedJson, setExportedJson] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Двухшаговое подтверждение сброса состояния восстановления: 0 -> 1 -> 2
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [explicitRiskAccepted, setExplicitRiskAccepted] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isPending = currentState.status === 'pending';

  const handleRetryRecovery = () => {
    setStatusError(null);
    setStatusInfo(null);
    const res = StorageService.retryPendingRecovery();
    if (res.ok) {
      onRecovered();
      return;
    }
    const refreshed = StorageService.getRecoveryState();
    setCurrentState(refreshed);
    setStatusError(
      res.error ||
        refreshed.error ||
        'Не удалось завершить восстановление. Повторите попытку или сохраните копию данных.'
    );
  };

  const handleSaveCopy = () => {
    setStatusError(null);
    const rawDump = StorageService.exportEmergencyRawBackupJson();
    setExportedJson(rawDump);
    setCopied(false);

    let fileDownloadTriggered = false;
    try {
      if (
        typeof Blob !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        const blob = new Blob([rawDump], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FORM_emergency_backup_${formatLocalIsoDate(new Date())}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        fileDownloadTriggered = true;
      }
    } catch {
      fileDownloadTriggered = false;
    }

    if (fileDownloadTriggered) {
      setBackupConfirmed(true);
      setStatusInfo(
        'Резервная копия (включая сырые и служебные ключи) подготовлена и отправлена на загрузку. Если файл не сохранился в WebView, нажмите «Копировать» ниже.'
      );
    } else {
      setStatusInfo(
        'Скачивание файла недоступно в этом окружении. Нажмите «Копировать» или скопируйте текст из поля ниже вручную.'
      );
    }
  };

  const handleCopyText = async () => {
    if (!exportedJson) return;
    let didCopy = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportedJson);
        didCopy = true;
      }
    } catch {
      didCopy = false;
    }

    if (!didCopy && textareaRef.current) {
      try {
        textareaRef.current.focus();
        textareaRef.current.select();
        if (typeof document.execCommand === 'function') {
          didCopy = document.execCommand('copy');
        }
      } catch {
        didCopy = false;
      }
    }

    setBackupConfirmed(true);
    setCopied(didCopy);
    setStatusInfo(
      didCopy
        ? 'Резервная копия полностью скопирована в буфер обмена.'
        : 'Текст выделен — скопируйте его вручную и сохраните в заметки или файл.'
    );
  };

  const handleStartResetStep1 = () => {
    if (!backupConfirmed) {
      setStatusError('Сначала сохраните или скопируйте резервную копию данных.');
      return;
    }
    setStatusError(null);
    setExplicitRiskAccepted(false);
    setResetStep(1);
  };

  const handleProceedResetStep2 = () => {
    setStatusError(null);
    setResetStep(2);
  };

  const handleConfirmReset = () => {
    if (!backupConfirmed || resetStep !== 2 || !explicitRiskAccepted) {
      setStatusError('Необходимо сохранить копию данных и подтвердить оба шага сброса.');
      return;
    }
    const res = StorageService.resetRecoveryStateOnly({
      backupConfirmed: true,
      userConfirmed: true,
    });
    if (res.ok) {
      onRecovered();
      return;
    }
    setStatusError(res.error || 'Не удалось сбросить состояние восстановления.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-screen-title"
      className="min-h-[100dvh] w-full bg-[#08100D] text-[#F2F5F3] flex justify-center overflow-y-auto p-4"
    >
      <div className="w-full max-w-md my-auto bg-[#0E1814] border border-[#2A1E1E] rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#2B1414] border border-[#5C2626] text-[#F87171] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 id="recovery-screen-title" className="text-base font-bold text-white leading-snug">
              {isPending
                ? 'Незавершённое восстановление данных'
                : 'Повреждён снимок восстановления'}
            </h1>
            <p className="text-xs text-[#9AB0A6] mt-1 leading-relaxed">
              Ваши данные <strong className="text-[#58C995]">не удалены</strong>. Предыдущая
              операция (импорт или миграция) прервалась или её служебный снимок повреждён. Обычная
              запись временно заблокирована, чтобы ничего не перезаписать случайно.
            </p>
          </div>
        </div>

        {(statusError || currentState.pendingKeys.length > 0) && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-[#2B1414] border border-[#5C2626] text-xs text-[#FCA5A5] space-y-1.5"
          >
            <div className="flex items-center gap-1.5 font-bold text-[#F87171]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Причина блокировки</span>
            </div>
            {statusError && <p className="leading-relaxed break-words">{statusError}</p>}
            {currentState.pendingKeys.length > 0 && (
              <p className="text-[11px] text-[#FCA5A5]/80 break-all">
                Затронутые разделы: {currentState.pendingKeys.join(', ')}
              </p>
            )}
          </div>
        )}

        {statusInfo && (
          <div className="p-3 rounded-2xl bg-[#12261C] border border-[#26543E] text-xs text-[#7BE3B0] leading-relaxed">
            {statusInfo}
          </div>
        )}

        <div className="space-y-2.5">
          {isPending && (
            <button
              type="button"
              onClick={handleRetryRecovery}
              className="w-full py-3 px-4 rounded-2xl bg-[#58C995] hover:bg-[#6AD5A4] text-[#08100D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Повторить восстановление</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveCopy}
            className="w-full py-3 px-4 rounded-2xl bg-[#152820] hover:bg-[#1B352A] border border-[#285440] text-[#58C995] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Сохранить копию данных</span>
          </button>

          {exportedJson !== null && (
            <div className="p-3 rounded-2xl bg-[#0A120F] border border-[#1E332A] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#9AB0A6]">
                  Полная сырая копия (включая служебные и повреждённые ключи):
                </span>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="px-2.5 py-1 rounded-xl bg-[#1A3328] hover:bg-[#234436] text-[#58C995] text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>
              <textarea
                ref={textareaRef}
                readOnly
                rows={5}
                value={exportedJson}
                aria-label="Сырая резервная копия JSON"
                className="w-full bg-[#060B09] border border-[#1C2A24] rounded-xl p-2 text-[10px] font-mono text-[#D5E3DC] focus:outline-none focus:border-[#58C995]"
              />
              {!backupConfirmed && (
                <label className="flex items-start gap-2 text-[11px] text-[#FCA5A5] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="mt-0.5 accent-[#58C995]"
                  />
                  <span>Я скопировал текст копии вручную</span>
                </label>
              )}
            </div>
          )}

          {resetStep === 0 && (
            <div className="pt-2 border-t border-[#1A2922] space-y-1.5">
              <button
                type="button"
                disabled={!backupConfirmed}
                onClick={handleStartResetStep1}
                className="w-full py-2.5 px-4 rounded-2xl bg-[#241414] hover:bg-[#311A1A] disabled:opacity-40 disabled:cursor-not-allowed border border-[#4D2424] text-[#F87171] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Сбросить состояние восстановления</span>
              </button>
              {!backupConfirmed && (
                <p className="text-[11px] text-[#8EA299] text-center">
                  Кнопка разблокируется после сохранения или копирования резервной копии данных.
                </p>
              )}
            </div>
          )}

          {resetStep === 1 && (
            <div className="p-3.5 rounded-2xl bg-[#241414] border border-[#5C2626] space-y-2.5 text-xs">
              <p className="font-bold text-[#F87171]">Шаг 1 из 2: предупреждение</p>
              <p className="text-[#FCA5A5] leading-relaxed">
                Пользовательские данные останутся в том виде, в каком они находятся сейчас (возможно,
                частично импортированные или неполные). Будут удалены <strong>только</strong>{' '}
                служебные ключи восстановления (маркер, snapshot, staging); сами данные профиля и
                тренировок не будут удалены.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleProceedResetStep2}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#7F1D1D] hover:bg-[#991B1B] text-white font-bold cursor-pointer"
                >
                  Продолжить к подтверждению
                </button>
                <button
                  type="button"
                  onClick={() => setResetStep(0)}
                  className="py-2 px-3 rounded-xl bg-[#1A2420] text-[#D5E3DC] font-semibold cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {resetStep === 2 && (
            <div className="p-3.5 rounded-2xl bg-[#2B1414] border border-[#7F1D1D] space-y-2.5 text-xs">
              <p className="font-bold text-[#F87171]">Шаг 2 из 2: финальное подтверждение</p>
              <label className="flex items-start gap-2 text-[#FECACA] cursor-pointer leading-relaxed">
                <input
                  type="checkbox"
                  checked={explicitRiskAccepted}
                  onChange={(e) => setExplicitRiskAccepted(e.target.checked)}
                  className="mt-0.5 accent-[#EF4444]"
                />
                <span>
                  Подтверждаю: оставить данные в текущем состоянии и удалить только служебные ключи
                  восстановления.
                </span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!explicitRiskAccepted}
                  onClick={handleConfirmReset}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold cursor-pointer"
                >
                  Подтвердить сброс
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetStep(0);
                    setExplicitRiskAccepted(false);
                  }}
                  className="py-2 px-3 rounded-xl bg-[#1A2420] text-[#D5E3DC] font-semibold cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
