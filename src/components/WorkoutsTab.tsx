import React, { useState } from 'react';
import {
  WorkoutProgram,
  WorkoutSession,
  ProgramWorkoutDay,
} from '../types/workout';
import { ExerciseLibraryView } from './ExerciseLibraryView';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { tabContentVariants, androidTapFeedback, androidCardTap } from '../utils/animations';

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
  const [activeSubTab, setActiveSubTab] = useState<'programs' | 'library' | 'history'>('programs');
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    programs[0]?.id || ''
  );
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const selectedProgram =
    programs.find((p) => p.id === selectedProgramId) || programs[0] || null;

  // Last finished session
  const lastSession = sessions.length > 0 ? sessions[0] : null;

  return (
    <div className="w-full flex flex-col pb-24">
      {/* Title & Quick Start */}
      <div className="flex items-center justify-between pt-2 mb-3 px-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#E8E9E7]">
          Тренировки
        </h1>

        <motion.button
          onClick={onStartCustomQuickWorkout}
          whileTap={{ scale: 0.95 }}
          className="px-3 py-1.5 bg-[#172d24] border border-[#2d5843] text-[#58C995] rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[#1e3c30] transition-colors cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-[#58C995]" />
          <span>Быстрый старт</span>
        </motion.button>
      </div>

      {/* Active Draft Alert Banner if unfinished workout exists */}
      {activeDraft && onResumeDraft && (
        <div className="mb-4 bg-[#14231b] border border-[#2f553f] rounded-2xl p-3.5 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#203628] text-[#58C995] flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 fill-[#58C995]" />
            </div>
            <div className="truncate">
              <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
                Незавершенная тренировка
              </span>
              <p className="text-xs font-bold text-[#E8E9E7] truncate">{activeDraft.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onDiscardDraft && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onDiscardDraft}
                className="px-2 py-1.5 text-[11px] text-[#92999A] hover:text-[#C83232] rounded-lg transition-colors cursor-pointer"
                title="Сбросить черновик"
              >
                Сброс
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onResumeDraft(activeDraft)}
              className="px-3 py-1.5 bg-[#58C995] text-black font-bold text-xs rounded-xl shadow-md hover:bg-[#68d7a4] transition-colors cursor-pointer"
            >
              Продолжить
            </motion.button>
          </div>
        </div>
      )}

      {/* Sub-navigation tabs: [Программы] [Каталог] [История] */}
      <div className="w-full flex p-1 bg-[#101719] rounded-xl border border-[#252D2F] mb-4 relative">
        <motion.button
          onClick={() => setActiveSubTab('programs')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSubTab === 'programs'
              ? 'text-black font-bold'
              : 'text-[#92999A] hover:text-[#E8E9E7]'
          }`}
        >
          {activeSubTab === 'programs' && (
            <motion.div
              layoutId="workoutsSubTabPill"
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="absolute inset-0 bg-[#58C995] rounded-lg -z-10 shadow-md"
            />
          )}
          Программы ({programs.length})
        </motion.button>
        <motion.button
          onClick={() => setActiveSubTab('library')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSubTab === 'library'
              ? 'text-black font-bold'
              : 'text-[#92999A] hover:text-[#E8E9E7]'
          }`}
        >
          {activeSubTab === 'library' && (
            <motion.div
              layoutId="workoutsSubTabPill"
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="absolute inset-0 bg-[#58C995] rounded-lg -z-10 shadow-md"
            />
          )}
          Каталог упражнений
        </motion.button>
        <motion.button
          onClick={() => setActiveSubTab('history')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSubTab === 'history'
              ? 'text-black font-bold'
              : 'text-[#92999A] hover:text-[#E8E9E7]'
          }`}
        >
          {activeSubTab === 'history' && (
            <motion.div
              layoutId="workoutsSubTabPill"
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="absolute inset-0 bg-[#58C995] rounded-lg -z-10 shadow-md"
            />
          )}
          История ({sessions.length})
        </motion.button>
      </div>

      {/* SUB-TAB 1: PROGRAMS */}
      {activeSubTab === 'programs' && (
        <div className="space-y-4">
          {/* Action buttons: Create manual vs Generate AI */}
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onCreateProgram}
              className="py-3 px-3 bg-[#101719] border border-[#252D2F] hover:border-[#384346] rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#E8E9E7] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#58C995]" />
              <span>Создать программу</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onGenerateProgram}
              className="py-3 px-3 bg-[#14231b] border border-[#2f553f] hover:border-[#58C995] rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#58C995] transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#58C995]" />
              <span>Сгенерировать</span>
            </motion.button>
          </div>

          {/* Quick Shortcuts for Equipment & Parameters */}
          {(onOpenEquipment || onOpenParameters) && (
            <div className="flex gap-2">
              {onOpenParameters && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={onOpenParameters}
                  className="flex-1 py-2 px-3 bg-[#101719] border border-[#252D2F] hover:border-[#384346] rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#58C995]" />
                  <span>Мои параметры</span>
                </motion.button>
              )}
              {onOpenEquipment && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={onOpenEquipment}
                  className="flex-1 py-2 px-3 bg-[#101719] border border-[#252D2F] hover:border-[#384346] rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
                >
                  <Dumbbell className="w-3.5 h-3.5 text-[#58C995]" />
                  <span>Мой инвентарь</span>
                </motion.button>
              )}
            </div>
          )}

          {/* LAST COMPLETED WORKOUT CARD */}
          {lastSession && (
            <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Последняя завершенная тренировка
                </span>
                <span className="text-xs text-[#92999A] tabular-nums">{lastSession.date}</span>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#E8E9E7]">{lastSession.name}</h3>
                <span className="text-xs text-[#92999A]">{lastSession.programName}</span>
              </div>

              {/* Quick stats strip */}
              <div className="grid grid-cols-3 gap-2 py-2 bg-[#080D0E] rounded-xl px-3 border border-[#1b2224] text-center text-xs">
                <div>
                  <span className="text-[10px] text-[#92999A] block">Время</span>
                  <span className="font-bold text-[#E8E9E7] tabular-nums">
                    {lastSession.durationMinutes} мин
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#92999A] block">Тоннаж</span>
                  <span className="font-bold text-[#58C995] tabular-nums">
                    {lastSession.totalVolumeKg?.toLocaleString('ru-RU') || 0} кг
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#92999A] block">Подходов</span>
                  <span className="font-bold text-[#E8E9E7] tabular-nums">
                    {lastSession.completedSets || 0}
                  </span>
                </div>
              </div>

              {lastSession.notes && (
                <p className="text-[11px] text-[#92999A] italic bg-[#080D0E] p-2 rounded-lg border border-[#1b2224]">
                  «{lastSession.notes}»
                </p>
              )}
            </div>
          )}

          {/* Programs selector carousel pills */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block px-1">
              Мои программы ({programs.length})
            </span>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProgramId(p.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedProgram?.id === p.id
                      ? 'border-[#58C995] bg-[#14231b] text-[#58C995]'
                      : 'border-[#252D2F] bg-[#101719] text-[#92999A] hover:text-[#E8E9E7]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Program Details with Full Actions: Open, Start, Edit, Duplicate, Delete */}
          {selectedProgram ? (
            <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-bold text-[#58C995] bg-[#14231b] border border-[#2f553f] px-2 py-0.5 rounded-md">
                      {selectedProgram.goal}
                    </span>
                    <span className="text-xs text-[#92999A]">
                      {selectedProgram.daysPerWeek} дня в неделю
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[#E8E9E7]">{selectedProgram.name}</h2>
                  <p className="text-xs text-[#92999A] mt-1">{selectedProgram.description}</p>
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onEditProgram(selectedProgram)}
                    className="p-2 text-[#92999A] hover:text-[#E8E9E7] rounded-lg hover:bg-[#1c2426] transition-colors"
                    title="Редактировать программу"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDuplicateProgram(selectedProgram.id)}
                    className="p-2 text-[#92999A] hover:text-[#58C995] rounded-lg hover:bg-[#1c2426] transition-colors"
                    title="Дублировать программу"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  {programs.length > 1 && (
                    <button
                      onClick={() => onDeleteProgram(selectedProgram.id)}
                      className="p-2 text-[#92999A] hover:text-[#C83232] rounded-lg hover:bg-[#1c2426] transition-colors"
                      title="Удалить программу"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Start First Day Instant Button */}
              {selectedProgram.workouts.length > 0 && (
                <button
                  onClick={() =>
                    onStartProgramWorkout(
                      selectedProgram.workouts[0],
                      selectedProgram.name,
                      selectedProgram.id
                    )
                  }
                  className="w-full py-2.5 bg-[#58C995] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-[#68d7a4] transition-colors shadow-md cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>Начать тренировку ({selectedProgram.workouts[0].dayName})</span>
                </button>
              )}

              {/* Workout Days in this program */}
              <div className="space-y-3 pt-1">
                <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block">
                  Тренировочные дни ({selectedProgram.workouts.length})
                </span>

                {selectedProgram.workouts.map((day) => {
                  const isExpanded = expandedDayId === day.id;

                  return (
                    <div
                      key={day.id}
                      className="bg-[#080D0E] border border-[#202729] rounded-xl p-3.5 space-y-3"
                    >
                      <div
                        onClick={() => setExpandedDayId(isExpanded ? null : day.id)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <h4 className="text-sm font-bold text-[#E8E9E7]">{day.dayName}</h4>
                          <span className="text-xs text-[#92999A]">
                            {day.exercises.length} упр. • ~{day.estimatedDuration} мин
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="p-1 text-[#92999A] hover:text-[#E8E9E7]"
                            title="Открыть подробности"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#58C995]" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Exercises brief list */}
                      <div className="space-y-1">
                        {day.exercises.map((ex, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs py-1.5 px-2 bg-[#101719] rounded-lg border border-[#1b2224]"
                          >
                            <span className="text-[#c7c9c7]">{ex.name}</span>
                            <span className="text-[#92999A] tabular-nums text-[11px]">
                              {ex.sets} × {ex.reps} {ex.targetWeight > 0 ? `(${ex.targetWeight} кг)` : ''}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Launch Day Workout Button */}
                      <button
                        onClick={() =>
                          onStartProgramWorkout(day, selectedProgram.name, selectedProgram.id)
                        }
                        className="w-full py-2 bg-[#172d24] hover:bg-[#1e3c30] border border-[#2d5843] text-[#58C995] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-[#58C995]" />
                        <span>Начать этот день</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-[#92999A] text-xs bg-[#101719] rounded-2xl border border-[#252D2F]">
              Нет созданных программ. Нажмите «Создать программу» или «Сгенерировать».
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: EXERCISE CATALOG */}
      {activeSubTab === 'library' && (
        <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4">
          <ExerciseLibraryView />
        </div>
      )}

      {/* SUB-TAB 3: WORKOUT HISTORY & PRs */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* Key PRs Overview */}
          <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#58C995]" />
              <span className="text-sm font-bold text-[#E8E9E7]">
                Личные рекорды в упражнениях
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#080D0E] p-2.5 rounded-xl border border-[#202729]">
                <span className="text-[10px] text-[#92999A] block">Жим штанги лежа</span>
                <span className="text-sm font-bold text-[#58C995] tabular-nums">105 кг</span>
                <span className="text-[10px] text-[#92999A] block">на 5 повторений</span>
              </div>
              <div className="bg-[#080D0E] p-2.5 rounded-xl border border-[#202729]">
                <span className="text-[10px] text-[#92999A] block">Приседания со штангой</span>
                <span className="text-sm font-bold text-[#58C995] tabular-nums">135 кг</span>
                <span className="text-[10px] text-[#92999A] block">на 5 повторений</span>
              </div>
              <div className="bg-[#080D0E] p-2.5 rounded-xl border border-[#202729]">
                <span className="text-[10px] text-[#92999A] block">Становая тяга</span>
                <span className="text-sm font-bold text-[#58C995] tabular-nums">155 кг</span>
                <span className="text-[10px] text-[#92999A] block">на 4 повторения</span>
              </div>
              <div className="bg-[#080D0E] p-2.5 rounded-xl border border-[#202729]">
                <span className="text-[10px] text-[#92999A] block">Подтягивания с весом</span>
                <span className="text-sm font-bold text-[#58C995] tabular-nums">+30 кг</span>
                <span className="text-[10px] text-[#92999A] block">на 6 повторений</span>
              </div>
            </div>
          </div>

          {/* Past Sessions List */}
          {sessions.length === 0 ? (
            <div className="p-8 text-center bg-[#101719] rounded-2xl border border-[#252D2F]">
              <History className="w-8 h-8 text-[#555] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#E8E9E7]">История пуста</p>
              <p className="text-xs text-[#92999A] mt-1">
                Завершите свою первую тренировку, чтобы увидеть запись здесь.
              </p>
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-[#58C995] font-semibold bg-[#14231b] border border-[#2f553f] px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Завершено
                      </span>
                      <span className="text-xs text-[#92999A]">{sess.date}</span>
                    </div>
                    <h3 className="text-base font-bold text-[#E8E9E7]">{sess.name}</h3>
                  </div>

                  <button
                    onClick={() => onDeleteSession(sess.id)}
                    className="p-1.5 text-[#92999A] hover:text-[#C83232] transition-colors"
                    title="Удалить запись"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Metrics strip */}
                <div className="grid grid-cols-3 gap-2 py-2 bg-[#080D0E] rounded-xl px-3 border border-[#202729] text-center">
                  <div>
                    <span className="text-[10px] text-[#92999A] block">Длительность</span>
                    <span className="text-xs font-bold text-[#E8E9E7] tabular-nums">
                      {sess.durationMinutes} мин
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#92999A] block">Общий тоннаж</span>
                    <span className="text-xs font-bold text-[#58C995] tabular-nums">
                      {sess.totalVolumeKg?.toLocaleString('ru-RU') || 0} кг
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#92999A] block">Подходов</span>
                    <span className="text-xs font-bold text-[#E8E9E7] tabular-nums">
                      {sess.completedSets || 0}
                    </span>
                  </div>
                </div>

                {/* Exercises logged */}
                {sess.exercises && sess.exercises.length > 0 && (
                  <div className="space-y-1 text-xs">
                    {sess.exercises.map((ex, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1 border-b border-[#202729] last:border-none"
                      >
                        <span className="text-[#c7c9c7]">{ex.name}</span>
                        <span className="text-[#92999A] tabular-nums text-[11px]">
                          {ex.sets.filter((s) => s.completed).length} подходов
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {sess.notes && (
                  <p className="text-[11px] text-[#92999A] italic bg-[#080D0E] p-2 rounded-lg border border-[#202729]">
                    «{sess.notes}»
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
