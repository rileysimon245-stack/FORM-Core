import React, { useState } from 'react';
import {
  SportSession,
  SportType,
  ActivityIntensity,
  SPORT_DEFINITIONS,
} from '../types/workout';
import { FormSelect } from './common/FormSelect';
import {
  X,
  Swords,
  Trophy,
  Zap,
  Bike,
  Waves,
  Activity,
  Dumbbell,
  Clock,
  Calendar,
  CheckCircle2,
  Trash2,
  Info,
} from 'lucide-react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface SportSessionModalProps {
  initialSession?: SportSession | null;
  defaultDate?: string;
  onSave: (session: SportSession) => void;
  onDelete?: (sessionId: string) => void;
  onClose: () => void;
}

export const SportSessionModal: React.FC<SportSessionModalProps> = ({
  initialSession,
  defaultDate = '2026-10-29',
  onSave,
  onDelete,
  onClose,
}) => {
  const [sportType, setSportType] = useState<SportType>(
    initialSession?.sportType || 'boxing'
  );
  const [title, setTitle] = useState(
    initialSession?.title || 'Бокс: тренировка'
  );
  const [date, setDate] = useState(initialSession?.date || defaultDate);
  const [startTime, setStartTime] = useState(initialSession?.startTime || '19:00');
  const [durationMinutes, setDurationMinutes] = useState(
    initialSession?.actualDurationMinutes || initialSession?.plannedDurationMinutes || 60
  );
  const [intensity, setIntensity] = useState<ActivityIntensity>(
    initialSession?.intensity || 'high'
  );
  const [status, setStatus] = useState<'planned' | 'completed' | 'skipped' | 'rescheduled'>(
    initialSession?.status || 'completed'
  );
  const [notes, setNotes] = useState(initialSession?.notes || '');

  const sportDef = SPORT_DEFINITIONS[sportType] || SPORT_DEFINITIONS.other_sport;

  // Real-time load score preview
  const intensityMult = intensity === 'high' ? 2.2 : intensity === 'medium' ? 1.5 : 1.0;
  const estimatedLoadScore = Math.round(durationMinutes * intensityMult * (sportDef.loadMultiplier / 1.5));

  const handleSportChange = (newSport: SportType) => {
    setSportType(newSport);
    const def = SPORT_DEFINITIONS[newSport];
    if (def) {
      setTitle(`${def.nameRu}: тренировка`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const sessionToSave: SportSession = {
      id: initialSession?.id || `sport_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sportType,
      title: title.trim(),
      date,
      startTime,
      plannedDurationMinutes: durationMinutes,
      actualDurationMinutes: status === 'completed' ? durationMinutes : undefined,
      intensity,
      status,
      notes: notes.trim(),
      loadScore: estimatedLoadScore,
    };

    onSave(sessionToSave);
    onClose();
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
        className="w-full max-w-md bg-[#101719] border border-[#252D2F] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#252D2F] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {sportType === 'boxing' ? '🥊' : sportType === 'basketball' ? '🏀' : sportType === 'running' ? '🏃' : '⚡'}
            </span>
            <h2 className="text-base font-bold text-[#E8E9E7]">
              {initialSession ? 'Запись спортивного занятия' : 'Добавить занятие спортом'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#92999A] hover:text-[#E8E9E7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs [overscroll-behavior:contain] min-h-0">
          {/* Sport Selector Pills */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1.5">
              Вид спорта
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { type: 'boxing', label: 'Бокс', icon: '🥊' },
                  { type: 'basketball', label: 'Баскетбол', icon: '🏀' },
                  { type: 'running', label: 'Бег', icon: '🏃' },
                  { type: 'cycling', label: 'Вело', icon: '🚴' },
                  { type: 'swimming', label: 'Плавание', icon: '🏊' },
                  { type: 'strength', label: 'Силовая', icon: '🏋️' },
                  { type: 'other_sport', label: 'Другой', icon: '⚡' },
                  { type: 'rest', label: 'Отдых', icon: '🌙' },
                ] as const
              ).map((item) => (
                <button
                  type="button"
                  key={item.type}
                  onClick={() => handleSportChange(item.type)}
                  className={`py-2 px-1 rounded-xl text-center border transition-all ${
                    sportType === item.type
                      ? 'border-[#58C995] bg-[#14231b] text-[#58C995] font-bold shadow-sm'
                      : 'border-[#252D2F] bg-[#080D0E] text-[#92999A] hover:text-[#E8E9E7]'
                  }`}
                >
                  <span className="text-sm block">{item.icon}</span>
                  <span className="text-[10px] mt-0.5 block truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
              Название активности
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="например: Бокс: работа на лапах и спарринг"
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
            />
          </div>

          {/* Date & Start Time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
                Дата
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
                Время начала
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] font-mono focus:outline-none focus:border-[#58C995]"
              />
            </div>
          </div>

          {/* Duration & Intensity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
                Длительность (минут)
              </label>
              <input
                type="number"
                min="10"
                max="300"
                step="5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] font-mono focus:outline-none focus:border-[#58C995]"
              />
            </div>

            <div>
              <FormSelect
                label="Интенсивность"
                value={intensity}
                onChange={(val) => setIntensity(val as ActivityIntensity)}
                options={[
                  { value: 'low', label: '🟢 Лёгкая (восстановительная)' },
                  { value: 'medium', label: '🟡 Средняя (рабочий темп)' },
                  { value: 'high', label: '🔴 Высокая (тяжёлая / матч)' },
                ]}
              />
            </div>
          </div>

          {/* Status selector: Completed vs Planned vs Skipped */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1.5">
              Статус выполнения
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setStatus('completed')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  status === 'completed'
                    ? 'border-[#58C995] bg-[#14231b] text-[#58C995]'
                    : 'border-[#252D2F] bg-[#080D0E] text-[#92999A]'
                }`}
              >
                ✓ Выполнено
              </button>
              <button
                type="button"
                onClick={() => setStatus('planned')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  status === 'planned'
                    ? 'border-[#4EA5D9] bg-[#12222d] text-[#4EA5D9]'
                    : 'border-[#252D2F] bg-[#080D0E] text-[#92999A]'
                }`}
              >
                🕒 Запланировано
              </button>
              <button
                type="button"
                onClick={() => setStatus('skipped')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  status === 'skipped'
                    ? 'border-[#C83232] bg-[#2a1714] text-[#C83232]'
                    : 'border-[#252D2F] bg-[#080D0E] text-[#92999A]'
                }`}
              >
                ✕ Пропуск
              </button>
            </div>
          </div>

          {/* Load Preview Badge */}
          <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#92999A]">
              <Info className="w-4 h-4 text-[#58C995]" />
              <span>Расчётная нагрузка на организм:</span>
            </div>
            <span className="font-bold text-[#58C995] font-mono">
              ~{estimatedLoadScore} баллов нагрузки
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
              Заметки и самочувствие
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="например: Отличная скорость в 5 раунде, плечи забились к концу"
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995] resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            {initialSession && onDelete && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={() => {
                  onDelete(initialSession.id);
                  onClose();
                }}
                className="p-2.5 bg-[#2a1714] border border-[#552720] text-[#C83232] rounded-xl hover:bg-[#381c18] transition-colors cursor-pointer"
                title="Удалить запись"
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>
            )}

            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#171D1F] hover:bg-[#202729] text-[#92999A] font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Отмена
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              type="submit"
              className="flex-1 py-2.5 bg-[#58C995] hover:bg-[#68d7a4] text-black font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              {initialSession ? 'Сохранить изменения' : 'Записать тренировку'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
