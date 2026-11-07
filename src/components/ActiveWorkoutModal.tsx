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
import { ExerciseLibraryView } from './ExerciseLibraryView';
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
  isRestoredDraft?: boolean;
}

export const ActiveWorkoutModal: React.FC<ActiveWorkoutModalProps> = ({
  session,
  onSave,
  onCancel,
  isRestoredDraft = false,
}) => {
  const [exercises, setExercises] = useState<WorkoutExercise[]>(session.exercises || []);
  const [sessionNotes, setSessionNotes] = useState(session.notes || '');
  const [secondsElapsed, setSecondsElapsed] = useState(session.durationMinutes * 60 || 0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Restored workout Toast notification (shown strictly once upon draft resume)
  const [showRestoredToast, setShowRestoredToast] = useState(Boolean(isRestoredDraft));

  useEffect(() => {
    if (isRestoredDraft) {
      setShowRestoredToast(true);
      const timer = setTimeout(() => {
        setShowRestoredToast(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isRestoredDraft]);

  // Rest timer
  const [restSecondsRemaining, setRestSecondsRemaining] = useState<number | null>(null);
  const [activeRestPreset, setActiveRestPreset] = useState<number>(90);
  const [isRestPaused, setIsRestPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const timerFiredRef = useRef<boolean>(false);

  // Play sound when rest timer finishes (preserves existing audio oscillator)
  const playTimerSound = () => {
    if (!soundEnabledRef.current || typeof window === 'undefined') return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const audioCtx = new AudioCtxClass();
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
  };

  // Safe device vibration API trigger for mobile & Android
  const vibrateDevice = (pattern: number | number[] = [120, 60, 120]) => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Safe fallback if vibration API is restricted or throws
      }
    }
  };

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

  // Rest timer countdown with sound and vibration
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (restSecondsRemaining !== null && restSecondsRemaining > 0 && !isRestPaused) {
      timerFiredRef.current = false;
      interval = setInterval(() => {
        setRestSecondsRemaining((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            // Trigger sound & vibration strictly once upon completion
            if (!timerFiredRef.current) {
              timerFiredRef.current = true;
              playTimerSound();
              vibrateDevice([120, 60, 120]);
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
  }, [restSecondsRemaining !== null, isRestPaused]);

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
      timerFiredRef.current = false;
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

  const scrollToExercise = (targetIndex: number) => {
    const el = document.getElementById(`exercise-card-${targetIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDeleteExercise = (exIndex: number) => {
    const ex = exercises[exIndex];
    const hasCompletedSets = ex && ex.sets && ex.sets.some((s) => s.completed);
    if (hasCompletedSets) {
      if (!confirm(`Удалить упражнение «${ex.name}» с выполненными подходами?`)) return;
    }
    const next = exercises.filter((_, idx) => idx !== exIndex);
    setExercises(next);
  };

  const handleAddFromCatalog = (item: any) => {
    const defaultSetsCount = item.defaultSets || 3;
    const defaultRepsCount = item.defaultReps || 10;
    const defaultWeightVal = item.defaultWeight || 0;
    const restSec = item.defaultRestSeconds || 75;

    const newEx: WorkoutExercise = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      exerciseId: item.id,
      name: item.name,
      targetMuscle: item.primaryMuscle || 'chest',
      secondaryMuscles: item.secondaryMuscles || [],
      isBodyweight: Boolean(item.isBodyweight),
      restSeconds: restSec,
      sets: Array.from({ length: defaultSetsCount }).map((_, idx) => ({
        setNumber: idx + 1,
        weightKg: defaultWeightVal,
        reps: defaultRepsCount,
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
      {/* 4. Top Header: Title, Live Stopwatch, Completed exercises count & Progress */}
      <header
        className="bg-[#0E1416]/95 backdrop-blur-md border-b border-[#1C2628] shrink-0 z-30"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}
      >
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          {/* Left: Close button + Workout title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9AA3A5] hover:text-[#F0F3F2] hover:bg-[#162124] active:scale-95 transition-all shrink-0 cursor-pointer"
              title="Прервать тренировку"
              aria-label="Прервать тренировку"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="text-xs sm:text-sm font-bold text-[#F0F3F2] truncate leading-tight">
                  {session.name}
                </h1>
                <span className="text-[10px] text-[#58C995] font-mono tabular-nums bg-[#11241C] border border-[#2A5943] px-1.5 py-0.5 rounded shrink-0">
                  {completedExercisesCount}/{exercises.length}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Stopwatch + Finish Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Live Stopwatch with pause/play */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-[#121A1C] border border-[#1C2628] rounded-xl">
              <Timer className="w-3.5 h-3.5 text-[#58C995]" />
              <span className="text-xs font-bold tabular-nums text-[#F0F3F2] font-mono">
                {formatTime(secondsElapsed)}
              </span>
              <button
                type="button"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="text-[#9AA3A5] hover:text-[#F0F3F2] p-0.5 active:scale-90 transition-transform cursor-pointer"
                title={isTimerRunning ? 'Пауза' : 'Старт'}
              >
                {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </div>

            {/* Finish Button */}
            <button
              type="button"
              onClick={() => setShowFinishSummary(true)}
              className="px-3 py-1.5 bg-[#58C995] hover:bg-[#68D8A3] active:scale-95 text-[#080D0E] font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer shrink-0"
            >
              Завершить
            </button>
          </div>
        </div>

        {/* Micro progress line */}
        <div className="w-full h-1 bg-[#121A1C] overflow-hidden">
          <div
            className="h-full bg-[#58C995] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* Toast Notification: Resumed from draft */}
      <AnimatePresence>
        {showRestoredToast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="absolute top-14 left-4 right-4 z-40 mx-auto max-w-sm bg-[#14231b] border border-[#2f553f] text-[#E8E9E7] px-3.5 py-2 rounded-xl shadow-2xl flex items-center justify-between gap-3 backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-[#315D4B]/40 text-[#58C995] flex items-center justify-center shrink-0">
                <RotateCcw className="w-3.5 h-3.5 text-[#58C995]" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#E8E9E7] block truncate">
                  Тренировка восстановлена
                </span>
                <span className="text-[10px] text-[#858E90] block truncate">
                  Прогресс подходов и время продолжены
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRestoredToast(false)}
              className="p-1 text-[#92999A] hover:text-[#E8E9E7] rounded-lg transition-colors cursor-pointer shrink-0"
              title="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Rest Timer Strip (in document flow, never obscuring exercises) */}
      <AnimatePresence>
        {restSecondsRemaining !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-[#101F18] border-b border-[#2B4B39] px-3.5 py-1.5 flex items-center justify-between text-xs text-[#58C995] shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-[#58C995] animate-ping" />
              <span className="text-[11px] font-semibold text-[#8BB8A0]">Отдых:</span>
              <span className="text-sm font-bold tabular-nums text-[#58C995] font-mono">
                {formatTime(restSecondsRemaining)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsRestPaused(!isRestPaused)}
                className="w-7 h-7 rounded-lg bg-[#172D23] hover:bg-[#1E3B2E] text-[#92999A] hover:text-[#E8E9E7] flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                title={isRestPaused ? 'Возобновить' : 'Пауза'}
              >
                {isRestPaused ? <Play className="w-3.5 h-3.5 text-[#58C995]" /> : <Pause className="w-3.5 h-3.5 text-[#E8E9E7]" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  timerFiredRef.current = false;
                  setRestSecondsRemaining((prev) => (prev ? prev + 15 : 15));
                }}
                className="px-2 py-1 bg-[#172D23] hover:bg-[#1E3B2E] border border-[#2B4B39] rounded-lg text-[#58C995] text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
                title="Добавить 15 секунд"
              >
                +15с
              </button>
              <button
                type="button"
                onClick={() => {
                  timerFiredRef.current = false;
                  setRestSecondsRemaining(null);
                }}
                className="w-7 h-7 rounded-lg bg-[#172D23] hover:bg-[#1E3B2E] text-[#92999A] hover:text-[#E8E9E7] flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                title="Пропустить отдых"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="w-7 h-7 rounded-lg bg-[#172D23] hover:bg-[#1E3B2E] text-[#92999A] hover:text-[#E8E9E7] flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                title={soundEnabled ? 'Выключить звук' : 'Включить звук'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#58C995]" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content: Exercises and Sets */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 sm:space-y-4">
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
          const isAllSetsCompleted = ex.sets.length > 0 && ex.sets.every((s) => s.completed);

          return (
            <div
              key={ex.id || `ex-${exIndex}`}
              id={`exercise-card-${exIndex}`}
              className={`border rounded-2xl p-3 sm:p-3.5 ${
                ex.skipped
                  ? 'border-[#1C2628] bg-[#0A1012] opacity-50'
                  : isAllSetsCompleted
                  ? 'border-[#2A5943] bg-[#11241C]'
                  : 'border-[#1C2628] bg-[#121A1C]'
              }`}
            >
              {ex.skipped ? (
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-[#869194] italic">Упражнение пропущено: {ex.name}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSkipExercise(exIndex)}
                    className="text-xs text-[#58C995] font-bold px-2.5 py-1 bg-[#14261E] border border-[#234736] rounded-xl cursor-pointer"
                  >
                    Вернуть
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
                  {/* Left Column (55-60% width -> col-span-7) */}
                  <div className="md:col-span-7 flex flex-col justify-between p-3 bg-[#0D1518] border border-[#1B272A] rounded-2xl space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10.5px] font-bold text-[#58C995] bg-[#14261E] border border-[#234736] px-2 py-0.5 rounded-md">
                          {MUSCLE_DEFINITIONS[ex.targetMuscle]?.nameRu || 'Мышцы'}
                        </span>
                        {ex.isBodyweight && (
                          <span className="text-[10px] text-[#869194] bg-[#152024] px-1.5 py-0.5 rounded">Свой вес</span>
                        )}
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={() => handleToggleSkipExercise(exIndex)}
                            className="text-[10.5px] text-[#869194] hover:text-[#E8E9E7] px-1.5 py-0.5 rounded bg-[#152024] cursor-pointer"
                          >
                            Пропустить
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExercise(exIndex)}
                            className="p-1 text-[#869194] hover:text-[#E05353] rounded cursor-pointer"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-[#E8E9E7] tracking-tight leading-snug">
                        {ex.name}
                      </h3>
                    </div>

                    {/* Previous results banner if available */}
                    {prev && prev.summary && (
                      <div className="text-[10.5px] text-[#869194] bg-[#11181B] p-2 rounded-xl border border-[#1B272A] flex items-center justify-between gap-2">
                        <span className="truncate">{prev.summary}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyPreviousSets(exIndex)}
                          className="text-[#58C995] hover:text-[#68d7a4] font-semibold text-[10px] shrink-0 cursor-pointer"
                        >
                          Копировать
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-[#869194] pt-2 border-t border-[#182326]">
                      <span className="font-medium">
                        Сеты: <strong className="text-[#E8E9E7]">{ex.sets.filter(s => s.completed).length}</strong> / {ex.sets.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddSet(exIndex)}
                        className="text-[#58C995] hover:text-[#68d7a4] font-bold text-xs flex items-center gap-1 cursor-pointer bg-[#14261E] border border-[#234736] px-2.5 py-1 rounded-xl"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Сет</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Column (40-45% width -> col-span-5) */}
                  <div className="md:col-span-5 flex flex-col space-y-1.5 justify-center">
                    {ex.sets.map((set, setIndex) => (
                      <div
                        key={set.setNumber}
                        className={`flex items-center gap-2 p-2 rounded-2xl border ${
                          set.completed
                            ? 'bg-[#12241C] border-[#2A5943]'
                            : 'bg-[#0D1518] border-[#1B272A]'
                        }`}
                      >
                        <span className={`text-xs font-bold font-mono w-5 text-center shrink-0 ${set.completed ? 'text-[#58C995]' : 'text-[#869194]'}`}>
                          {set.setNumber}
                        </span>

                        {!ex.isBodyweight ? (
                          <div className="relative flex-1 min-w-0">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              min="0"
                              value={set.weightKg === 0 ? '' : set.weightKg}
                              placeholder="кг"
                              onChange={(e) => handleSetWeightChange(exIndex, setIndex, e.target.value)}
                              className="w-full h-8 bg-[#11181B] border border-[#1E282B] focus:border-[#58C995] text-center font-mono font-bold text-xs rounded-xl text-[#E8E9E7] outline-none px-1"
                            />
                          </div>
                        ) : (
                          <div className="flex-1 text-center text-[10px] text-[#869194] italic">
                            свой вес
                          </div>
                        )}

                        <div className="relative flex-1 min-w-0">
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            value={set.reps || ''}
                            placeholder="повт"
                            onChange={(e) => handleSetRepsChange(exIndex, setIndex, e.target.value)}
                            className="w-full h-8 bg-[#11181B] border border-[#1E282B] focus:border-[#58C995] text-center font-mono font-bold text-xs rounded-xl text-[#E8E9E7] outline-none px-1"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleSetComplete(exIndex, setIndex)}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                            set.completed
                              ? 'bg-[#58C995] text-[#080D0E] shadow-md shadow-[#58C995]/20'
                              : 'bg-[#11181B] border border-[#223035] text-[#697174] hover:text-[#58C995] hover:border-[#58C995]'
                          }`}
                          title={set.completed ? 'Подход выполнен (нажмите для отмены)' : 'Отметить выполненным'}
                        >
                          {set.completed ? (
                            <Check className="w-4 h-4 stroke-[3]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 stroke-[2] opacity-30" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
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

      {/* Add Exercise Modal (Full 181-exercise Library + Custom) */}
      {showAddExercisePicker && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#080D0E] border border-[#252D2F] rounded-2xl max-h-[88vh] flex flex-col overflow-y-auto p-3 shadow-2xl">
            <ExerciseLibraryView
              selectionMode={true}
              onSelectExercise={(selected) => {
                handleAddFromCatalog(selected);
              }}
              onClose={() => setShowAddExercisePicker(false)}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};
