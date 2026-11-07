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
            <span className="text-2xl font-black tracking-tight text-[#E8E9E7] font-sans">
              FORM
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#58C995] shadow-[0_0_6px_rgba(88,201,149,0.8)]" />
          </div>
          <span className="text-[11.5px] text-[#869194] block font-medium tracking-tight mt-0.5">
            {capitalizedToday}
          </span>
        </div>

        {stats.streakDays > 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#12241C] border border-[#234736] rounded-xl text-xs font-bold text-[#58C995] shadow-[0_2px_10px_rgba(88,201,149,0.12)]">
            <Flame className="w-3.5 h-3.5 fill-[#58C995] text-[#58C995]" />
            <span className="tabular-nums">{stats.streakDays} дн. подряд</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#11181B] border border-[#1E282B] rounded-xl text-xs font-medium text-[#869194]">
            <Activity className="w-3.5 h-3.5 text-[#58C995]" />
            <span>Дневник активности</span>
          </div>
        )}
      </div>

      {/* 2. Quick Actions Strip: [Расписание недели] [+ Бокс / Спорт] */}
      <div className="grid grid-cols-2 gap-2.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenWeeklySchedule}
          className="py-2.5 px-3 bg-[#11181B] hover:bg-[#152024] border border-[#1E282B] hover:border-[#2D453C] rounded-2xl text-xs font-semibold text-[#E8E9E7] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm group"
        >
          <Calendar className="w-4 h-4 text-[#58C995] transition-transform group-hover:scale-105" />
          <span>Расписание</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onOpenSportModal(todayIso)}
          className="py-2.5 px-3 bg-[#12231B] hover:bg-[#162D23] border border-[#234535] hover:border-[#58C995] rounded-2xl text-xs font-bold text-[#58C995] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm group"
        >
          <Plus className="w-4 h-4 text-[#58C995] transition-transform group-hover:scale-110" />
          <span>+ Спорт / Бокс</span>
        </motion.button>
      </div>

      {/* 3. Recently Completed Workout Banner Notification */}
      {recentlyCompletedDate && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-[#12241C] border border-[#27533E] rounded-2xl flex items-center gap-2.5 shadow-md"
        >
          <span className="w-2 h-2 rounded-full bg-[#58C995] animate-ping shrink-0" />
          <p className="text-xs font-semibold text-[#58C995]">
            Тренировка завершена! Отметка успешно добавлена в календарь.
          </p>
        </motion.div>
      )}

      {/* 4. Total Physical Activity Strip */}
      {totalActivityStats && (
        <div className="bg-[#11181B] border border-[#1E282B] rounded-2xl p-3.5 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-[#7E8B8E] uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#58C995]" />
              Физическая активность
            </span>
            <span className="text-[11px] font-bold text-[#58C995] bg-[#14261E] px-2 py-0.5 rounded-lg border border-[#244A37] tabular-nums">
              {totalActivityStats.totalLoadScore} баллов
            </span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-[#1D272A] py-1 text-center">
            <div className="px-1">
              <span className="text-[10px] text-[#7E8B8E] block font-medium">Силовые</span>
              <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                {totalActivityStats.completedWorkoutsCount} <span className="text-[10px] font-normal text-[#7E8B8E]">трен.</span>
              </span>
            </div>
            <div className="px-1">
              <span className="text-[10px] text-[#7E8B8E] block font-medium">Другой спорт</span>
              <span className="text-sm font-bold text-[#E06D53] tabular-nums">
                {totalActivityStats.completedSportsCount} <span className="text-[10px] font-normal text-[#7E8B8E]">сессий</span>
              </span>
            </div>
            <div className="px-1">
              <span className="text-[10px] text-[#7E8B8E] block font-medium">Общее время</span>
              <span className="text-sm font-bold text-[#58C995] tabular-nums">
                {Math.floor(totalActivityStats.totalActiveMinutes / 60)}ч {totalActivityStats.totalActiveMinutes % 60}м
              </span>
            </div>
          </div>

          {/* Sports Breakdown Badges if any */}
          {totalActivityStats.totalSessionsCount > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px] border-t border-[#182326] pt-2.5">
              {totalActivityStats.sportCounts.strength > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#14231b] text-[#58C995] border border-[#234233] font-medium text-[10.5px]">
                  Силовые: {totalActivityStats.sportCounts.strength}
                </span>
              )}
              {totalActivityStats.sportCounts.boxing > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#241716] text-[#E06D53] border border-[#422320] font-medium text-[10.5px]">
                  Бокс: {totalActivityStats.sportCounts.boxing}
                </span>
              )}
              {totalActivityStats.sportCounts.basketball > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#261E14] text-[#E5A93C] border border-[#42331C] font-medium text-[10.5px]">
                  Баскетбол: {totalActivityStats.sportCounts.basketball}
                </span>
              )}
              {totalActivityStats.sportCounts.running > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#141F26] text-[#4EA5D9] border border-[#203644] font-medium text-[10.5px]">
                  Бег: {totalActivityStats.sportCounts.running}
                </span>
              )}
              {totalActivityStats.sportCounts.cycling > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#14241A] text-[#44CF6C] border border-[#22442D] font-medium text-[10.5px]">
                  Вело: {totalActivityStats.sportCounts.cycling}
                </span>
              )}
              {totalActivityStats.sportCounts.swimming > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#122324] text-[#2EC4B6] border border-[#1E3F40] font-medium text-[10.5px]">
                  Плавание: {totalActivityStats.sportCounts.swimming}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[#6b7577] text-center pt-0.5">
              Пока нет завершённых тренировок
            </p>
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

      {/* 6. Block «План на сегодня / Следующая активность» */}
      <div className="w-full bg-[#11181B] border border-[#1E282B] rounded-2xl p-4 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-bold text-[#7E8B8E] uppercase tracking-wider">
            План на сегодня
          </span>
          <span className="text-[11px] text-[#58C995] font-semibold bg-[#14261E] border border-[#244A37] px-2.5 py-0.5 rounded-full">
            {primaryTodayAct ? primaryTodayAct.startTime : 'Сегодня'}
          </span>
        </div>

        {primaryTodayAct ? (
          <div>
            <h3 className="text-base font-bold text-[#E8E9E7] tracking-tight">
              {primaryTodayAct.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-[#869194] mt-1.5">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#58C995]" />
                <span className="tabular-nums">~{primaryTodayAct.durationMinutes} мин</span>
              </div>
              <span className="text-[#E06D53] font-medium">
                {primaryTodayAct.intensity === 'high' ? 'Высокая интенсивность' : primaryTodayAct.intensity === 'medium' ? 'Средний темп' : 'Низкая нагрузка'}
              </span>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpenSportModal(todayIso)}
              className="w-full py-3 mt-3.5 bg-[#E06D53] hover:bg-[#eb7b62] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Swords className="w-4 h-4 fill-white" />
              <span>Записать занятие: {primaryTodayAct.title}</span>
            </motion.button>
          </div>
        ) : nextWorkout && activeProgram ? (
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#E8E9E7] tracking-tight">
                  {nextWorkout.dayName}
                </h3>
                <p className="text-xs text-[#869194] mt-0.5">
                  Программа: <span className="text-[#58C995] font-medium">{activeProgram.name}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 text-xs text-[#869194] mt-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#58C995]" />
                <span className="tabular-nums">~{nextWorkout.estimatedDuration || 55} мин</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-[#58C995]" />
                <span className="tabular-nums">{nextWorkout.exercises?.length || 0} упражнений</span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onStartWorkout(nextWorkout, activeProgram.name)}
              className="w-full py-3 mt-3.5 bg-[#58C995] hover:bg-[#68d7a4] text-[#080D0E] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(88,201,149,0.25)] transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-[#080D0E] stroke-[#080D0E]" />
              <span>Начать тренировку</span>
            </motion.button>
          </div>
        ) : (
          /* Empty State when no program and no scheduled activity */
          <div className="text-center py-2 space-y-2.5">
            <p className="text-xs text-[#869194]">
              Активных программ пока нет. Создайте программу тренировок или начните свободную сессию.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {onCreateProgram && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onCreateProgram}
                  className="px-3 py-2 bg-[#152024] border border-[#223035] hover:border-[#58C995] rounded-xl text-xs font-semibold text-[#E8E9E7] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#58C995]" />
                  <span>Создать программу</span>
                </motion.button>
              )}
              {onQuickStart && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onQuickStart}
                  className="px-3.5 py-2 bg-[#14261E] border border-[#254A37] rounded-xl text-xs font-bold text-[#58C995] flex items-center gap-1.5 hover:bg-[#1a3328] transition-colors cursor-pointer"
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
