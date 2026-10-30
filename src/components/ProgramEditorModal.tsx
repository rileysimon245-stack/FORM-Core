import React, { useState } from 'react';
import {
  WorkoutProgram,
  ProgramWorkoutDay,
  ProgramExerciseTemplate,
  MuscleGroup,
  MUSCLE_DEFINITIONS,
  ExerciseLibraryItem,
} from '../types/workout';
import { ExerciseLibraryView } from './ExerciseLibraryView';
import { X, Plus, Trash2, ArrowRightLeft, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface ProgramEditorModalProps {
  initialProgram?: WorkoutProgram | null;
  onSave: (program: WorkoutProgram) => void;
  onClose: () => void;
}

export const ProgramEditorModal: React.FC<ProgramEditorModalProps> = ({
  initialProgram,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(initialProgram?.name || '');
  const [description, setDescription] = useState(
    initialProgram?.description || 'Индивидуальная тренировочная программа'
  );
  const [goal, setGoal] = useState(initialProgram?.goal || 'Развитие мышц');
  const [daysPerWeek, setDaysPerWeek] = useState(initialProgram?.daysPerWeek || 3);
  const [workouts, setWorkouts] = useState<ProgramWorkoutDay[]>(
    initialProgram?.workouts || [
      {
        id: `day_${Date.now()}`,
        dayName: 'День 1: Верх тела (Грудь и Спина)',
        targetMuscleGroups: ['chest', 'lats'],
        estimatedDuration: 60,
        exercises: [
          {
            name: 'Жим штанги лежа',
            targetMuscle: 'chest',
            isBodyweight: false,
            sets: 4,
            reps: 8,
            targetWeight: 75,
            restSeconds: 90,
            technique: 'Опускайте гриф под контроль, лопатки сведены',
          },
          {
            name: 'Подтягивания широким хватом',
            targetMuscle: 'lats',
            isBodyweight: true,
            sets: 4,
            reps: 8,
            targetWeight: 0,
            restSeconds: 90,
          },
        ],
      },
    ]
  );

  // Replacement modal state: { dayIndex, exIndex }
  const [replacingTarget, setReplacingTarget] = useState<{ dayIndex: number; exIndex: number } | null>(null);
  const [showAddLibraryPicker, setShowAddLibraryPicker] = useState<number | null>(null);

  const handleAddWorkoutDay = () => {
    const newDay: ProgramWorkoutDay = {
      id: `day_${Date.now()}`,
      dayName: `День ${workouts.length + 1}: Новая тренировка`,
      targetMuscleGroups: ['quads'],
      estimatedDuration: 55,
      exercises: [
        {
          name: 'Приседания со штангой',
          targetMuscle: 'quads',
          isBodyweight: false,
          sets: 4,
          reps: 8,
          targetWeight: 80,
          restSeconds: 90,
          technique: 'Глубокий сед, колени не заваливать внутрь',
        },
      ],
    };
    setWorkouts([...workouts, newDay]);
  };

  const handleDeleteWorkoutDay = (dayIndex: number) => {
    setWorkouts(workouts.filter((_, idx) => idx !== dayIndex));
  };

  const handleDayNameChange = (dayIndex: number, text: string) => {
    const next = [...workouts];
    next[dayIndex].dayName = text;
    setWorkouts(next);
  };

  const handleDeleteExercise = (dayIndex: number, exIndex: number) => {
    const next = [...workouts];
    next[dayIndex].exercises.splice(exIndex, 1);
    setWorkouts(next);
  };

  const handleExerciseChange = (
    dayIndex: number,
    exIndex: number,
    field: keyof ProgramExerciseTemplate,
    val: any
  ) => {
    const next = [...workouts];
    (next[dayIndex].exercises[exIndex] as any)[field] = val;
    setWorkouts(next);
  };

  const handleMoveExercise = (dayIndex: number, exIndex: number, dir: 'up' | 'down') => {
    const next = [...workouts];
    const targetIdx = dir === 'up' ? exIndex - 1 : exIndex + 1;
    if (targetIdx < 0 || targetIdx >= next[dayIndex].exercises.length) return;
    const temp = next[dayIndex].exercises[exIndex];
    next[dayIndex].exercises[exIndex] = next[dayIndex].exercises[targetIdx];
    next[dayIndex].exercises[targetIdx] = temp;
    setWorkouts(next);
  };

  const handleSelectReplacement = (selected: ExerciseLibraryItem) => {
    if (!replacingTarget) return;
    const { dayIndex, exIndex } = replacingTarget;
    const next = [...workouts];
    const prevEx = next[dayIndex].exercises[exIndex];

    next[dayIndex].exercises[exIndex] = {
      name: selected.name,
      targetMuscle: selected.primaryMuscle,
      secondaryMuscles: selected.secondaryMuscles,
      isBodyweight: selected.isBodyweight,
      requiredEquipment: selected.requiredEquipment,
      sets: prevEx.sets || selected.defaultSets,
      reps: prevEx.reps || selected.defaultReps,
      targetWeight: selected.isBodyweight ? 0 : (prevEx.targetWeight || selected.defaultWeight),
      restSeconds: prevEx.restSeconds || selected.defaultRestSeconds,
      technique: selected.technique,
      notes: prevEx.notes,
    };

    setWorkouts(next);
    setReplacingTarget(null);
  };

  const handleAddFromLibrary = (selected: ExerciseLibraryItem) => {
    if (showAddLibraryPicker === null) return;
    const dayIndex = showAddLibraryPicker;
    const next = [...workouts];

    next[dayIndex].exercises.push({
      name: selected.name,
      targetMuscle: selected.primaryMuscle,
      secondaryMuscles: selected.secondaryMuscles,
      isBodyweight: selected.isBodyweight,
      requiredEquipment: selected.requiredEquipment,
      sets: selected.defaultSets,
      reps: selected.defaultReps,
      targetWeight: selected.isBodyweight ? 0 : selected.defaultWeight,
      restSeconds: selected.defaultRestSeconds,
      technique: selected.technique,
    });

    setWorkouts(next);
    setShowAddLibraryPicker(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const programToSave: WorkoutProgram = {
      id: initialProgram?.id || `prog_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      goal,
      daysPerWeek,
      workouts,
      isCustom: true,
      createdAt: initialProgram?.createdAt || new Date().toISOString().split('T')[0],
    };

    onSave(programToSave);
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
        className="w-full max-w-lg bg-[#101719] border border-[#252D2F] rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#252D2F] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#E8E9E7]">
            {initialProgram ? 'Редактировать программу' : 'Конструктор программы'}
          </h2>
          <button onClick={onClose} className="text-[#92999A] hover:text-[#E8E9E7]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
              Название программы
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="например, Мой силовой сплит 4 дня"
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
                Цель тренировок
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-1.5 text-xs text-[#E8E9E7]"
              >
                <option value="Развитие мышц">Развитие мышц</option>
                <option value="Сила">Сила</option>
                <option value="Выносливость">Выносливость</option>
                <option value="Общая физическая подготовка">Общая физическая подготовка</option>
                <option value="Улучшение физической формы">Улучшение физической формы</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
                Дней в неделю
              </label>
              <select
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-1.5 text-xs text-[#E8E9E7]"
              >
                <option value={2}>2 тренировки</option>
                <option value={3}>3 тренировки</option>
                <option value={4}>4 тренировки</option>
                <option value={5}>5 тренировок</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#92999A] mb-1">
              Описание стратегии
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-1.5 text-xs text-[#E8E9E7]"
            />
          </div>

          {/* Workouts Days */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#E8E9E7] uppercase tracking-wider">
                Тренировочные дни ({workouts.length})
              </span>
              <button
                type="button"
                onClick={handleAddWorkoutDay}
                className="text-xs text-[#58C995] hover:text-[#83CBA5] flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить день</span>
              </button>
            </div>

            {workouts.map((day, dIdx) => (
              <div
                key={day.id || dIdx}
                className="bg-[#171D1F] border border-[#252D2F] rounded-xl p-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={day.dayName}
                    onChange={(e) => handleDayNameChange(dIdx, e.target.value)}
                    className="flex-1 bg-transparent font-bold text-sm text-[#E8E9E7] border-b border-transparent focus:border-[#58C995] outline-none"
                  />
                  {workouts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkoutDay(dIdx)}
                      className="text-[#92999A] hover:text-[#C83232] p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Exercises list in this day */}
                <div className="space-y-2">
                  {day.exercises.map((ex, exIdx) => (
                    <div
                      key={exIdx}
                      className="bg-[#101719] border border-[#252D2F] rounded-lg p-2.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 flex items-center gap-2">
                          <span className="font-bold text-[#E8E9E7]">{ex.name}</span>
                          <span className="text-[10px] text-[#58C995] bg-[#315D4B]/40 px-1.5 py-0.5 rounded">
                            {MUSCLE_DEFINITIONS[ex.targetMuscle]?.nameRu}
                          </span>
                        </div>

                        {/* Replace button & Reorder */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReplacingTarget({ dayIndex: dIdx, exIndex: exIdx })}
                            className="px-2 py-0.5 bg-[#171D1F] hover:bg-[#20292b] border border-[#252D2F] text-[#83CBA5] text-[10px] rounded flex items-center gap-1"
                            title="Заменить на альтернативное"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Заменить</span>
                          </button>

                          <button
                            type="button"
                            disabled={exIdx === 0}
                            onClick={() => handleMoveExercise(dIdx, exIdx, 'up')}
                            className="text-[#92999A] hover:text-[#E8E9E7] disabled:opacity-30 p-0.5"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={exIdx === day.exercises.length - 1}
                            onClick={() => handleMoveExercise(dIdx, exIdx, 'down')}
                            className="text-[#92999A] hover:text-[#E8E9E7] disabled:opacity-30 p-0.5"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExercise(dIdx, exIdx)}
                            className="text-[#92999A] hover:text-[#C83232] p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Sets & Reps parameters */}
                      <div className="flex items-center gap-2 text-[11px] text-[#92999A]">
                        <div className="flex items-center gap-1">
                          <span>Сеты:</span>
                          <input
                            type="number"
                            min="1"
                            value={ex.sets}
                            onChange={(e) =>
                              handleExerciseChange(dIdx, exIdx, 'sets', Number(e.target.value))
                            }
                            className="w-10 bg-[#171D1F] border border-[#252D2F] rounded text-center text-[#E8E9E7] py-0.5"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span>Повт:</span>
                          <input
                            type="number"
                            min="1"
                            value={ex.reps}
                            onChange={(e) =>
                              handleExerciseChange(dIdx, exIdx, 'reps', Number(e.target.value))
                            }
                            className="w-10 bg-[#171D1F] border border-[#252D2F] rounded text-center text-[#E8E9E7] py-0.5"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span>Вес:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={ex.isBodyweight ? 0 : ex.targetWeight}
                            disabled={ex.isBodyweight}
                            onChange={(e) =>
                              handleExerciseChange(dIdx, exIdx, 'targetWeight', Number(e.target.value))
                            }
                            className="w-12 bg-[#171D1F] border border-[#252D2F] rounded text-center text-[#E8E9E7] py-0.5 disabled:opacity-40"
                          />
                          <span>кг</span>
                        </div>
                        <label className="flex items-center gap-1 cursor-pointer pl-1">
                          <input
                            type="checkbox"
                            checked={ex.isBodyweight}
                            onChange={(e) =>
                              handleExerciseChange(dIdx, exIdx, 'isBodyweight', e.target.checked)
                            }
                            className="rounded bg-[#171D1F] text-[#58C995]"
                          />
                          <span className="text-[10px] text-[#92999A]">Свой вес</span>
                        </label>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setShowAddLibraryPicker(dIdx)}
                    className="w-full py-1.5 border border-dashed border-[#252D2F] hover:border-[#58C995] rounded-lg text-xs text-[#92999A] hover:text-[#58C995] transition-colors"
                  >
                    + Добавить упражнение из библиотеки
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex gap-2 pt-3 border-t border-[#252D2F]">
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
              type="submit"
              className="flex-1 py-2.5 bg-[#58C995] text-[#080D0E] text-xs font-bold rounded-xl shadow-md hover:bg-[#48b885] cursor-pointer"
            >
              Сохранить программу
            </motion.button>
          </div>
        </form>
      </motion.div>

      {/* Exercise Replacement & Add Picker Modal */}
      {(replacingTarget !== null || showAddLibraryPicker !== null) && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="w-full max-w-md bg-[#080D0E] border border-[#252D2F] rounded-2xl max-h-[85vh] flex flex-col overflow-hidden p-3 shadow-2xl">
            <ExerciseLibraryView
              selectionMode={true}
              onSelectExercise={(selected) => {
                if (replacingTarget !== null) {
                  handleSelectReplacement(selected);
                } else {
                  handleAddFromLibrary(selected);
                }
              }}
              onClose={() => {
                setReplacingTarget(null);
                setShowAddLibraryPicker(null);
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};
