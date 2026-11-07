import React, { useState, useMemo } from 'react';
import {
  WorkoutProgram,
  WorkoutSession,
  ProgramWorkoutDay,
} from '../types/workout';
import { StorageService } from '../services/storage';
import { ExerciseLibraryView } from './ExerciseLibraryView';
import { ExerciseProgressModal } from './ExerciseProgressModal';
import { WorkoutAnalyticsView } from './WorkoutAnalyticsView';
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
  TrendingUp,
  AlertCircle,
  Sliders,
  RotateCcw,
  X,
  Layers,
} from 'lucide-react';

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
  const [activeSubTab, setActiveSubTab] = useState<'programs' | 'analytics' | 'history' | 'library'>('programs');
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    programs[0]?.id || ''
  );
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const selectedProgram =
    programs.find((p) => p.id === selectedProgramId) || programs[0] || null;

  // Real completed sessions stats
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'completed'),
    [sessions]
  );
  const totalCompletedCount = completedSessions.length;
  const totalVolumeKg = useMemo(
    () => completedSessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 0),
    [completedSessions]
  );
  const totalTonnageDisplay = totalVolumeKg >= 1000 ? `${(totalVolumeKg / 1000).toFixed(1)} т` : `${totalVolumeKg} кг`;

  // Workouts this week
  const workoutsThisWeekCount = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    return completedSessions.filter((s) => {
      const d = new Date(s.date);
      return d >= startOfWeek;
    }).length;
  }, [completedSessions]);

  const lastSession = completedSessions.length > 0 ? completedSessions[0] : null;
  const activeProgram = programs.length > 0 ? programs[0] : null;
  const nextWorkoutDay = activeProgram && activeProgram.workouts.length > 0 ? activeProgram.workouts[0] : null;

  return (
    <div className="w-full flex flex-col pb-6 space-y-4">
      {/* 1. Header & Title */}
      <div className="flex items-center justify-between pt-1 px-0.5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#E8E9E7]">
            Тренировки
          </h1>
          <p className="text-xs text-[#869194] mt-0.5">
            Программы, планирование и журнал занятий
          </p>
        </div>

        <button
          type="button"
          onClick={onStartCustomQuickWorkout}
          className="px-3.5 py-2 bg-[#12241C] border border-[#234736] text-[#58C995] rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[#183226] cursor-pointer shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-[#58C995]" />
          <span>Быстрый старт</span>
        </button>
      </div>

      {/* 2. Active Draft Alert Banner if unfinished workout exists */}
      {activeDraft && onResumeDraft && (
        <div className="bg-[#14261E] border border-[#27533E] rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#1D3D2F] text-[#58C995] flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 fill-[#58C995]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10.5px] font-bold text-[#58C995] uppercase tracking-wider block">
                Незавершённая тренировка
              </span>
              <p className="text-xs font-bold text-[#E8E9E7] truncate">{activeDraft.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDiscardDraft && (
              <button
                type="button"
                onClick={onDiscardDraft}
                className="px-2.5 py-2 text-xs font-medium text-[#869194] hover:text-[#E05353] rounded-xl hover:bg-[#1A2529] cursor-pointer"
              >
                Сбросить
              </button>
            )}
            <button
              type="button"
              onClick={() => onResumeDraft(activeDraft)}
              className="px-3.5 py-2 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl shadow-md hover:bg-[#68d7a4] cursor-pointer"
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {/* 3. Sub-navigation tabs */}
      <div className="w-full grid grid-cols-4 p-1 bg-[#11181B] rounded-2xl border border-[#1E282B] gap-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveSubTab('programs')}
          className={`py-2 text-[11px] sm:text-xs font-semibold rounded-xl text-center truncate cursor-pointer transition-colors ${
            activeSubTab === 'programs'
              ? 'bg-[#58C995] text-[#080D0E] font-bold shadow-sm'
              : 'text-[#869194] hover:text-[#E8E9E7]'
          }`}
        >
          Программы
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('analytics')}
          className={`py-2 text-[11px] sm:text-xs font-semibold rounded-xl text-center truncate cursor-pointer transition-colors ${
            activeSubTab === 'analytics'
              ? 'bg-[#58C995] text-[#080D0E] font-bold shadow-sm'
              : 'text-[#869194] hover:text-[#E8E9E7]'
          }`}
        >
          Аналитика
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`py-2 text-[11px] sm:text-xs font-semibold rounded-xl text-center truncate cursor-pointer transition-colors ${
            activeSubTab === 'history'
              ? 'bg-[#58C995] text-[#080D0E] font-bold shadow-sm'
              : 'text-[#869194] hover:text-[#E8E9E7]'
          }`}
        >
          История ({sessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('library')}
          className={`py-2 text-[11px] sm:text-xs font-semibold rounded-xl text-center truncate cursor-pointer transition-colors ${
            activeSubTab === 'library'
              ? 'bg-[#58C995] text-[#080D0E] font-bold shadow-sm'
              : 'text-[#869194] hover:text-[#E8E9E7]'
          }`}
        >
          Каталог
        </button>
      </div>

      {/* SUB-TAB 1: PROGRAMS & MAIN WORKOUT DASHBOARD */}
      {activeSubTab === 'programs' && (
        <div className="space-y-4">
          {/* A. Statistics Summary Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-[#11181B] border border-[#1E282B] rounded-2xl p-3 text-center shadow-sm">
              <span className="text-[10px] font-medium text-[#869194] block">Всего сессий</span>
              <span className="text-base font-extrabold text-[#E8E9E7] tabular-nums mt-0.5 block">
                {totalCompletedCount}
              </span>
            </div>
            <div className="bg-[#11181B] border border-[#1E282B] rounded-2xl p-3 text-center shadow-sm">
              <span className="text-[10px] font-medium text-[#869194] block">За неделю</span>
              <span className="text-base font-extrabold text-[#58C995] tabular-nums mt-0.5 block">
                {workoutsThisWeekCount}
              </span>
            </div>
            <div className="bg-[#11181B] border border-[#1E282B] rounded-2xl p-3 text-center shadow-sm">
              <span className="text-[10px] font-medium text-[#869194] block">Тоннаж</span>
              <span className="text-base font-extrabold text-[#58C995] tabular-nums mt-0.5 block truncate">
                {totalTonnageDisplay}
              </span>
            </div>
          </div>

          {/* B. Prominent Main Start Card */}
          <div className="bg-[#11181B] border border-[#1E282B] rounded-3xl p-5 space-y-4 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-[#58C995] bg-[#14261E] border border-[#234736] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Активная программа
              </span>
              <span className="text-xs text-[#869194] font-medium">
                {activeProgram ? activeProgram.name : 'Нет программ'}
              </span>
            </div>

            {nextWorkoutDay && activeProgram ? (
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-[#E8E9E7] tracking-tight">
                  {nextWorkoutDay.dayName}
                </h3>
                <div className="flex items-center gap-4 text-xs text-[#869194]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#58C995]" />
                    <span className="tabular-nums">~{nextWorkoutDay.estimatedDuration || 55} мин</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5 text-[#58C995]" />
                    <span className="tabular-nums">{nextWorkoutDay.exercises?.length || 0} упражнений</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartProgramWorkout(nextWorkoutDay, activeProgram.name, activeProgram.id)}
                  className="w-full py-3.5 mt-2 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(88,201,149,0.3)] cursor-pointer transition-colors"
                >
                  <Play className="w-4 h-4 fill-[#080D0E]" />
                  <span>Начать тренировку</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-[#869194]">
                  У вас пока нет активных тренировок. Создайте программу или запустите свободную сессию.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onCreateProgram}
                    className="px-4 py-2.5 bg-[#152024] border border-[#223035] hover:border-[#58C995] text-xs font-bold text-[#E8E9E7] rounded-xl cursor-pointer"
                  >
                    Создать программу
                  </button>
                  <button
                    type="button"
                    onClick={onStartCustomQuickWorkout}
                    className="px-4 py-2.5 bg-[#12241C] border border-[#234736] text-xs font-bold text-[#58C995] rounded-xl cursor-pointer"
                  >
                    Быстрый старт
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* C. Quick Actions Compact Bar */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onCreateProgram}
              className="py-3 px-3.5 bg-[#11181B] hover:bg-[#152024] border border-[#1E282B] hover:border-[#2D453C] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#E8E9E7] cursor-pointer shadow-sm"
            >
              <div className="w-7 h-7 rounded-xl bg-[#152024] text-[#58C995] flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span>Создать программу</span>
            </button>

            <button
              type="button"
              onClick={onGenerateProgram}
              className="py-3 px-3.5 bg-[#12231B] hover:bg-[#162D23] border border-[#234535] hover:border-[#58C995] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#58C995] cursor-pointer shadow-sm"
            >
              <div className="w-7 h-7 rounded-xl bg-[#1A382C] text-[#58C995] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span>AI Генератор</span>
            </button>
          </div>

          {/* D. My Programs Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-0.5">
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

            {/* Programs Carousel / List */}
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {programs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProgramId(p.id)}
                  className={`px-4 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-colors border cursor-pointer ${
                    selectedProgram?.id === p.id
                      ? 'border-[#58C995] bg-[#12241C] text-[#58C995] shadow-sm'
                      : 'border-[#1E282B] bg-[#11181B] text-[#869194] hover:text-[#E8E9E7]'
                  }`}
                >
                  {p.name} ({p.daysPerWeek} дн.)
                </button>
              ))}
            </div>

            {/* Selected Program Details Card */}
            {selectedProgram && (
              <div className="bg-[#11181B] border border-[#1E282B] rounded-3xl p-4.5 space-y-4 shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold text-[#58C995] bg-[#14261E] border border-[#234736] px-2 py-0.5 rounded-md">
                        {selectedProgram.goal}
                      </span>
                      <span className="text-xs text-[#869194]">
                        {selectedProgram.daysPerWeek} тренировочных дня
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#E8E9E7] tracking-tight">{selectedProgram.name}</h3>
                    <p className="text-xs text-[#869194] mt-0.5">{selectedProgram.description}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditProgram(selectedProgram)}
                      className="p-2 text-[#869194] hover:text-[#E8E9E7] rounded-xl hover:bg-[#1A2529] cursor-pointer"
                      title="Редактировать программу"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateProgram(selectedProgram.id)}
                      className="p-2 text-[#869194] hover:text-[#58C995] rounded-xl hover:bg-[#1A2529] cursor-pointer"
                      title="Дублировать программу"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {programs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteProgram(selectedProgram.id)}
                        className="p-2 text-[#869194] hover:text-[#E05353] rounded-xl hover:bg-[#1A2529] cursor-pointer"
                        title="Удалить программу"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

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
                        className="bg-[#0D1518] border border-[#1B272A] rounded-2xl p-3 space-y-2.5"
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
                                onStartProgramWorkout(day, selectedProgram.name, selectedProgram.id);
                              }}
                              className="px-3 py-1.5 bg-[#12241C] border border-[#234736] hover:border-[#58C995] text-[#58C995] rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-[#58C995]" />
                              <span>Старт</span>
                            </button>
                            <ChevronDown className={`w-4 h-4 text-[#869194] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded exercises preview */}
                        {isExpanded && day.exercises && day.exercises.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-[#182326] text-xs">
                            {day.exercises.map((ex, exIdx) => (
                              <div key={exIdx} className="flex items-center justify-between text-[#B2B8BA] py-1 px-2 rounded-lg bg-[#11181B]">
                                <span className="font-medium truncate pr-2">{ex.name}</span>
                                <span className="text-[#869194] tabular-nums shrink-0">{ex.sets} × {ex.reps}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: WORKOUT ANALYTICS */}
      {activeSubTab === 'analytics' && (
        <WorkoutAnalyticsView onStartWorkout={onStartCustomQuickWorkout} />
      )}

      {/* SUB-TAB 3: EXERCISE CATALOG */}
      {activeSubTab === 'library' && (
        <div className="bg-[#11181B] border border-[#1E282B] rounded-3xl p-4 shadow-md">
          <ExerciseLibraryView />
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
              <div className="bg-[#11181B] border border-[#1E282B] rounded-3xl p-4 space-y-3 shadow-md">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#58C995]" />
                  <span className="text-xs font-bold text-[#E8E9E7] uppercase tracking-wider">
                    Личные рекорды в упражнениях
                  </span>
                </div>

                {hasAnyPR ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#0D1518] p-3 rounded-2xl border border-[#1B272A]">
                      <span className="text-[10px] text-[#869194] block">Жим штанги лежа</span>
                      <span className="text-sm font-bold text-[#58C995] tabular-nums">
                        {benchPR ? `${benchPR.maxWeight} кг` : '—'}
                      </span>
                    </div>
                    <div className="bg-[#0D1518] p-3 rounded-2xl border border-[#1B272A]">
                      <span className="text-[10px] text-[#869194] block">Приседания</span>
                      <span className="text-sm font-bold text-[#58C995] tabular-nums">
                        {squatPR ? `${squatPR.maxWeight} кг` : '—'}
                      </span>
                    </div>
                    <div className="bg-[#0D1518] p-3 rounded-2xl border border-[#1B272A]">
                      <span className="text-[10px] text-[#869194] block">Становая тяга</span>
                      <span className="text-sm font-bold text-[#58C995] tabular-nums">
                        {deadliftPR ? `${deadliftPR.maxWeight} кг` : '—'}
                      </span>
                    </div>
                    <div className="bg-[#0D1518] p-3 rounded-2xl border border-[#1B272A]">
                      <span className="text-[10px] text-[#869194] block">Подтягивания</span>
                      <span className="text-sm font-bold text-[#58C995] tabular-nums">
                        {pullupPR ? `${pullupPR.maxWeight > 0 ? `+${pullupPR.maxWeight} кг` : 'свой вес'}` : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#869194] text-center py-2">
                    Рекорды пока не зафиксированы.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Past Sessions List */}
          {sessions.length === 0 ? (
            <div className="p-8 text-center bg-[#11181B] rounded-3xl border border-[#1E282B]">
              <History className="w-8 h-8 text-[#555] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#E8E9E7]">История пуста</p>
              <p className="text-xs text-[#869194] mt-1">
                Завершите свою первую тренировку, чтобы увидеть запись здесь.
              </p>
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                className="bg-[#11181B] border border-[#1E282B] rounded-3xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10.5px] text-[#58C995] font-semibold bg-[#14261E] border border-[#234736] px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Завершено
                      </span>
                      <span className="text-xs text-[#869194]">{sess.date}</span>
                    </div>
                    <h3 className="text-base font-bold text-[#E8E9E7]">{sess.name}</h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteSession(sess.id)}
                    className="p-1.5 text-[#869194] hover:text-[#E05353] cursor-pointer"
                    title="Удалить запись"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 bg-[#0D1518] rounded-2xl px-3 border border-[#1B272A] text-center">
                  <div>
                    <span className="text-[10px] text-[#869194] block">Длительность</span>
                    <span className="text-xs font-bold text-[#E8E9E7] tabular-nums">
                      {sess.durationMinutes} мин
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#869194] block">Тоннаж</span>
                    <span className="text-xs font-bold text-[#58C995] tabular-nums">
                      {sess.totalVolumeKg?.toLocaleString('ru-RU') || 0} кг
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#869194] block">Подходов</span>
                    <span className="text-xs font-bold text-[#E8E9E7] tabular-nums">
                      {sess.completedSets || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
