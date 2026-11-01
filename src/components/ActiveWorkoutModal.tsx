import React, { useState, useEffect, useRef } from 'react';
import {
  WorkoutSession,
  WorkoutExercise,
  ExerciseSet,
  MuscleGroup,
  PersonalRecordInfo,
  EXERCISE_CATALOG,
  MUSCLE_DEFINITIONS,
} from '../types/workout';
import { StorageService } from '../services/storage';
import { FormSelect } from './common/FormSelect';
import {
  X,
  Plus,
  Trash2,
  Check,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Copy,
  ChevronDown,
  ChevronUp,
  Award,
  AlertCircle,
  SkipForward,
  BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants, bottomSheetVariants } from '../utils/animations';

interface ActiveWorkoutModalProps {
  session: WorkoutSession;
  onSave: (updatedSession: WorkoutSession) => void;
  onCancel: () => void;
}

export const ActiveWorkoutModal: React.FC<ActiveWorkoutModalProps> = ({
  session,
  onSave,
  onCancel,
}) => {
  const [exercises, setExercises] = useState<WorkoutExercise[]>(session.exercises || []);
  const [sessionNotes, setSessionNotes] = useState(session.notes || '');
  const [secondsElapsed, setSecondsElapsed] = useState(session.durationMinutes * 60 || 0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Rest timer
  const [restSecondsRemaining, setRestSecondsRemaining] = useState<number | null>(null);
  const [activeRestPreset, setActiveRestPreset] = useState<number>(90);
  const [isRestPaused, setIsRestPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Modals & pickers
  const [showAddExercisePicker, setShowAddExercisePicker] = useState(false);
  const [showFinishSummary, setShowFinishSummary] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogMuscleFilter, setCatalogMuscleFilter] = useState<string>('all');

  // Custom new exercise inputs
  const [customExName, setCustomExName] = useState('');
  const [customExMuscle, setCustomExMuscle] = useState<MuscleGroup>('chest');
  const [customExIsBodyweight, setCustomExIsBodyweight] = useState(false);

  // Cached previous results map: exerciseName -> { summary, sets }
  const [prevResultsMap, setPrevResultsMap] = useState<Record<string, { summary: string; sets: ExerciseSet[] } | null>>({});

  // Auto-save draft on every change
  useEffect(() => {
    const draft: WorkoutSession = {
      ...session,
      exercises,
      durationMinutes: Math.max(1, Math.round(secondsElapsed / 60)),
      notes: sessionNotes,
      status: 'in_progress',
    };
    StorageService.saveActiveDraft(draft);
  }, [exercises, sessionNotes, secondsElapsed, session]);

  // Load previous results for each exercise in this workout
  useEffect(() => {
    const map: Record<string, { summary: string; sets: ExerciseSet[] } | null> = {};
    exercises.forEach((ex) => {
      if (!map[ex.name]) {
        map[ex.name] = StorageService.getPreviousExerciseResults(ex.name);
      }
    });
    setPrevResultsMap(map);
  }, [exercises]);

  // Workout duration stopwatch
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  // Rest timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (restSecondsRemaining !== null && restSecondsRemaining > 0 && !isRestPaused) {
      interval = setInterval(() => {
        setRestSecondsRemaining((prev) => {
          if (prev === null || prev <= 1) {
            // Play gentle chime on rest completion
            if (soundEnabled && typeof window !== 'undefined') {
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
                gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.35);
              } catch {
                // AudioContext restrictions
              }
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [restSecondsRemaining, isRestPaused, soundEnabled]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleToggleSetComplete = (exIndex: number, setIndex: number) => {
    const next = [...exercises];
    const targetSet = next[exIndex].sets[setIndex];
    const nextStatus = !targetSet.completed;
    targetSet.completed = nextStatus;
    setExercises(next);

    // If completed, trigger rest timer
    if (nextStatus) {
      const restDuration = next[exIndex].restSeconds || activeRestPreset;
      setRestSecondsRemaining(restDuration);
      setIsRestPaused(false);
    }
  };

  const handleSetWeightChange = (exIndex: number, setIndex: number, val: string) => {
    const num = parseFloat(val) || 0;
    const next = [...exercises];
    next[exIndex].sets[setIndex].weightKg = num;
    setExercises(next);
  };

  const handleSetRepsChange = (exIndex: number, setIndex: number, val: string) => {
    const num = parseInt(val, 10) || 0;
    const next = [...exercises];
    next[exIndex].sets[setIndex].reps = num;
    setExercises(next);
  };

  const handleSetNoteChange = (exIndex: number, setIndex: number, val: string) => {
    const next = [...exercises];
    next[exIndex].sets[setIndex].note = val;
    setExercises(next);
  };

  const handleAddSet = (exIndex: number) => {
    const next = [...exercises];
    const curSets = next[exIndex].sets;
    const lastSet = curSets[curSets.length - 1];

    const newSet: ExerciseSet = {
      setNumber: curSets.length + 1,
      weightKg: lastSet ? lastSet.weightKg : (next[exIndex].isBodyweight ? 0 : 50),
      reps: lastSet ? lastSet.reps : 10,
      completed: false,
      previousWeightKg: lastSet?.weightKg,
      previousReps: lastSet?.reps,
    };
    curSets.push(newSet);
    setExercises(next);
  };

  const handleDeleteSet = (exIndex: number, setIndex: number) => {
    const next = [...exercises];
    next[exIndex].sets.splice(setIndex, 1);
    next[exIndex].sets.forEach((s, idx) => {
      s.setNumber = idx + 1;
    });
    setExercises(next);
  };

  // Copy previous session's sets into current exercise
  const handleCopyPreviousSets = (exIndex: number) => {
    const ex = exercises[exIndex];
    const prev = prevResultsMap[ex.name];
    if (prev && prev.sets && prev.sets.length > 0) {
      const next = [...exercises];
      next[exIndex].sets = prev.sets.map((s, idx) => ({
        setNumber: idx + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        completed: false,
        previousWeightKg: s.weightKg,
        previousReps: s.reps,
      }));
      setExercises(next);
    }
  };

  const handleToggleSkipExercise = (exIndex: number) => {
    const next = [...exercises];
    next[exIndex].skipped = !next[exIndex].skipped;
    setExercises(next);
  };

  const handleDeleteExercise = (exIndex: number) => {
    const next = exercises.filter((_, idx) => idx !== exIndex);
    setExercises(next);
  };

  const handleAddFromCatalog = (item: typeof EXERCISE_CATALOG[0]) => {
    const newEx: WorkoutExercise = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      exerciseId: item.id,
      name: item.name,
      targetMuscle: item.primaryMuscle,
      secondaryMuscles: item.secondaryMuscles,
      isBodyweight: item.isBodyweight,
      restSeconds: item.defaultRestSeconds,
      sets: Array.from({ length: item.defaultSets }).map((_, idx) => ({
        setNumber: idx + 1,
        weightKg: item.defaultWeight,
        reps: item.defaultReps,
        completed: false,
      })),
    };

    setExercises([...exercises, newEx]);
    setShowAddExercisePicker(false);
  };

  const handleAddCustomExercise = () => {
    if (!customExName.trim()) return;

    const newEx: WorkoutExercise = {
      id: `ex_custom_${Date.now()}`,
      exerciseId: `custom_${Date.now()}`,
      name: customExName.trim(),
      targetMuscle: customExMuscle,
      isBodyweight: customExIsBodyweight,
      restSeconds: 90,
      sets: [
        { setNumber: 1, weightKg: customExIsBodyweight ? 0 : 50, reps: 10, completed: false },
        { setNumber: 2, weightKg: customExIsBodyweight ? 0 : 50, reps: 10, completed: false },
        { setNumber: 3, weightKg: customExIsBodyweight ? 0 : 50, reps: 10, completed: false },
      ],
    };

    setExercises([...exercises, newEx]);
    setCustomExName('');
    setShowAddExercisePicker(false);
  };

  // Metrics calculations
  const calculateTotalVolume = () => {
    let volume = 0;
    exercises.forEach((ex) => {
      if (!ex.skipped) {
        ex.sets.forEach((s) => {
          if (s.completed && !ex.isBodyweight) {
            volume += s.weightKg * s.reps;
          }
        });
      }
    });
    return Math.round(volume);
  };

  const calculateCompletedSets = () => {
    let count = 0;
    exercises.forEach((ex) => {
      if (!ex.skipped) {
        ex.sets.forEach((s) => {
          if (s.completed) count++;
        });
      }
    });
    return count;
  };

  const calculateTotalReps = () => {
    let count = 0;
    exercises.forEach((ex) => {
      if (!ex.skipped) {
        ex.sets.forEach((s) => {
          if (s.completed) count += s.reps;
        });
      }
    });
    return count;
  };

  const totalPossibleSets = exercises.reduce((acc, ex) => acc + (ex.skipped ? 0 : ex.sets.length), 0);
  const completedSetsCount = calculateCompletedSets();
  const progressPercent = totalPossibleSets > 0 ? Math.round((completedSetsCount / totalPossibleSets) * 100) : 0;
  const completedExercisesCount = exercises.filter(
    (ex) => !ex.skipped && ex.sets.length > 0 && ex.sets.every((s) => s.completed)
  ).length;

  // Detect Personal Records during this session
  const detectPersonalRecords = (): PersonalRecordInfo[] => {
    const prs: PersonalRecordInfo[] = [];
    exercises.forEach((ex) => {
      if (!ex.isBodyweight && !ex.skipped) {
        const histPR = StorageService.getPersonalRecord(ex.name);
        let sessionMax = 0;
        let sessionMaxReps = 0;
        ex.sets.forEach((s) => {
          if (s.completed && s.weightKg > sessionMax) {
            sessionMax = s.weightKg;
            sessionMaxReps = s.reps;
          }
        });

        if (sessionMax > 0 && (!histPR || sessionMax > histPR.maxWeight)) {
          prs.push({
            exerciseName: ex.name,
            weightKg: sessionMax,
            reps: sessionMaxReps,
            date: session.date,
            isNew: true,
          });
        }
      }
    });
    return prs;
  };

  const handleConfirmFinish = () => {
    const finalSession: WorkoutSession = {
      ...session,
      exercises,
      durationMinutes: Math.max(1, Math.round(secondsElapsed / 60)),
      totalVolumeKg: calculateTotalVolume(),
      completedSets: completedSetsCount,
      totalReps: calculateTotalReps(),
      notes: sessionNotes,
      status: 'completed',
      personalRecords: detectPersonalRecords(),
    };

    onSave(finalSession);
  };

  // Catalog filtered items
  const filteredCatalog = EXERCISE_CATALOG.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchMuscle = catalogMuscleFilter === 'all' || item.primaryMuscle === catalogMuscleFilter;
    return matchSearch && matchMuscle;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className="fixed inset-0 z-50 bg-[#080D0E] flex flex-col overflow-hidden max-w-md mx-auto"
    >
      {/* 4. Top Header: Title, Date, Live Stopwatch, Completed exercises count & Progress */}
      <div className="pt-safe px-4 py-2.5 bg-[#101719] border-b border-[#252D2F] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onCancel}
            className="text-[#92999A] hover:text-[#E8E9E7] p-1 -ml-1 transition-colors"
            title="Прервать"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Live Stopwatch with pause/play */}
          <div className="flex items-center gap-2 px-3 py-1 bg-[#171D1F] border border-[#252D2F] rounded-full">
            <Timer className="w-4 h-4 text-[#58C995]" />
            <span className="text-xs font-bold tabular-nums text-[#E8E9E7]">
              {formatTime(secondsElapsed)}
            </span>
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="text-[#92999A] hover:text-[#E8E9E7] pl-1"
            >
              {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
          </div>

          {/* Finish Button */}
          <button
            onClick={() => setShowFinishSummary(true)}
            className="px-3.5 py-1.5 bg-[#58C995] hover:bg-[#48b885] active:scale-95 text-[#080D0E] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            Завершить
          </button>
        </div>

        {/* Workout Info and Progress bar */}
        <div className="flex items-center justify-between text-xs text-[#92999A] mb-1.5">
          <span className="font-semibold text-[#E8E9E7] truncate max-w-[200px]">
            {session.name}
          </span>
          <span className="tabular-nums font-mono text-[11px]">
            {completedExercisesCount}/{exercises.length} упражнений ({progressPercent}%)
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[#171D1F] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#58C995] rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 6. Rest Timer Floating Strip */}
      {restSecondsRemaining !== null && (
        <div className="bg-[#171D1F] border-b border-[#252D2F] px-4 py-2 flex items-center justify-between text-xs text-[#58C995] shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#E8E9E7]">Отдых:</span>
            <span className="text-base font-bold tabular-nums text-[#58C995] font-mono">
              {formatTime(restSecondsRemaining)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRestPaused(!isRestPaused)}
              className="p-1 text-[#92999A] hover:text-[#E8E9E7]"
              title={isRestPaused ? 'Возобновить' : 'Пауза'}
            >
              {isRestPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setRestSecondsRemaining((prev) => (prev ? prev + 15 : 15))}
              className="px-2 py-0.5 bg-[#315D4B] rounded text-[#E8E9E7] text-[10px] font-bold"
            >
              +15с
            </button>
            <button
              onClick={() => setRestSecondsRemaining(null)}
              className="text-[#92999A] hover:text-[#E8E9E7] p-1"
              title="Пропустить отдых"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="text-[#92999A] hover:text-[#E8E9E7] p-1"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Main Content: Exercises and Sets */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {exercises.length === 0 && (
          <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#14231b] text-[#58C995] flex items-center justify-center mx-auto">
              <BookOpen className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-[#E8E9E7]">В тренировке пока нет упражнений</p>
            <p className="text-[11px] text-[#92999A]">
              Нажмите кнопку ниже, чтобы выбрать упражнения из каталога или создать своё.
            </p>
          </div>
        )}
        {exercises.map((ex, exIndex) => {
          const prev = prevResultsMap[ex.name];

          return (
            <div
              key={ex.id || `ex-${exIndex}`}
              className={`bg-[#101719] border rounded-2xl p-3.5 transition-all ${
                ex.skipped
                  ? 'border-[#252D2F] opacity-50'
                  : 'border-[#252D2F]'
              }`}
            >
              {/* Exercise Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#E8E9E7]">{ex.name}</span>
                    <span className="text-[10px] text-[#58C995] bg-[#315D4B]/40 px-2 py-0.5 rounded-md font-medium">
                      {MUSCLE_DEFINITIONS[ex.targetMuscle]?.nameRu || 'Мышцы'}
                    </span>
                    {ex.isBodyweight && (
                      <span className="text-[10px] text-[#92999A] bg-[#171D1F] px-1.5 py-0.5 rounded-md">
                        Свой вес
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleSkipExercise(exIndex)}
                    className="text-[11px] text-[#92999A] hover:text-[#E8E9E7] px-2 py-0.5 rounded bg-[#171D1F]"
                  >
                    {ex.skipped ? 'Вернуть' : 'Пропустить'}
                  </button>
                  <button
                    onClick={() => handleDeleteExercise(exIndex)}
                    className="p-1 text-[#92999A] hover:text-[#C83232] transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 7. Previous Results Banner */}
              {prev && prev.summary && !ex.skipped && (
                <div className="mb-3 p-2 bg-[#171D1F] border border-[#252D2F] rounded-xl flex items-center justify-between text-[11px]">
                  <span className="text-[#92999A] truncate pr-2">
                    {prev.summary}
                  </span>
                  <button
                    onClick={() => handleCopyPreviousSets(exIndex)}
                    className="text-[#58C995] hover:text-[#83CBA5] font-semibold shrink-0 flex items-center gap-1 bg-[#315D4B]/30 px-2 py-0.5 rounded-md"
                    title="Скопировать подходы из прошлой тренировки"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Скопировать</span>
                  </button>
                </div>
              )}

              {/* 5. Sets Table */}
              {!ex.skipped && (
                <>
                  <div className="grid grid-cols-12 gap-1 text-[11px] text-[#92999A] font-medium pb-1.5 border-b border-[#252D2F] px-1">
                    <div className="col-span-2 text-center">Сет</div>
                    <div className="col-span-4 text-center">
                      {ex.isBodyweight ? 'Вес (свой)' : 'Вес (кг)'}
                    </div>
                    <div className="col-span-4 text-center">Повторения</div>
                    <div className="col-span-2 text-center">✔</div>
                  </div>

                  <div className="space-y-1.5 mt-2">
                    {ex.sets.map((set, setIndex) => (
                      <div
                        key={set.setNumber}
                        className={`grid grid-cols-12 gap-1 items-center p-1.5 rounded-xl border transition-colors ${
                          set.completed
                            ? 'bg-[#17231d] border-[#315D4B]'
                            : 'bg-[#171D1F] border-[#252D2F]'
                        }`}
                      >
                        {/* Set # */}
                        <div className="col-span-2 text-center text-xs font-bold text-[#92999A] tabular-nums font-mono">
                          {set.setNumber}
                        </div>

                        {/* Weight input */}
                        <div className="col-span-4 flex items-center justify-center">
                          {ex.isBodyweight ? (
                            <span className="text-xs text-[#92999A] italic">0 кг</span>
                          ) : (
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={set.weightKg === 0 ? '' : set.weightKg}
                              placeholder="0"
                              onChange={(e) => handleSetWeightChange(exIndex, setIndex, e.target.value)}
                              className="w-full text-center bg-[#101719] border border-[#252D2F] rounded-lg py-1 text-xs font-bold text-[#E8E9E7] tabular-nums focus:outline-none focus:border-[#58C995]"
                            />
                          )}
                        </div>

                        {/* Reps input */}
                        <div className="col-span-4 flex items-center justify-center">
                          <input
                            type="number"
                            min="0"
                            value={set.reps || ''}
                            placeholder="0"
                            onChange={(e) => handleSetRepsChange(exIndex, setIndex, e.target.value)}
                            className="w-full text-center bg-[#101719] border border-[#252D2F] rounded-lg py-1 text-xs font-bold text-[#E8E9E7] tabular-nums focus:outline-none focus:border-[#58C995]"
                          />
                        </div>

                        {/* Complete Status Checkbox */}
                        <div className="col-span-2 flex items-center justify-center">
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            onClick={() => handleToggleSetComplete(exIndex, setIndex)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                              set.completed
                                ? 'bg-[#58C995] text-[#080D0E] shadow-sm font-bold'
                                : 'bg-[#101719] border border-[#252D2F] text-[#697174] hover:border-[#92999A]'
                            }`}
                          >
                            {set.completed ? (
                              <motion.div
                                initial={{ scale: 0.6 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3] animate-check-pop" />
                              </motion.div>
                            ) : (
                              <Check className="w-3.5 h-3.5 stroke-[2] opacity-40" />
                            )}
                          </motion.button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add set / Delete set actions */}
                  <div className="mt-2.5 pt-2 border-t border-[#252D2F] flex items-center justify-between text-xs">
                    <button
                      onClick={() => handleAddSet(exIndex)}
                      className="text-[#58C995] hover:text-[#83CBA5] font-semibold flex items-center gap-1 px-1 py-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить подход</span>
                    </button>

                    {ex.sets.length > 1 && (
                      <button
                        onClick={() => handleDeleteSet(exIndex, ex.sets.length - 1)}
                        className="text-[#92999A] hover:text-[#C83232] text-[11px]"
                      >
                        Удалить подход
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Add Exercise CTA button */}
        <button
          onClick={() => setShowAddExercisePicker(true)}
          className="w-full py-3 border border-dashed border-[#252D2F] hover:border-[#58C995] rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-[#E8E9E7] hover:text-[#58C995] bg-[#101719] transition-colors"
        >
          <Plus className="w-4 h-4 text-[#58C995]" />
          <span>Добавить упражнение в тренировку</span>
        </button>

        {/* Notes */}
        <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-3">
          <label className="block text-xs font-semibold text-[#92999A] mb-1">
            Заметки к текущей тренировке
          </label>
          <textarea
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Самочувствие, настройки тренажера, замечания..."
            rows={2}
            className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl p-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995] resize-none"
          />
        </div>
      </div>

      {/* 8. Finish Workout Summary Dialog */}
      {showFinishSummary && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#252D2F]">
              <h3 className="text-base font-bold text-[#E8E9E7]">Итоги тренировки</h3>
              <button
                onClick={() => setShowFinishSummary(false)}
                className="text-[#92999A] hover:text-[#E8E9E7]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary KPI Strip */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#171D1F] p-3 rounded-xl border border-[#252D2F]">
              <div>
                <span className="text-[10px] text-[#92999A] block">Время</span>
                <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                  {Math.max(1, Math.round(secondsElapsed / 60))} мин
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#92999A] block">Подходов</span>
                <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                  {completedSetsCount}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#92999A] block">Тоннаж</span>
                <span className="text-sm font-bold text-[#58C995] tabular-nums">
                  {calculateTotalVolume().toLocaleString('ru-RU')} кг
                </span>
              </div>
            </div>

            {/* PRs detected */}
            {(() => {
              const prs = detectPersonalRecords();
              if (prs.length === 0) return null;
              return (
                <div className="p-2.5 bg-[#315D4B]/30 border border-[#315D4B] rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-[#58C995] font-bold">
                    <Award className="w-4 h-4" />
                    <span>Новые личные рекорды!</span>
                  </div>
                  {prs.map((p, idx) => (
                    <div key={idx} className="text-[#E8E9E7] text-[11px]">
                      • {p.exerciseName}: <span className="font-bold text-[#58C995]">{p.weightKg} кг</span> × {p.reps}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Exercises completed brief list */}
            <div className="space-y-1 text-xs">
              <span className="text-[11px] text-[#92999A] font-semibold block">
                Выполненные упражнения:
              </span>
              {exercises
                .filter((ex) => !ex.skipped && ex.sets.some((s) => s.completed))
                .map((ex, idx) => (
                  <div key={idx} className="flex justify-between text-[#E8E9E7] text-[11px]">
                    <span>{ex.name}</span>
                    <span className="text-[#92999A] tabular-nums">
                      {ex.sets.filter((s) => s.completed).length} подходов
                    </span>
                  </div>
                ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[#252D2F]">
              <button
                onClick={handleConfirmFinish}
                className="w-full py-3 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl shadow-md hover:bg-[#48b885]"
              >
                Подтвердить и сохранить в историю
              </button>
              <button
                onClick={() => setShowFinishSummary(false)}
                className="w-full py-2 bg-[#171D1F] text-[#92999A] font-semibold text-xs rounded-xl hover:text-[#E8E9E7]"
              >
                Вернуться к занятию
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Exercise Modal (Catalog + Custom) */}
      {showAddExercisePicker && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#252D2F] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#E8E9E7]">Добавить упражнение</h3>
              <button
                onClick={() => setShowAddExercisePicker(false)}
                className="text-[#92999A] hover:text-[#E8E9E7]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 border-b border-[#252D2F] space-y-2">
              <input
                type="text"
                placeholder="Поиск упражнения..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-1.5 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />

              {/* Muscle group filter pills */}
              <div className="flex gap-1 overflow-x-auto pb-1 text-[11px]">
                <button
                  onClick={() => setCatalogMuscleFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap ${
                    catalogMuscleFilter === 'all'
                      ? 'bg-[#315D4B] text-[#58C995]'
                      : 'bg-[#171D1F] text-[#92999A]'
                  }`}
                >
                  Все
                </button>
                {Object.values(MUSCLE_DEFINITIONS).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCatalogMuscleFilter(m.id)}
                    className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap ${
                      catalogMuscleFilter === m.id
                        ? 'bg-[#315D4B] text-[#58C995]'
                        : 'bg-[#171D1F] text-[#92999A]'
                    }`}
                  >
                    {m.nameRu}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddFromCatalog(item)}
                  className="w-full text-left p-2.5 bg-[#171D1F] hover:bg-[#20292b] border border-[#252D2F] rounded-xl flex items-center justify-between transition-colors"
                >
                  <div>
                    <span className="text-xs font-bold text-[#E8E9E7] block">{item.name}</span>
                    <span className="text-[10px] text-[#92999A]">
                      {MUSCLE_DEFINITIONS[item.primaryMuscle]?.nameRu} · {item.defaultSets} подхода
                    </span>
                  </div>
                  <Plus className="w-4 h-4 text-[#58C995]" />
                </button>
              ))}

              {/* Create custom input if not found */}
              <div className="pt-3 border-t border-[#252D2F] space-y-2">
                <span className="text-xs font-semibold text-[#92999A] block">
                  Или создайте свое:
                </span>
                <input
                  type="text"
                  placeholder="Название нового упражнения"
                  value={customExName}
                  onChange={(e) => setCustomExName(e.target.value)}
                  className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-1.5 text-xs text-[#E8E9E7] focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <FormSelect
                      value={customExMuscle}
                      onChange={(val) => setCustomExMuscle(val as MuscleGroup)}
                      options={Object.values(MUSCLE_DEFINITIONS).map((m) => ({
                        value: m.id,
                        label: m.nameRu,
                      }))}
                    />
                  </div>
                  <button
                    onClick={handleAddCustomExercise}
                    disabled={!customExName.trim()}
                    className="px-3 py-2 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl disabled:opacity-40 shrink-0 cursor-pointer"
                  >
                    Создать
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
