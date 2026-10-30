import React, { useState } from 'react';
import { UserFitnessParameters, MuscleGroup, MUSCLE_DEFINITIONS, EXERCISE_CATALOG } from '../types/workout';
import { StorageService } from '../services/storage';
import { X, Check, Sliders, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface UserParametersModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export const UserParametersModal: React.FC<UserParametersModalProps> = ({
  onClose,
  onSaved,
}) => {
  const [params, setParams] = useState<UserFitnessParameters>(
    StorageService.getUserParameters()
  );
  const [successToast, setSuccessToast] = useState(false);
  const [newExcludedInput, setNewExcludedInput] = useState('');

  const GOALS = [
    'Развитие мышц',
    'Сила',
    'Выносливость',
    'Общая физическая подготовка',
    'Улучшение физической формы',
  ] as const;

  const LEVELS = ['Начинающий', 'Средний', 'Продвинутый'] as const;
  const LOCATIONS = ['В зале', 'Дома', 'На улице'] as const;
  const DAYS_LIST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const HEALTH_RESTRICTIONS_PRESETS = [
    'Без осевой нагрузки на позвоночник',
    'Беречь коленные суставы',
    'Беречь плечевые суставы',
    'Без глубоких наклонов и прогибов',
    'Избегать резких прыжков',
  ];

  const toggleDay = (day: string) => {
    const list = params.availableDays || [];
    if (list.includes(day)) {
      if (list.length > 1) {
        setParams({ ...params, availableDays: list.filter((d) => d !== day) });
      }
    } else {
      setParams({ ...params, availableDays: [...list, day] });
    }
  };

  const toggleMuscle = (muscle: MuscleGroup) => {
    const list = params.preferredMuscles || [];
    if (list.includes(muscle)) {
      if (list.length > 1) {
        setParams({ ...params, preferredMuscles: list.filter((m) => m !== muscle) });
      }
    } else {
      setParams({ ...params, preferredMuscles: [...list, muscle] });
    }
  };

  const toggleHealthRestriction = (item: string) => {
    const list = params.healthRestrictions || [];
    if (list.includes(item)) {
      setParams({ ...params, healthRestrictions: list.filter((r) => r !== item) });
    } else {
      setParams({ ...params, healthRestrictions: [...list, item] });
    }
  };

  const handleAddExcluded = (name: string) => {
    if (!name.trim()) return;
    const list = params.excludedExercises || [];
    if (!list.includes(name.trim())) {
      setParams({ ...params, excludedExercises: [...list, name.trim()] });
    }
    setNewExcludedInput('');
  };

  const handleRemoveExcluded = (name: string) => {
    setParams({
      ...params,
      excludedExercises: (params.excludedExercises || []).filter((e) => e !== name),
    });
  };

  const handleSave = () => {
    StorageService.saveUserParameters(params);
    setSuccessToast(true);
    setTimeout(() => {
      setSuccessToast(false);
      onSaved();
      onClose();
    }, 800);
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
            <div className="w-7 h-7 rounded-lg bg-[#315D4B]/40 text-[#58C995] flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-[#E8E9E7]">Мои параметры</h2>
          </div>
          <button onClick={onClose} className="text-[#92999A] hover:text-[#E8E9E7]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Goal */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1 uppercase tracking-wider">
              Главная цель
            </label>
            <select
              value={params.goal}
              onChange={(e) => setParams({ ...params, goal: e.target.value as any })}
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Level & Location */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1 uppercase tracking-wider">
                Уровень
              </label>
              <select
                value={params.level}
                onChange={(e) => setParams({ ...params, level: e.target.value as any })}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7]"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1 uppercase tracking-wider">
                Место тренировок
              </label>
              <select
                value={params.location}
                onChange={(e) => setParams({ ...params, location: e.target.value as any })}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7]"
              >
                {LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequency & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1 uppercase tracking-wider">
                Дней в неделю
              </label>
              <select
                value={params.daysPerWeek}
                onChange={(e) => setParams({ ...params, daysPerWeek: Number(e.target.value) })}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7]"
              >
                <option value={2}>2 тренировки</option>
                <option value={3}>3 тренировки</option>
                <option value={4}>4 тренировки</option>
                <option value={5}>5 тренировок</option>
                <option value={6}>6 тренировок</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1 uppercase tracking-wider">
                Длительность
              </label>
              <select
                value={params.durationMinutes}
                onChange={(e) => setParams({ ...params, durationMinutes: Number(e.target.value) })}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7]"
              >
                <option value={30}>30 минут</option>
                <option value={45}>45 минут</option>
                <option value={60}>60 минут</option>
                <option value={75}>75 минут</option>
                <option value={90}>90 минут</option>
              </select>
            </div>
          </div>

          {/* Available Days */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1.5 uppercase tracking-wider">
              Доступные дни недели
            </label>
            <div className="flex gap-1">
              {DAYS_LIST.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    params.availableDays?.includes(d)
                      ? 'border-[#58C995] bg-[#315D4B]/40 text-[#58C995]'
                      : 'border-[#252D2F] bg-[#171D1F] text-[#92999A]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Muscle Groups */}
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1.5 uppercase tracking-wider">
              Предпочитаемые мышечные группы
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(MUSCLE_DEFINITIONS) as MuscleGroup[]).map((m) => {
                const isSelected = params.preferredMuscles?.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995] font-semibold'
                        : 'border-[#252D2F] bg-[#171D1F] text-[#92999A]'
                    }`}
                  >
                    {MUSCLE_DEFINITIONS[m].nameRu}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Health Restrictions & Avoiding Painful Movements */}
          <div className="bg-[#171D1F] border border-[#252D2F] rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8E9E7]">
              <ShieldCheck className="w-4 h-4 text-[#58C995]" />
              <span>Ограничения по движениям и здоровью</span>
            </div>
            <p className="text-[10px] text-[#92999A]">
              Генератор исключит травмоопасные упражнения и подберет мягкие анатомические альтернативы.
            </p>

            <div className="space-y-1.5 pt-1">
              {HEALTH_RESTRICTIONS_PRESETS.map((item) => {
                const isChecked = params.healthRestrictions?.includes(item);
                return (
                  <label
                    key={item}
                    onClick={() => toggleHealthRestriction(item)}
                    className="flex items-center gap-2 cursor-pointer text-[11px] text-[#E8E9E7]"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      className="rounded bg-[#101719] border-[#252D2F] text-[#58C995] focus:ring-0"
                    />
                    <span>{item}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Excluded Exercises (Blacklist) */}
          <div className="bg-[#171D1F] border border-[#252D2F] rounded-xl p-3 space-y-2">
            <span className="text-xs font-bold text-[#E8E9E7] block">
              Исключенные упражнения ({params.excludedExercises?.length || 0})
            </span>

            {/* Existing excluded pills */}
            {params.excludedExercises && params.excludedExercises.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {params.excludedExercises.map((ex) => (
                  <span
                    key={ex}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#252D2F] text-[#E8E9E7] rounded-md text-[11px]"
                  >
                    <span>{ex}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExcluded(ex)}
                      className="text-[#92999A] hover:text-[#C83232]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Quick add from catalog or custom input */}
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                placeholder="Название упражнения для исключения"
                value={newExcludedInput}
                onChange={(e) => setNewExcludedInput(e.target.value)}
                className="flex-1 bg-[#101719] border border-[#252D2F] rounded-lg px-2.5 py-1 text-xs text-[#E8E9E7] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleAddExcluded(newExcludedInput)}
                className="px-3 py-1 bg-[#252D2F] hover:bg-[#315D4B] text-[#E8E9E7] font-semibold rounded-lg text-xs"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#252D2F] bg-[#101719] flex items-center justify-between gap-2">
          {successToast ? (
            <div className="w-full py-2.5 bg-[#315D4B]/40 text-[#58C995] text-xs font-bold rounded-xl flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Параметры успешно обновлены!</span>
            </div>
          ) : (
            <>
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-[#171D1F] text-[#92999A] text-xs font-semibold rounded-xl hover:text-[#E8E9E7] cursor-pointer"
              >
                Отмена
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={handleSave}
                className="flex-1 py-2.5 bg-[#58C995] text-[#080D0E] text-xs font-bold rounded-xl hover:bg-[#48b885] transition-colors cursor-pointer shadow-md"
              >
                Сохранить параметры
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
