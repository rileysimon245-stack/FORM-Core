import React, { useState, useMemo } from 'react';
import { MusclePeriod, MuscleGroup, MUSCLE_DEFINITIONS } from '../types/workout';
import { StorageService } from '../services/storage';
import {
  Activity,
  Calendar,
  Dumbbell,
  Clock,
  TrendingUp,
  TrendingDown,
  Layers,
  ChevronRight,
  Flame,
  Award,
  BarChart3,
  Percent,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DS, DS_CARD, DS_BUTTON, DS_TYPO } from '../styles/designSystem';

interface WorkoutAnalyticsViewProps {
  onStartWorkout?: () => void;
}

// Major Muscle Group Category mapping
interface MuscleCategorySummary {
  id: string;
  nameRu: string;
  muscles: MuscleGroup[];
  totalSets: number;
  totalVolumeKg: number;
  distinctExercisesCount: number;
  sharePercent: number;
  status: 'recovered' | 'recovering' | 'fatigued';
}

const MAJOR_CATEGORIES: { id: string; nameRu: string; muscles: MuscleGroup[] }[] = [
  {
    id: 'chest',
    nameRu: 'Грудные мышцы',
    muscles: ['chest', 'chest_upper', 'chest_mid', 'chest_lower'],
  },
  {
    id: 'back',
    nameRu: 'Спина',
    muscles: ['lats', 'traps', 'lowerback', 'traps_upper', 'traps_mid', 'traps_lower', 'rhomboids'],
  },
  {
    id: 'shoulders',
    nameRu: 'Плечи (Дельты)',
    muscles: ['shoulders', 'front_delts', 'side_delts', 'rear_delts', 'rearDelts'],
  },
  {
    id: 'arms',
    nameRu: 'Руки (Бицепс, Трицепс, Предплечья)',
    muscles: ['biceps', 'triceps', 'forearms', 'brachialis'],
  },
  {
    id: 'legs',
    nameRu: 'Ноги и ягодицы',
    muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'tibialis', 'quads_rectus', 'quads_lateralis', 'quads_medialis'],
  },
  {
    id: 'core',
    nameRu: 'Кор и пресс',
    muscles: ['abs', 'obliques'],
  },
];

