import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { StorageService } from '../services/storage';
import { ExerciseProgressPoint, MuscleGroup, MUSCLE_DEFINITIONS } from '../types/workout';
import { FullExerciseItem } from '../data/exerciseTypes';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';
import {
  X,
  TrendingUp,
  Dumbbell,
  Repeat,
  Layers,
  Award,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
  CheckCircle2,
} from 'lucide-react';

export type ProgressMetric = 'weight' | 'reps' | 'volume';

interface ExerciseProgressModalProps {
  exercise: FullExerciseItem | { id?: string; name: string; nameEn?: string; primaryMuscle?: MuscleGroup; type?: string };
  onClose: () => void;
}

export const ExerciseProgressModal: React.FC<ExerciseProgressModalProps> = ({
  exercise,
  onClose,
}) => {
  const [metric, setMetric] = useState<ProgressMetric>('weight');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const exerciseName = exercise?.name || '';

  // Fetch real history points strictly from completed workouts in StorageService
  const [history, setHistory] = useState<ExerciseProgressPoint[]>(() =>
    StorageService.getExerciseDetailedHistory(exerciseName)
  );

  // Reactive subscription: auto-refresh if workouts are completed, edited, or deleted
  useEffect(() => {
    if (!exerciseName) return;
    const unsub = StorageService.subscribe(() => {
      const updated = StorageService.getExerciseDetailedHistory(exerciseName);
      setHistory(updated);
    });
    return () => unsub();
  }, [exerciseName]);

  // Keep selectedPointIndex pointing to the latest point by default when data loads
  useEffect(() => {
    if (history.length > 0) {
      setSelectedPointIndex(history.length - 1);
    } else {
      setSelectedPointIndex(null);
    }
  }, [history.length]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Extract metric values
  const getMetricValue = (p: ExerciseProgressPoint, m: ProgressMetric): number => {
    switch (m) {
      case 'weight':
        return p.maxWeight;
      case 'reps':
        return p.maxReps;
      case 'volume':
        return p.volume;
    }
  };

  const getMetricLabel = (m: ProgressMetric): string => {
    switch (m) {
      case 'weight':
        return 'Макс. рабочий вес';
      case 'reps':
        return 'Количество повторений';
      case 'volume':
        return 'Тренировочный объём';
    }
  };

  const getMetricUnit = (m: ProgressMetric): string => {
    switch (m) {
      case 'weight':
        return 'кг';
      case 'reps':
        return 'повт';
      case 'volume':
        return 'кг';
    }
  };

  // KPI Statistics: Best result, Last result, Delta vs previous
  const stats = useMemo(() => {
    if (history.length === 0) {
      return null;
    }

    const values = history.map((p) => getMetricValue(p, metric));
    const bestValue = Math.max(...values);
    const lastValue = values[values.length - 1];
    const prevValue = values.length >= 2 ? values[values.length - 2] : null;

    let delta: number | null = null;
    let deltaPercent: number | null = null;

    if (prevValue !== null) {
      delta = lastValue - prevValue;
      if (prevValue > 0) {
        deltaPercent = Math.round(((lastValue - prevValue) / prevValue) * 100);
      }
    }

    return {
      bestValue,
      lastValue,
      prevValue,
      delta,
      deltaPercent,
      totalSessions: history.length,
    };
  }, [history, metric]);

  // Selected point details (defaults to latest)
  const activePoint: ExerciseProgressPoint | null = useMemo(() => {
    if (history.length === 0) return null;
    if (selectedPointIndex !== null && history[selectedPointIndex]) {
      return history[selectedPointIndex];
    }
    return history[history.length - 1];
  }, [history, selectedPointIndex]);

  // Format full Russian date
  const formatFullDateRu = (isoDate: string): string => {
    if (!isoDate) return '';
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return isoDate;
    }
  };

  // SVG Chart geometry calculations
  const chartData = useMemo(() => {
    if (history.length < 2) return null;

    const width = 520;
    const height = 210;
    const padding = { top: 25, right: 25, bottom: 35, left: 55 };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const values = history.map((p) => getMetricValue(p, metric));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    // Add visual headroom to prevent points touching borders
    const margin = rawMax === rawMin ? (rawMax === 0 ? 10 : rawMax * 0.2) : (rawMax - rawMin) * 0.15;
    const minY = Math.max(0, Math.floor(rawMin - margin));
    const maxY = Math.ceil(rawMax + margin);
    const rangeY = maxY - minY || 1;

    // Coordinate mapping
    const points = history.map((p, idx) => {
      const val = getMetricValue(p, metric);
      const x = padding.left + (idx / (history.length - 1)) * plotWidth;
      const y = padding.top + plotHeight - ((val - minY) / rangeY) * plotHeight;
      return { x, y, val, point: p, idx };
    });

    // Generate smooth cubic bezier SVG path
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpX = (curr.x + next.x) / 2;
      linePath += ` C ${cpX} ${curr.y}, ${cpX} ${next.y}, ${next.x} ${next.y}`;
    }

    // Area closed path under the curve
    const lastP = points[points.length - 1];
    const firstP = points[0];
    const baselineY = padding.top + plotHeight;
    const areaPath = `${linePath} L ${lastP.x} ${baselineY} L ${firstP.x} ${baselineY} Z`;

    // Horizontal Y grid lines (3 steps)
    const gridTicks = [
      { val: minY, y: baselineY },
      { val: Math.round(minY + rangeY * 0.5), y: padding.top + plotHeight * 0.5 },
      { val: maxY, y: padding.top },
    ];

    // X axis ticks (limit labels if many points to avoid clutter on mobile)
    const xStep = history.length <= 6 ? 1 : Math.ceil(history.length / 5);
    const xTicks = points.filter((_, idx) => idx % xStep === 0 || idx === points.length - 1);

    return {
      width,
      height,
      points,
      linePath,
      areaPath,
      gridTicks,
      xTicks,
      baselineY,
    };
  }, [history, metric]);

  const primaryMuscleRu =
    exercise?.primaryMuscle && MUSCLE_DEFINITIONS[exercise.primaryMuscle]?.nameRu
      ? MUSCLE_DEFINITIONS[exercise.primaryMuscle].nameRu
      : null;

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <motion.div
      variants={modalBackdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="bg-[#0D1315] border border-[#252D2F] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-[#1F2729] bg-[#101719]">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#58C995] bg-[#315D4B]/30 border border-[#58C995]/30 px-2 py-0.5 rounded-md uppercase tracking-wider">
                <TrendingUp className="w-3 h-3 text-[#58C995]" />
                Прогресс
              </span>
              {primaryMuscleRu && (
                <span className="text-[11px] text-[#92999A] bg-[#171D1F] border border-[#252D2F] px-2 py-0.5 rounded-md">
                  {primaryMuscleRu}
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#E8E9E7] truncate leading-tight">
              {exercise?.name || 'Упражнение'}
            </h2>
            {exercise?.nameEn && (
              <p className="text-xs text-[#788285] font-medium tracking-tight truncate">
                {exercise.nameEn}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] hover:bg-[#1C2426] rounded-xl transition-colors cursor-pointer shrink-0"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Metric Selector Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#101719] border border-[#252D2F] rounded-xl">
            <button
              type="button"
              onClick={() => setMetric('weight')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                metric === 'weight'
                  ? 'bg-[#58C995] text-[#080D0E] shadow-sm font-bold'
                  : 'text-[#92999A] hover:text-[#E8E9E7] hover:bg-[#171D1F]'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Макс. вес</span>
            </button>

            <button
              type="button"
              onClick={() => setMetric('reps')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                metric === 'reps'
                  ? 'bg-[#58C995] text-[#080D0E] shadow-sm font-bold'
                  : 'text-[#92999A] hover:text-[#E8E9E7] hover:bg-[#171D1F]'
              }`}
            >
              <Repeat className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Повторения</span>
            </button>

            <button
              type="button"
              onClick={() => setMetric('volume')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                metric === 'volume'
                  ? 'bg-[#58C995] text-[#080D0E] shadow-sm font-bold'
                  : 'text-[#92999A] hover:text-[#E8E9E7] hover:bg-[#171D1F]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Объём</span>
            </button>
          </div>

          {/* Compact Statistics Bar (KPI Strip) */}
          {stats && (
            <div className="grid grid-cols-3 gap-2">
              {/* Best Result */}
              <div className="bg-[#101719] border border-[#252D2F] rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#858E90] flex items-center gap-1">
                  <Award className="w-3 h-3 text-[#FFB347]" />
                  <span>Рекорд (PR)</span>
                </span>
                <div className="mt-1">
                  <span className="text-base sm:text-lg font-bold text-[#E8E9E7]">
                    {stats.bestValue.toLocaleString('ru-RU')}
                  </span>
                  <span className="text-xs text-[#92999A] ml-1 font-medium">
                    {getMetricUnit(metric)}
                  </span>
                </div>
              </div>

              {/* Last Result */}
              <div className="bg-[#101719] border border-[#252D2F] rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#858E90] flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#58C995]" />
                  <span>Последний</span>
                </span>
                <div className="mt-1">
                  <span className="text-base sm:text-lg font-bold text-[#E8E9E7]">
                    {stats.lastValue.toLocaleString('ru-RU')}
                  </span>
                  <span className="text-xs text-[#92999A] ml-1 font-medium">
                    {getMetricUnit(metric)}
                  </span>
                </div>
              </div>

              {/* Delta */}
              <div className="bg-[#101719] border border-[#252D2F] rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#858E90]">
                  Динамика (Δ)
                </span>
                <div className="mt-1 flex items-center gap-1">
                  {stats.delta === null ? (
                    <span className="text-xs text-[#788285]">База</span>
                  ) : stats.delta > 0 ? (
                    <span className="text-xs sm:text-sm font-bold text-[#58C995] flex items-center">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      +{stats.delta.toLocaleString('ru-RU')} {getMetricUnit(metric)}
                    </span>
                  ) : stats.delta < 0 ? (
                    <span className="text-xs sm:text-sm font-bold text-[#FF6B6B] flex items-center">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      {stats.delta.toLocaleString('ru-RU')} {getMetricUnit(metric)}
                    </span>
                  ) : (
                    <span className="text-xs sm:text-sm font-bold text-[#92999A] flex items-center">
                      <Minus className="w-3.5 h-3.5" />
                      0 {getMetricUnit(metric)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Interactive Chart Container */}
          <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#92999A]">
                {getMetricLabel(metric)} ({getMetricUnit(metric)})
              </span>
              <span className="text-[11px] text-[#58C995]">
                {history.length > 0 ? `${history.length} тренировок` : '0 записей'}
              </span>
            </div>

            {/* Empty State: 0 completed workouts */}
            {history.length === 0 && (
              <div className="py-8 sm:py-10 text-center flex flex-col items-center justify-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-[#171D1F] border border-[#252D2F] flex items-center justify-center text-[#58C995] mb-3 shadow-inner">
                  <TrendingUp className="w-6 h-6 opacity-70" />
                </div>
                <h3 className="text-sm font-bold text-[#E8E9E7] mb-1">
                  История тренировок пуста
                </h3>
                <p className="text-xs text-[#858E90] max-w-sm mb-3">
                  Выполните и завершите хотя бы одну тренировку с этим упражнением, чтобы здесь появился график динамики рабочих весов, повторений и объёма.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#58C995] bg-[#315D4B]/20 border border-[#58C995]/30 px-3 py-1.5 rounded-xl">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Учитываются только завершённые тренировки</span>
                </div>
              </div>
            )}

            {/* Single Point State: 1 completed workout */}
            {history.length === 1 && (
              <div className="py-6 text-center flex flex-col items-center justify-center px-4">
                <div className="w-10 h-10 rounded-xl bg-[#171D1F] border border-[#58C995]/40 flex items-center justify-center text-[#58C995] mb-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#58C995]" />
                </div>
                <h3 className="text-sm font-bold text-[#E8E9E7] mb-1">
                  Зафиксирован первый результат: {getMetricValue(history[0], metric)} {getMetricUnit(metric)}
                </h3>
                <p className="text-xs text-[#858E90] max-w-sm mb-2">
                  {formatFullDateRu(history[0].fullDate)} · {history[0].sessionName}
                </p>
                <span className="text-[11px] text-[#58C995] bg-[#315D4B]/20 border border-[#58C995]/20 px-2.5 py-1 rounded-lg">
                  Завершите ещё одну тренировку для построения линии прогресса
                </span>
              </div>
            )}

            {/* Full Interactive Chart: 2 or more points */}
            {chartData && (
              <div className="relative w-full overflow-hidden select-none">
                <svg
                  viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                  className="w-full h-auto overflow-visible"
                  style={{ maxHeight: '240px' }}
                >
                  <defs>
                    {/* Area fill mint gradient */}
                    <linearGradient id="mintAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#58C995" stopOpacity="0.32" />
                      <stop offset="65%" stopColor="#58C995" stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#58C995" stopOpacity="0" />
                    </linearGradient>

                    {/* Glow filter for active point */}
                    <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#58C995" floodOpacity="0.8" />
                    </filter>
                  </defs>

                  {/* Horizontal gridlines & Y labels */}
                  {chartData.gridTicks.map((tick, i) => (
                    <g key={i}>
                      <line
                        x1="50"
                        y1={tick.y}
                        x2={chartData.width - 20}
                        y2={tick.y}
                        stroke="#1F282B"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                      <text
                        x="44"
                        y={tick.y + 3.5}
                        textAnchor="end"
                        fill="#6B7578"
                        fontSize="10"
                        fontFamily="inherit"
                        fontWeight="500"
                      >
                        {tick.val}
                      </text>
                    </g>
                  ))}

                  {/* Shaded Area */}
                  <path d={chartData.areaPath} fill="url(#mintAreaGradient)" />

                  {/* Smooth Metric Line */}
                  <path
                    d={chartData.linePath}
                    fill="none"
                    stroke="#58C995"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Selected point vertical guide line */}
                  {selectedPointIndex !== null && chartData.points[selectedPointIndex] && (
                    <line
                      x1={chartData.points[selectedPointIndex].x}
                      y1={chartData.points[selectedPointIndex].y}
                      x2={chartData.points[selectedPointIndex].x}
                      y2={chartData.baselineY}
                      stroke="#58C995"
                      strokeDasharray="2 2"
                      strokeWidth="1.2"
                      opacity="0.6"
                    />
                  )}

                  {/* X axis dates */}
                  {chartData.xTicks.map((tick, i) => (
                    <text
                      key={i}
                      x={tick.x}
                      y={chartData.baselineY + 18}
                      textAnchor="middle"
                      fill={selectedPointIndex === tick.idx ? '#58C995' : '#788285'}
                      fontSize="10"
                      fontFamily="inherit"
                      fontWeight={selectedPointIndex === tick.idx ? '700' : '500'}
                    >
                      {tick.point.date}
                    </text>
                  ))}

                  {/* Data Points */}
                  {chartData.points.map((pt) => {
                    const isSelected = selectedPointIndex === pt.idx;
                    return (
                      <g
                        key={pt.idx}
                        className="cursor-pointer transition-transform"
                        onClick={() => setSelectedPointIndex(pt.idx)}
                      >
                        {/* Invisible large touch target circle for Android/mobile friendliness */}
                        <circle cx={pt.x} cy={pt.y} r="18" fill="transparent" />

                        {/* Outer halo when selected */}
                        {isSelected && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="9"
                            fill="#58C995"
                            opacity="0.25"
                            className="animate-ping"
                          />
                        )}

                        {/* Outer ring */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? '6.5' : '4.5'}
                          fill="#101719"
                          stroke="#58C995"
                          strokeWidth={isSelected ? '2.5' : '2'}
                          filter={isSelected ? 'url(#pointGlow)' : undefined}
                        />

                        {/* Inner core */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? '3' : '2'}
                          fill={isSelected ? '#FFFFFF' : '#58C995'}
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Interactive Detailed Result Card for Selected Session */}
          {activePoint && (
            <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-3.5 sm:p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-[#1F2729] pb-2.5">
                <div>
                  <span className="text-[10px] text-[#58C995] font-semibold uppercase tracking-wider block">
                    Выбранная тренировка
                  </span>
                  <h4 className="text-sm font-bold text-[#E8E9E7]">
                    {activePoint.sessionName}
                  </h4>
                  <p className="text-xs text-[#858E90] mt-0.5">
                    {formatFullDateRu(activePoint.fullDate)}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-[#858E90] block">Значение</span>
                  <span className="text-base font-bold text-[#58C995]">
                    {getMetricValue(activePoint, metric).toLocaleString('ru-RU')} {getMetricUnit(metric)}
                  </span>
                </div>
              </div>

              {/* Breakdown of sets */}
              <div>
                <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-2">
                  Выполненные сеты ({activePoint.setsCount})
                </span>
                <div className="flex flex-wrap gap-2">
                  {activePoint.setsDetails.map((st, i) => (
                    <div
                      key={i}
                      className="px-2.5 py-1.5 bg-[#171D1F] border border-[#252D2F] rounded-xl text-xs flex items-center gap-2"
                    >
                      <span className="text-[10px] font-bold text-[#58C995] bg-[#315D4B]/20 px-1.5 py-0.5 rounded-md">
                        #{st.setNumber}
                      </span>
                      <span className="font-semibold text-[#E8E9E7]">
                        {st.weightKg > 0 ? `${st.weightKg} кг × ${st.reps}` : `${st.reps} повт`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Session Stats */}
              <div className="flex items-center justify-between text-xs text-[#858E90] pt-2 border-t border-[#1F2729]">
                <span>
                  Всего повторений: <strong className="text-[#E8E9E7]">{activePoint.totalReps}</strong>
                </span>
                <span>
                  Общий тоннаж: <strong className="text-[#E8E9E7]">{activePoint.volume.toLocaleString('ru-RU')} кг</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-[#101719] border-t border-[#1F2729] flex items-center justify-between">
          <span className="text-[11px] text-[#788285]">
            Данные формируются автоматически из завершённых тренировок
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#171D1F] hover:bg-[#202729] border border-[#252D2F] hover:border-[#58C995] text-[#E8E9E7] text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};
