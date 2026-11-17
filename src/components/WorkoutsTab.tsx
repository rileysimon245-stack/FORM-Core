import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  WorkoutProgram,
  WorkoutSession,
  ProgramWorkoutDay,
  MuscleGroup,
  MUSCLE_DEFINITIONS,
  ProgramStatus,
} from '../types/workout';
import { StorageService } from '../services/storage';
import { isIsoDateInCurrentWeek } from '../training-core/dateUtils';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';
import { normalizeMuscleKeyPure } from '../training-core/muscles';
import {
  checkWorkoutLaunchSafety,
  confirmWellbeingPainArea,
  StalePainArea,
} from '../services/safetyContext';
import { WorkoutAnalyticsView } from './WorkoutAnalyticsView';

const LazyExerciseLibraryView = React.lazy(() =>
  import('./ExerciseLibraryView').then((m) => ({ default: m.ExerciseLibraryView }))
);
import { Modal, ConfirmModal } from './common/Modal';
import {
  Plus,
  Sparkles,
  Play,
  Calendar,
  Dumbbell,
  Trash2,
  Edit3,
  Copy,
  Clock,
  History,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Award,
  RotateCcw,
  X,
  Layers,
  Zap,
  Target,
  Sliders,
  Pause,
  Archive,
  Trophy,
  Check,
  AlertCircle,
  Compass,
  Flame,
  Activity,
  ChevronLeft,
  ArrowRightLeft,
  ShieldAlert,
} from 'lucide-react';
import {
  STRENGTH_PROGRAMS,
  MOBILITY_PROGRAMS,
  DIRECTIONS_CONFIG,
} from '../data/directionsCatalog';
import { motion, AnimatePresence } from 'motion/react';

interface WorkoutsTabProps {
  programs: WorkoutProgram[];
  sessions: WorkoutSession[];
  onStartProgramWorkout: (day: ProgramWorkoutDay, programName: string, programId: string) => void;
  onStartCustomQuickWorkout: () => void;
  onCreateProgram: () => void;
  onGenerateProgram: () => void;
  onEditProgram: (program: WorkoutProgram) => void;
  onDuplicateProgram: (programId: string) => void;
  onDeleteProgram: (programId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenEquipment?: () => void;
  onOpenParameters?: () => void;
  activeDraft?: WorkoutSession | null;
  onResumeDraft?: (draft: WorkoutSession) => void;
  onDiscardDraft?: () => void;
}

export const WorkoutsTab: React.FC<WorkoutsTabProps> = ({
  programs,
  sessions,
  onStartProgramWorkout,
  onStartCustomQuickWorkout,
  onCreateProgram,
  onGenerateProgram,
  onEditProgram,
  onDuplicateProgram,
  onDeleteProgram,
  onDeleteSession,
  onOpenEquipment,
  onOpenParameters,
  activeDraft,
  onResumeDraft,
  onDiscardDraft,
}) => {
  const hasActiveProgram = useMemo(
    () => programs.some((p) => (p.status || 'active') === 'active'),
    [programs]
  );

  const [activeSubTab, setActiveSubTab] = useState<'programs' | 'analytics' | 'history' | 'library'>('programs');
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    () => (programs.find((p) => (p.status || 'active') === 'active') || programs[0])?.id || ''
  );
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  // Direction View State:
  // 'my_programs': Active workout dashboard when user already has an active program
  // 'directions': Initial onboarding screen (2 direction cards) when no active program exists
  // 'direction_catalog': Catalog of the chosen direction with programs list
  const [workoutScreenView, setWorkoutScreenView] = useState<'directions' | 'direction_catalog' | 'my_programs'>(() =>
    programs.some((p) => (p.status || 'active') === 'active') ? 'my_programs' : 'directions'
  );
  const [currentDirection, setCurrentDirection] = useState<'programs' | 'mobility'>('programs');
  const [expandedCatalogProgramId, setExpandedCatalogProgramId] = useState<string | null>(null);
  const [expandedDirectionTags, setExpandedDirectionTags] = useState<{
    programs: boolean;
    mobility: boolean;
  }>({ programs: false, mobility: false });

  // Transition automatically to 'my_programs' only when active program state changes from false -> true
  const prevHasActiveProgramRef = useRef<boolean>(hasActiveProgram);
  useEffect(() => {
    if (!prevHasActiveProgramRef.current && hasActiveProgram) {
      const firstActive = programs.find((p) => (p.status || 'active') === 'active');
      if (firstActive) {
        setSelectedProgramId(firstActive.id);
      }
      setWorkoutScreenView('my_programs');
    }
    prevHasActiveProgramRef.current = hasActiveProgram;
  }, [hasActiveProgram, programs]);

  // Status Filter for "Мои программы"
  const [programFilter, setProgramFilter] = useState<'all' | 'active' | 'paused' | 'completed' | 'archived'>('all');

  // Program Management Modals State
  const [showManageModal, setShowManageModal] = useState<boolean>(false);
  const [showCompleteModal, setShowCompleteModal] = useState<boolean>(false);
  const [showChangeGoalModal, setShowChangeGoalModal] = useState<boolean>(false);
  const [showReplaceModal, setShowReplaceModal] = useState<boolean>(false);

  // Form states for modals
  const [completionNote, setCompletionNote] = useState<string>('');
  const [newGoalInput, setNewGoalInput] = useState<string>('');
  const [replacementTargetId, setReplacementTargetId] = useState<string>('');

  // Transition / Preview state for launching workout
  const [previewWorkoutData, setPreviewWorkoutData] = useState<{
    day: ProgramWorkoutDay;
    programName: string;
    programId: string;
  } | null>(null);
  const [wellbeingVersion, setWellbeingVersion] = useState<number>(0);