export const WorkoutAnalyticsView: React.FC<WorkoutAnalyticsViewProps> = ({ onStartWorkout }) => {
  const [musclePeriod, setMusclePeriod] = useState<MusclePeriod>('30d');
  const [showDetailedMuscles, setShowDetailedMuscles] = useState(false);

  // Compute analytics from StorageService
  const analytics = useMemo(() => {
    return StorageService.getWorkoutAnalytics(musclePeriod);
  }, [musclePeriod]);

  // Aggregate muscle load into major categories
  const categoriesSummary = useMemo(() => {
    const raw = analytics.rawMuscleStats;
    let totalAllVolume = 0;

    const list: MuscleCategorySummary[] = MAJOR_CATEGORIES.map((cat) => {
      let catVolume = 0;
      let catSets = 0;
      const exSet = new Set<string>();
      let isFatigued = false;
      let isRecovering = false;

      cat.muscles.forEach((m) => {
        const mStat = raw[m];
        if (mStat && mStat.hasData) {
          catVolume += mStat.weeklyTonnageKg || 0;
          catSets += mStat.setsCount || 0;
          if (mStat.status === 'fatigued') isFatigued = true;
          if (mStat.status === 'recovering') isRecovering = true;
          mStat.history?.forEach((h) => exSet.add(h.exerciseName));
        }
      });

      totalAllVolume += catVolume;

      let status: 'recovered' | 'recovering' | 'fatigued' = 'recovered';
      if (isFatigued) status = 'fatigued';
      else if (isRecovering) status = 'recovering';

      return {
        id: cat.id,
        nameRu: cat.nameRu,
        muscles: cat.muscles,
        totalSets: catSets,
        totalVolumeKg: Math.round(catVolume),
        distinctExercisesCount: exSet.size,
        sharePercent: 0,
        status,
      };
    });

    return list.map((item) => ({
      ...item,
      sharePercent: totalAllVolume > 0 ? Math.round((item.totalVolumeKg / totalAllVolume) * 100) : 0,
    }));
  }, [analytics.rawMuscleStats]);

  // Helper formatting for tonnage
  const formatTonnage = (kg: number) => {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)} т`;
    }
    return `${kg} кг`;
  };

  // Deltas for week and month workouts
  const weekDiff = analytics.weekWorkoutsCount - analytics.prevWeekWorkoutsCount;
  const monthDiff = analytics.monthWorkoutsCount - analytics.prevMonthWorkoutsCount;

  // Max count in weekly dynamics for bar scale calculation
  const maxWeeklyWorkouts = useMemo(() => {
    const max = Math.max(...analytics.weeklyDynamics.map((w) => w.count), 1);
    return Math.max(max, 4);
  }, [analytics.weeklyDynamics]);

  // Max volume in monthly dynamics for bar scale calculation
  const maxMonthlyVolume = useMemo(() => {
    const max = Math.max(...analytics.monthlyDynamics.map((m) => m.volumeKg), 1);
    return Math.max(max, 5000);
  }, [analytics.monthlyDynamics]);

  return (
    <div className="space-y-4 select-none pb-4">
      {/* Header with Title and Metric icon */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#F0F3F2]">
            Аналитика тренировок
          </h2>
          <p className="text-[11px] text-[#9AA3A5]">
            Общая статистика, динамика прогресса и распределение нагрузки
          </p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-[#11241C] border border-[#2A5943] flex items-center justify-center text-[#58C995] shrink-0">
          <BarChart3 className="w-4 h-4 text-[#58C995]" />
        </div>
      </div>

      {/* Empty State if no workouts completed yet */}
      {analytics.totalCompletedWorkouts === 0 ? (
        <div className={`${DS_CARD.base} p-8 text-center space-y-3`}>
          <div className="w-12 h-12 rounded-2xl bg-[#11241C] border border-[#2A5943] flex items-center justify-center mx-auto text-[#58C995]">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F0F3F2]">Пока нет завершённых тренировок</h3>
            <p className="text-xs text-[#9AA3A5] mt-1 max-w-xs mx-auto">
              Завершите свою первую тренировку, чтобы здесь появились графики динамики, объёма и распределения нагрузки по мышцам.
            </p>
          </div>
          {onStartWorkout && (
            <button
              onClick={onStartWorkout}
              className={DS_BUTTON.primary + ' mx-auto'}
            >
              Начать тренировку
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 1. General Statistics KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Total Workouts */}
            <div className="bg-[#121A1C] border border-[#1C2628] rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#9AA3A5] mb-1">
                <span className="text-[11px] font-medium">Тренировки</span>
                <Dumbbell className="w-3.5 h-3.5 text-[#58C995]" />
              </div>
              <div>
                <span className="text-xl font-bold font-mono tabular-nums text-[#F0F3F2]">
                  {analytics.totalCompletedWorkouts}
                </span>
                <span className="text-[10px] text-[#5F6B6E] block mt-0.5">завершено</span>
              </div>
            </div>

            {/* Total Completed Sets */}
            <div className="bg-[#121A1C] border border-[#1C2628] rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#9AA3A5] mb-1">
                <span className="text-[11px] font-medium">Подходы</span>
                <Layers className="w-3.5 h-3.5 text-[#58C995]" />
              </div>
              <div>
                <span className="text-xl font-bold font-mono tabular-nums text-[#F0F3F2]">
                  {analytics.totalCompletedSets}
                </span>
                <span className="text-[10px] text-[#5F6B6E] block mt-0.5">выполнено сетов</span>
              </div>
            </div>

            {/* Total Training Volume */}
            <div className="bg-[#121A1C] border border-[#1C2628] rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#9AA3A5] mb-1">
                <span className="text-[11px] font-medium">Общий тоннаж</span>
                <Flame className="w-3.5 h-3.5 text-[#58C995]" />
              </div>
              <div>
                <span className="text-xl font-bold font-mono tabular-nums text-[#58C995]">
                  {formatTonnage(analytics.totalVolumeKg)}
                </span>
                <span className="text-[10px] text-[#5F6B6E] block mt-0.5">суммарный вес</span>
              </div>
            </div>

            {/* Average Duration */}
            <div className="bg-[#121A1C] border border-[#1C2628] rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#9AA3A5] mb-1">
                <span className="text-[11px] font-medium">Ср. время</span>
                <Clock className="w-3.5 h-3.5 text-[#58C995]" />
              </div>
              <div>
                <span className="text-xl font-bold font-mono tabular-nums text-[#F0F3F2]">
                  {analytics.avgDurationMinutes}
                </span>
                <span className="text-[10px] text-[#5F6B6E] block mt-0.5">минут за сессию</span>
              </div>
            </div>
          </div>

          {/* Period Rates & Comparisons: Week and Month */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Week Activity Card */}
            <div className="bg-[#121A1C] border border-[#1C2628] rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#F0F3F2]">На этой неделе</span>
                {weekDiff !== 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                      weekDiff > 0
                        ? 'bg-[#11241C] text-[#58C995] border border-[#2A5943]'
                        : 'bg-[#261315] text-[#E04848] border border-[#522023]'
                    }`}
                  >
                    {weekDiff > 0 ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    <span>{weekDiff > 0 ? `+${weekDiff}` : weekDiff} к пред. нед.</span>
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-[#F0F3F2]">
                  {analytics.weekWorkoutsCount}
                </span>
                <span className="text-xs text-[#9AA3A5]">тренировок</span>
              </div>
              <div className="text-[11px] text-[#9AA3A5] flex items-center justify-between pt-1 border-t border-[#161F21]">
                <span>Объём недели:</span>
                <span className="font-semibold text-[#58C995] font-mono tabular-nums">
                  {formatTonnage(analytics.weekVolumeKg)}
                </span>
              </div>
            </div>

            {/* Month Activity Card */}
            <div className="bg-[#121A1C] border border-[#1C2628] rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#F0F3F2]">В этом месяце</span>
                {monthDiff !== 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                      monthDiff > 0
                        ? 'bg-[#11241C] text-[#58C995] border border-[#2A5943]'
                        : 'bg-[#261315] text-[#E04848] border border-[#522023]'
                    }`}
                  >
                    {monthDiff > 0 ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    <span>{monthDiff > 0 ? `+${monthDiff}` : monthDiff} к пред. мес.</span>
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-[#F0F3F2]">
                  {analytics.monthWorkoutsCount}
                </span>
                <span className="text-xs text-[#9AA3A5]">тренировок</span>
              </div>
              <div className="text-[11px] text-[#9AA3A5] flex items-center justify-between pt-1 border-t border-[#161F21]">
                <span>Объём месяца:</span>
                <span className="font-semibold text-[#58C995] font-mono tabular-nums">
                  {formatTonnage(analytics.monthVolumeKg)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Dynamics: Weekly Workouts Bar Chart (8 weeks) */}
          <div className={`${DS_CARD.base} space-y-3`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F0F3F2]">
                  Динамика тренировок по неделям
                </h3>
                <span className="text-[11px] text-[#9AA3A5]">
                  Количество занятий за последние 8 недель
                </span>
              </div>
              <div className="text-[11px] text-[#58C995] font-semibold bg-[#11241C] border border-[#2A5943] px-2 py-0.5 rounded-lg">
                8 недель
              </div>
            </div>

            {/* Weekly Bars Grid */}
            <div className="pt-4 pb-1">
              <div className="grid grid-cols-8 gap-2 items-end h-28 border-b border-[#161F21] pb-2">
                {analytics.weeklyDynamics.map((w, idx) => {
                  const heightPercent = Math.max(6, Math.round((w.count / maxWeeklyWorkouts) * 100));
                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Tooltip on hover/active */}
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0A1012] border border-[#1C2628] text-[10px] text-[#F0F3F2] px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-20">
                        {w.count} тр. • {formatTonnage(w.volumeKg)}
                      </div>

                      {/* Number above bar */}
                      <span
                        className={`text-[10px] font-mono tabular-nums mb-1 font-bold ${
                          w.count > 0 ? (w.isCurrentWeek ? 'text-[#58C995]' : 'text-[#F0F3F2]') : 'text-[#4A5558]'
                        }`}
                      >
                        {w.count > 0 ? w.count : '·'}
                      </span>

                      {/* Bar */}
                      <div className="w-full max-w-[28px] h-full flex items-end">
                        <div
                          style={{ height: `${w.count > 0 ? heightPercent : 4}%` }}
                          className={`w-full rounded-t-md transition-all duration-300 ${
                            w.isCurrentWeek
                              ? 'bg-[#58C995] shadow-sm shadow-[#58C995]/30 ring-1 ring-[#58C995]'
                              : w.count > 0
                              ? 'bg-[#31644E] hover:bg-[#58C995]'
                              : 'bg-[#162124]'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-axis labels */}
              <div className="grid grid-cols-8 gap-2 pt-1.5 text-center text-[10px] text-[#9AA3A5] font-mono">
                {analytics.weeklyDynamics.map((w, idx) => (
                  <span
                    key={idx}
                    className={`truncate ${w.isCurrentWeek ? 'text-[#58C995] font-bold' : ''}`}
                    title={w.rangeLabel}
                  >
                    {w.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 3b. Monthly Volume Dynamics (6 months) */}
          <div className={`${DS_CARD.base} space-y-3`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F0F3F2]">
                  Объём нагрузки по месяцам
                </h3>
                <span className="text-[11px] text-[#9AA3A5]">
                  Суммарный тоннаж за последние 6 месяцев
                </span>
              </div>
              <div className="text-[11px] text-[#58C995] font-semibold bg-[#11241C] border border-[#2A5943] px-2 py-0.5 rounded-lg">
                6 месяцев
              </div>
            </div>

            {/* Monthly Volume Bars */}
            <div className="pt-4 pb-1">
              <div className="grid grid-cols-6 gap-2.5 items-end h-28 border-b border-[#161F21] pb-2">
                {analytics.monthlyDynamics.map((m, idx) => {
                  const heightPercent =
                    maxMonthlyVolume > 0 && m.volumeKg > 0
                      ? Math.max(8, Math.round((m.volumeKg / maxMonthlyVolume) * 100))
                      : 4;

                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Tooltip */}
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0A1012] border border-[#1C2628] text-[10px] text-[#F0F3F2] px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-20">
                        {m.count} тр. • {formatTonnage(m.volumeKg)}
                      </div>

                      {/* Volume text above bar */}
                      <span className="text-[10px] font-mono tabular-nums mb-1 font-semibold text-[#83D9AE] truncate max-w-full">
                        {m.volumeKg > 0 ? (m.volumeKg >= 1000 ? `${(m.volumeKg / 1000).toFixed(0)}т` : `${m.volumeKg}`) : '—'}
                      </span>

                      {/* Bar */}
                      <div className="w-full max-w-[34px] h-full flex items-end">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t-md transition-all duration-300 ${
                            m.isCurrentMonth
                              ? 'bg-[#58C995] shadow-sm shadow-[#58C995]/30'
                              : m.volumeKg > 0
                              ? 'bg-[#2A5943] hover:bg-[#31644E]'
                              : 'bg-[#162124]'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-axis Month labels */}
              <div className="grid grid-cols-6 gap-2.5 pt-1.5 text-center text-[10px] text-[#9AA3A5] font-semibold">
                {analytics.monthlyDynamics.map((m, idx) => (
                  <span
                    key={idx}
                    className={`truncate ${m.isCurrentMonth ? 'text-[#58C995] font-bold' : ''}`}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Muscle Load Distribution (StorageService.getMuscleStats with 7d/30d/90d/all) */}
          <div className={`${DS_CARD.base} space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F0F3F2]">
                  Распределение нагрузки по мышцам
                </h3>
                <span className="text-[11px] text-[#9AA3A5]">
                  На основе реальных завершённых подходов и весов
                </span>
              </div>

              {/* Period Selector Tabs: 7d, 30d, 90d, all */}
              <div className="flex items-center p-0.5 bg-[#0A1012] border border-[#1C2628] rounded-xl self-start sm:self-auto">
                {(
                  [
                    { id: '7d', label: '7 дней' },
                    { id: '30d', label: '30 дней' },
                    { id: '90d', label: '90 дней' },
                    { id: 'all', label: 'Всё время' },
                  ] as const
                ).map((tab) => {
                  const isActive = musclePeriod === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMusclePeriod(tab.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#58C995] text-[#080D0E] shadow-sm font-bold'
                          : 'text-[#9AA3A5] hover:text-[#F0F3F2]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Muscle Categories Breakdown */}
            <div className="space-y-2.5">
              {categoriesSummary.map((cat) => {
                const hasLoad = cat.totalVolumeKg > 0 || cat.totalSets > 0;

                return (
                  <div
                    key={cat.id}
                    className="p-3 bg-[#0A1012] border border-[#161F21] rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#F0F3F2]">{cat.nameRu}</span>
                        {cat.status === 'fatigued' && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#261315] text-[#E04848] border border-[#522023] rounded">
                            Нагрузка
                          </span>
                        )}
                        {cat.status === 'recovering' && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#271F11] text-[#E5A842] border border-[#543E19] rounded">
                            Восстановление
                          </span>
                        )}
                        {cat.status === 'recovered' && hasLoad && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#11241C] text-[#58C995] border border-[#2A5943] rounded">
                            Готова
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-mono tabular-nums text-[#9AA3A5]">
                          {cat.totalSets} сетов
                        </span>
                        <span className="font-mono tabular-nums font-bold text-[#58C995]">
                          {formatTonnage(cat.totalVolumeKg)}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-[#F0F3F2] w-8 text-right">
                          {cat.sharePercent}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-[#162124] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(hasLoad ? 2 : 0, cat.sharePercent)}%` }}
                        transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
                        className={`h-full rounded-full ${
                          hasLoad
                            ? 'bg-gradient-to-r from-[#31644E] to-[#58C995]'
                            : 'bg-transparent'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Toggle Detailed Muscle Groups Breakdown */}
            <div className="pt-2 border-t border-[#161F21]">
              <button
                type="button"
                onClick={() => setShowDetailedMuscles(!showDetailedMuscles)}
                className="w-full h-10 bg-[#0A1012] hover:bg-[#121A1C] border border-[#161F21] rounded-xl text-xs font-semibold text-[#83D9AE] hover:text-[#58C995] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>{showDetailedMuscles ? 'Скрыть детальные пучки' : 'Показать детальные мышцы'}</span>
                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${showDetailedMuscles ? 'rotate-90' : ''}`}
                />
              </button>

              <AnimatePresence>
                {showDetailedMuscles && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-1.5 pt-3 overflow-hidden"
                  >
                    {Object.entries(analytics.rawMuscleStats)
                      .filter(([_, stat]) => stat && stat.hasData)
                      .sort((a, b) => (b[1].weeklyTonnageKg || 0) - (a[1].weeklyTonnageKg || 0))
                      .map(([key, stat]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between py-2 px-3 bg-[#0A1012] rounded-lg text-xs border border-[#161F21]"
                        >
                          <span className="text-[#F0F3F2]">{stat.nameRu}</span>
                          <div className="flex items-center gap-3 font-mono text-[11px]">
                            <span className="text-[#9AA3A5]">{stat.setsCount} подх.</span>
                            <span className="font-bold text-[#58C995]">
                              {formatTonnage(stat.weeklyTonnageKg || 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
