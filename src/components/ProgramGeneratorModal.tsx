import React, { useState } from 'react';
import { WorkoutProgram } from '../types/workout';
import { generateWorkoutProgram, GeneratorParams } from '../services/programGenerator';
import { StorageService } from '../services/storage';
import { FormSelect } from './common/FormSelect';
import { X, Sparkles, Loader2, Check, AlertCircle, Sliders, Dumbbell, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface ProgramGeneratorModalProps {
  onProgramGenerated: (program: WorkoutProgram) => void;
  onClose: () => void;
  onOpenEquipment?: () => void;
  onOpenParameters?: () => void;
}

export const ProgramGeneratorModal: React.FC<ProgramGeneratorModalProps> = ({
  onProgramGenerated,
  onClose,
  onOpenEquipment,
  onOpenParameters,
}) => {
  const savedParams = StorageService.getUserParameters();
  const equipmentList = StorageService.getEquipmentList();
  const activeEquipCount = equipmentList.filter((e) => e.selected || e.owned).length;

  const [goal, setGoal] = useState<string>(savedParams.goal || 'Развитие мышц');
  const [daysPerWeek, setDaysPerWeek] = useState(savedParams.daysPerWeek || 3);
  const [duration, setDuration] = useState(savedParams.durationMinutes || 60);
  const [experience, setExperience] = useState(
    savedParams.level === 'Начинающий'
      ? 'Новичок (до 6 месяцев)'
      : savedParams.level === 'Продвинутый'
      ? 'Опытный (3+ года)'
      : 'Средний (1-3 года)'
  );
  const [preferredDays, setPreferredDays] = useState<string[]>(
    savedParams.availableDays?.length ? savedParams.availableDays : ['Пн', 'Ср', 'Пт']
  );
  const [notes, setNotes] = useState(
    savedParams.healthRestrictions.length > 0
      ? `Ограничения: ${savedParams.healthRestrictions.join(', ')}`
      : ''
  );

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewProgram, setPreviewProgram] = useState<WorkoutProgram | null>(null);

  const DAYS_LIST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const toggleDay = (day: string) => {
    if (preferredDays.includes(day)) {
      if (preferredDays.length > 1) {
        setPreferredDays(preferredDays.filter((d) => d !== day));
      }
    } else {
      setPreferredDays([...preferredDays, day]);
    }
  };

  const handleSyncWithSavedParams = () => {
    const current = StorageService.getUserParameters();
    setGoal(current.goal);
    setDaysPerWeek(current.daysPerWeek);
    setDuration(current.durationMinutes);
    setExperience(
      current.level === 'Начинающий'
        ? 'Новичок (до 6 месяцев)'
        : current.level === 'Продвинутый'
        ? 'Опытный (3+ года)'
        : 'Средний (1-3 года)'
    );
    if (current.availableDays?.length) {
      setPreferredDays(current.availableDays);
    }
    if (current.healthRestrictions.length > 0) {
      setNotes(`Ограничения: ${current.healthRestrictions.join(', ')}`);
    }
    setStatusMessage('Параметры синхронизированы из вашего профиля!');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);

    const params: GeneratorParams = {
      goal,
      daysPerWeek,
      duration,
      experience,
      preferredDays,
      notes: notes.trim(),
    };

    try {
      const result = await generateWorkoutProgram(params);
      setPreviewProgram(result.program);
      if (result.message) {
        setStatusMessage(result.message);
      }
    } catch (err) {
      setStatusMessage('Ошибка генерации. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePreview = () => {
    if (previewProgram) {
      onProgramGenerated(previewProgram);
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
        className="w-full max-w-md bg-[#101719] border border-[#252D2F] rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#252D2F] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#14231b] text-[#58C995] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-[#E8E9E7]">
              {previewProgram ? 'Сгенерированная программа' : 'Генератор тренировок FORM'}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#92999A] hover:text-[#E8E9E7] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!previewProgram ? (
          <form onSubmit={handleGenerate} className="flex-1 overflow-y-auto p-4 space-y-3.5 [overscroll-behavior:contain] min-h-0">
            {/* Sync bar */}
            <div className="flex items-center justify-between p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-xs">
              <div className="flex items-center gap-2 text-[#92999A]">
                <ShieldCheck className="w-4 h-4 text-[#58C995]" />
                <span>Инвентарь: {activeEquipCount} шт.</span>
              </div>
              <button
                type="button"
                onClick={handleSyncWithSavedParams}
                className="text-[11px] font-bold text-[#58C995] hover:underline"
              >
                Синхронизировать
              </button>
            </div>

            {/* Goal */}
            <div>
              <FormSelect
                label="Цель тренировок"
                value={goal}
                onChange={(val) => setGoal(String(val))}
                options={[
                  { value: 'Развитие мышц', label: 'Развитие мышц (гипертрофия)' },
                  { value: 'Сила', label: 'Развитие максимальной силы' },
                  { value: 'Выносливость', label: 'Выносливость и рельеф' },
                  { value: 'Общая физическая подготовка', label: 'Общая физическая подготовка (ОФП)' },
                  { value: 'Улучшение физической формы', label: 'Улучшение физической формы' },
                ]}
              />
            </div>



            {/* Days per week & duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormSelect
                  label="Тренировок в неделю"
                  value={daysPerWeek}
                  onChange={(val) => setDaysPerWeek(Number(val))}
                  options={[
                    { value: 2, label: '2 дня' },
                    { value: 3, label: '3 дня' },
                    { value: 4, label: '4 дня' },
                    { value: 5, label: '5 дней' },
                  ]}
                />
              </div>
              <div>
                <FormSelect
                  label="Длительность"
                  value={duration}
                  onChange={(val) => setDuration(Number(val))}
                  options={[
                    { value: 45, label: '45 минут' },
                    { value: 60, label: '60 минут' },
                    { value: 75, label: '75 минут' },
                    { value: 90, label: '90 минут' },
                  ]}
                />
              </div>
            </div>

            {/* Experience level */}
            <div>
              <FormSelect
                label="Уровень подготовки"
                value={experience}
                onChange={(val) => setExperience(String(val))}
                options={[
                  { value: 'Новичок (до 6 месяцев)', label: 'Новичок (до 6 месяцев)' },
                  { value: 'Средний (1-3 года)', label: 'Средний (1-3 года)' },
                  { value: 'Опытный (3+ года)', label: 'Опытный (3+ года)' },
                ]}
              />
            </div>

            {/* Preferred days */}
            <div>
              <label className="block text-xs font-semibold text-[#92999A] mb-1.5">
                Доступные дни недели
              </label>
              <div className="flex gap-1.5">
                {DAYS_LIST.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      preferredDays.includes(d)
                        ? 'border-[#58C995] bg-[#14231b] text-[#58C995]'
                        : 'border-[#252D2F] bg-[#080D0E] text-[#92999A]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Additional notes & limitations */}
            <div>
              <label className="block text-xs font-semibold text-[#92999A] mb-1">
                Ограничения по здоровью и исключения
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="например: без осевой нагрузки на позвоночник, беречь колени, исключить становую тягу..."
                rows={2}
                className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl p-2.5 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995] resize-none"
              />
            </div>

            {statusMessage && (
              <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl flex items-center gap-2 text-xs text-[#c7c9c7]">
                <AlertCircle className="w-4 h-4 text-[#58C995] shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#58C995] hover:bg-[#68d7a4] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all mt-3 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Составляем сбалансированную программу...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-black text-black" />
                  <span>Сгенерировать программу</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Preview and review generated program */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block mb-1">
                Готово к сохранению
              </span>
              <h3 className="text-base font-bold text-[#E8E9E7]">{previewProgram.name}</h3>
              <p className="text-xs text-[#92999A] mt-0.5">{previewProgram.description}</p>
            </div>

            {statusMessage && (
              <div className="p-2.5 bg-[#14231b] border border-[#2f553f] rounded-xl text-xs text-[#58C995] flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Workouts preview */}
            <div className="space-y-3">
              {previewProgram.workouts.map((day, idx) => (
                <div key={idx} className="bg-[#080D0E] border border-[#202729] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#E8E9E7]">{day.dayName}</span>
                    <span className="text-[11px] text-[#92999A]">~{day.estimatedDuration} мин</span>
                  </div>

                  <div className="space-y-1">
                    {day.exercises.map((ex, eIdx) => (
                      <div
                        key={eIdx}
                        className="flex items-center justify-between text-[11px] py-1 px-2 bg-[#101719] rounded-lg"
                      >
                        <span className="text-[#c7c9c7]">{ex.name}</span>
                        <span className="text-[#92999A] tabular-nums">
                          {ex.sets} × {ex.reps} {ex.targetWeight > 0 ? `(${ex.targetWeight} кг)` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex gap-2 pt-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setPreviewProgram(null)}
                className="flex-1 py-2.5 bg-[#080D0E] border border-[#252D2F] hover:border-[#384346] text-[#92999A] font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Назад к настройкам
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={handleSavePreview}
                className="flex-1 py-2.5 bg-[#58C995] hover:bg-[#68d7a4] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Сохранить в мои программы</span>
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
