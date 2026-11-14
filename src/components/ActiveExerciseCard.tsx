import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  WorkoutExercise,
  ExerciseSet,
  MUSCLE_DEFINITIONS,
} from '../types/workout';
import { StorageService } from '../services/storage';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';
import {
  Check,
  Plus,
  Trash2,
  Timer,
  ChevronRight,
  Dumbbell,
  RotateCcw,
  Shield,
  Activity,
  Target,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

interface ActiveExerciseCardProps {
  exercise: WorkoutExercise;
  exerciseIndex: number;
  totalExercises: number;
  previousResult: { summary: string; sets: ExerciseSet[] } | null;
  onUpdateExercise: (updated: WorkoutExercise) => void;
  onStartRestTimer: (seconds: number) => void;
  onCancelRestTimer: () => void;
  onDeleteExercise: () => void;
  onToggleSkip: () => void;
  onNextExercise?: () => void;
}

export const ActiveExerciseCard: React.FC<ActiveExerciseCardProps> = ({
  exercise,
  exerciseIndex,
  totalExercises,
  previousResult,
  onUpdateExercise,
  onStartRestTimer,
  onCancelRestTimer,
  onDeleteExercise,
  onToggleSkip,
  onNextExercise,
}) => {
  const shouldReduceMotion = useReducedMotion();

  const catalogItem = useMemo(() => {
    const customExercises = StorageService.getCustomExercises();
    return findExerciseInUnifiedCatalog(
      exercise.exerciseId,
      exercise.name,
      customExercises,
      exercise.targetMuscle
    );
  }, [exercise.exerciseId, exercise.name, exercise.targetMuscle]);

  // Equipment type and icon detection for tile
  const equipmentInfo = useMemo(() => {
    const nameLow = exercise.name.toLowerCase();
    const reqEq = exercise.requiredEquipment || catalogItem?.requiredEquipment;

    if (
      exercise.isBodyweight ||
      catalogItem?.isBodyweight ||
      reqEq === 'bodyweight' ||
      nameLow.includes('подтягиван') ||
      nameLow.includes('отжиман') ||
      nameLow.includes('планк') ||
      nameLow.includes('брус') ||
      nameLow.includes('пресс')
    ) {
      return { label: 'Свой вес', icon: Shield };
    }
    if (reqEq === 'barbell' || nameLow.includes('штанг') || nameLow.includes('barbell')) {
      return { label: 'Штанга', icon: Dumbbell };
    }
    if (
      reqEq === 'dumbbells_adjustable' ||
      reqEq === 'dumbbells_fixed' ||
      nameLow.includes('гантел') ||
      nameLow.includes('dumbbell')
    ) {
      return { label: 'Гантели', icon: Dumbbell };
    }
    if (
      reqEq === 'gym_machines' ||
      nameLow.includes('тренажёр') ||
      nameLow.includes('машин') ||
      nameLow.includes('блоч') ||
      nameLow.includes('блок') ||
      nameLow.includes('кроссовер') ||
      nameLow.includes('cable')
    ) {
      return { label: 'Тренажёр', icon: Target };
    }
    if (
      nameLow.includes('бег') ||
      nameLow.includes('кардио') ||
      nameLow.includes('вело') ||
      nameLow.includes('эллипс')
    ) {
      return { label: 'Кардио', icon: Activity };
    }
    return { label: 'Другое', icon: Dumbbell };
  }, [exercise.name, exercise.isBodyweight, exercise.requiredEquipment, catalogItem]);

  const EquipmentIcon = equipmentInfo.icon;

  // Difficulty level from unified catalog & bar height mapping
  const difficultyInfo = useMemo(() => {
    const diff = catalogItem?.difficulty || 'Средний';
    let level = 2; // 1: beginner, 2: intermediate, 3: advanced
    if (diff === 'Начинающий' || diff === 'Легкий') level = 1;
    if (diff === 'Сложный' || diff === 'Опытный') level = 3;
    return { label: diff, level };
  }, [catalogItem]);

  // Dynamic plan label: "4 × 12"
  const planLabel = useMemo(() => {
    const count = exercise.sets.length;
    if (count === 0) return { count: 0, reps: 0 };
    const firstReps = exercise.sets[0]?.reps || 10;
    return { count, reps: firstReps };
  }, [exercise.sets]);

  // Previous result summary hint
  const previousHint = useMemo(() => {
    if (!previousResult || !previousResult.sets || !previousResult.sets.length) return null;
    const first = previousResult.sets[0];
    if (exercise.isBodyweight) {
      return `в прошлый раз: ${first.reps} повт`;
    }
    return `в прошлый раз: ${first.weightKg} кг × ${first.reps}`;
  }, [previousResult, exercise.isBodyweight]);

  const [shakingSetIndex, setShakingSetIndex] = useState<number | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  // Track extra weight visibility for bodyweight exercises per set index
  const [showWeightMap, setShowWeightMap] = useState<Record<number, boolean>>({});

  // Undo deletion toast
  const [deletedSetInfo, setDeletedSetInfo] = useState<{
    set: ExerciseSet;
    index: number;
    timer: NodeJS.Timeout;
  } | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (deletedSetInfo?.timer) clearTimeout(deletedSetInfo.timer);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [deletedSetInfo]);

  const isAllSetsCompleted =
    exercise.sets.length > 0 && exercise.sets.every((s) => s.completed);

  const triggerHaptic = (duration: number = 10) => {
    if (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'vibrate' in navigator &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate(duration);
      } catch {
        // Fallback
      }
    }
  };

  const handleToggleComplete = (setIndex: number) => {
    const targetSet = exercise.sets[setIndex];
    if (!targetSet) return;

    if (!targetSet.completed && (!targetSet.reps || targetSet.reps <= 0)) {
      triggerHaptic(40);
      setShakingSetIndex(setIndex);
      setTimeout(() => {
        setShakingSetIndex(null);
      }, 650);
      return;
    }

    const nextCompleted = !targetSet.completed;
    const updatedSets = exercise.sets.map((s, idx) =>
      idx === setIndex
        ? {
            ...s,
            completed: nextCompleted,
            isAutoFilled: false,
          }
        : s
    );

    onUpdateExercise({
      ...exercise,
      sets: updatedSets,
    });

    if (nextCompleted) {
      triggerHaptic(10);
      const restSec = exercise.restSeconds || 90;
      onStartRestTimer(restSec);
    } else {
      onCancelRestTimer();
    }
  };

  const handleWeightChange = (setIndex: number, rawVal: string) => {
    const normalized = rawVal.replace(',', '.');
    if (normalized === '') {
      const updatedSets = exercise.sets.map((s, idx) =>
        idx === setIndex
          ? {
              ...s,
              weightKg: 0,
              isAutoFilled: false,
            }
          : s
      );
      onUpdateExercise({ ...exercise, sets: updatedSets });
      return;
    }

    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(999, Math.round(parsed * 10) / 10));
      const updatedSets = exercise.sets.map((s, idx) =>
        idx === setIndex
          ? {
              ...s,
              weightKg: clamped,
              isAutoFilled: false,
            }
          : s
      );
      onUpdateExercise({ ...exercise, sets: updatedSets });
    }
  };

  const handleRepsChange = (setIndex: number, rawVal: string) => {
    const cleaned = rawVal.replace(/\D/g, '');
    const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
    const clamped = Math.max(0, Math.min(99, num));

    const updatedSets = exercise.sets.map((s, idx) =>
      idx === setIndex
        ? {
            ...s,
            reps: clamped,
            isAutoFilled: false,
          }
        : s
    );
    onUpdateExercise({ ...exercise, sets: updatedSets });
  };

  const handleAddSet = () => {
    const curSets = exercise.sets;
    const lastSet = curSets[curSets.length - 1];

    let newWeight = 50;
    let newReps = 10;

    if (lastSet) {
      newWeight = lastSet.weightKg;
      newReps = lastSet.reps;
    } else if (previousResult && previousResult.sets.length > 0) {
      newWeight = previousResult.sets[0].weightKg;
      newReps = previousResult.sets[0].reps;
    } else if (exercise.isBodyweight) {
      newWeight = 0;
    }

    const newSet: ExerciseSet = {
      setNumber: curSets.length + 1,
      weightKg: newWeight,
      reps: newReps,
      completed: false,
      isAutoFilled: true,
      previousWeightKg: lastSet?.weightKg,
      previousReps: lastSet?.reps,
    };

    onUpdateExercise({
      ...exercise,
      sets: [...curSets, newSet],
    });
    triggerHaptic(15);
  };

  const handleDeleteSetWithUndo = (setIndex: number) => {
    if (exercise.sets.length <= 1) return;

    const targetSet = exercise.sets[setIndex];
    const nextSets = exercise.sets
      .filter((_, idx) => idx !== setIndex)
      .map((s, idx) => ({
        ...s,
        setNumber: idx + 1,
      }));

    onUpdateExercise({
      ...exercise,
      sets: nextSets,
    });

    triggerHaptic(20);

    if (deletedSetInfo?.timer) clearTimeout(deletedSetInfo.timer);
    const timer = setTimeout(() => {
      setDeletedSetInfo(null);
    }, 4000);

    setDeletedSetInfo({
      set: targetSet,
      index: setIndex,
      timer,
    });
  };

  const handleUndoDelete = () => {
    if (!deletedSetInfo) return;
    clearTimeout(deletedSetInfo.timer);

    const restored = [...exercise.sets];
    restored.splice(deletedSetInfo.index, 0, deletedSetInfo.set);
    const reindexed = restored.map((s, idx) => ({
      ...s,
      setNumber: idx + 1,
    }));

    onUpdateExercise({
      ...exercise,
      sets: reindexed,
    });
    setDeletedSetInfo(null);
    triggerHaptic(15);
  };

  const startLongPress = (setIndex: number) => {
    if (exercise.sets.length <= 1) return;
    longPressTimerRef.current = setTimeout(() => {
      triggerHaptic(30);
      handleDeleteSetWithUndo(setIndex);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  if (exercise.skipped) {
    return (
      <div className="border border-[#1F2C2E] bg-[#161E21] rounded-[28px] p-4 opacity-50 flex items-center justify-between transition-all">
        <span className="text-xs text-[#858E90] italic truncate">
          Упражнение пропущено: {exercise.name}
        </span>
        <button
          type="button"
          onClick={onToggleSkip}
          className="text-xs text-[#58C995] font-bold px-3 py-1.5 bg-[#14261E] border border-[#234736] rounded-xl hover:bg-[#1A3328] transition-colors"
          aria-label={`Возобновить упражнение ${exercise.name}`}
        >
          Вернуть
        </button>
      </div>
    );
  }

  const isBodyweightOrCardio = exercise.isBodyweight || equipmentInfo.label === 'Кардио';

  return (
    <div className="space-y-3">
      {/* Undo Toast */}
      <AnimatePresence>
        {deletedSetInfo && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="bg-[#162720] border border-[#2B543F] text-[#F0F3F2] px-3.5 py-2 rounded-xl shadow-2xl flex items-center justify-between gap-2 backdrop-blur-md"
          >
            <span className="text-xs text-[#E8E9E7] truncate">
              Подход #{deletedSetInfo.set.setNumber} удалён
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="flex items-center gap-1 text-xs font-bold text-[#58C995] hover:text-[#78E0AF] px-2.5 py-1 bg-[#101D18] border border-[#2A523E] rounded-lg transition-colors cursor-pointer shrink-0"
              aria-label="Отменить удаление подхода"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Отменить</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UNIFIED SINGLE CARD CONTAINER */}
      <div
        className={`border rounded-[28px] p-4 sm:p-5 transition-all duration-300 relative shadow-2xl ${
          isAllSetsCompleted
            ? 'border-[#58C995]/70 bg-[#162022] shadow-[0_0_32px_rgba(88,201,149,0.2)]'
            : 'border-[#222F33] bg-[#161E21]'
        }`}
      >
        {/* TOP SECTION: Equipment Tile, Title, Chip, Plan, Difficulty, Check Column */}
        <div className="flex items-center justify-between gap-3 sm:gap-4 pb-4">
          {/* 1. EQUIPMENT TILE (Replacing body photo) */}
          <div
            className={`relative w-[36%] max-w-[124px] aspect-[1/1.1] rounded-[20px] border flex flex-col items-center justify-center p-2.5 transition-colors duration-300 shadow-inner overflow-hidden ${
              isAllSetsCompleted
                ? 'bg-[#182823] border-[#377A59]'
                : 'bg-[#1A2326] border-[#2A373A]'
            }`}
          >
            {/* Centered circular background */}
            <div
              className={`w-16 h-16 sm:w-[88px] sm:h-[88px] rounded-full flex items-center justify-center transition-colors duration-300 ${
                isAllSetsCompleted
                  ? 'bg-[#58C995] text-[#0A1012] shadow-md shadow-[#58C995]/30'
                  : 'bg-[#58C995]/12 text-[#58C995]'
              }`}
            >
              <EquipmentIcon
                className={`w-7 h-7 sm:w-12 sm:h-12 transition-colors duration-300 ${
                  isAllSetsCompleted ? 'text-[#0A1012]' : 'text-[#58C995]'
                }`}
              />
            </div>
            {/* Small label underneath */}
            <span className="text-[10px] sm:text-xs text-[#858E90] font-medium mt-2 text-center truncate max-w-full">
              {equipmentInfo.label}
            </span>
          </div>

          {/* 2. CENTER CONTENT: Title, Chip, Plan, Difficulty */}
          <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5 space-y-1.5">
            {/* Title: 21-28px, bold 700-800, up to 2 lines, no ellipsis */}
            <h3 className="text-lg sm:text-[26px] font-extrabold text-[#FFFFFF] tracking-tight leading-tight line-clamp-2">
              {exercise.name}
            </h3>

            {/* Muscle Chip */}
            <div>
              <div className="inline-flex items-center gap-1.5 bg-[#20292B] border border-[#2D393C] text-[#C2C8C9] px-2.5 py-1 rounded-full text-xs font-medium">
                <Dumbbell className="w-3.5 h-3.5 text-[#58C995]" />
                <span>{MUSCLE_DEFINITIONS[exercise.targetMuscle]?.nameRu || 'Мышцы'}</span>
              </div>
            </div>

            {/* Plan "N × M": ~34-38px, font-black, tight letter spacing */}
            <div className="text-2xl sm:text-[36px] font-black text-[#FFFFFF] font-mono tracking-tight pt-0.5 flex items-center gap-1.5">
              <span>{planLabel.count}</span>
              <span className="text-[#58C995] font-extrabold text-xl sm:text-2xl">×</span>
              <span>{planLabel.reps}</span>
            </div>

            {/* Difficulty: 3 vertical mint bars + gray label */}
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex items-end gap-0.5 h-3.5">
                <span
                  className={`w-1.5 bg-[#58C995] rounded-full ${
                    difficultyInfo.level >= 1 ? 'h-2' : 'h-1.5 opacity-40'
                  }`}
                />
                <span
                  className={`w-1.5 bg-[#58C995] rounded-full ${
                    difficultyInfo.level >= 2 ? 'h-3' : 'h-2 opacity-40'
                  }`}
                />
                <span
                  className={`w-1.5 bg-[#58C995] rounded-full ${
                    difficultyInfo.level >= 3 ? 'h-3.5' : 'h-2.5 opacity-40'
                  }`}
                />
              </div>
              <span className="text-xs font-medium text-[#858E90]">{difficultyInfo.label}</span>
            </div>
          </div>

          {/* 3. RIGHT COLUMN: Vertical Column of Check Circles (~40-48px) */}
          <div className="flex flex-col justify-around items-center self-stretch py-1 pl-1 shrink-0">
            {exercise.sets.map((set, setIndex) => {
              const isShaking = shakingSetIndex === setIndex;
              const isLinkedFocused = focusedRowIndex === setIndex;

              return (
                <motion.button
                  key={set.setNumber}
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  animate={
                    set.completed && !shouldReduceMotion
                      ? { scale: [0.8, 1.15, 1] }
                      : isShaking
                      ? { x: [-6, 6, -4, 4, 0] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                  onClick={() => handleToggleComplete(setIndex)}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center cursor-pointer transition-all my-0.5 ${
                    set.completed
                      ? 'bg-[#58C995] border-2 border-[#58C995] text-[#0A1012] shadow-lg shadow-[#58C995]/30'
                      : isShaking
                      ? 'bg-[#2A1618] border-2 border-[#E04848] text-[#E04848]'
                      : isLinkedFocused
                      ? 'bg-[#162124] border-2 border-[#58C995] text-transparent shadow-sm shadow-[#58C995]/20'
                      : 'bg-[#161E21] border-2 border-[#2C383B] text-transparent hover:border-[#58C995]/60'
                  }`}
                  aria-label={
                    set.completed
                      ? `Подход ${set.setNumber} выполнен. Нажмите для отмены.`
                      : `Отметить подход ${set.setNumber} выполненным.`
                  }
                >
                  <Check
                    className={`w-5 h-5 transition-transform ${
                      set.completed ? 'opacity-100 stroke-[3]' : 'opacity-0 scale-50'
                    }`}
                  />
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* THIN DIVIDER SEPARATING TOP SECTION FROM SET ROWS */}
        <div className="border-t border-[#222F33] my-3" />

        {/* SET ROWS */}
        <div className="space-y-2">
          {previousHint && (
            <div className="text-[11px] text-[#858E90] px-1 pb-1 flex justify-end">
              <span>{previousHint}</span>
            </div>
          )}

          <AnimatePresence initial={false}>
            {exercise.sets.map((set, setIndex) => {
              const showWeight = !isBodyweightOrCardio || showWeightMap[setIndex] || set.weightKg > 0;

              return (
                <motion.div
                  key={set.setNumber}
                  layout={!shouldReduceMotion}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="relative group/row rounded-xl">
                    {/* Swipe delete background button */}
                    {exercise.sets.length > 1 && (
                      <div className="absolute inset-y-0 right-0 w-20 bg-[#E04848] rounded-xl flex items-center justify-center text-white z-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteSetWithUndo(setIndex)}
                          className="w-full h-full flex flex-col items-center justify-center text-white cursor-pointer active:scale-95 transition-transform"
                          aria-label={`Удалить подход ${set.setNumber}`}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-[9px] font-bold mt-0.5">Удалить</span>
                        </button>
                      </div>
                    )}

                    {/* Row Foreground */}
                    <motion.div
                      drag={exercise.sets.length > 1 ? 'x' : false}
                      dragConstraints={{ left: -76, right: 0 }}
                      dragElastic={0.08}
                      onDragEnd={(_, info) => {
                        if (info.offset.x < -42) {
                          handleDeleteSetWithUndo(setIndex);
                        }
                      }}
                      className={`relative z-10 grid ${
                        showWeight
                          ? 'grid-cols-[40px_1fr_1fr_40px] sm:grid-cols-[48px_1fr_1fr_48px]'
                          : 'grid-cols-[40px_1fr_40px] sm:grid-cols-[48px_1fr_48px]'
                      } gap-2.5 items-center p-2 rounded-xl border transition-all ${
                        set.completed
                          ? 'bg-[#12231B]/70 border-[#2A5943]/60 border-l-2 border-l-[#58C995] opacity-80'
                          : focusedRowIndex === setIndex
                          ? 'bg-[#141D20] border-[#58C995]/50'
                          : 'bg-[#121A1C] border-[#202E31]'
                      }`}
                    >
                      {/* Set Number */}
                      <div
                        onPointerDown={() => startLongPress(setIndex)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onClick={() => handleToggleComplete(setIndex)}
                        className="flex items-center justify-center select-none cursor-pointer"
                        title="Нажмите, чтобы отметить подход выполненным"
                      >
                        <span
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs transition-colors ${
                            set.completed
                              ? 'text-[#58C995] bg-[#142D21]'
                              : 'text-[#858E90] bg-[#141C1E] hover:text-[#F0F3F2]'
                          }`}
                        >
                          {set.setNumber}
                        </span>
                      </div>

                      {/* Weight Field (if shown) */}
                      {showWeight && (
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={set.weightKg === 0 && !exercise.isBodyweight ? '' : set.weightKg}
                            placeholder="0 кг"
                            onFocus={(e) => {
                              setFocusedRowIndex(setIndex);
                              e.target.select();
                            }}
                            onBlur={() => {
                              setFocusedRowIndex(null);
                            }}
                            onChange={(e) => handleWeightChange(setIndex, e.target.value)}
                            className={`w-full h-10 bg-[#0E1416] border border-[#223033] focus:border-[#58C995] focus:ring-1 focus:ring-[#58C995] text-center font-mono font-bold text-sm rounded-xl outline-none px-1 transition-all ${
                              set.isAutoFilled && !set.completed ? 'text-[#6E7B7D]' : 'text-[#F0F3F2]'
                            }`}
                            aria-label={`Вес для подхода ${set.setNumber}`}
                          />
                        </div>
                      )}

                      {/* Reps Field */}
                      <div className="relative flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={set.reps || ''}
                          placeholder="0 повт"
                          onFocus={(e) => {
                            setFocusedRowIndex(setIndex);
                            e.target.select();
                          }}
                          onBlur={() => {
                            setFocusedRowIndex(null);
                          }}
                          onChange={(e) => handleRepsChange(setIndex, e.target.value)}
                          className={`w-full h-10 bg-[#0E1416] border border-[#223033] focus:border-[#58C995] focus:ring-1 focus:ring-[#58C995] text-center font-mono font-bold text-sm rounded-xl outline-none px-1 transition-all ${
                            set.isAutoFilled && !set.completed ? 'text-[#6E7B7D]' : 'text-[#F0F3F2]'
                          }`}
                          aria-label={`Повторения для подхода ${set.setNumber}`}
                        />

                        {/* Optional "+ вес" button for bodyweight / cardio exercises */}
                        {isBodyweightOrCardio && !showWeight && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowWeightMap((prev) => ({ ...prev, [setIndex]: true }))
                            }
                            className="px-2 h-10 bg-[#162124] hover:bg-[#1E2C30] border border-[#2A373A] text-[10px] font-bold text-[#58C995] rounded-xl shrink-0 transition-colors"
                            title="Добавить отягощение"
                          >
                            + вес
                          </button>
                        )}
                      </div>

                      {/* Delete button */}
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteSetWithUndo(setIndex)}
                          disabled={exercise.sets.length <= 1}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#697275] hover:text-[#E04848] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Удалить подход"
                          aria-label={`Удалить подход ${set.setNumber}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Add Set Button inside card container */}
        <div className="pt-2.5">
          <button
            type="button"
            onClick={handleAddSet}
            className="w-full py-2.5 border border-dashed border-[#26373A] hover:border-[#58C995] rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#E8E9E7] hover:text-[#58C995] bg-[#121A1C] transition-all cursor-pointer active:scale-[0.99]"
            aria-label="Добавить новый подход"
          >
            <Plus className="w-4 h-4 text-[#58C995]" />
            <span>+ Добавить подход</span>
          </button>
        </div>
      </div>

      {/* REST TIMER BANNER: Standalone plate under card */}
      <div>
        <button
          type="button"
          onClick={() => onStartRestTimer(exercise.restSeconds || 90)}
          className="w-full py-3.5 px-4 bg-[#161E21] hover:bg-[#1B2528] border border-[#222F33] hover:border-[#2C3E42] rounded-[24px] flex items-center justify-between text-xs text-[#858E90] hover:text-[#F0F3F2] transition-all cursor-pointer shadow-xl active:scale-[0.99]"
          aria-label={`Запустить таймер отдыха на ${exercise.restSeconds || 90} секунд`}
        >
          <div className="w-6" />
          
          <div className="flex items-center gap-2.5">
            <Timer className="w-4 h-4 text-[#858E90]" />
            <span className="font-medium text-xs sm:text-sm text-[#858E90]">
              Отдых <strong className="text-[#F0F3F2] font-bold">{exercise.restSeconds || 90} сек</strong>
            </span>
          </div>

          <div className="w-6 flex items-center justify-end text-[#858E90]">
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      </div>

      {/* All sets completed banner */}
      {isAllSetsCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 rounded-2xl bg-[#12241C] border border-[#2A5943] text-xs text-[#58C995] shadow-lg"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#58C995] animate-ping" />
            <span className="font-bold text-xs text-[#F0F3F2]">
              Все подходы выполнены!
            </span>
          </div>

          {onNextExercise && exerciseIndex < totalExercises - 1 && (
            <button
              type="button"
              onClick={onNextExercise}
              className="px-3 py-1 bg-[#173828] hover:bg-[#1E4833] border border-[#377A59] text-white text-[11px] font-bold rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Следующее</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
};