  // Confirmation Modals State
  const [deleteProgramConfirm, setDeleteProgramConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<string | null>(null);
  const [showDiscardDraftConfirm, setShowDiscardDraftConfirm] = useState<boolean>(false);

  // Counts for filters
  const statusCounts = useMemo(() => {
    const counts = { all: programs.length, active: 0, paused: 0, completed: 0, archived: 0 };
    programs.forEach((p) => {
      const st = p.status || 'active';
      if (st in counts) {
        counts[st as keyof typeof counts]++;
      }
    });
    return counts;
  }, [programs]);

  // Filtered programs list
  const filteredPrograms = useMemo(() => {
    if (programFilter === 'all') return programs;
    return programs.filter((p) => (p.status || 'active') === programFilter);
  }, [programs, programFilter]);

  // Selected program strictly from filteredPrograms (null when filteredPrograms is empty)
  const selectedProgram = useMemo(() => {
    if (filteredPrograms.length === 0) return null;
    const foundInFiltered = filteredPrograms.find((p) => p.id === selectedProgramId);
    if (foundInFiltered) return foundInFiltered;
    return filteredPrograms[0];
  }, [filteredPrograms, selectedProgramId]);

  // Selected program calculated stats
  const selectedProgramStats = useMemo(() => {
    if (!selectedProgram) return null;
    return StorageService.calculateProgramStats(selectedProgram.id);
  }, [selectedProgram, sessions]);

  // Real completed sessions stats
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'completed'),
    [sessions]
  );
  const totalCompletedCount = completedSessions.length;
  const currentWeightKg = StorageService.getProfile().weightKg;
  const totalVolumeKg = useMemo(
    () => completedSessions.reduce((acc, s) => acc + StorageService.getSessionVolumeKg(s, currentWeightKg), 0),
    [completedSessions, currentWeightKg]
  );
  const totalTonnageDisplay =
    totalVolumeKg >= 1000 ? `${(totalVolumeKg / 1000).toFixed(1)} т` : `${totalVolumeKg} кг`;

  // Workouts this week (timezone-safe local ISO week Mon-Sun)
  const workoutsThisWeekCount = useMemo(() => {
    const now = new Date();
    return completedSessions.filter((s) => isIsoDateInCurrentWeek(s.date, now)).length;
  }, [completedSessions]);

  // First truly active program for hero next workout card
  const activeProgram = useMemo(() => {
    return programs.find((p) => (p.status || 'active') === 'active') || null;
  }, [programs]);

  const nextWorkoutDay =
    activeProgram && activeProgram.workouts.length > 0 ? activeProgram.workouts[0] : null;

  // Helper to open transition preview modal
  const handleOpenPreview = (day: ProgramWorkoutDay, programName: string, programId: string) => {
    setPreviewWorkoutData({ day, programName, programId });
  };

  // Helper to start from preview
  const handleConfirmStart = () => {
    if (previewWorkoutData) {
      onStartProgramWorkout(
        previewWorkoutData.day,
        previewWorkoutData.programName,
        previewWorkoutData.programId
      );
      setPreviewWorkoutData(null);
    }
  };

  // Helper to select and activate catalog program
  const handleSelectCatalogProgram = (catalogProg: WorkoutProgram, startImmediately = false) => {
    const added = StorageService.addProgramFromCatalog(catalogProg);
    setSelectedProgramId(added.id);
    if (startImmediately && added.workouts && added.workouts.length > 0) {
      const firstDay = added.workouts[0];
      handleOpenPreview(firstDay, added.name, added.id);
    } else {
      setWorkoutScreenView('my_programs');
    }
  };

  // Status Badge Renderer Helper
  const renderStatusBadge = (status?: string) => {
    const st = status || 'active';
    switch (st) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#132A20] text-[#58C995] border border-[#234F3A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#58C995] animate-pulse" />
            <span>Активная</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#2B2312] text-[#E5A83B] border border-[#4D3A1B]">
            <Pause className="w-2.5 h-2.5" />
            <span>На паузе</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#132338] text-[#5EA2EF] border border-[#213C5E]">
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>Завершена</span>
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1A1F24] text-[#869194] border border-[#2B343B]">
            <Archive className="w-2.5 h-2.5" />
            <span>В архиве</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full flex flex-col pb-6 space-y-4 font-sans select-none">
      {/* 1. Header & Title with Quick Start button */}
      <div className="flex items-center justify-between pt-1 px-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#58C995] animate-pulse" />
            <span className="text-[10px] font-bold tracking-widest text-[#58C995] uppercase">
              FORM Training
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[#E8E9E7]">Тренировки</h1>
        </div>

        <button
          type="button"
          onClick={onStartCustomQuickWorkout}
          className="px-3.5 py-2.5 bg-[#12241C] border border-[#234736] text-[#58C995] hover:bg-[#183226] active:scale-95 rounded-2xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
        >
          <Zap className="w-3.5 h-3.5 fill-[#58C995]" />
          <span>Быстрый старт</span>
        </button>
      </div>

      {/* 2. Active Draft Alert Banner if unfinished workout exists */}
      {activeDraft && onResumeDraft && (
        <div className="bg-[#12241C] border border-[#27533E] rounded-3xl p-4 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#1D3D2F] text-[#58C995] flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 fill-[#58C995]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-[#58C995] uppercase tracking-wider block">
                Незавершённая тренировка
              </span>
              <p className="text-xs font-bold text-[#E8E9E7] truncate">{activeDraft.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDiscardDraft && (
              <button
                type="button"
                onClick={() => setShowDiscardDraftConfirm(true)}
                className="px-2.5 py-2 text-xs font-medium text-[#869194] hover:text-[#E05353] rounded-xl hover:bg-[#1A2529] cursor-pointer"
              >
                Сбросить
              </button>
            )}
            <button
              type="button"
              onClick={() => onResumeDraft(activeDraft)}
              className="px-4 py-2 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl shadow-md hover:bg-[#68d7a4] active:scale-95 transition-transform cursor-pointer"
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {/* 2. Sub-navigation tabs: Programs, Analytics, History, Catalog */}
      <div className="w-full flex items-center justify-between p-1.5 bg-[#0D1914] rounded-full border border-[#1F3A30] shadow-sm">
        <button
          type="button"
          onClick={() => {
            if (activeSubTab === 'programs' && workoutScreenView === 'direction_catalog') {
              setWorkoutScreenView(hasActiveProgram ? 'my_programs' : 'directions');
            } else {
              setActiveSubTab('programs');
            }
          }}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-full text-center truncate cursor-pointer transition-all ${
            activeSubTab === 'programs'
              ? 'bg-[#56CC97] text-[#08100D] font-black shadow-sm'
              : 'text-[#6F8A7F] hover:text-[#F2F5F3]'
          }`}
        >
          Программы
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('analytics')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-full text-center truncate cursor-pointer transition-all ${
            activeSubTab === 'analytics'
              ? 'bg-[#56CC97] text-[#08100D] font-black shadow-sm'
              : 'text-[#6F8A7F] hover:text-[#F2F5F3]'
          }`}
        >
          Аналитика
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-full text-center truncate cursor-pointer transition-all ${
            activeSubTab === 'history'
              ? 'bg-[#56CC97] text-[#08100D] font-black shadow-sm'
              : 'text-[#6F8A7F] hover:text-[#F2F5F3]'
          }`}
        >
          История ({sessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('library')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-full text-center truncate cursor-pointer transition-all ${
            activeSubTab === 'library'
              ? 'bg-[#56CC97] text-[#08100D] font-black shadow-sm'
              : 'text-[#6F8A7F] hover:text-[#F2F5F3]'
          }`}
        >
          Каталог
        </button>
      </div>

      {/* SUB-TAB 1: PROGRAMS & MAIN WORKOUT DASHBOARD */}
      {activeSubTab === 'programs' && (
        <div className="space-y-4">
          {/* ========================================================= */}
          {/* VIEW 1: СТАРТОВЫЙ ЭКРАН ВЫБОРА НАПРАВЛЕНИЯ (2 КАРТОЧКИ)   */}
          {/* ========================================================= */}
          {workoutScreenView === 'directions' && (
            <div className="space-y-4">
              {/* Optional Active Program Jump Banner */}
              {activeProgram && (
                <div className="rounded-2xl bg-[#0C1014] border border-[#182027] p-3.5 flex items-center justify-between gap-3 shadow-md hover:border-[#24332D] transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#132A20] border border-[#234F3A] flex items-center justify-center shrink-0 text-[#58C995]">
                      <Play className="w-4 h-4 fill-[#58C995]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#58C995] uppercase tracking-wider">Текущая программа</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#58C995] animate-pulse" />
                      </div>
                      <p className="text-xs font-bold text-[#E8E9E7] truncate">{activeProgram.name}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWorkoutScreenView('my_programs')}
                    className="px-3.5 py-1.5 bg-[#1C232B] hover:bg-[#252F3A] text-xs font-bold text-[#58C995] rounded-full flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all border border-[#27323D]"
                  >
                    <span>К тренировке</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Direction Selection Header */}
              <div className="space-y-1 px-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C232B] border border-[#27323D] text-[11px] font-bold uppercase tracking-wider text-[#58C995]">
                  <Sparkles className="w-3 h-3 text-[#58C995]" />
                  Выбор вектора
                </span>
                <h2 className="text-xl font-black text-white tracking-tight">
                  Два вектора подготовки
                </h2>
                <p className="text-xs text-[#8E9CA3]">
                  Базовые программы силы и выносливости или комплексы коррекции и подвижности суставов.
                </p>
              </div>

              {/* КАРТОЧКА №1: ПРОГРАММЫ (Matches reference screenshot 100%) */}
              <div
                onClick={() => {
                  setCurrentDirection('programs');
                  setWorkoutScreenView('direction_catalog');
                }}
                className="group relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[rgba(86,204,151,0.18)] hover:border-[#56CC97]/40 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-[0_0_40px_rgba(86,204,151,0.08)] before:absolute before:top-0 before:left-0 before:w-48 before:h-48 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.14),transparent_70%)] before:pointer-events-none transition-all cursor-pointer space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-[20px] bg-[#10221A] border border-[#56CC97]/30 text-[#56CC97] shadow-[0_0_20px_rgba(86,204,151,0.15)] flex items-center justify-center shrink-0">
                      <Flame className="w-6 h-6 text-[#56CC97]" />
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase tracking-[0.1em] text-xs font-bold text-[#6F8A7F] block">
                        НАПРАВЛЕНИЕ 1
                      </span>
                      <h3 className="uppercase font-black text-[#F2F5F3] text-2xl sm:text-3xl leading-none tracking-tight mt-0.5">
                        ПРОГРАММЫ
                      </h3>
                    </div>
                  </div>

                  <span className="inline-flex items-center px-3.5 py-1.5 bg-[#10251C] border border-[#56CC97]/30 rounded-full text-xs font-bold text-[#56CC97] shadow-xs shrink-0">
                    8 программ
                  </span>
                </div>

                <p className="text-sm sm:text-base text-[#C9D3CE] leading-relaxed font-normal">
                  развивай силу, выносливость и физические показатели.
                </p>

                <div className="space-y-2">
                  <span className="uppercase tracking-[0.1em] text-xs font-bold text-[#6F8A7F] block">
                    ВКЛЮЧАЕТ 8 ПРОГРАММ:
                  </span>
                  {(() => {
                    const strengthTags = [
                      'Подтягивания',
                      'Отжимания',
                      'Приседания',
                      'Сила верхней части тела',
                      'Сила ног',
                      'Сильный корпус',
                      'Выносливость',
                      'Общая физическая подготовка',
                    ];
                    const isExpanded = expandedDirectionTags.programs;
                    const visibleTags = isExpanded ? strengthTags : strengthTags.slice(0, 3);
                    const hiddenCount = strengthTags.length - visibleTags.length;

                    return (
                      <div className="flex flex-wrap gap-2">
                        {visibleTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-3.5 py-1.5 bg-[#12251E] border border-[#1F3A30] rounded-full text-xs sm:text-sm font-medium text-[#E2ECE7] whitespace-nowrap"
                          >
                            {tag}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDirectionTags((prev) => ({
                              ...prev,
                              programs: !prev.programs,
                            }));
                          }}
                          className="inline-flex items-center px-3.5 py-1.5 bg-[#162D24] hover:bg-[#1C382D] border border-[#2B5242] rounded-full text-xs font-bold text-[#56CC97] whitespace-nowrap cursor-pointer transition-colors"
                        >
                          {isExpanded ? 'Скрыть' : `Показать ещё (+${hiddenCount})`}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                <button
                  type="button"
                  className="w-full h-14 sm:h-[58px] rounded-full bg-[#56CC97] hover:bg-[#62d6a1] text-[#08100D] font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_4px_24px_rgba(86,204,151,0.25)] active:scale-[0.98] active:brightness-95 transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                >
                  <span>ВЫБРАТЬ НАПРАВЛЕНИЕ</span>
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>

              {/* КАРТОЧКА №2: КОРРЕКЦИЯ И МОБИЛЬНОСТЬ */}
              <div
                onClick={() => {
                  setCurrentDirection('mobility');
                  setWorkoutScreenView('direction_catalog');
                }}
                className="group relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[rgba(86,204,151,0.18)] hover:border-[#56CC97]/40 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-[0_0_40px_rgba(86,204,151,0.08)] before:absolute before:top-0 before:left-0 before:w-48 before:h-48 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.14),transparent_70%)] before:pointer-events-none transition-all cursor-pointer space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-[20px] bg-[#10221A] border border-[#56CC97]/30 text-[#56CC97] shadow-[0_0_20px_rgba(86,204,151,0.15)] flex items-center justify-center shrink-0">
                      <Activity className="w-6 h-6 text-[#56CC97]" />
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase tracking-[0.1em] text-xs font-bold text-[#6F8A7F] block">
                        НАПРАВЛЕНИЕ 2
                      </span>
                      <h3 className="uppercase font-black text-[#F2F5F3] text-2xl sm:text-3xl leading-none tracking-tight mt-0.5">
                        КОРРЕКЦИЯ И МОБИЛЬНОСТЬ
                      </h3>
                    </div>
                  </div>

                  <span className="inline-flex items-center px-3.5 py-1.5 bg-[#10251C] border border-[#56CC97]/30 rounded-full text-xs font-bold text-[#56CC97] shadow-xs shrink-0">
                    7 комплексов
                  </span>
                </div>

                <p className="text-sm sm:text-base text-[#C9D3CE] leading-relaxed font-normal">
                  развивай подвижность суставов, контроль движений и устойчивость тела.
                </p>

                <div className="space-y-2">
                  <span className="uppercase tracking-[0.1em] text-xs font-bold text-[#6F8A7F] block">
                    ВКЛЮЧАЕТ 7 КОМПЛЕКСОВ:
                  </span>
                  {(() => {
                    const mobilityTags = [
                      'Контроль положения лопаток',
                      'Мобильность плеч',
                      'Подвижность грудного отдела',
                      'Контроль положения таза',
                      'Мобильность тазобедренных суставов',
                      'Мобильность голеностопа',
                      'Общая мобильность',
                    ];
                    const isExpanded = expandedDirectionTags.mobility;
                    const visibleTags = isExpanded ? mobilityTags : mobilityTags.slice(0, 3);
                    const hiddenCount = mobilityTags.length - visibleTags.length;

                    return (
                      <div className="flex flex-wrap gap-2">
                        {visibleTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-3.5 py-1.5 bg-[#12251E] border border-[#1F3A30] rounded-full text-xs sm:text-sm font-medium text-[#E2ECE7] whitespace-nowrap"
                          >
                            {tag}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDirectionTags((prev) => ({
                              ...prev,
                              mobility: !prev.mobility,
                            }));
                          }}
                          className="inline-flex items-center px-3.5 py-1.5 bg-[#162D24] hover:bg-[#1C382D] border border-[#2B5242] rounded-full text-xs font-bold text-[#56CC97] whitespace-nowrap cursor-pointer transition-colors"
                        >
                          {isExpanded ? 'Скрыть' : `Показать ещё (+${hiddenCount})`}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                <button
                  type="button"
                  className="w-full h-14 sm:h-[58px] rounded-full bg-[#56CC97] hover:bg-[#62d6a1] text-[#08100D] font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_4px_24px_rgba(86,204,151,0.25)] active:scale-[0.98] active:brightness-95 transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                >
                  <span>ВЫБРАТЬ НАПРАВЛЕНИЕ</span>
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>

              {/* Single secondary button for non-active saved programs when no active banner is shown */}
              {!activeProgram && programs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWorkoutScreenView('my_programs')}
                  className="w-full py-3.5 px-4 bg-[#13171B] hover:bg-[#1C232B] border border-[#1F2730] rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-[#E8E9E7] cursor-pointer active:scale-95 transition-all"
                >
                  <BookOpen className="w-4 h-4 text-[#58C995]" />
                  <span>Мои программы ({programs.length})</span>
                </button>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 2: КАТАЛОГ ВЫБРАННОГО НАПРАВЛЕНИЯ                     */}
          {/* ========================================================= */}
          {workoutScreenView === 'direction_catalog' && (
            <div className="space-y-4">
              {/* Top Navigation Strip */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setWorkoutScreenView('directions')}
                  className="px-3 py-2 bg-[#11171A] hover:bg-[#162024] border border-[#1E282B] hover:border-[#2D453C] text-xs font-bold text-[#E8E9E7] rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 text-[#58C995]" />
                  <span>← К выбору направлений</span>
                </button>

                {/* Direction Switcher Pill */}
                <div className="flex bg-[#0C1215] border border-[#1E282B] rounded-xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentDirection('programs')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      currentDirection === 'programs'
                        ? 'bg-[#182C23] text-[#58C995] border border-[#376953]'
                        : 'text-[#869194] hover:text-[#E8E9E7]'
                    }`}
                  >
                    Программы (8)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDirection('mobility')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      currentDirection === 'mobility'
                        ? 'bg-[#162635] text-[#5EA2EF] border border-[#2B4B69]'
                        : 'text-[#869194] hover:text-[#E8E9E7]'
                    }`}
                  >
                    Мобильность (7)
                  </button>
                </div>
              </div>

              {/* Direction Info Banner */}
              <div
                className={`rounded-[24px] p-4.5 border ${
                  currentDirection === 'programs'
                    ? 'bg-gradient-to-r from-[#12211A] to-[#0E1714] border-[#223F30]'
                    : 'bg-gradient-to-r from-[#101F2C] to-[#0D161E] border-[#1F3952]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      currentDirection === 'programs'
                        ? 'bg-[#183628] text-[#58C995]'
                        : 'bg-[#162C42] text-[#5EA2EF]'
                    }`}
                  >
                    {currentDirection === 'programs' ? '8 программ силы и ОФП' : '7 комплексов подвижности'}
                  </span>
                </div>
                <h3 className="text-xl font-black text-[#E8E9E7] mt-1.5">
                  {currentDirection === 'programs' ? 'ПРОГРАММЫ' : 'КОРРЕКЦИЯ И МОБИЛЬНОСТЬ'}
                </h3>
                <p className="text-xs text-[#A6B2B0] mt-1">
                  {currentDirection === 'programs'
                    ? 'развивай силу, выносливость и физические показатели.'
                    : 'развивай подвижность суставов, контроль движений и устойчивость.'}
                </p>
              </div>

              {/* Program List for Current Direction */}
              <div className="space-y-3.5">
                {(currentDirection === 'programs' ? STRENGTH_PROGRAMS : MOBILITY_PROGRAMS).map((prog) => {
                  const isExpanded = expandedCatalogProgramId === prog.id;
                  const isAlreadyAdded = programs.some(
                    (p) => p.name.trim().toLowerCase() === prog.name.trim().toLowerCase()
                  );
                  const firstWorkout = prog.workouts[0];

                  return (
                    <div
                      key={prog.id}
                      className="rounded-[32px] bg-[#13171B] border border-[#1F2730] hover:border-[#2D3945] p-5 space-y-3.5 transition-all shadow-xl"
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Hallmark Left Inset Squircle */}
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[22px] bg-[#0C1014] border border-[#182027] shrink-0 flex flex-col items-center justify-center p-2 text-center">
                          <span className="font-mono tabular-nums font-black text-white text-lg">
                            {prog.daysPerWeek}
                          </span>
                          <span className="text-[9px] font-bold text-[#8E9CA3] uppercase tracking-wider">
                            {prog.daysPerWeek === 1 ? 'день' : prog.daysPerWeek < 5 ? 'дня' : 'дней'}/нед
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1C232B] border border-[#27323D] text-[10px] font-bold text-[#58C995] uppercase tracking-wider">
                              🎯 {prog.goal}
                            </span>
                            {isAlreadyAdded && (
                              <span className="text-[10px] font-bold text-[#58C995] bg-[#132A20] border border-[#234F3A] px-2.5 py-0.5 rounded-full">
                                ✓ В моих
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-black text-white tracking-tight">{prog.name}</h4>
                          <p className="text-xs text-[#8E9CA3] line-clamp-2 leading-relaxed">{prog.description}</p>
                        </div>
                      </div>

                      {/* Secondary Capsule Bar */}
                      <div className="rounded-2xl bg-[#0C1014] border border-[#182027] py-2.5 px-4 flex items-center justify-between text-xs font-semibold text-[#8E9CA3]">
                        <div className="flex items-center gap-3">
                          <span>⏱️ ~{firstWorkout?.estimatedDuration || 35} мин</span>
                          <span>•</span>
                          <span>{prog.workouts.length} {prog.workouts.length === 1 ? 'день' : 'дня'}</span>
                        </div>
                        <span className="text-[#58C995] font-bold">{prog.workouts.reduce((acc, w) => acc + w.exercises.length, 0)} упр.</span>
                      </div>

                      {/* Expanded exercises preview */}
                      {isExpanded && firstWorkout && (
                        <div className="space-y-2 pt-1 border-t border-[#182027] text-xs">
                          <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">
                            Упражнения: {firstWorkout.dayName} ({firstWorkout.exercises.length})
                          </span>
                          <div className="space-y-1.5">
                            {firstWorkout.exercises.map((ex, exIdx) => (
                              <div
                                key={exIdx}
                                className="p-2.5 rounded-xl bg-[#0C1014] border border-[#182027] flex items-center justify-between text-[#E8E9E7]"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="font-bold text-white block truncate">{ex.name}</span>
                                  {ex.technique && (
                                    <span className="text-[10px] text-[#8E9CA3] block line-clamp-1">{ex.technique}</span>
                                  )}
                                </div>
                                <span className="text-xs font-mono font-bold text-[#58C995] tabular-nums shrink-0">
                                  {ex.sets} × {ex.reps}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCatalogProgramId(isExpanded ? null : prog.id)
                            }
                            className="py-2.5 px-3 bg-[#1C232B] hover:bg-[#252F3A] border border-[#27323D] text-xs font-bold text-[#E8E9E7] rounded-full flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                          >
                            <span>{isExpanded ? 'Скрыть' : 'Состав'}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectCatalogProgram(prog, false)}
                            className="py-2.5 px-3 bg-[#132A20] hover:bg-[#1A382B] border border-[#234F3A] text-xs font-bold text-[#58C995] rounded-full flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>В мои программы</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectCatalogProgram(prog, true)}
                          className="w-full py-3 bg-[#58C995] hover:bg-[#68d7a4] text-[#0A0D0F] font-black text-xs uppercase tracking-wider rounded-full flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(88,201,149,0.3)] cursor-pointer active:scale-95 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-[#0A0D0F]" />
                          <span>Выбрать и начать тренировку</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 3: ЭКРАН ТРЕНИРОВОК ("МОИ ПРОГРАММЫ")                */}
          {/* ========================================================= */}
          {workoutScreenView === 'my_programs' && (
            <div className="space-y-4">
              {/* Prominent Direction Switcher Bar */}
              <div className="rounded-2xl bg-[#0C1014] border border-[#182027] p-3 flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#132A20] border border-[#234F3A] flex items-center justify-center text-[#58C995] shrink-0">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">
                      Направление
                    </span>
                    <span className="text-xs font-bold text-white truncate block">
                      {(selectedProgram || activeProgram)?.direction === 'mobility'
                        ? 'Коррекция и мобильность'
                        : 'Программы (Сила и ОФП)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedProgram?.direction) {
                        setCurrentDirection(selectedProgram.direction);
                      }
                      setWorkoutScreenView('direction_catalog');
                    }}
                    className="px-3 py-1.5 bg-[#1C232B] hover:bg-[#252F3A] border border-[#27323D] text-[11px] font-bold text-[#E8E9E7] rounded-full cursor-pointer active:scale-95 transition-all"
                  >
                    Каталог
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkoutScreenView('directions')}
                    className="px-3 py-1.5 bg-[#132A20] hover:bg-[#1A382B] border border-[#234F3A] hover:border-[#58C995] text-[11px] font-bold text-[#58C995] rounded-full flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-[#58C995]" />
                    <span>Сменить</span>
                  </button>
                </div>
              </div>

              {/* Quick Metrics Strip */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-[24px] bg-[#13171B] border border-[#1F2730] p-3.5 text-center shadow-md">
                  <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">Сессий</span>
                  <span className="text-lg font-mono font-black text-white tabular-nums mt-0.5 block">
                    {totalCompletedCount}
                  </span>
                </div>
                <div className="rounded-[24px] bg-[#13171B] border border-[#1F2730] p-3.5 text-center shadow-md">
                  <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">За неделю</span>
                  <span className="text-lg font-mono font-black text-[#58C995] tabular-nums mt-0.5 block">
                    {workoutsThisWeekCount}
                  </span>
                </div>
                <div className="rounded-[24px] bg-[#13171B] border border-[#1F2730] p-3.5 text-center shadow-md">
                  <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">Тоннаж</span>
                  <span className="text-lg font-mono font-black text-[#58C995] tabular-nums mt-0.5 block truncate">
                    {totalTonnageDisplay}
                  </span>
                </div>
              </div>

          {/* 1. Hero Next Workout Card */}
          <div className="rounded-[32px] bg-[#13171B] border border-[#1F2730] p-5 sm:p-6 space-y-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C232B] border border-[#27323D] text-[10px] font-bold text-[#58C995] uppercase tracking-wider">
                  <Play className="w-3 h-3 fill-[#58C995]" />
                  Следующая тренировка
                </span>
                {activeProgram && renderStatusBadge(activeProgram.status)}
              </div>
              {/* Signal Bars */}
              <div className="flex items-end gap-1 shrink-0" title="Интенсивность: Высокая">
                <span className="w-1 h-2 rounded-full bg-[#58C995]" />
                <span className="w-1 h-3 rounded-full bg-[#58C995]" />
                <span className="w-1 h-4 rounded-full bg-[#58C995]" />
              </div>
            </div>

            {nextWorkoutDay && activeProgram ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  {/* Hallmark Left Inset Squircle with SVG Gauge */}
                  <div className="w-24 h-24 rounded-[24px] bg-[#0C1014] border border-[#182027] shrink-0 flex flex-col items-center justify-center p-2 relative">
                    <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#1A222A]"
                        strokeWidth="3"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[#58C995]"
                        strokeDasharray="75, 100"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="font-mono tabular-nums font-black text-white text-base">
                        {nextWorkoutDay.estimatedDuration || 55}
                      </span>
                      <span className="text-[9px] font-bold text-[#8E9CA3] uppercase tracking-wider">мин</span>
                    </div>
                  </div>

                  {/* Title and Program */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="text-xs font-semibold text-[#8E9CA3] block truncate">
                      {activeProgram.name}
                    </span>
                    <h3 className="text-xl font-black text-white tracking-tight leading-tight">
                      {nextWorkoutDay.dayName}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[#8E9CA3] pt-1 flex-wrap">
                      <span className="font-mono tabular-nums text-white font-bold">
                        {nextWorkoutDay.exercises?.length || 0} упр.
                      </span>
                      <span>•</span>
                      <span className="font-mono tabular-nums text-white font-bold">
                        {nextWorkoutDay.exercises?.reduce((acc, ex) => acc + (ex.sets || 4), 0)} сетов
                      </span>
                    </div>
                  </div>
                </div>

                {/* Exercise Pills Preview */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {nextWorkoutDay.exercises?.slice(0, 3).map((ex, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] font-semibold bg-[#0C1014] text-[#E8E9E7] px-3 py-1 rounded-full border border-[#182027]"
                    >
                      {ex.name}
                    </span>
                  ))}
                  {(nextWorkoutDay.exercises?.length || 0) > 3 && (
                    <span className="text-[11px] font-semibold bg-[#0C1014] text-[#8E9CA3] px-2.5 py-1 rounded-full border border-[#182027]">
                      +{(nextWorkoutDay.exercises?.length || 0) - 3} ещё
                    </span>
                  )}
                </div>

                {/* Secondary Capsule Bar */}
                <div className="rounded-2xl bg-[#0C1014] border border-[#182027] py-3 px-4 flex items-center justify-between text-xs font-bold text-[#E8E9E7]">
                  <div className="flex items-center gap-2 text-[#8E9CA3]">
                    <Clock className="w-3.5 h-3.5 text-[#58C995]" />
                    <span>Отдых между сетами: ~90 сек</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8E9CA3]" />
                </div>

                {/* Primary CTA */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(nextWorkoutDay, activeProgram.name, activeProgram.id)}
                    className="w-full py-3.5 bg-[#58C995] hover:bg-[#68d7a4] text-[#0A0D0F] font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(88,201,149,0.35)] cursor-pointer transition-all active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-[#0A0D0F]" />
                    <span>Начать тренировку</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-[#8E9CA3]">
                  У вас пока нет активных тренировок. Создайте свою программу или начните свободную тренировку.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onCreateProgram}
                    className="px-4 py-2.5 bg-[#1C232B] border border-[#27323D] text-xs font-bold text-white rounded-full cursor-pointer active:scale-95"
                  >
                    Создать программу
                  </button>
                  <button
                    type="button"
                    onClick={onStartCustomQuickWorkout}
                    className="px-4 py-2.5 bg-[#58C995] text-xs font-bold text-[#0A0D0F] rounded-full cursor-pointer active:scale-95"
                  >
                    Быстрый старт
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions Bar */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onCreateProgram}
              className="py-3 px-3.5 bg-[#11171A] hover:bg-[#151F23] border border-[#1E282B] hover:border-[#2D453C] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#E8E9E7] cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              <div className="w-7 h-7 rounded-xl bg-[#172227] text-[#58C995] flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span>Создать программу</span>
            </button>

            <button
              type="button"
              onClick={onGenerateProgram}
              className="py-3 px-3.5 bg-[#12231B] hover:bg-[#162D23] border border-[#234535] hover:border-[#58C995] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#58C995] cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              <div className="w-7 h-7 rounded-xl bg-[#1A382C] text-[#58C995] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span>AI Генератор</span>
            </button>
          </div>

          {/* Program Selector & Workout Days */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#7E8B8E] uppercase tracking-wider">
                Мои программы ({programs.length})
              </span>
              {(onOpenEquipment || onOpenParameters) && (
                <div className="flex items-center gap-2">
                  {onOpenParameters && (
                    <button
                      type="button"
                      onClick={onOpenParameters}
                      className="text-[11px] font-semibold text-[#869194] hover:text-[#58C995] cursor-pointer"
                    >
                      Параметры
                    </button>
                  )}
                  {onOpenEquipment && (
                    <button
                      type="button"
                      onClick={onOpenEquipment}
                      className="text-[11px] font-semibold text-[#869194] hover:text-[#58C995] cursor-pointer"
                    >
                      Инвентарь
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Program Status Filter Pills */}
            {programs.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {[
                  { id: 'all', label: 'Все', count: statusCounts.all },
                  { id: 'active', label: 'Активные', count: statusCounts.active },
                  { id: 'paused', label: 'На паузе', count: statusCounts.paused },
                  { id: 'completed', label: 'Завершённые', count: statusCounts.completed },
                  { id: 'archived', label: 'Архив', count: statusCounts.archived },
                ].map((tab) => {
                  const isActive = programFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProgramFilter(tab.id as typeof programFilter)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-[#182C23] border-[#376953] text-[#58C995] font-bold shadow-xs'
                          : 'bg-[#101619] border-[#1C262A] text-[#869194] hover:text-[#E8E9E7]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className="ml-1.5 text-[10px] opacity-70">({tab.count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {programs.length === 0 ? (
              <div className="bg-[#11171A] border border-[#1E282B] rounded-[28px] p-6 text-center space-y-3 shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-[#172227] text-[#58C995] flex items-center justify-center mx-auto">
                  <Dumbbell className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#E8E9E7]">Нет созданных программ</h3>
                  <p className="text-xs text-[#869194] mt-1 max-w-xs mx-auto">
                    Создайте свою индивидуальную программу тренировок с нуля или воспользуйтесь AI-генератором.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onCreateProgram}
                    className="px-4 py-2 bg-[#162024] border border-[#253338] hover:border-[#58C995] text-xs font-bold text-[#E8E9E7] rounded-xl cursor-pointer transition-colors active:scale-95"
                  >
                    Создать программу
                  </button>
                  <button
                    type="button"
                    onClick={onGenerateProgram}
                    className="px-4 py-2 bg-[#12241C] border border-[#234736] text-xs font-bold text-[#58C995] rounded-xl cursor-pointer transition-colors active:scale-95"
                  >
                    AI Генератор
                  </button>
                </div>
              </div>
            ) : filteredPrograms.length === 0 ? (
              <div className="bg-[#11171A] border border-[#1E282B] rounded-[24px] p-5 text-center space-y-2.5">
                <p className="text-xs text-[#869194]">
                  Нет программ со статусом «{programFilter === 'active' ? 'Активные' : programFilter === 'paused' ? 'На паузе' : programFilter === 'completed' ? 'Завершённые' : 'В архиве'}».
                </p>
                <button
                  type="button"
                  onClick={() => setProgramFilter('all')}
                  className="px-3.5 py-1.5 bg-[#172227] border border-[#23333A] text-xs font-bold text-[#58C995] rounded-xl cursor-pointer active:scale-95"
                >
                  Показать все ({programs.length})
                </button>
              </div>
            ) : (
              <>
                {/* Programs Horizontal Carousel */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {filteredPrograms.map((p) => {
                    const isSelected = selectedProgram?.id === p.id;
                    const st = p.status || 'active';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProgramId(p.id)}
                        className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'border-[#58C995] bg-[#12241C] text-[#58C995] shadow-xs'
                            : 'border-[#1E282B] bg-[#11171A] text-[#869194] hover:text-[#E8E9E7]'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            st === 'active'
                              ? 'bg-[#58C995]'
                              : st === 'paused'
                              ? 'bg-[#E5A83B]'
                              : st === 'completed'
                              ? 'bg-[#5EA2EF]'
                              : 'bg-[#6D777B]'
                          }`}
                        />
                        <span>{p.name}</span>
                        <span className="text-[10px] opacity-75 font-normal">
                          ({p.daysPerWeek} дн.)
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Program Details Card */}
                {selectedProgram && (
                  <div className="bg-[#11171A] border border-[#1E282B] rounded-[28px] p-4.5 space-y-4 shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {renderStatusBadge(selectedProgram.status)}
                          {selectedProgram.iterationCount && selectedProgram.iterationCount > 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7FD6BA] bg-[#142621] border border-[#234A3C] px-2 py-0.5 rounded-md">
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Цикл {selectedProgram.iterationCount}</span>
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-[#58C995] bg-[#14261E] border border-[#234736] px-2 py-0.5 rounded-md">
                            {selectedProgram.goal}
                          </span>
                          <span className="text-xs text-[#869194]">
                            {selectedProgram.daysPerWeek} тренировочных дня
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#E8E9E7] tracking-tight">
                          {selectedProgram.name}
                        </h3>
                        <p className="text-xs text-[#869194] mt-0.5">{selectedProgram.description}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Program Management Menu Button */}
                        <button
                          type="button"
                          onClick={() => setShowManageModal(true)}
                          className="px-3 py-1.5 bg-[#172429] hover:bg-[#1E3037] border border-[#284139] hover:border-[#58C995] text-[#58C995] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs"
                          title="Управление программой"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Управление</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditProgram(selectedProgram)}
                          className="p-2 text-[#869194] hover:text-[#E8E9E7] rounded-xl hover:bg-[#1A2529] cursor-pointer"
                          title="Редактировать"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProgram(selectedProgram.id)}
                          className="p-2 text-[#869194] hover:text-[#58C995] rounded-xl hover:bg-[#1A2529] cursor-pointer"
                          title="Дублировать"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteProgramConfirm({
                              id: selectedProgram.id,
                              name: selectedProgram.name,
                            })
                          }
                          className="p-2 text-[#869194] hover:text-[#E05353] rounded-xl hover:bg-[#1A2529] cursor-pointer"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Program Status Contextual Banner */}
                    {selectedProgram.status === 'completed' && (
                      <div className="bg-[#121E2C] border border-[#203D5E] rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#19324D] text-[#5EA2EF] flex items-center justify-center shrink-0">
                              <Trophy className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#E8E9E7] block">
                                Программа завершена
                              </span>
                              <span className="text-[10px] text-[#8BAECD]">
                                {selectedProgram.completedAt
                                  ? `Завершена ${new Date(selectedProgram.completedAt).toLocaleDateString('ru-RU')}`
                                  : 'Результаты сохранены в истории'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              StorageService.repeatProgram(selectedProgram.id);
                            }}
                            className="px-3 py-1.5 bg-[#1B3654] hover:bg-[#23466E] border border-[#2B5482] text-xs font-bold text-[#5EA2EF] rounded-xl cursor-pointer active:scale-95 flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Повторить цикл</span>
                          </button>
                        </div>

                        {selectedProgramStats && (
                          <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                            <div className="bg-[#0C151F] p-1.5 rounded-xl">
                              <span className="text-[9px] text-[#7A98B5] block">Сессий</span>
                              <span className="text-xs font-extrabold text-[#E8E9E7] font-mono">
                                {selectedProgramStats.totalWorkoutsCompleted}
                              </span>
                            </div>
                            <div className="bg-[#0C151F] p-1.5 rounded-xl">
                              <span className="text-[9px] text-[#7A98B5] block">Тоннаж</span>
                              <span className="text-xs font-extrabold text-[#58C995] font-mono truncate">
                                {selectedProgramStats.totalVolumeKg >= 1000
                                  ? `${(selectedProgramStats.totalVolumeKg / 1000).toFixed(1)} т`
                                  : `${selectedProgramStats.totalVolumeKg} кг`}
                              </span>
                            </div>
                            <div className="bg-[#0C151F] p-1.5 rounded-xl">
                              <span className="text-[9px] text-[#7A98B5] block">Часов</span>
                              <span className="text-xs font-extrabold text-[#E8E9E7] font-mono">
                                {(selectedProgramStats.totalDurationMinutes / 60).toFixed(1)}
                              </span>
                            </div>
                            <div className="bg-[#0C151F] p-1.5 rounded-xl">
                              <span className="text-[9px] text-[#7A98B5] block">Рекордов</span>
                              <span className="text-xs font-extrabold text-[#5EA2EF] font-mono">
                                {selectedProgramStats.personalRecordsCount}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedProgram.status === 'paused' && (
                      <div className="bg-[#241E13] border border-[#483B20] text-[#E5A83B] rounded-2xl p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Pause className="w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-bold block truncate">Программа на паузе</span>
                            <span className="text-[10px] text-[#C0964D] block truncate">
                              График приостановлен, весь прогресс сохранен
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => StorageService.resumeProgram(selectedProgram.id)}
                          className="px-3 py-1.5 bg-[#E5A83B] hover:bg-[#F0B54B] text-[#0D0B07] font-bold rounded-xl cursor-pointer shrink-0 text-xs active:scale-95 transition-all shadow-sm"
                        >
                          Возобновить
                        </button>
                      </div>
                    )}

                    {selectedProgram.status === 'archived' && (
                      <div className="bg-[#181D21] border border-[#2C353D] text-[#869194] rounded-2xl p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Archive className="w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-bold text-[#E8E9E7] block truncate">
                              Программа в архиве
                            </span>
                            <span className="text-[10px] text-[#869194] block truncate">
                              История тренировок и тоннаж сохранены
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => StorageService.resumeProgram(selectedProgram.id)}
                          className="px-3 py-1.5 bg-[#252F37] hover:bg-[#313E48] text-[#58C995] font-bold rounded-xl cursor-pointer shrink-0 text-xs active:scale-95 transition-all border border-[#3A4B58]"
                        >
                          Восстановить
                        </button>
                      </div>
                    )}

                    {/* Workout Days List inside Selected Program */}
                    <div className="space-y-2.5 pt-1">
                      <span className="text-[10px] font-bold text-[#7E8B8E] uppercase tracking-wider block">
                        Дни тренировок ({selectedProgram.workouts.length})
                      </span>

                      {selectedProgram.workouts.map((day) => {
                        const isExpanded = expandedDayId === day.id;

                        return (
                          <div
                            key={day.id}
                            className="bg-[#0C1215] border border-[#1A2528] rounded-2xl p-3.5 space-y-2.5 transition-all"
                          >
                            <div
                              onClick={() => setExpandedDayId(isExpanded ? null : day.id)}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <h4 className="text-xs font-bold text-[#E8E9E7]">{day.dayName}</h4>
                                <span className="text-[11px] text-[#869194]">
                                  {day.exercises.length} упр. • ~{day.estimatedDuration} мин
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPreview(day, selectedProgram.name, selectedProgram.id);
                                  }}
                                  className="px-3 py-1.5 bg-[#12241C] border border-[#234736] hover:border-[#58C995] text-[#58C995] rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                                >
                                  <Play className="w-3 h-3 fill-[#58C995]" />
                                  <span>Старт</span>
                                </button>
                                <ChevronDown
                                  className={`w-4 h-4 text-[#869194] transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Expanded exercises preview */}
                            {isExpanded && day.exercises && day.exercises.length > 0 && (
                              <div className="space-y-1.5 pt-2 border-t border-[#182326] text-xs">
                                {day.exercises.map((ex, exIdx) => (
                                  <div
                                    key={exIdx}
                                    className="flex items-center justify-between text-[#B2B8BA] py-1.5 px-2.5 rounded-xl bg-[#11171A]"
                                  >
                                    <span className="font-medium truncate pr-2">{ex.name}</span>
                                    <span className="text-[#869194] tabular-nums shrink-0 font-mono">
                                      {ex.sets} × {ex.reps}
                                    </span>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenPreview(day, selectedProgram.name, selectedProgram.id)
                                  }
                                  className="w-full mt-2 py-2 bg-[#172429] text-[#58C995] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                                >
                                  <span>Открыть полный план дня</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )}
        </div>
      )}

      {/* SUB-TAB 2: WORKOUT ANALYTICS */}
      {activeSubTab === 'analytics' && (
        <WorkoutAnalyticsView onStartWorkout={onStartCustomQuickWorkout} />
      )}

      {/* SUB-TAB 3: EXERCISE CATALOG */}
      {activeSubTab === 'library' && (
        <div className="bg-[#11171A] border border-[#1E282B] rounded-3xl p-4 shadow-md">
          <React.Suspense fallback={<div className="py-10 text-center text-xs text-[#92999A]">Загрузка каталога упражнений...</div>}>
            <LazyExerciseLibraryView />
          </React.Suspense>
        </div>
      )}

      {/* SUB-TAB 4: WORKOUT HISTORY & REAL PRS */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* PRs overview */}
          {(() => {
            const benchPR = StorageService.getPersonalRecord('Жим штанги лежа');
            const squatPR = StorageService.getPersonalRecord('Приседания со штангой');
            const deadliftPR = StorageService.getPersonalRecord('Становая тяга');
            const pullupPR = StorageService.getPersonalRecord('Подтягивания широким хватом');
            const hasAnyPR = Boolean(benchPR || squatPR || deadliftPR || pullupPR);

            return (
              <div className="rounded-[32px] bg-[#13171B] border border-[#1F2730] p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C232B] border border-[#27323D] text-[10px] font-bold text-[#58C995] uppercase tracking-wider">
                      <Award className="w-3.5 h-3.5 text-[#58C995]" />
                      Личные рекорды
                    </span>
                  </div>
                </div>

                {hasAnyPR ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[22px] bg-[#0C1014] border border-[#182027] p-3.5">
                      <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">Жим лёжа</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-1 block">
                        {benchPR ? `${benchPR.maxWeight} кг` : '—'}
                      </span>
                    </div>
                    <div className="rounded-[22px] bg-[#0C1014] border border-[#182027] p-3.5">
                      <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">Приседания</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-1 block">
                        {squatPR ? `${squatPR.maxWeight} кг` : '—'}
                      </span>
                    </div>
                    <div className="rounded-[22px] bg-[#0C1014] border border-[#182027] p-3.5">
                      <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">Становая тяга</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-1 block">
                        {deadliftPR ? `${deadliftPR.maxWeight} кг` : '—'}
                      </span>
                    </div>
                    <div className="rounded-[22px] bg-[#0C1014] border border-[#182027] p-3.5">
                      <span className="text-[10px] font-bold text-[#8E9CA3] uppercase tracking-wider block">Подтягивания</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-1 block">
                        {pullupPR
                          ? `${pullupPR.maxWeight > 0 ? `+${pullupPR.maxWeight} кг` : 'свой вес'}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#8E9CA3] text-center py-2">
                    Рекорды пока не зафиксированы.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Past Sessions List */}
          {sessions.length === 0 ? (
            <div className="p-8 text-center rounded-[32px] bg-[#13171B] border border-[#1F2730] shadow-xl">
              <History className="w-8 h-8 text-[#58C995] mx-auto mb-2" />
              <p className="text-sm font-bold text-white">История пуста</p>
              <p className="text-xs text-[#8E9CA3] mt-1">
                Завершите свою первую тренировку, чтобы увидеть запись здесь.
              </p>
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                className="rounded-[32px] bg-[#13171B] border border-[#1F2730] hover:border-[#2D3945] p-5 space-y-3.5 transition-all shadow-xl"
              >
                <div className="flex items-start gap-4">
                  {/* Hallmark Left Inset Squircle with Session Metrics */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[22px] bg-[#0C1014] border border-[#182027] shrink-0 flex flex-col items-center justify-center p-2 text-center">
                    <span className="font-mono tabular-nums font-black text-white text-base">
                      {sess.durationMinutes}
                    </span>
                    <span className="text-[9px] font-bold text-[#8E9CA3] uppercase tracking-wider">
                      минут
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1C232B] border border-[#27323D] text-[10px] font-bold text-[#58C995] uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3 text-[#58C995]" />
                        Завершено
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteSessionConfirm(sess.id)}
                        className="p-1 text-[#8E9CA3] hover:text-[#E05353] cursor-pointer transition-colors"
                        title="Удалить запись"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <h3 className="text-base font-black text-white tracking-tight leading-tight">{sess.name}</h3>
                    <span className="text-xs text-[#8E9CA3] block">{sess.date}</span>
                  </div>
                </div>

                {/* Secondary Capsule Bar */}
                <div className="rounded-2xl bg-[#0C1014] border border-[#182027] py-2.5 px-4 flex items-center justify-between text-xs font-semibold text-[#8E9CA3]">
                  <div className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-[#58C995]" />
                    <span>Тоннаж:</span>
                    <span className="font-mono font-bold text-[#58C995] tabular-nums">
                      {StorageService.getSessionVolumeKg(sess, currentWeightKg).toLocaleString('ru-RU')} кг
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-white">
                    {sess.completedSets || 0} сетов
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ======================================================================= */}
      {/* 2. UNIFIED MODAL: WORKOUT PREVIEW / LAUNCH SHEET                        */}
      {/* ======================================================================= */}
      {(() => {
        const customExercisesForPreview = StorageService.getCustomExercises();
        const enrichedPreviewExercises = previewWorkoutData
          ? (previewWorkoutData.day.exercises || []).map((ex) => {
              const catalogItem = findExerciseInUnifiedCatalog(
                ex.exerciseId,
                ex.name,
                customExercisesForPreview,
                ex.targetMuscle
              );
              return {
                ...ex,
                exerciseId: ex.exerciseId || catalogItem?.id,
                targetMuscle: ex.targetMuscle || catalogItem?.primaryMuscle,
                secondaryMuscles:
                  ex.secondaryMuscles && ex.secondaryMuscles.length > 0
                    ? ex.secondaryMuscles
                    : catalogItem?.secondaryMuscles,
                requiredEquipment: ex.requiredEquipment || catalogItem?.requiredEquipment,
              };
            })
          : [];
        const previewSafety =
          previewWorkoutData && wellbeingVersion >= 0
            ? checkWorkoutLaunchSafety(enrichedPreviewExercises)
            : null;
        const blockedIndexSet = new Set(
          (previewSafety?.blockedExercises || []).map((b) => b.index)
        );
        const hasGlobalBlock = Boolean(
          previewSafety?.blockedExercises.some(
            (b) => b.decision.blockedByAge || b.decision.blockedByPain
          )
        );
        const safeCount = previewSafety?.safeExercises.length || 0;
        const canStartSafeOnly = Boolean(
          previewSafety && !previewSafety.allowed && safeCount > 0 && !hasGlobalBlock
        );
        const formatStaleZoneRu = (area: StalePainArea): string => {
          if (area.areaType === 'general') return 'Суставы и связки';
          const def = MUSCLE_DEFINITIONS[area.zoneKey as MuscleGroup];
          return def?.nameRu || area.rawKey || area.zoneKey;
        };

        return (
          <Modal
            isOpen={Boolean(previewWorkoutData)}
            onClose={() => setPreviewWorkoutData(null)}
            title={previewWorkoutData?.day.dayName}
            subtitle={previewWorkoutData?.programName}
            icon={<Play className="w-5 h-5 fill-[#58C995] text-[#58C995]" />}
            footer={
              previewWorkoutData ? (
                <div className="space-y-2">
                  {previewSafety && !previewSafety.allowed ? (
                    canStartSafeOnly ? (
                      <button
                        type="button"
                        onClick={() => {
                          const filteredDay: ProgramWorkoutDay = {
                            ...previewWorkoutData.day,
                            exercises: (previewWorkoutData.day.exercises || []).filter(
                              (_, idx) => !blockedIndexSet.has(idx)
                            ),
                          };
                          onStartProgramWorkout(
                            filteredDay,
                            previewWorkoutData.programName,
                            previewWorkoutData.programId
                          );
                          setPreviewWorkoutData(null);
                        }}
                        className="w-full py-4 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(88,201,149,0.35)] cursor-pointer active:scale-95 transition-all"
                      >
                        <Play className="w-4 h-4 fill-[#080D0E]" />
                        <span>Начать без заблокированных ({safeCount})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full py-4 bg-[#2B1414] border border-[#5C2626] text-[#FCA5A5] font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed opacity-80"
                      >
                        <ShieldAlert className="w-4 h-4 text-[#F87171]" />
                        <span>Запуск заблокирован Safety Guard</span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmStart}
                      className="w-full py-4 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2.5 shadow-[0_4px_24px_rgba(88,201,149,0.35)] cursor-pointer active:scale-95 transition-all"
                    >
                      <Play className="w-5 h-5 fill-[#080D0E]" />
                      <span>Начать тренировку</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setPreviewWorkoutData(null)}
                    className="w-full py-2 text-xs text-[#869194] hover:text-white font-medium text-center cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              ) : undefined
            }
          >
            {previewWorkoutData && (
              <div className="space-y-3.5">
                {previewSafety && !previewSafety.allowed && (
                  <div
                    role="alert"
                    className="p-3 rounded-2xl bg-[#2B1414] border border-[#5C2626] text-xs text-[#FCA5A5] space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[#F87171]">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Safety Guard обнаружил ограничения:</span>
                    </div>
                    {previewSafety.vetoReasons.map((r, i) => (
                      <div key={i} className="text-[11px]">
                        • {r}
                      </div>
                    ))}
                  </div>
                )}

                {previewSafety &&
                  !previewSafety.allowed &&
                  previewSafety.requiresWellbeingUpdate &&
                  previewSafety.stalePainAreas &&
                  previewSafety.stalePainAreas.length > 0 && (
                    <div className="p-3 rounded-2xl bg-[#1F1A10] border border-[#4A3B18] text-xs space-y-2.5">
                      <div className="font-bold text-[#FCD34D]">
                        Устаревшая отметка о боли — подтвердите текущее состояние:
                      </div>
                      <div className="space-y-2">
                        {previewSafety.stalePainAreas.map((area) => (
                          <div
                            key={`${area.areaType}:${area.zoneKey}`}
                            className="p-2.5 rounded-xl bg-[#121A1E] border border-[#2C2416] space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-[#E8E9E7]">
                              <span className="font-bold">{formatStaleZoneRu(area)}</span>
                              <span className="text-[11px] text-[#FCD34D]">
                                {area.level}/10 ({area.daysAgo} дн. назад)
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  confirmWellbeingPainArea(area, area.level);
                                  setWellbeingVersion((v) => v + 1);
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-[#2B1414] hover:bg-[#3A1C1C] border border-[#5C2626] text-[#FCA5A5] text-[11px] font-bold cursor-pointer transition-all"
                              >
                                Боль сохраняется
                              </button>
                              {area.level >= 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    confirmWellbeingPainArea(area, 1);
                                    setWellbeingVersion((v) => v + 1);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-[#2B2412] hover:bg-[#3B3018] border border-[#5C491C] text-[#FCD34D] text-[11px] font-bold cursor-pointer transition-all"
                                >
                                  Стала слабее (1/10)
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  confirmWellbeingPainArea(area, 0);
                                  setWellbeingVersion((v) => v + 1);
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-[#152E24] hover:bg-[#1C3D30] border border-[#2B5946] text-[#58C995] text-[11px] font-bold cursor-pointer transition-all"
                              >
                                Боль прошла (0)
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Workout Key Metrics Row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#121A1E] border border-[#1E292E] p-3 rounded-2xl text-center">
                    <Clock className="w-4 h-4 text-[#58C995] mx-auto mb-1" />
                    <span className="text-[10px] text-[#869194] block">Длительность</span>
                    <span className="text-xs font-bold text-[#E8E9E7] tabular-nums font-mono">
                      ~{previewWorkoutData.day.estimatedDuration || 55} мин
                    </span>
                  </div>

                  <div className="bg-[#121A1E] border border-[#1E292E] p-3 rounded-2xl text-center">
                    <Dumbbell className="w-4 h-4 text-[#58C995] mx-auto mb-1" />
                    <span className="text-[10px] text-[#869194] block">Упражнений</span>
                    <span className="text-xs font-bold text-[#E8E9E7] tabular-nums font-mono">
                      {previewWorkoutData.day.exercises?.length || 0}
                    </span>
                  </div>

                  <div className="bg-[#121A1E] border border-[#1E292E] p-3 rounded-2xl text-center">
                    <Layers className="w-4 h-4 text-[#58C995] mx-auto mb-1" />
                    <span className="text-[10px] text-[#869194] block">Подходов</span>
                    <span className="text-xs font-bold text-[#58C995] tabular-nums font-mono">
                      {previewWorkoutData.day.exercises?.reduce(
                        (acc, ex) => acc + (ex.sets || 4),
                        0
                      ) || 16}
                    </span>
                  </div>
                </div>

                {/* Scrollable Exercises List */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-[#7E8B8E] uppercase tracking-wider block px-0.5">
                    План упражнений ({previewWorkoutData.day.exercises?.length || 0}):
                  </span>

                  {previewWorkoutData.day.exercises?.map((ex, idx) => {
                    const catalogItem = findExerciseInUnifiedCatalog(
                      ex.exerciseId,
                      ex.name,
                      customExercisesForPreview,
                      ex.targetMuscle
                    );
                    const muscleKey = (normalizeMuscleKeyPure(
                      ex.targetMuscle || catalogItem?.primaryMuscle
                    ) || 'quads_rectus') as MuscleGroup;
                    const muscleNameRu = MUSCLE_DEFINITIONS[muscleKey]?.nameRu || 'Мышцы';
                    const isBlockedEx = blockedIndexSet.has(idx);

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl p-3 flex items-center justify-between gap-3 border ${
                          isBlockedEx
                            ? 'bg-[#211214] border-[#5C2626]'
                            : 'bg-[#121A1E] border-[#1B272C]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-lg text-xs font-bold font-mono flex items-center justify-center shrink-0 ${
                              isBlockedEx
                                ? 'bg-[#3A1B1E] text-[#F87171]'
                                : 'bg-[#18242A] text-[#58C995]'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-[#E8E9E7] truncate">{ex.name}</h4>
                            <span className="text-[10px] text-[#869194] flex items-center gap-1 mt-0.5">
                              {isBlockedEx ? (
                                <>
                                  <ShieldAlert className="w-2.5 h-2.5 text-[#F87171]" />
                                  <span className="text-[#FCA5A5]">Заблокировано Safety Guard</span>
                                </>
                              ) : (
                                <>
                                  <Dumbbell className="w-2.5 h-2.5" />
                                  {muscleNameRu}
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold text-[#58C995] font-mono block">
                            {ex.sets} × {ex.reps}
                          </span>
                          <span className="text-[10px] text-[#7E8B8E]">
                            {ex.targetWeight ? `${ex.targetWeight} кг` : 'рабочий вес'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* ======================================================================= */}
      {/* 2. PROGRAM LIFECYCLE & MANAGEMENT MODALS                                */}
      {/* ======================================================================= */}
      {/* 2.1 Program Management Menu Modal */}
      <Modal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        title="Управление программой"
      >
        {selectedProgram && (
          <div className="space-y-4">
            {/* Program Summary Header */}
            <div className="bg-[#121A1E] border border-[#1E2B30] rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-[#E8E9E7] truncate">
                    {selectedProgram.name}
                  </h3>
                  <p className="text-xs text-[#869194] mt-0.5 truncate">
                    {selectedProgram.goal} • {selectedProgram.daysPerWeek} дн./нед.
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {renderStatusBadge(selectedProgram.status)}
                  {selectedProgram.iterationCount && selectedProgram.iterationCount > 1 && (
                    <span className="text-[10px] text-[#58C995] font-semibold">
                      Цикл {selectedProgram.iterationCount}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 7 Management Menu Actions */}
            <div className="space-y-2">
              {/* 1. Complete Program */}
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setShowCompleteModal(true);
                }}
                className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#58C995] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#14261F] text-[#58C995] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#E8E9E7] block">Завершить программу</span>
                    <span className="text-[11px] text-[#869194] block truncate">
                      Зафиксировать результаты, тоннаж и перейти к новому этапу
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
              </button>

              {/* 2. Pause / Resume */}
              {selectedProgram.status === 'paused' ? (
                <button
                  type="button"
                  onClick={() => {
                    StorageService.resumeProgram(selectedProgram.id);
                    setShowManageModal(false);
                  }}
                  className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#58C995] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#14261F] text-[#58C995] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Play className="w-4 h-4 fill-[#58C995]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#58C995] block">Возобновить программу</span>
                      <span className="text-[11px] text-[#869194] block truncate">
                        Вернуть программу в активный статус и продолжить график
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    StorageService.pauseProgram(selectedProgram.id);
                    setShowManageModal(false);
                  }}
                  className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#E5A83B] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#282112] text-[#E5A83B] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Pause className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#E8E9E7] block">Приостановить</span>
                      <span className="text-[11px] text-[#869194] block truncate">
                        Временная пауза без сброса накопленного прогресса
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
                </button>
              )}

              {/* 3. Change Goal */}
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setNewGoalInput(selectedProgram.goal || '');
                  setShowChangeGoalModal(true);
                }}
                className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#58C995] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#16252C] text-[#58C995] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Target className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#E8E9E7] block">Изменить цель</span>
                    <span className="text-[11px] text-[#869194] block truncate">
                      Текущая: {selectedProgram.goal}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
              </button>

              {/* 4. Replace Program */}
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setShowReplaceModal(true);
                }}
                className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#58C995] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#142333] text-[#5EA2EF] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#E8E9E7] block">Заменить программу</span>
                    <span className="text-[11px] text-[#869194] block truncate">
                      Выбрать другой комплекс, сохранив историю текущего
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
              </button>

              {/* 5. Repeat Program */}
              <button
                type="button"
                onClick={() => {
                  StorageService.repeatProgram(selectedProgram.id);
                  setShowManageModal(false);
                }}
                className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#58C995] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#14261F] text-[#58C995] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#E8E9E7] block">Повторить программу</span>
                    <span className="text-[11px] text-[#869194] block truncate">
                      Начать новый тренировочный цикл (Цикл {(selectedProgram.iterationCount || 1) + 1})
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
              </button>

              {/* 6. Archive / Unarchive */}
              {selectedProgram.status === 'archived' ? (
                <button
                  type="button"
                  onClick={() => {
                    StorageService.resumeProgram(selectedProgram.id);
                    setShowManageModal(false);
                  }}
                  className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#58C995] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#162227] text-[#869194] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <RotateCcw className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#E8E9E7] block">Восстановить из архива</span>
                      <span className="text-[11px] text-[#869194] block truncate">
                        Вернуть программу в активные
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    StorageService.archiveProgram(selectedProgram.id);
                    setShowManageModal(false);
                  }}
                  className="w-full p-3.5 bg-[#11171A] hover:bg-[#162227] border border-[#1E282B] hover:border-[#869194] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#162227] text-[#869194] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Archive className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#E8E9E7] block">В архив</span>
                      <span className="text-[11px] text-[#869194] block truncate">
                        Переместить в архив (вся история и тренировки сохранятся)
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
                </button>
              )}

              {/* 7. Delete Program */}
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setDeleteProgramConfirm({
                    id: selectedProgram.id,
                    name: selectedProgram.name,
                  });
                }}
                className="w-full p-3.5 bg-[#161214] hover:bg-[#201618] border border-[#2D1B1E] hover:border-[#E05353] rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#281518] text-[#E05353] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#E05353] block">Удалить программу</span>
                    <span className="text-[11px] text-[#869194] block truncate">
                      Удалить шаблон программы (история тренировок останется)
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#869194] shrink-0" />
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2.2 Program Completion Modal */}
      <Modal
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        title="Завершение программы"
      >
        {selectedProgram && (
          <div className="space-y-4">
            {/* Trophy Header */}
            <div className="text-center py-1 space-y-1">
              <div className="w-14 h-14 rounded-3xl bg-[#14291F] border border-[#27533E] text-[#58C995] flex items-center justify-center mx-auto shadow-lg">
                <Trophy className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-[#E8E9E7] pt-2">
                Завершение «{selectedProgram.name}»
              </h3>
              <p className="text-xs text-[#869194]">
                Все тренировки сохранены в истории. Зафиксируйте достижения цикла.
              </p>
            </div>

            {/* Stats Summary Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#121A1E] border border-[#1E282B] rounded-2xl p-3 text-center">
                <span className="text-[10px] text-[#869194] block">Пройдено тренировок</span>
                <span className="text-lg font-black text-[#58C995] tabular-nums mt-0.5 block">
                  {selectedProgramStats?.totalWorkoutsCompleted || 0}
                </span>
              </div>
              <div className="bg-[#121A1E] border border-[#1E282B] rounded-2xl p-3 text-center">
                <span className="text-[10px] text-[#869194] block">Общий тоннаж</span>
                <span className="text-lg font-black text-[#58C995] tabular-nums mt-0.5 block">
                  {(selectedProgramStats?.totalVolumeKg || 0) >= 1000
                    ? `${((selectedProgramStats?.totalVolumeKg || 0) / 1000).toFixed(1)} т`
                    : `${selectedProgramStats?.totalVolumeKg || 0} кг`}
                </span>
              </div>
              <div className="bg-[#121A1E] border border-[#1E282B] rounded-2xl p-3 text-center">
                <span className="text-[10px] text-[#869194] block">Времени в зале</span>
                <span className="text-lg font-black text-[#E8E9E7] tabular-nums mt-0.5 block">
                  {Math.floor((selectedProgramStats?.totalDurationMinutes || 0) / 60)} ч{' '}
                  {(selectedProgramStats?.totalDurationMinutes || 0) % 60} м
                </span>
              </div>
              <div className="bg-[#121A1E] border border-[#1E282B] rounded-2xl p-3 text-center">
                <span className="text-[10px] text-[#869194] block">Личных рекордов (PR)</span>
                <span className="text-lg font-black text-[#5EA2EF] tabular-nums mt-0.5 block">
                  {selectedProgramStats?.personalRecordsCount || 0}
                </span>
              </div>
            </div>

            {/* Note Input */}
            <div>
              <label className="text-xs font-semibold text-[#869194] block mb-1.5">
                Заметка о результатах (опционально)
              </label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Как прошел цикл? Самочувствие, прирост силовых, выводы..."
                className="w-full bg-[#11171A] border border-[#1E282B] rounded-2xl p-3 text-xs text-[#E8E9E7] placeholder-[#556366] focus:outline-hidden focus:border-[#58C995] resize-none h-20"
              />
            </div>

            {/* Action Options */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  StorageService.completeProgram(selectedProgram.id, completionNote);
                  setShowCompleteModal(false);
                  setCompletionNote('');
                  setShowReplaceModal(true);
                }}
                className="w-full py-3 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-2xl shadow-md hover:bg-[#68d7a4] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Завершить и выбрать новый комплекс</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  StorageService.completeProgram(selectedProgram.id, completionNote);
                  StorageService.repeatProgram(selectedProgram.id);
                  setShowCompleteModal(false);
                  setCompletionNote('');
                }}
                className="w-full py-3 bg-[#14261F] border border-[#25523C] text-[#58C995] font-bold text-xs rounded-2xl hover:bg-[#1A332A] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Завершить и повторить этот цикл (Итерация {(selectedProgram.iterationCount || 1) + 1})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  StorageService.completeProgram(selectedProgram.id, completionNote);
                  setShowCompleteModal(false);
                  setCompletionNote('');
                }}
                className="w-full py-2.5 text-xs font-semibold text-[#869194] hover:text-[#E8E9E7] rounded-xl hover:bg-[#11171A] transition-colors cursor-pointer text-center block"
              >
                Просто переместить в завершённые
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2.3 Change Program Goal Modal */}
      <Modal
        isOpen={showChangeGoalModal}
        onClose={() => setShowChangeGoalModal(false)}
        title="Изменить цель программы"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#869194]">
            Выберите новую цель для программы. Это поможет отслеживать прогресс и адаптировать тренировки.
          </p>

          <div className="space-y-2">
            {[
              'Развитие мышц (Гипертрофия)',
              'Увеличение силы',
              'Рельеф и сжигание жира',
              'Выносливость и функциональность',
              'Общая физическая подготовка (ОФП)',
              'Здоровье, осанка и тонус',
            ].map((goalOption) => (
              <button
                key={goalOption}
                type="button"
                onClick={() => setNewGoalInput(goalOption)}
                className={`w-full p-3 rounded-2xl border text-xs font-bold text-left flex items-center justify-between cursor-pointer transition-all ${
                  newGoalInput === goalOption
                    ? 'bg-[#132A20] border-[#58C995] text-[#58C995]'
                    : 'bg-[#11171A] border-[#1E282B] text-[#B2B8BA] hover:text-[#E8E9E7]'
                }`}
              >
                <span>{goalOption}</span>
                {newGoalInput === goalOption && <Check className="w-4 h-4 text-[#58C995]" />}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-[#869194] block mb-1.5">
              Или укажите свою цель
            </label>
            <input
              type="text"
              value={newGoalInput}
              onChange={(e) => setNewGoalInput(e.target.value)}
              placeholder="Например: Подготовка к соревнованиям, жим лежа..."
              className="w-full bg-[#11171A] border border-[#1E282B] rounded-2xl px-3.5 py-2.5 text-xs text-[#E8E9E7] placeholder-[#556366] focus:outline-hidden focus:border-[#58C995]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowChangeGoalModal(false)}
              className="flex-1 py-2.5 bg-[#172227] text-xs font-semibold text-[#869194] hover:text-[#E8E9E7] rounded-xl cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!newGoalInput.trim()}
              onClick={() => {
                if (selectedProgram && newGoalInput.trim()) {
                  StorageService.updateProgramGoal(selectedProgram.id, newGoalInput.trim());
                  setShowChangeGoalModal(false);
                }
              }}
              className="flex-1 py-2.5 bg-[#58C995] text-[#080D0E] text-xs font-bold rounded-xl shadow-md hover:bg-[#68d7a4] active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              Сохранить цель
            </button>
          </div>
        </div>
      </Modal>

      {/* 2.4 Replace Program Modal */}
      <Modal
        isOpen={showReplaceModal}
        onClose={() => {
          setShowReplaceModal(false);
          setReplacementTargetId('');
        }}
        title="Замена программы"
      >
        <div className="space-y-4">
          {/* Safe retention info */}
          <div className="bg-[#121F1A] border border-[#234A38] rounded-2xl p-3.5 flex items-start gap-3">
            <div className="w-7 h-7 rounded-xl bg-[#183628] text-[#58C995] flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <span className="font-bold text-[#E8E9E7] block">Полная сохранность истории</span>
              <span className="text-[#8FA89D] mt-0.5 block">
                Текущая программа перейдёт в архив. Вся история ваших тренировок, тоннаж и рекорды останутся в приложении.
              </span>
            </div>
          </div>

          {/* Choose other program */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#7E8B8E] uppercase tracking-wider block">
              Выберите программу для активации:
            </span>

            {programs.filter((p) => p.id !== selectedProgram?.id).length === 0 ? (
              <div className="bg-[#11171A] border border-[#1E282B] rounded-2xl p-4 text-center space-y-2">
                <p className="text-xs text-[#869194]">
                  У вас пока нет других программ в списке. Вы можете создать новую или воспользоваться AI-генератором.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {programs
                  .filter((p) => p.id !== selectedProgram?.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setReplacementTargetId(p.id)}
                      className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between cursor-pointer transition-all ${
                        replacementTargetId === p.id
                          ? 'bg-[#132A20] border-[#58C995] text-[#58C995]'
                          : 'bg-[#11171A] border-[#1E282B] text-[#E8E9E7] hover:border-[#2C3E37]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-[#E8E9E7] truncate">{p.name}</span>
                          {renderStatusBadge(p.status)}
                        </div>
                        <span className="text-[11px] text-[#869194]">
                          {p.goal} • {p.daysPerWeek} дн./нед.
                        </span>
                      </div>
                      {replacementTargetId === p.id && (
                        <Check className="w-4 h-4 text-[#58C995] shrink-0" />
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Or create new / AI */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1A2529]">
            <button
              type="button"
              onClick={() => {
                setShowReplaceModal(false);
                onCreateProgram();
              }}
              className="py-2.5 px-3 bg-[#11171A] border border-[#1E282B] hover:border-[#58C995] text-xs font-bold text-[#E8E9E7] rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Создать новую</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowReplaceModal(false);
                onGenerateProgram();
              }}
              className="py-2.5 px-3 bg-[#12231B] border border-[#234535] hover:border-[#58C995] text-xs font-bold text-[#58C995] rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#58C995]" />
              <span>AI Генератор</span>
            </button>
          </div>

          {/* Confirmation button */}
          {replacementTargetId && selectedProgram && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  StorageService.replaceProgram(selectedProgram.id, replacementTargetId, true);
                  setSelectedProgramId(replacementTargetId);
                  setShowReplaceModal(false);
                  setReplacementTargetId('');
                }}
                className="w-full py-3 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl shadow-md hover:bg-[#68d7a4] active:scale-95 transition-all cursor-pointer"
              >
                Подтвердить замену и активировать
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ======================================================================= */}
      {/* 3. CONFIRMATION MODALS (Unified system)                                */}
      {/* ======================================================================= */}
      {/* Delete Program Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deleteProgramConfirm)}
        onClose={() => setDeleteProgramConfirm(null)}
        onConfirm={() => {
          if (deleteProgramConfirm) {
            onDeleteProgram(deleteProgramConfirm.id);
            setDeleteProgramConfirm(null);
          }
        }}
        title="Удалить программу?"
        description={`Вы уверены, что хотите удалить программу «${deleteProgramConfirm?.name}»? Это действие нельзя отменить.`}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      {/* Delete Session Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deleteSessionConfirm)}
        onClose={() => setDeleteSessionConfirm(null)}
        onConfirm={() => {
          if (deleteSessionConfirm) {
            onDeleteSession(deleteSessionConfirm);
            setDeleteSessionConfirm(null);
          }
        }}
        title="Удалить запись?"
        description="Вы уверены, что хотите удалить эту тренировку из истории? Статистика будет обновлена."
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      {/* Discard Draft Confirmation */}
      <ConfirmModal
        isOpen={showDiscardDraftConfirm}
        onClose={() => setShowDiscardDraftConfirm(false)}
        onConfirm={() => {
          if (onDiscardDraft) {
            onDiscardDraft();
            setShowDiscardDraftConfirm(false);
          }
        }}
        title="Сбросить черновик?"
        description="Несохранённый прогресс активной тренировки будет удалён. Вы уверены?"
        confirmText="Сбросить"
        cancelText="Отмена"
        variant="warning"
      />
    </div>
  );
};
