import React from 'react';
import { YearCalendar } from './YearCalendar';
import { WorkoutProgram, WorkoutSession, SportSession, WeeklyScheduleDay, SPORT_DEFINITIONS } from '../types/workout';
import { Play, Settings, Dumbbell, Clock, Calendar, Plus, Swords, Trophy, Zap, Activity, Flame } from 'lucide-react';
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
  onOpenSettings: () => void;
  onOpenWeeklySchedule: () => void;
  onOpenSportModal: (date?: string) => void;
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
  onOpenSettings,
  onOpenWeeklySchedule,
  onOpenSportModal,
}) => {
  // Determine next scheduled workout
  const defaultProgram = programs[0] || null;
  const nextWorkout = defaultProgram?.workouts[0] || {
    id: 'next_default',
    dayName: 'Push: Грудь, Плечи, Трицепс',
    estimatedDuration: 55,
    exercises: [
      { name: 'Жим штанги лежа', targetMuscle: 'chest', sets: 4, reps: 8, targetWeight: 80 },
      { name: 'Армейский жим', targetMuscle: 'shoulders', sets: 3, reps: 8, targetWeight: 50 },
      { name: 'Махи гантелями', targetMuscle: 'shoulders', sets: 4, reps: 12, targetWeight: 14 },
    ],
  };

  const todayFormatted = 'Четверг, 29 октября';

  // Find today's activity from weekly schedule (Thursday = index 3)
  const todaySchedule = weeklySchedule[3]?.activities || [];
  const primaryTodayAct = todaySchedule[0] || null;

  return (
    <div className="w-full flex flex-col pb-24">
      {/* Top Header: FORM Logo, Settings icon */}
      <div className="flex items-center justify-between pt-2 pb-1 px-1 mb-2">
        <div>
          <span className="text-2xl font-black tracking-wider text-[#E8E9E7] font-mono">
            FORM
          </span>
          <span className="text-[11px] text-[#92999A] block font-medium">
            {todayFormatted}
          </span>
        </div>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-xl bg-[#101719] border border-[#252D2F] flex items-center justify-center text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
          aria-label="Настройки и экспорт"
        >
          <Settings className="w-5 h-5" />
        </motion.button>
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
          onClick={() => onOpenSportModal('2026-10-29')}
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

      {/* Overall Total Physical Activity Strip */}
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

          {/* Sports Breakdown Badges */}
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
          </div>
        </div>
      )}

      {/* Title */}
      <div className="mb-2 px-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#E8E9E7]">
          Календарь тренировок
        </h1>
      </div>

      {/* Main Year Activity Calendar */}
      <YearCalendar
        year={year}
        onYearChange={onYearChange}
        activityMap={activityMap}
        onDayClick={onDayClick}
        recentlyCompletedDate={recentlyCompletedDate}
        stats={stats}
      />

      {/* Block «Следующая активность» */}
      <div className="w-full bg-[#101719] border border-[#252D2F] rounded-2xl p-4 mt-2 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider">
            План на сегодня
          </span>
          <span className="text-xs text-[#58C995] font-semibold bg-[#14231b] border border-[#2f553f] px-2.5 py-0.5 rounded-full">
            {primaryTodayAct ? primaryTodayAct.startTime : 'Сегодня, 18:30'}
          </span>
        </div>

        <div>
          <h3 className="text-base font-bold text-[#E8E9E7]">
            {primaryTodayAct ? primaryTodayAct.title : nextWorkout.dayName}
          </h3>
          <div className="flex items-center gap-3 text-xs text-[#92999A] mt-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#92999A]" />
              <span>~{primaryTodayAct ? primaryTodayAct.durationMinutes : nextWorkout.estimatedDuration || 55} мин</span>
            </div>
            {primaryTodayAct ? (
              <span className="font-semibold text-[#E06D53]">
                {primaryTodayAct.intensity === 'high' ? 'Высокая интенсивность' : 'Средний темп'}
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-[#92999A]" />
                <span>{nextWorkout.exercises?.length || 5} упражнений</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Button: Start Workout or Log Sport */}
        {primaryTodayAct && primaryTodayAct.sportType !== 'strength' ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onOpenSportModal('2026-10-29')}
            className="w-full py-3 bg-[#E06D53] hover:bg-[#eb7b62] text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            <Swords className="w-4 h-4 fill-white" />
            <span>Записать занятие: {primaryTodayAct.title}</span>
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() =>
              onStartWorkout(nextWorkout, defaultProgram?.name || 'Push / Pull / Legs')
            }
            className="w-full py-3 bg-[#58C995] hover:bg-[#68d7a4] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-black stroke-black" />
            <span>Начать тренировку</span>
          </motion.button>
        )}
      </div>
    </div>
  );
};
