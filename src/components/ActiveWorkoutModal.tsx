import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  WorkoutSession,
  WorkoutExercise,
  ExerciseSet,
  MuscleGroup,
  PersonalRecordInfo,
  MUSCLE_DEFINITIONS,
} from '../types/workout';
import { StorageService, resolveInitialExerciseSets } from '../services/storage';
import { SafeWriteResult } from '../services/migrations';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';
import { calculateWorkoutMetrics } from '../training-core/coreMath';
import { normalizeMuscleKeyPure, normalizeMuscleListPure } from '../training-core/muscles';
import { ExerciseLibraryView } from './ExerciseLibraryView';
import { Modal, ConfirmModal, PromptModal } from './common/Modal';
import {
  X,
  Plus,
  Minus,
  Check,
  Timer,
  Play,
  Pause,
  Award,
  BookOpen,
  Eye,
  Dumbbell,
  Mic,
  MicOff,
  RotateCcw,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ActiveWorkoutModalProps {
  session: WorkoutSession;
  onSave: (updatedSession: WorkoutSession) => void | SafeWriteResult;
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
  const [sessionNotes, setSessionNotes] = useState<string>(session.notes || '');
  const [secondsElapsed, setSecondsElapsed] = useState<number>(session.durationMinutes * 60 || 0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

  // Vertical Zoom scale: 0.9 .. 1.15
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Modals & Sheets
  const [visualizeExercise, setVisualizeExercise] = useState<WorkoutExercise | null>(null);
  const [showAddExercisePicker, setShowAddExercisePicker] = useState<boolean>(false);
  const [showFinishSummary, setShowFinishSummary] = useState<boolean>(false);
  const [editingTarget, setEditingTarget] = useState<{ exIndex: number; setIndex: number } | null>(null);
  const [exerciseToDeleteIndex, setExerciseToDeleteIndex] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showNotePrompt, setShowNotePrompt] = useState<boolean>(false);
  const [showRestoredToast, setShowRestoredToast] = useState<boolean>(Boolean(isRestoredDraft));
  const [isListeningVoice, setIsListeningVoice] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Rest timer
  const [restSecondsRemaining, setRestSecondsRemaining] = useState<number | null>(null);
  const [activeRestPreset, setActiveRestPreset] = useState<number>(90);
  const [activeRestExerciseName, setActiveRestExerciseName] = useState<string>('');
  const [isRestPaused, setIsRestPaused] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const timerFiredRef = useRef<boolean>(false);

  // Safe audio tone on timer completion (pleasant synth sine chime)
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
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch {
      // AudioContext policy safe fallback
    }
  };

  // Safe device vibration
  const vibrateDevice = (pattern: number | number[] = [80]) => {
    if (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'vibrate' in navigator &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Safe fallback
      }
    }
  };

  // Toast auto-hide for restored draft
  useEffect(() => {
    if (isRestoredDraft) {
      setShowRestoredToast(true);
      const timer = setTimeout(() => setShowRestoredToast(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [isRestoredDraft]);

  // Auto-save draft on changes
  useEffect(() => {
    const draft: WorkoutSession = {
      ...session,
      exercises,
      durationMinutes: Math.max(1, Math.round(secondsElapsed / 60)),
      notes: sessionNotes,
      status: 'in_progress',
    };
    const draftRes = StorageService.saveActiveDraft(draft);
    if (!draftRes.ok) {
      setSaveError(
        draftRes.error || 'Не удалось автосохранить черновик тренировки (ошибка памяти).'
      );
    }
  }, [exercises, sessionNotes, secondsElapsed, session]);

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
      timerFiredRef.current = false;
      interval = setInterval(() => {
        setRestSecondsRemaining((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
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

  // Toggle set completion (clicking on circle)
  // CRITICAL: Does NOT change active exercise or jump scroll position!
  const handleToggleSetComplete = (exIdx: number, setIndex: number) => {
    const next = [...exercises];
    const targetEx = next[exIdx];
    if (!targetEx) return;
    const targetSet = targetEx.sets[setIndex];
    if (!targetSet) return;

    const nextStatus = !targetSet.completed;
    targetSet.completed = nextStatus;
    (targetSet as any).done = nextStatus;
    (targetSet as any).isDone = nextStatus;
    setExercises(next);

    vibrateDevice(nextStatus ? [80] : [40]);

    // Start rest timer if marked completed
    if (nextStatus) {
      const restDuration = targetEx.restSeconds || activeRestPreset;
      timerFiredRef.current = false;
      setRestSecondsRemaining(restDuration);
      setActiveRestExerciseName(targetEx.name);
      setIsRestPaused(false);
    }
  };

  const handleStartRestTimer = (seconds: number, exerciseName?: string) => {
    setActiveRestPreset(seconds);
    setRestSecondsRemaining(seconds);
    setIsRestPaused(false);
    timerFiredRef.current = false;
    if (exerciseName) setActiveRestExerciseName(exerciseName);
  };

  // Adjust weight for specific exercise set
  const handleAdjustWeight = (exIdx: number, setIdx: number, delta: number) => {
    const next = [...exercises];
    const targetEx = next[exIdx];
    if (!targetEx) return;
    const targetSet = targetEx.sets[setIdx];
    if (!targetSet) return;

    const curW = targetSet.weightKg || 0;
    const newW = Math.max(0, Math.round((curW + delta) * 2) / 2);
    targetSet.weightKg = newW;
    setExercises(next);
    vibrateDevice(30);
  };

  const handleSetWeightValue = (exIdx: number, setIdx: number, val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    const next = [...exercises];
    const targetEx = next[exIdx];
    if (!targetEx || !targetEx.sets[setIdx]) return;
    targetEx.sets[setIdx].weightKg = num;
    setExercises(next);
  };

  // Adjust reps for specific exercise set
  const handleAdjustReps = (exIdx: number, setIdx: number, delta: number) => {
    const next = [...exercises];
    const targetEx = next[exIdx];
    if (!targetEx) return;
    const targetSet = targetEx.sets[setIdx];
    if (!targetSet) return;

    const curR = targetSet.reps || 12;
    const newR = Math.max(1, curR + delta);
    targetSet.reps = newR;
    setExercises(next);
    vibrateDevice(30);
  };

  // Add a new set to an exercise
  const handleAddSet = (exIdx: number) => {
    const next = [...exercises];
    const targetEx = next[exIdx];
    if (!targetEx) return;

    const lastSet = targetEx.sets[targetEx.sets.length - 1];
    const newSetNumber = targetEx.sets.length + 1;
    targetEx.sets.push({
      setNumber: newSetNumber,
      weightKg: lastSet ? (lastSet.weightKg ?? 0) : 0,
      reps: lastSet ? lastSet.reps : 12,
      completed: false,
    });
    setExercises(next);
    vibrateDevice(40);
  };

  // Delete an exercise from the session
  const handleDeleteExercise = (exIdx: number) => {
    setExerciseToDeleteIndex(exIdx);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(1.15, Math.round((prev + 0.05) * 100) / 100));
  };
  const handleZoomOut = () => {
    setZoomScale((prev) => Math.max(0.9, Math.round((prev - 0.05) * 100) / 100));
  };

  // Add exercise from catalog (preserving custom & full catalog metadata)
  const handleAddFromCatalog = (item: any) => {
    const defaultSetsCount = item.defaultSets || 4;
    const defaultRepsCount = item.defaultReps || 12;
    const restSec = item.defaultRestSeconds || 90;
    const normPrimary =
      normalizeMuscleKeyPure(item.primaryMuscle) || item.primaryMuscle || 'quads_rectus';
    const normSecondary = normalizeMuscleListPure(item.secondaryMuscles || []).filter(
      (m) => m !== normPrimary
    );

    const newEx: WorkoutExercise = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      exerciseId: item.id,
      name: item.name,
      targetMuscle: normPrimary,
      secondaryMuscles: normSecondary,
      isBodyweight: Boolean(item.isBodyweight),
      requiredEquipment: item.requiredEquipment,
      technique: item.technique,
      restSeconds: restSec,
      sets: resolveInitialExerciseSets({
        exerciseName: item.name,
        exerciseId: item.id,
        targetMuscle: normPrimary,
        setsCount: defaultSetsCount,
        defaultReps: defaultRepsCount,
        explicitTargetWeight: null,
        isBodyweight: Boolean(item.isBodyweight),
      }),
    };

    setExercises((prev) => [...prev, newEx]);
    setShowAddExercisePicker(false);
    vibrateDevice(50);
  };

  const getSessionMetrics = () =>
    calculateWorkoutMetrics(exercises, StorageService.getProfile().weightKg);

  // Calculate volume
  const calculateTotalVolume = () => getSessionMetrics().totalVolumeKg;

  // Calculate completed sets
  const calculateCompletedSets = () => getSessionMetrics().completedSets;

  // Calculate total reps
  const calculateTotalReps = () => getSessionMetrics().totalReps;

  const totalPossibleSets = exercises.reduce((acc, ex) => acc + (ex.skipped ? 0 : ex.sets.length), 0);
  const completedSetsCount = calculateCompletedSets();

  // PR detection
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
    setSaveError(null);
    const currentBodyWeight = Number(StorageService.getProfile().weightKg);
    const bodyWeightKgAtWorkout =
      Number.isFinite(currentBodyWeight) && currentBodyWeight > 0 ? currentBodyWeight : null;

    const finalSession: WorkoutSession = {
      ...session,
      exercises,
      durationMinutes: Math.max(1, Math.round(secondsElapsed / 60)),
      totalVolumeKg: calculateTotalVolume(),
      completedSets: completedSetsCount,
      totalReps: calculateTotalReps(),
      bodyWeightKgAtWorkout,
      notes: sessionNotes,
      status: 'completed',
      completedAt: Date.now(),
      personalRecords: detectPersonalRecords(),
    };

    const result = onSave(finalSession);
    if (result && !result.ok) {
      setSaveError(
        result.error ||
          'Не удалось сохранить тренировку в память устройства. Проверьте свободное место или Настройки → Данные.'
      );
    }
  };

  // Format stopwatch string
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Helper for difficulty using unified catalog (198+ & custom exercises)
  const getDifficultyInfo = (ex: WorkoutExercise) => {
    const customExercises = StorageService.getCustomExercises();
    const catalogItem = findExerciseInUnifiedCatalog(
      ex.exerciseId,
      ex.name,
      customExercises,
      ex.targetMuscle
    );
    const diff = catalogItem?.difficulty || 'Средний';
    let greenBars = 2;
    if (diff === 'Начинающий' || diff === 'Легкий') greenBars = 1;
    if (diff === 'Сложный' || diff === 'Опытный') greenBars = 3;
    return { label: diff, greenBars };
  };

  // Voice note recording simulation / Web Speech API handler
  const handleToggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setShowNotePrompt(true);
      return;
    }

    if (isListeningVoice) {
      setIsListeningVoice(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ru-RU';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListeningVoice(true);
        vibrateDevice(50);
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) {
          setSessionNotes((prev) => (prev ? `${prev} · ${text}` : text));
        }
        setIsListeningVoice(false);
      };

      recognition.onerror = () => {
        setIsListeningVoice(false);
      };

      recognition.onend = () => {
        setIsListeningVoice(false);
      };

      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 bg-[#080C0E] text-[#E8E9E7] flex flex-col justify-between overflow-hidden select-none font-sans"
    >
      {/* ======================================================== */}
      {/* 1. TOP STICKY BAR (Derived from screenshot)              */}
      {/* ======================================================== */}
      <header
        className="relative z-30 shrink-0 px-4 pt-3 pb-2.5 bg-[#0A0D0F]/95 backdrop-blur-md border-b border-[#1A2229] flex items-center justify-between gap-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        {/* Left: Round close button with crisp white background (from screenshot) */}
        <button
          type="button"
          onClick={() => setShowExitConfirm(true)}
          className="w-11 h-11 rounded-full bg-white text-black font-bold shadow-md hover:bg-zinc-100 active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
          title="Прервать тренировку"
          aria-label="Прервать тренировку"
        >
          <X className="w-5 h-5 stroke-[2.4]" />
        </button>

        {/* Center: "visualize" white pill button (from screenshot) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const currentEx = exercises[0] || null;
              if (currentEx) setVisualizeExercise(currentEx);
            }}
            className="rounded-full bg-white hover:bg-zinc-100 text-black px-7 py-2.5 font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            title="Открыть анатомический фокус"
          >
            <span>visualize</span>
          </button>
        </div>

        {/* Right: Stopwatch duration & Finish Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsTimerRunning(!isTimerRunning)}
            className="px-3 py-2 rounded-full bg-[#13171B] border border-[#222B35] text-xs font-mono font-bold text-[#58C995] flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="Пауза / Продолжить таймер"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{formatTime(secondsElapsed)}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFinishSummary(true)}
            className="px-3.5 py-2 rounded-full bg-[#58C995] text-[#080D0E] font-black text-xs uppercase tracking-wider hover:bg-[#68d7a4] active:scale-95 transition-all cursor-pointer shadow-md"
            title="Завершить тренировку"
          >
            Готово
          </button>
        </div>
      </header>

      {/* Restored from Draft Toast */}
      <AnimatePresence>
        {showRestoredToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-40 mx-auto max-w-xs bg-[#12241C] text-[#58C995] border border-[#27533E] px-3.5 py-2 rounded-2xl shadow-xl flex items-center justify-between gap-2 text-xs mt-1"
          >
            <div className="flex items-center gap-2 font-semibold">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Тренировка восстановлена</span>
            </div>
            <button onClick={() => setShowRestoredToast(false)} className="text-[#869194] p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {saveError && !showFinishSummary && (
        <div
          role="alert"
          className="relative z-40 mx-4 mt-1 px-3.5 py-2 rounded-2xl bg-[#2B1414] border border-[#5C2626] text-xs text-[#FCA5A5] flex items-center justify-between gap-2"
        >
          <span className="flex-1">{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-[#FCA5A5] hover:text-white p-0.5 cursor-pointer"
            aria-label="Скрыть ошибку"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. FLOATING RIGHT ZOOM DOCK (+ / −)                      */}
      {/* ======================================================== */}
      <aside
        className="fixed right-3.5 top-[76px] z-30 w-11 rounded-2xl bg-white text-black shadow-lg flex flex-col items-center overflow-hidden border border-zinc-200"
        aria-label="Масштаб"
      >
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-11 h-10 flex items-center justify-center text-black text-lg font-bold hover:bg-zinc-100 active:bg-zinc-200 transition-colors cursor-pointer"
          title="Увеличить (+)"
          aria-label="Увеличить"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
        <div className="w-7 h-[1px] bg-zinc-200" />
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-11 h-10 flex items-center justify-center text-black text-lg font-bold hover:bg-zinc-100 active:bg-zinc-200 transition-colors cursor-pointer"
          title="Уменьшить (−)"
          aria-label="Уменьшить"
        >
          <Minus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </aside>

      {/* ======================================================== */}
      {/* 3. VERTICAL FEED OF EXERCISE CARDS                       */}
      {/* Smooth scrollable vertical list matching the prompt      */}
      {/* ======================================================== */}
      <main className="relative z-20 flex-1 overflow-y-auto px-4 py-3 w-full max-w-md mx-auto scroll-smooth no-scrollbar">
        {exercises.length === 0 ? (
          <div className="bg-[#11171A] rounded-[32px] border border-[#202E34] p-8 text-center text-white w-full shadow-2xl space-y-4 my-8">
            <div className="w-14 h-14 rounded-2xl bg-[#172227] text-[#58C995] flex items-center justify-center mx-auto">
              <BookOpen className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white">В тренировке нет упражнений</h2>
            <p className="text-xs text-[#869194]">
              Добавьте упражнение из каталога, чтобы начать тренировку.
            </p>
            <button
              onClick={() => setShowAddExercisePicker(true)}
              className="w-full py-3 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-2xl shadow-lg cursor-pointer"
            >
              Выбрать из каталога
            </button>
          </div>
        ) : (
          <div
            className="w-full flex flex-col gap-4 pb-36 transition-transform duration-200"
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: 'top center',
            }}
          >
            {exercises.map((ex, exIdx) => {
              // Active set for this exercise: first uncompleted set or last set
              const activeSetIdx = ex.sets.findIndex((s) => !s.completed);
              const effectiveActiveSetIdx = activeSetIdx >= 0 ? activeSetIdx : ex.sets.length - 1;
              const currentActiveSet = ex.sets[effectiveActiveSetIdx];

              const currentWeight = currentActiveSet ? (currentActiveSet.weightKg ?? 0) : 0;
              const currentReps = currentActiveSet ? currentActiveSet.reps || 12 : 12;

              const completedCountInThisEx = ex.sets.filter((s) => s.completed).length;
              const totalSetsInThisEx = ex.sets.length;
              const percentDone =
                totalSetsInThisEx > 0 ? (completedCountInThisEx / totalSetsInThisEx) * 100 : 0;

              const radius = 40;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset =
                circumference - (circumference * Math.max(10, percentDone || 70)) / 100;

              const muscleKey = ex.targetMuscle as MuscleGroup;
              const muscleNameRu = MUSCLE_DEFINITIONS[muscleKey]?.nameRu || ex.targetMuscle || 'Мышцы';
              const diffInfo = getDifficultyInfo(ex);

              return (
                <div
                  key={ex.id || exIdx}
                  className="bg-[#11171A] rounded-[32px] p-4.5 sm:p-5 border border-[#202E34] shadow-xl text-white w-full space-y-3.5 relative overflow-hidden transition-all"
                >
                  {/* Top Header of Card: Exercise Number Badge, Name, Visualize button */}
                  <div className="flex items-center justify-between pb-1 border-b border-[#182327]">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#18242A] text-[#58C995] text-xs font-bold font-mono flex items-center justify-center">
                        {exIdx + 1}
                      </span>
                      <span className="text-[10.5px] font-bold text-[#869194] tracking-wider uppercase font-mono">
                        Упражнение {exIdx + 1} из {exercises.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVisualizeExercise(ex)}
                        className="px-2.5 py-1 rounded-full bg-[#182327] hover:bg-[#202E34] text-[#58C995] text-[11px] font-semibold flex items-center gap-1 border border-[#223137] cursor-pointer active:scale-95 transition-all"
                        title="Анатомический фокус"
                      >
                        <Eye className="w-3 h-3" />
                        <span>visualize</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteExercise(exIdx)}
                        className="p-1 text-[#869194] hover:text-[#E05353] rounded-lg hover:bg-[#182327] cursor-pointer transition-colors"
                        title="Удалить упражнение"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Main Card Body: Circular Gauge + Specs + Vertical Circles */}
                  <div className="flex items-center justify-between gap-3">
                    {/* Left Column: Circular working weight gauge */}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingTarget({ exIndex: exIdx, setIndex: effectiveActiveSetIdx })
                      }
                      className="bg-[#090E10] border border-[#1A2529] rounded-[24px] p-2.5 w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform"
                      title="Нажмите для настройки веса и повторений"
                    >
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background track */}
                        <circle
                          cx="50"
                          cy="50"
                          r={radius}
                          stroke="#162024"
                          strokeWidth="6.5"
                          fill="none"
                        />
                        {/* Progress Arc */}
                        <circle
                          cx="50"
                          cy="50"
                          r={radius}
                          stroke="#58C995"
                          strokeWidth="6.5"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="none"
                          className="transition-all duration-300 ease-out"
                        />
                      </svg>

                      {/* Center Weight & Unit */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono tabular-nums leading-none">
                          {currentWeight}
                        </span>
                        <span className="text-[10px] sm:text-[11px] text-[#869194] font-medium mt-1">
                          {ex.isBodyweight && currentWeight === 0 ? 'свой вес' : 'кг'}
                        </span>
                      </div>
                    </button>

                    {/* Middle Column: Title, Muscle Chip, Plan 4 x 12, Difficulty */}
                    <div className="flex-1 min-w-0 pr-1">
                      <h2 className="text-sm sm:text-base font-black text-[#E8E9E7] leading-snug line-clamp-2">
                        {ex.name}
                      </h2>

                      {/* Muscle Tag Chip */}
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#182327] text-[#A6B2B5] text-[11px] font-medium mt-1.5 max-w-full border border-[#223137]">
                        <Dumbbell className="w-3 h-3 shrink-0 text-[#58C995]" />
                        <span className="truncate">{muscleNameRu}</span>
                      </div>

                      {/* Plan: e.g. 4 x 12 */}
                      <div className="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono tabular-nums tracking-tight">
                        {ex.sets.length} x {currentReps}
                      </div>

                      {/* Difficulty Bars */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex items-end gap-0.5 h-3" aria-hidden="true">
                          <span
                            className={`w-1 h-1.5 rounded-full ${
                              diffInfo.greenBars >= 1 ? 'bg-[#58C995]' : 'bg-[#29363B]'
                            }`}
                          />
                          <span
                            className={`w-1 h-2.5 rounded-full ${
                              diffInfo.greenBars >= 2 ? 'bg-[#58C995]' : 'bg-[#29363B]'
                            }`}
                          />
                          <span
                            className={`w-1 h-3.5 rounded-full ${
                              diffInfo.greenBars >= 3 ? 'bg-[#58C995]' : 'bg-[#29363B]'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] text-[#869194] font-medium">
                          {diffInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Vertical Set Completion Circles */}
                    <div
                      className="flex flex-col items-center gap-2 shrink-0"
                      aria-label="Отметка подходов"
                    >
                      {ex.sets.map((st, sIdx) => {
                        const isCompleted =
                          st.completed === true ||
                          (st as any).done === true ||
                          (st as any).isDone === true;
                        const isActive = sIdx === effectiveActiveSetIdx;

                        return (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => handleToggleSetComplete(exIdx, sIdx)}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                              isCompleted
                                ? 'bg-[#58C995] text-[#080D0E] shadow-[0_0_12px_rgba(88,201,149,0.35)]'
                                : isActive
                                ? 'border-2 border-[#58C995] bg-[#162227] text-transparent'
                                : 'border-2 border-[#253338] bg-[#0E1518] text-transparent hover:border-[#58C995]'
                            }`}
                            title={`Подход ${st.setNumber}: ${st.weightKg ?? 0} кг × ${
                              st.reps || 12
                            }. Нажмите для отметки`}
                            aria-label={`Подход ${st.setNumber}`}
                          >
                            {isCompleted ? (
                              <Check className="w-4 h-4 sm:w-5 sm:h-5 stroke-[3]" />
                            ) : (
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isActive ? 'bg-[#58C995] animate-pulse' : 'bg-transparent'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Inline Quick Adjustment Bar (Weight +/- & Reps +/- & Add Set) */}
                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#182327]">
                    {/* Weight adjustments */}
                    <div className="flex items-center gap-1 bg-[#090E10] border border-[#1A2529] rounded-xl px-2 py-1 text-xs">
                      <span className="text-[10px] text-[#869194] mr-0.5">Вес:</span>
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(exIdx, effectiveActiveSetIdx, -2.5)}
                        className="w-6 h-6 rounded-lg bg-[#182327] hover:bg-[#202E34] text-[#E8E9E7] font-bold flex items-center justify-center cursor-pointer active:scale-90"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-white px-1 tabular-nums text-xs">
                        {currentWeight}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(exIdx, effectiveActiveSetIdx, 2.5)}
                        className="w-6 h-6 rounded-lg bg-[#182327] hover:bg-[#202E34] text-[#58C995] font-bold flex items-center justify-center cursor-pointer active:scale-90"
                      >
                        +
                      </button>
                    </div>

                    {/* Reps adjustments */}
                    <div className="flex items-center gap-1 bg-[#090E10] border border-[#1A2529] rounded-xl px-2 py-1 text-xs">
                      <span className="text-[10px] text-[#869194] mr-0.5">Повт:</span>
                      <button
                        type="button"
                        onClick={() => handleAdjustReps(exIdx, effectiveActiveSetIdx, -1)}
                        className="w-6 h-6 rounded-lg bg-[#182327] hover:bg-[#202E34] text-[#E8E9E7] font-bold flex items-center justify-center cursor-pointer active:scale-90"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-white px-1 tabular-nums text-xs">
                        {currentReps}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdjustReps(exIdx, effectiveActiveSetIdx, 1)}
                        className="w-6 h-6 rounded-lg bg-[#182327] hover:bg-[#202E34] text-[#58C995] font-bold flex items-center justify-center cursor-pointer active:scale-90"
                      >
                        +
                      </button>
                    </div>

                    {/* Add set button */}
                    <button
                      type="button"
                      onClick={() => handleAddSet(exIdx)}
                      className="px-2.5 py-1.5 bg-[#182327] hover:bg-[#202E34] text-[#58C995] text-[11px] font-bold rounded-xl flex items-center gap-1 border border-[#223137] cursor-pointer active:scale-90"
                      title="Добавить подход"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Сет</span>
                    </button>
                  </div>

                  {/* Secondary Capsule Bar matching screenshot: ⏱️ Отдых 90 сек  > */}
                  <div
                    onClick={() => handleStartRestTimer(ex.restSeconds || 90, ex.name)}
                    className="rounded-2xl bg-[#0C1014] border border-[#182027] hover:border-[#2D3945] py-3 px-4 flex items-center justify-between text-xs font-bold text-[#E8E9E7] shadow-inner cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2 text-xs text-[#8E9CA3]">
                      <Timer className="w-3.5 h-3.5 text-[#58C995]" />
                      <span className="font-bold text-[#E8E9E7]">
                        Отдых {ex.restSeconds || 90} сек
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#8E9CA3]" />
                  </div>
                </div>
              );
            })}

            {/* Bottom Actions inside Feed: Add Exercise + Big Finish Button */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddExercisePicker(true)}
                className="w-full py-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#202E34] hover:border-[#58C995] text-[#58C995] font-bold text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить упражнение из каталога</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFinishSummary(true)}
                className="w-full py-4 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2.5 shadow-[0_4px_24px_rgba(88,201,149,0.35)] cursor-pointer active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-5 h-5 fill-[#080D0E]" />
                <span>Завершить тренировку</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* 4. FLOATING REST TIMER DOCK (Always visible when active) */}
      {/* ======================================================== */}
      <AnimatePresence>
        {restSecondsRemaining !== null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-[74px] left-4 right-4 z-40 max-w-md mx-auto"
            style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 74px)' }}
          >
            <div className="bg-[#11171A]/95 backdrop-blur-md rounded-[24px] border border-[#202E34] px-4 py-3 flex items-center justify-between text-white shadow-2xl">
              <button
                type="button"
                onClick={() => setIsRestPaused(!isRestPaused)}
                className="flex items-center gap-3 text-left cursor-pointer flex-1 min-w-0"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#182327] text-[#58C995] flex items-center justify-center shrink-0">
                  <Timer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white tabular-nums font-mono">
                      Отдых {restSecondsRemaining} сек
                    </span>
                    {!isRestPaused && (
                      <span className="w-2 h-2 rounded-full bg-[#58C995] animate-ping" />
                    )}
                  </div>
                  <span className="text-[10.5px] text-[#869194] truncate block">
                    {activeRestExerciseName ? `${activeRestExerciseName} · ` : ''}
                    {isRestPaused ? 'Пауза' : 'Нажмите для паузы'}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRestSecondsRemaining((prev) => (prev || 0) + 15)}
                  className="px-2.5 py-1.5 bg-[#182327] hover:bg-[#202E34] text-[#58C995] font-bold text-xs rounded-xl cursor-pointer active:scale-90"
                  title="+15 секунд"
                >
                  +15с
                </button>

                <button
                  type="button"
                  onClick={() => setRestSecondsRemaining(null)}
                  className="px-2.5 py-1.5 bg-[#182327] hover:bg-[#202E34] text-[#869194] hover:text-white font-medium text-xs rounded-xl cursor-pointer active:scale-90"
                  title="Пропустить отдых"
                >
                  Стоп
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* 5. BOTTOM BAR: Voice Note & Catalog Quick Trigger        */}
      {/* ======================================================== */}
      <footer
        className="relative z-30 shrink-0 px-4 pb-3 pt-1 w-full max-w-md mx-auto bg-[#080C0E]/95 backdrop-blur-md border-t border-[#1A2529]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        <div className="bg-[#14181C] border border-[#222B35] rounded-full p-2 flex items-center justify-between shadow-2xl">
          {/* Left (+) Button: Open Exercise Library */}
          <button
            type="button"
            onClick={() => setShowAddExercisePicker(true)}
            className="w-10 h-10 rounded-full bg-[#1C232B] border border-[#27323D] shadow-sm flex items-center justify-center text-[#E8E9E7] hover:text-[#58C995] hover:border-[#58C995] active:scale-95 transition-all cursor-pointer"
            title="Добавить упражнение из каталога (+)"
            aria-label="Добавить упражнение"
          >
            <Plus className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Middle: "Зажмите и говорите" or current note */}
          <button
            type="button"
            onClick={() => setShowNotePrompt(true)}
            className="flex-1 px-4 text-left truncate cursor-pointer active:opacity-75 transition-opacity"
            title="Нажмите для ввода заметки"
          >
            <span className="text-xs sm:text-sm text-[#8E9CA3] font-medium truncate block">
              {isListeningVoice
                ? '🎙 Слушаю... говорите'
                : sessionNotes
                ? `Заметка: ${sessionNotes}`
                : 'Зажмите и говорите'}
            </span>
          </button>

          {/* Right Action: Voice Input Microphone & Waveform */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isListeningVoice
                  ? 'bg-[#E05353] text-white animate-pulse'
                  : 'bg-[#1C232B] text-[#E8E9E7] hover:bg-[#252F39] active:scale-95'
              }`}
              title="Голосовой ввод"
              aria-label="Микрофон"
            >
              {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <div className="w-10 h-10 rounded-full bg-black text-[#58C995] flex items-center justify-center shadow-inner">
              <span className="flex items-center gap-0.5 h-3.5" aria-hidden="true">
                <span className="w-0.5 h-2 bg-[#58C995] rounded-full" />
                <span className="w-0.5 h-3.5 bg-[#58C995] rounded-full" />
                <span className="w-0.5 h-1.5 bg-[#58C995] rounded-full" />
                <span className="w-0.5 h-3 bg-[#58C995] rounded-full" />
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ======================================================== */}
      {/* 6. VISUALIZE ANATOMICAL MODAL                             */}
      {/* ======================================================== */}
      <AnimatePresence>
        {visualizeExercise && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-[#11171A] border border-[#253338] rounded-[32px] p-6 text-white shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#1E282D]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#172227] text-[#58C995] flex items-center justify-center">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white truncate max-w-[200px]">
                      {visualizeExercise.name}
                    </h3>
                    <span className="text-xs text-[#58C995] font-semibold">
                      Анатомический фокус
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setVisualizeExercise(null)}
                  className="w-8 h-8 rounded-full bg-[#182327] text-[#869194] hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Target & Secondary Muscles */}
              <div className="bg-[#090E10] p-4 rounded-2xl border border-[#1A2529] space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#869194]">Основная нагрузка:</span>
                  <span className="font-extrabold text-[#58C995] text-sm">
                    {MUSCLE_DEFINITIONS[visualizeExercise.targetMuscle as MuscleGroup]?.nameRu ||
                      visualizeExercise.targetMuscle}
                  </span>
                </div>
                {visualizeExercise.secondaryMuscles && visualizeExercise.secondaryMuscles.length > 0 && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[#182327]">
                    <span className="text-[#869194]">Вспомогательные:</span>
                    <span className="font-semibold text-white/90 truncate max-w-[170px]">
                      {visualizeExercise.secondaryMuscles
                        .map((m) => MUSCLE_DEFINITIONS[m as MuscleGroup]?.nameRu || m)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Functional biomechanics */}
              {(() => {
                const def = MUSCLE_DEFINITIONS[visualizeExercise.targetMuscle as MuscleGroup];
                return (
                  <div className="space-y-2 text-xs">
                    {def?.functionRu && (
                      <div className="bg-[#090E10] p-3 rounded-2xl border border-[#1A2529]">
                        <span className="text-[#58C995] block text-[10px] uppercase font-bold mb-1">
                          Биомеханика и функция:
                        </span>
                        <p className="text-[#B2B8BA] leading-relaxed text-[11px]">{def.functionRu}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={() => setVisualizeExercise(null)}
                className="w-full py-3.5 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                Вернуться к тренировке
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* 7. WEIGHT & REPS ADJUST MODAL                             */}
      {/* ======================================================== */}
      <AnimatePresence>
        {editingTarget && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xs bg-[#11171A] border border-[#253338] rounded-[32px] p-6 text-white shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1E282D]">
                <div>
                  <h3 className="text-sm font-bold text-white">Вес и повторения</h3>
                  <span className="text-[11px] text-[#869194] truncate block max-w-[190px]">
                    {exercises[editingTarget.exIndex]?.name}
                  </span>
                </div>
                <button
                  onClick={() => setEditingTarget(null)}
                  className="w-8 h-8 rounded-full bg-[#182327] text-[#869194] hover:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Weight edit */}
              <div className="space-y-1.5">
                <label className="text-xs text-[#869194] font-medium">Рабочий вес (кг):</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleAdjustWeight(editingTarget.exIndex, editingTarget.setIndex, -2.5)
                    }
                    className="w-10 h-10 rounded-xl bg-[#182327] hover:bg-[#202E34] text-white font-bold text-sm cursor-pointer"
                  >
                    -2.5
                  </button>
                  <input
                    type="number"
                    step="0.5"
                    value={
                      exercises[editingTarget.exIndex]?.sets[editingTarget.setIndex]?.weightKg ?? 0
                    }
                    onChange={(e) =>
                      handleSetWeightValue(
                        editingTarget.exIndex,
                        editingTarget.setIndex,
                        e.target.value
                      )
                    }
                    className="flex-1 bg-[#090E10] border border-[#202E34] rounded-xl py-2 text-center text-xl font-bold font-mono text-white outline-none focus:border-[#58C995]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleAdjustWeight(editingTarget.exIndex, editingTarget.setIndex, 2.5)
                    }
                    className="w-10 h-10 rounded-xl bg-[#182327] hover:bg-[#202E34] text-[#58C995] font-bold text-sm cursor-pointer"
                  >
                    +2.5
                  </button>
                </div>
              </div>

              {/* Reps edit */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs text-[#869194] font-medium">Повторения в подходе:</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleAdjustReps(editingTarget.exIndex, editingTarget.setIndex, -1)
                    }
                    className="w-10 h-10 rounded-xl bg-[#182327] hover:bg-[#202E34] text-white font-bold text-sm cursor-pointer"
                  >
                    -1
                  </button>
                  <span className="flex-1 py-2 text-center text-xl font-bold font-mono text-white bg-[#090E10] border border-[#202E34] rounded-xl">
                    {exercises[editingTarget.exIndex]?.sets[editingTarget.setIndex]?.reps ?? 12}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleAdjustReps(editingTarget.exIndex, editingTarget.setIndex, 1)
                    }
                    className="w-10 h-10 rounded-xl bg-[#182327] hover:bg-[#202E34] text-[#58C995] font-bold text-sm cursor-pointer"
                  >
                    +1
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingTarget(null)}
                className="w-full py-3 bg-[#58C995] text-[#080D0E] font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg mt-2 cursor-pointer active:scale-95"
              >
                Сохранить
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* 8. FINISH WORKOUT SUMMARY MODAL                           */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showFinishSummary && (
          <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-[#11171A] border border-[#253338] rounded-[36px] p-6 space-y-4 text-white shadow-2xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1E282D]">
                <div>
                  <div className="flex items-center gap-1.5 text-[#58C995] text-xs font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Тренировка завершена</span>
                  </div>
                  <h3 className="text-base font-black text-white mt-0.5">{session.name}</h3>
                </div>
                <button
                  onClick={() => setShowFinishSummary(false)}
                  className="w-8 h-8 rounded-full bg-[#182327] text-[#869194] hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-2 text-center bg-[#090E10] p-3.5 rounded-2xl border border-[#1A2529]">
                <div>
                  <span className="text-[10px] text-[#869194] block">Время</span>
                  <span className="text-sm font-extrabold text-white tabular-nums font-mono">
                    {Math.max(1, Math.round(secondsElapsed / 60))} мин
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#869194] block">Подходов</span>
                  <span className="text-sm font-extrabold text-white tabular-nums font-mono">
                    {completedSetsCount} / {totalPossibleSets}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#869194] block">Тоннаж</span>
                  <span className="text-sm font-extrabold text-[#58C995] tabular-nums font-mono">
                    {calculateTotalVolume().toLocaleString('ru-RU')} кг
                  </span>
                </div>
              </div>

              {/* Detected PRs */}
              {(() => {
                const prs = detectPersonalRecords();
                if (prs.length === 0) return null;
                return (
                  <div className="p-3 bg-[#13281E] border border-[#254F3A] rounded-2xl text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-[#58C995] font-bold">
                      <Award className="w-4 h-4" />
                      <span>Новые личные рекорды!</span>
                    </div>
                    {prs.map((p, idx) => (
                      <div key={idx} className="text-white text-[11px]">
                        • {p.exerciseName}: <span className="font-bold text-[#58C995]">{p.weightKg} кг</span> × {p.reps}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Save Error Feedback inside Finish Modal */}
              {saveError && (
                <div className="p-3 bg-[#2B1414] border border-[#5C2626] rounded-2xl text-xs text-[#FCA5A5] leading-relaxed">
                  <strong className="block text-[#F87171] mb-0.5">Ошибка сохранения:</strong>
                  <span>{saveError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[#1E282D]">
                <button
                  type="button"
                  onClick={handleConfirmFinish}
                  className="w-full py-4 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl shadow-[0_4px_24px_rgba(88,201,149,0.35)] active:scale-95 transition-all cursor-pointer"
                >
                  Подтвердить и сохранить в историю
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveError(null);
                    setShowFinishSummary(false);
                  }}
                  className="w-full py-2.5 bg-[#182327] text-[#869194] hover:text-white font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Вернуться к тренировке
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* 9. ADD EXERCISE MODAL (FULL 181-CATALOG)                  */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showAddExercisePicker && (
          <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3">
            <div className="w-full max-w-lg bg-[#11171A] border border-[#253338] rounded-[32px] max-h-[88vh] flex flex-col overflow-y-auto p-4 shadow-2xl">
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
      </AnimatePresence>

      {/* Confirmation Modal: Delete Exercise */}
      <ConfirmModal
        isOpen={exerciseToDeleteIndex !== null}
        onClose={() => setExerciseToDeleteIndex(null)}
        onConfirm={() => {
          if (exerciseToDeleteIndex !== null) {
            setExercises((prev) => prev.filter((_, idx) => idx !== exerciseToDeleteIndex));
            vibrateDevice(40);
            setExerciseToDeleteIndex(null);
          }
        }}
        title="Удалить упражнение?"
        description={
          exerciseToDeleteIndex !== null && exercises[exerciseToDeleteIndex]
            ? `Упражнение «${exercises[exerciseToDeleteIndex].name}» будет удалено из текущей тренировки.`
            : 'Упражнение будет удалено из текущей тренировки.'
        }
        confirmText="Удалить упражнение"
        cancelText="Отмена"
        variant="danger"
      />

      {/* Confirmation Modal: Exit / Abort Workout */}
      <ConfirmModal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          onCancel();
        }}
        title="Прервать тренировку?"
        description="Текущий прогресс и выполненные подходы автоматически сохраняются в черновик. Вы сможете продолжить её в любое время."
        confirmText="Прервать тренировку"
        cancelText="Продолжить"
        variant="warning"
      />

      {/* Prompt Modal: Session Notes */}
      <PromptModal
        isOpen={showNotePrompt}
        onClose={() => setShowNotePrompt(false)}
        onSubmit={(val) => {
          setSessionNotes(val);
          setShowNotePrompt(false);
        }}
        title="Заметка к тренировке"
        description="Добавьте примечание о самочувствии, рабочем оборудовании или нюансах выполнения."
        initialValue={sessionNotes}
        placeholder="Например: жим шел уверенно, в 3 подходе добавил паузу внизу..."
        confirmText="Сохранить заметку"
        cancelText="Отмена"
      />
    </motion.div>
  );
};
