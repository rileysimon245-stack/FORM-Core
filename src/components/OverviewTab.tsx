import React from 'react';
import { AnnualHeatmapCalendar } from './AnnualHeatmapCalendar';
import { WorkoutProgram, WeeklyScheduleDay } from '../types/workout';
import { Play, Dumbbell, Clock, Calendar, Plus, Swords, Activity, Flame, PlusCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface OverviewTabProps {
  year: number;
  onYearChange: (year: number) => void;
  activityMap: Record<string, 'completed' | 'skipped' | 'none'>;
  recentlyCompletedDate?: string | null;
  stats: {
    total: number;
    completed: number;
    skipped: number;
    streakDays: number;
  };
  totalActivityStats?: {
    completedWorkoutsCount: number;
    completedSportsCount: number;
    totalSessionsCount: number;
    totalActiveMinutes: number;
    totalLoadScore: number;
    sportCounts: Record<string, number>;
  };
  weeklySchedule?: WeeklyScheduleDay[];
  onDayClick: (dateStr: string, currentStatus: 'completed' | 'skipped' | 'none') => void;
  programs: WorkoutProgram[];
  onStartWorkout: (workoutDay: any, programName: string) => void;
  onOpenSettings?: () => void;
  onOpenWeeklySchedule: () => void;
  onOpenSportModal: (date?: string) => void;
  onCreateProgram?: () => void;
  onQuickStart?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  year,
  onYearChange,
  activityMap,
  recentlyCompletedDate,
  stats,
  totalActivityStats,
  weeklySchedule = [],
  onDayClick,
  programs,
  onStartWorkout,
  onOpenWeeklySchedule,
  onOpenSportModal,
  onCreateProgram,
  onQuickStart,
}) => {
  // Format current date in Russian: e.g. "Четверг, 29 октября"
  const now = new Date();
  const todayFormatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  const capitalizedToday = todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1);
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Find today's activity from weekly schedule (0 = Monday, ..., 6 = Sunday)
  const currentDayOfWeek = (now.getDay() + 6) % 7;
  const todaySchedule = weeklySchedule[currentDayOfWeek]?.activities || [];
  const primaryTodayAct = todaySchedule[0] || null;

  // Active program if user has one
  const activeProgram = programs.length > 0 ? programs[0] : null;
  const nextWorkout = activeProgram ? activeProgram.workouts[0] : null;

  return (
    <div className="w-full flex flex-col pb-6 space-y-3.5">
      {/* 1. Top Header: FORM Logo, Date, Streak / Activity Tracker Badge */}
      <div className="flex items-center justify-between pt-1 pb-0.5 px-0.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-black tracking-tight text-[#F2F5F3] font-sans">
              FORM
            </span>
            <span className="w-2 h-2 rounded-full bg-[#56CC97] shadow-[0_0_8px_rgba(86,204,151,0.8)]" />
          </div>
          <span className="text-[11.5px] text-[#6F8A7F] block font-medium tracking-tight mt-0.5">
            {capitalizedToday}
          </span>
        </div>

        {stats.streakDays > 0 ? (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#10251C] border border-[#56CC97]/30 rounded-full text-xs font-bold text-[#56CC97] shadow-[0_2px_10px_rgba(86,204,151,0.12)]">
            <Flame className="w-3.5 h-3.5 fill-[#56CC97] text-[#56CC97]" />
            <span className="tabular-nums">{stats.streakDays} дн. подряд</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#10221A] border border-[#1F3A30] rounded-full text-xs font-medium text-[#C9D3CE]">
            <Activity className="w-3.5 h-3.5 text-[#56CC97]" />
            <span>Дневник активности</span>
          </div>
        )}
      </div>

      {/* 2. Quick Actions Strip: [Расписание недели] [+ Бокс / Спорт] */}
      <div className="grid grid-cols-2 gap-2.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenWeeklySchedule}
          className="py-3 px-4 bg-[#12251E] hover:bg-[#183127] border border-[#1F3A30] hover:border-[#56CC97]/40 rounded-full text-xs font-bold text-[#E2ECE7] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md group"
        >
          <Calendar className="w-4 h-4 text-[#56CC97] transition-transform group-hover:scale-105" />
          <span>Расписание</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onOpenSportModal(todayIso)}
          className="py-3 px-4 bg-[#10251C] hover:bg-[#163124] border border-[#56CC97]/30 hover:border-[#56CC97] rounded-full text-xs font-bold text-[#56CC97] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md group"
        >
          <Plus className="w-4 h-4 text-[#56CC97] transition-transform group-hover:scale-110" />
          <span>+ Спорт / Бокс</span>
        </motion.button>
      </div>

      {/* 3. Recently Completed Workout Banner Notification */}
      {recentlyCompletedDate && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 bg-[#10251C] border border-[#56CC97]/40 rounded-2xl flex items-center gap-2.5 shadow-md"
        >
          <span className="w-2 h-2 rounded-full bg-[#56CC97] animate-ping shrink-0" />
          <p className="text-xs font-semibold text-[#56CC97]">
            Тренировка завершена! Отметка успешно добавлена в календарь.
          </p>
        </motion.div>
      )}

      {/* 4. Total Physical Activity Card with Left Inset Squircle */}
      {totalActivityStats && (
        <div className="relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[rgba(86,204,151,0.18)] rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 space-y-4 shadow-[0_0_40px_rgba(86,204,151,0.08)] before:absolute before:top-0 before:left-0 before:w-48 before:h-48 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.14),transparent_70%)] before:pointer-events-none">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#12251E] border border-[#1F3A30] text-xs font-semibold text-[#C9D3CE]">
              <Activity className="w-3.5 h-3.5 text-[#56CC97]" />
              <span>Физическая активность</span>
            </span>
            <span className="text-xs font-mono font-bold text-[#56CC97] bg-[#10251C] px-3.5 py-1.5 rounded-full border border-[#56CC97]/30 tabular-nums">
              {totalActivityStats.totalLoadScore} баллов
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Inset Squircle with Score */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[20px] bg-[#0B1712] border border-[#1E362C] flex flex-col items-center justify-center shrink-0 shadow-inner">
              <span className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums leading-none">
                {totalActivityStats.totalLoadScore}
              </span>
              <span className="text-[10px] text-[#6F8A7F] font-bold mt-1 uppercase tracking-wider">
                баллов
              </span>
            </div>

            {/* Metrics Breakdown */}
            <div className="flex-1 min-w-0 grid grid-cols-3 divide-x divide-[#1E362C] text-center">
              <div className="px-1">
                <span className="text-[10px] text-[#6F8A7F] block font-bold uppercase tracking-wider">Силовые</span>
                <span className="text-base font-black text-white font-mono tabular-nums mt-0.5 block">
                  {totalActivityStats.completedWorkoutsCount}
                </span>
                <span className="text-[10px] text-[#6F8A7F]">сессий</span>
              </div>
              <div className="px-1">
                <span className="text-[10px] text-[#6F8A7F] block font-bold uppercase tracking-wider">Спорт</span>
                <span className="text-base font-black text-[#5EA2EF] font-mono tabular-nums mt-0.5 block">
                  {totalActivityStats.completedSportsCount}
                </span>
                <span className="text-[10px] text-[#6F8A7F]">занятий</span>
              </div>
              <div className="px-1">
                <span className="text-[10px] text-[#6F8A7F] block font-bold uppercase tracking-wider">Время</span>
                <span className="text-base font-black text-[#56CC97] font-mono tabular-nums mt-0.5 block">
                  {Math.floor(totalActivityStats.totalActiveMinutes / 60)}ч
                </span>
                <span className="text-[10px] text-[#6F8A7F]">{totalActivityStats.totalActiveMinutes % 60}м</span>
              </div>
            </div>
          </div>

          {/* Sports Breakdown Chips */}
          {totalActivityStats.totalSessionsCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#1E362C]">
              {totalActivityStats.sportCounts.strength > 0 && (
                <span className="px-3 py-1 rounded-full bg-[#12251E] text-[#56CC97] border border-[#1F3A30] font-medium text-xs">
                  Силовые: {totalActivityStats.sportCounts.strength}
                </span>
              )}
              {totalActivityStats.sportCounts.boxing > 0 && (
                <span className="px-3 py-1 rounded-full bg-[#281316] text-[#E06D53] border border-[#522023] font-medium text-xs">
                  Бокс: {totalActivityStats.sportCounts.boxing}
                </span>
              )}
              {totalActivityStats.sportCounts.basketball > 0 && (
                <span className="px-3 py-1 rounded-full bg-[#271F11] text-[#E5A93C] border border-[#543E19] font-medium text-xs">
                  Баскетбол: {totalActivityStats.sportCounts.basketball}
                </span>
              )}
              {totalActivityStats.sportCounts.running > 0 && (
                <span className="px-3 py-1 rounded-full bg-[#12202A] text-[#4EA5D9] border border-[#1F394A] font-medium text-xs">
                  Бег: {totalActivityStats.sportCounts.running}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Volm-Style Annual Heatmap Calendar Embedded inside Overview Tab */}
      <AnnualHeatmapCalendar
        activityMap={activityMap}
        onDayClick={onDayClick}
        onOpenSportModal={onOpenSportModal}
        onStartQuickWorkout={onQuickStart}
      />

      {/* 6. Block «Следующая тренировка / План на сегодня» — Derived from Reference Screenshot */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[rgba(86,204,151,0.18)] rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 space-y-4 shadow-[0_0_40px_rgba(86,204,151,0.08)] before:absolute before:top-0 before:left-0 before:w-48 before:h-48 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.14),transparent_70%)] before:pointer-events-none">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#12251E] border border-[#1F3A30] text-xs font-semibold text-[#C9D3CE]">
            <Dumbbell className="w-3.5 h-3.5 text-[#56CC97]" />
            <span>План на сегодня</span>
          </span>
          <span className="text-xs font-mono font-bold text-[#56CC97] bg-[#10251C] border border-[#56CC97]/30 px-3.5 py-1.5 rounded-full">
            {primaryTodayAct ? primaryTodayAct.startTime : 'Сегодня'}
          </span>
        </div>

        {primaryTodayAct ? (
          <div className="space-y-3.5">
            <div className="flex items-center gap-3.5">
              {/* Inset Squircle */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[20px] bg-[#0B1712] border border-[#1E362C] flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-black text-white font-mono tabular-nums leading-none">
                  {primaryTodayAct.durationMinutes}
                </span>
                <span className="text-[10px] text-[#6F8A7F] font-bold mt-1">мин</span>
              </div>

              {/* Title & Specs */}
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="text-lg font-black text-white leading-snug truncate">
                  {primaryTodayAct.title}
                </h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12251E] text-xs text-[#C9D3CE]">
                  <span>{primaryTodayAct.intensity === 'high' ? 'Высокая нагрузка' : 'Средний темп'}</span>
                </div>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpenSportModal(todayIso)}
              className="w-full h-14 sm:h-[58px] bg-[#E06D53] hover:bg-[#eb7b62] text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-full flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <Swords className="w-4 h-4 fill-white" />
              <span>Записать занятие: {primaryTodayAct.title}</span>
            </motion.button>
          </div>
        ) : nextWorkout && activeProgram ? (
          <div className="space-y-4">
            {/* Primary Card Row: Inset Squircle + Specs + Circular CTA */}
            <div className="flex items-center gap-3.5 sm:gap-4">
              {/* Hallmark Inset Squircle with Progress Gauge */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[20px] bg-[#0B1712] border border-[#1E362C] shrink-0 flex flex-col items-center justify-center relative shadow-inner">
                <svg className="w-full h-full transform -rotate-90 p-1" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" stroke="#1E362C" strokeWidth="6" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#56CC97"
                    strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 38}
                    strokeDashoffset={(2 * Math.PI * 38) * 0.25}
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums leading-none">
                    ~{nextWorkout.estimatedDuration || 55}
                  </span>
                  <span className="text-[10px] text-[#6F8A7F] font-bold mt-1">мин</span>
                </div>
              </div>

              {/* Center Content: Title, Category Pill, Specs, Signal */}
              <div className="flex-1 min-w-0 pr-1 space-y-1.5">
                <h3 className="text-lg sm:text-xl font-black text-[#F2F5F3] leading-snug line-clamp-2">
                  {nextWorkout.dayName}
                </h3>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12251E] border border-[#1F3A30] text-xs font-semibold text-[#C9D3CE]">
                  <Dumbbell className="w-3 h-3 text-[#56CC97]" />
                  <span className="truncate">{activeProgram.name}</span>
                </div>

                <div className="text-lg sm:text-xl font-black text-white font-mono tracking-tight mt-1">
                  {nextWorkout.exercises?.length || 4} упр · {nextWorkout.exercises?.reduce((acc, ex) => acc + (ex.sets || 4), 0)} подходов
                </div>
              </div>

              {/* Right Circular Start Button */}
              <button
                type="button"
                onClick={() => onStartWorkout(nextWorkout, activeProgram.name)}
                className="w-12 h-12 rounded-full bg-[#56CC97] hover:bg-[#62d6a1] text-[#08100D] flex items-center justify-center shadow-[0_0_16px_rgba(86,204,151,0.35)] cursor-pointer active:scale-95 transition-all shrink-0"
                title="Начать тренировку"
              >
                <Play className="w-5 h-5 fill-[#08100D] ml-0.5" />
              </button>
            </div>

            {/* Secondary Capsule Bar matching screenshot */}
            <div
              onClick={() => onStartWorkout(nextWorkout, activeProgram.name)}
              className="rounded-full bg-[#10221A] border border-[#1F3A30] hover:border-[#56CC97]/40 py-3.5 px-5 flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2ECE7] shadow-inner cursor-pointer transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#C9D3CE]">
                <Clock className="w-4 h-4 text-[#56CC97]" />
                <span className="font-bold text-[#F2F5F3]">
                  Длительность сессии: ~{nextWorkout.estimatedDuration || 55} мин
                </span>
              </div>
              <span className="text-xs font-bold text-[#56CC97] flex items-center gap-1">
                <span>Обзор</span>
                <span>›</span>
              </span>
            </div>

            {/* Big Primary CTA Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => onStartWorkout(nextWorkout, activeProgram.name)}
              className="w-full h-14 sm:h-[58px] rounded-full bg-[#56CC97] hover:bg-[#62d6a1] text-[#08100D] font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_4px_24px_rgba(86,204,151,0.25)] flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-[#08100D]" />
              <span>НАЧАТЬ ТРЕНИРОВКУ</span>
            </motion.button>
          </div>
        ) : (
          /* Empty State when no program and no scheduled activity */
          <div className="text-center py-4 space-y-3">
            <p className="text-xs sm:text-sm text-[#C9D3CE]">
              Активных программ пока нет. Создайте программу тренировок или начните свободную сессию.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {onCreateProgram && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onCreateProgram}
                  className="px-4 py-3 bg-[#12251E] border border-[#1F3A30] hover:border-[#56CC97] rounded-full text-xs font-bold text-[#F2F5F3] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-[#56CC97]" />
                  <span>Создать программу</span>
                </motion.button>
              )}
              {onQuickStart && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onQuickStart}
                  className="px-5 py-3 bg-[#56CC97] text-[#08100D] rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-[#62d6a1] transition-colors cursor-pointer shadow-md"
                >
                  <Play className="w-4 h-4 fill-[#08100D]" />
                  <span>Быстрый старт</span>
                </motion.button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
