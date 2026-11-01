import React from 'react';
import { MonthCalendar } from './MonthCalendar';
import { WorkoutProgram, WeeklyScheduleDay } from '../types/workout';
import { Play, Settings, Dumbbell, Clock, Calendar, Plus, Swords, Trophy, Zap, Activity, Flame, PlusCircle } from 'lucide-react';
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
    <div className="w-full flex flex-col pb-4">
      {/* Top Header: FORM Logo, Date, Settings icon */}
      <div className="flex items-center justify-between pt-2 pb-1 px-1 mb-2">
        <div>
          <span className="text-2xl font-black tracking-wider text-[#E8E9E7] font-mono">
            FORM
          </span>
          <span className="text-[11px] text-[#92999A] block font-medium">
            {capitalizedToday}
          </span>
        </div>

        {stats.streakDays > 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#14231b] border border-[#2f553f] rounded-xl text-xs font-bold text-[#58C995] shadow-sm">
            <Flame className="w-3.5 h-3.5 fill-[#58C995]" />
            <span>{stats.streakDays} дн. подряд</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#101719] border border-[#252D2F] rounded-xl text-xs font-semibold text-[#92999A]">
            <Activity className="w-3.5 h-3.5 text-[#58C995]" />
            <span>Трекер активности</span>
          </div>
        )}
      </div>

      {/* Quick Actions Strip: [Расписание недели] [+ Бокс / Спорт] */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onOpenWeeklySchedule}
          className="py-2.5 px-3 bg-[#101719] border border-[#252D2F] hover:border-[#58C995] rounded-xl text-xs font-bold text-[#E8E9E7] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm group"
        >
          <Calendar className="w-4 h-4 text-[#58C995] group-hover:scale-110 transition-transform" />
          <span>Расписание недели</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onOpenSportModal(todayIso)}
          className="py-2.5 px-3 bg-[#14231b] border border-[#2f553f] hover:border-[#58C995] rounded-xl text-xs font-bold text-[#58C995] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm group"
        >
          <Plus className="w-4 h-4 text-[#58C995] group-hover:scale-110 transition-transform" />
          <span>+ Бокс / Спорт</span>
        </motion.button>
      </div>

      {/* Recently Completed Workout Banner Notification */}
      {recentlyCompletedDate && (
        <div className="mb-3 p-3 bg-[#14231b] border border-[#2f553f] rounded-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="w-2.5 h-2.5 rounded-full bg-[#58C995] animate-ping" />
          <p className="text-xs font-semibold text-[#58C995]">
            Тренировка завершена! Отметка успешно добавлена в календарь.
          </p>
        </div>
      )}

      {/* Total Physical Activity Strip */}
      {totalActivityStats && (
        <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-3.5 mb-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#92999A] uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-[#58C995]" />
              Общая физическая активность
            </span>
            <span className="text-[11px] font-bold text-[#58C995] bg-[#14231b] px-2 py-0.5 rounded-md border border-[#2f553f]">
              {totalActivityStats.totalLoadScore} баллов нагрузки
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-1 bg-[#080D0E] rounded-xl p-2 border border-[#202729] text-center text-xs">
            <div>
              <span className="text-[10px] text-[#92999A] block">Силовые</span>
              <span className="font-bold text-[#E8E9E7] tabular-nums">
                {totalActivityStats.completedWorkoutsCount} сессий
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#92999A] block">Другой спорт</span>
              <span className="font-bold text-[#E06D53] tabular-nums">
                {totalActivityStats.completedSportsCount} занятий
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#92999A] block">Общее время</span>
              <span className="font-bold text-[#58C995] tabular-nums">
                {Math.floor(totalActivityStats.totalActiveMinutes / 60)}ч {totalActivityStats.totalActiveMinutes % 60}м
              </span>
            </div>
          </div>

          {/* Sports Breakdown Badges if any */}
          {totalActivityStats.totalSessionsCount > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px]">
              {totalActivityStats.sportCounts.strength > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[#14231b] text-[#58C995] border border-[#2f553f] font-semibold">
                  🏋️ {totalActivityStats.sportCounts.strength} силовых
                </span>
              )}
              {totalActivityStats.sportCounts.boxing > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[#2a1714] text-[#E06D53] border border-[#552720] font-semibold">
                  🥊 {totalActivityStats.sportCounts.boxing} бокс
                </span>
              )}
              {totalActivityStats.sportCounts.basketball > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[#2b2210] text-[#E5A93C] border border-[#54431e] font-semibold">
                  🏀 {totalActivityStats.sportCounts.basketball} баскетбол
                </span>
              )}
              {totalActivityStats.sportCounts.running > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[#12222d] text-[#4EA5D9] border border-[#234257] font-semibold">
                  🏃 {totalActivityStats.sportCounts.running} бег
                </span>
              )}
              {totalActivityStats.sportCounts.cycling > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[#12281a] text-[#44CF6C] border border-[#235034] font-semibold">
                  🚴 {totalActivityStats.sportCounts.cycling} вело
                </span>
              )}
              {totalActivityStats.sportCounts.swimming > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[#102726] text-[#2EC4B6] border border-[#1f4e4c] font-semibold">
                  🏊 {totalActivityStats.sportCounts.swimming} плавание
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[#6b7577] text-center pt-1">
              Пока нет завершенных тренировок
            </p>
          )}
        </div>
      )}

      {/* Main Month Activity Calendar (No scrollbars, fits mobile viewport perfectly) */}
      <MonthCalendar
        activityMap={activityMap}
        onDayClick={onDayClick}
        recentlyCompletedDate={recentlyCompletedDate}
        onYearChange={onYearChange}
        weeklySchedule={weeklySchedule}
      />

      {/* Block «Следующая активность / План на сегодня» */}
      <div className="w-full bg-[#101719] border border-[#252D2F] rounded-2xl p-4 mt-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider">
            План на сегодня
          </span>
          <span className="text-xs text-[#58C995] font-semibold bg-[#14231b] border border-[#2f553f] px-2.5 py-0.5 rounded-full">
            {primaryTodayAct ? primaryTodayAct.startTime : 'Сегодня'}
          </span>
        </div>

        {primaryTodayAct ? (
          <div>
            <h3 className="text-base font-bold text-[#E8E9E7]">
              {primaryTodayAct.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-[#92999A] mt-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#92999A]" />
                <span>~{primaryTodayAct.durationMinutes} мин</span>
              </div>
              <span className="font-semibold text-[#E06D53]">
                {primaryTodayAct.intensity === 'high' ? 'Высокая интенсивность' : primaryTodayAct.intensity === 'medium' ? 'Средний темп' : 'Низкая нагрузка'}
              </span>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpenSportModal(todayIso)}
              className="w-full py-3 mt-3 bg-[#E06D53] hover:bg-[#eb7b62] text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Swords className="w-4 h-4 fill-white" />
              <span>Записать занятие: {primaryTodayAct.title}</span>
            </motion.button>
          </div>
        ) : nextWorkout && activeProgram ? (
          <div>
            <h3 className="text-base font-bold text-[#E8E9E7]">
              {nextWorkout.dayName}
            </h3>
            <p className="text-xs text-[#92999A] mt-0.5">
              Программа: <span className="text-[#58C995] font-medium">{activeProgram.name}</span>
            </p>
            <div className="flex items-center gap-3 text-xs text-[#92999A] mt-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#92999A]" />
                <span>~{nextWorkout.estimatedDuration || 55} мин</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-[#92999A]" />
                <span>{nextWorkout.exercises?.length || 0} упражнений</span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onStartWorkout(nextWorkout, activeProgram.name)}
              className="w-full py-3 mt-3 bg-[#58C995] hover:bg-[#68d7a4] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black stroke-black" />
              <span>Начать тренировку</span>
            </motion.button>
          </div>
        ) : (
          /* Empty State when no program and no scheduled activity */
          <div className="text-center py-2 space-y-2">
            <p className="text-xs text-[#92999A]">
              Активных программ пока нет. Создайте программу тренировок или начните свободную сессию.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {onCreateProgram && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onCreateProgram}
                  className="px-3 py-2 bg-[#101719] border border-[#252D2F] hover:border-[#58C995] rounded-xl text-xs font-bold text-[#E8E9E7] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#58C995]" />
                  <span>Создать программу</span>
                </motion.button>
              )}
              {onQuickStart && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onQuickStart}
                  className="px-3 py-2 bg-[#172d24] border border-[#2d5843] rounded-xl text-xs font-bold text-[#58C995] flex items-center gap-1.5 hover:bg-[#1e3c30] transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-[#58C995]" />
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
