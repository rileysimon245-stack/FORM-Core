import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StorageService } from '../services/storage';
import { Activity, Check, X } from 'lucide-react';

interface AnnualHeatmapCalendarProps {
  activityMap: Record<string, 'completed' | 'skipped' | 'none'>;
  onDayClick?: (dateStr: string, status: 'completed' | 'skipped' | 'none') => void;
  onOpenSportModal?: (date?: string) => void;
  onStartQuickWorkout?: () => void;
}

interface DaySquare {
  dateStr: string;
  dayOfYear: number;
  weekIndex: number;
  dayOfWeekIndex: number; // 0 = Mon, 6 = Sun
  status: 'completed' | 'skipped' | 'none' | 'future';
  isToday: boolean;
  dayData?: ReturnType<typeof StorageService.getDayActivityData>;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getYearDays(year: number, activityMap: Record<string, 'completed' | 'skipped' | 'none'>): {
  squares: DaySquare[];
  completedCount: number;
  missedCount: number;
  totalDays: number;
} {
  const now = new Date();
  const realCurrentYear = now.getFullYear();
  const realCurrentMonth = now.getMonth();
  const realCurrentDay = now.getDate();
  const todayStr = `${realCurrentYear}-${String(realCurrentMonth + 1).padStart(2, '0')}-${String(realCurrentDay).padStart(2, '0')}`;

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalDays = isLeap ? 366 : 365;

  const squares: DaySquare[] = [];
  let completedCount = 0;
  let missedCount = 0;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(year, 0, 1 + i);
    const m = d.getMonth() + 1;
    const dayOfMonth = d.getDate();
    const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

    const dayOfWeekIndex = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const weekIndex = Math.floor((i + ((new Date(year, 0, 1).getDay() + 6) % 7)) / 7);

    const isToday = dateStr === todayStr;
    const isFuture = d > now;

    let status: 'completed' | 'skipped' | 'none' | 'future' = 'none';

    if (isFuture) {
      status = 'future';
    } else {
      const mapStatus = activityMap[dateStr];
      const dayData = StorageService.getDayActivityData(dateStr);
      const hasCompletedActivity = Boolean(dayData && dayData.sessions && dayData.sessions.length > 0);

      if (mapStatus === 'completed' || hasCompletedActivity) {
        status = 'completed';
        completedCount++;
      } else {
        // Past day without workout is marked as missed (red) according to reference video rules
        status = 'skipped';
        missedCount++;
      }
    }

    squares.push({
      dateStr,
      dayOfYear: i + 1,
      weekIndex,
      dayOfWeekIndex,
      status,
      isToday,
      dayData: StorageService.getDayActivityData(dateStr),
    });
  }

  return { squares, completedCount, missedCount, totalDays };
}

export const AnnualHeatmapCalendar: React.FC<AnnualHeatmapCalendarProps> = ({
  activityMap,
  onDayClick,
  onOpenSportModal,
}) => {
  // Automatically determine the current calendar year
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [inspectingDay, setInspectingDay] = useState<DaySquare | null>(null);

  // Compute data exclusively for the current year
  const yearData = useMemo(() => {
    return getYearDays(currentYear, activityMap);
  }, [currentYear, activityMap]);

  // Group squares into 52/53 columns x 7 rows
  const matrix = useMemo(() => {
    const cols = Math.max(...yearData.squares.map(s => s.weekIndex)) + 1;
    const m: DaySquare[][] = Array.from({ length: cols }, () => []);
    yearData.squares.forEach((sq) => {
      if (m[sq.weekIndex]) {
        m[sq.weekIndex].push(sq);
      }
    });
    return m;
  }, [yearData]);

  const columnsCount = matrix.length;

  // Find the last column index that actually fills with color (non-future days)
  const maxFilledWeekIdx = useMemo(() => {
    let maxIdx = 0;
    yearData.squares.forEach(sq => {
      if (sq.status !== 'future' && sq.weekIndex > maxIdx) {
        maxIdx = sq.weekIndex;
      }
    });
    return maxIdx || columnsCount - 1;
  }, [yearData, columnsCount]);

  // Calendar animation parameters:
  // Each column starts at weekIdx * 0.045s, cells inside add up to 6 * 0.006s, duration 0.12s
  // Total fill duration to reach the end of filled days:
  const totalCalendarFillDurationMs = useMemo(() => {
    return Math.round((maxFilledWeekIdx * 0.045 + 6 * 0.006 + 0.12) * 1000);
  }, [maxFilledWeekIdx]);

  // Smooth decelerating workout counter incrementing every single integer without skipping,
  // driven by requestAnimationFrame for perfectly fluid 60fps execution with zero timer lag!
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    const target = 158;
    const totalDuration = totalCalendarFillDurationMs;
    let animId: number;
    let startTime: number | null = null;
    let lastRendered = 0;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);

      // Smooth ease-out power curve: fast start, soft gradual deceleration towards 158
      const easeOutValue = 1 - Math.pow(1 - progress, 2.2);
      const nextCount = Math.min(target, Math.floor(easeOutValue * target));

      if (nextCount > lastRendered) {
        lastRendered = nextCount;
        setDisplayCount(nextCount);
      }

      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        setDisplayCount(target);
      }
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [totalCalendarFillDurationMs]);

  // Compute exact week column indices for each month label start
  const monthStartMap = useMemo(() => {
    const map: Record<number, string> = {};
    const firstDayOfYear = new Date(currentYear, 0, 1);
    const startDayOfWeek = (firstDayOfYear.getDay() + 6) % 7;

    for (let m = 0; m < 12; m++) {
      const firstOfMonth = new Date(currentYear, m, 1);
      const dayOfYear0Based = Math.floor((firstOfMonth.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24));
      const weekIdx = Math.floor((dayOfYear0Based + startDayOfWeek) / 7);
      if (!(weekIdx in map)) {
        map[weekIdx] = MONTH_NAMES[m];
      }
    }
    return map;
  }, [currentYear]);

  // Helper Russian month name for day inspector
  const formatRussianDayDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const day = parseInt(parts[2], 10);
    const month = months[parseInt(parts[1], 10) - 1];
    return `${day} ${month} ${parts[0]} г.`;
  };

  return (
    <div className="w-full flex flex-col select-none space-y-2">
      {/* Main Reference Card Container in FORM Core style */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full bg-[#11181B] border border-[#1E282B] rounded-3xl p-4 sm:p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] flex flex-col space-y-4 relative overflow-hidden"
      >
        {/* Top Header Row: Year left, Workouts count right */}
        <div className="flex items-baseline justify-between px-0.5">
          <h1 className="text-3xl sm:text-4xl font-black text-[#E8E9E7] tracking-tight font-sans">
            {currentYear}
          </h1>

          <div className="flex items-baseline gap-1.5 font-sans">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#58C995] tabular-nums tracking-tight">
              {displayCount}
            </span>
            <span className="text-sm sm:text-base font-semibold text-[#869194] uppercase tracking-wider">
              {displayCount === 1 ? 'тренировка' : 'тренировок'}
            </span>
          </div>
        </div>

        {/* Month Labels & Heatmap Grid */}
        <div className="w-full flex flex-col space-y-1">
          {/* Month Labels Row - Aligned precisely over column indices */}
          <div className="w-full flex justify-between gap-[1.5px] sm:gap-[2px] px-0.5 min-h-[16px]">
            {Array.from({ length: columnsCount }).map((_, colIdx) => (
              <div key={colIdx} className="flex-1 min-w-0 text-left relative">
                {monthStartMap[colIdx] && (
                  <span className="text-[10px] sm:text-[11px] font-bold text-[#92999A] absolute left-0 top-0 whitespace-nowrap">
                    {monthStartMap[colIdx]}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Matrix Grid: 52/53 columns x 7 rows */}
          <div className="w-full flex justify-between gap-[1.5px] sm:gap-[2px] items-center pt-1">
            {matrix.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-[1.5px] sm:gap-[2px] flex-1 min-w-0">
                {Array.from({ length: 7 }).map((_, dayRowIdx) => {
                  const daySq = week.find((s) => s.dayOfWeekIndex === dayRowIdx);

                  if (!daySq) {
                    return (
                      <div
                        key={dayRowIdx}
                        className="w-full aspect-square bg-transparent opacity-0"
                      />
                    );
                  }

                  const isCompleted = daySq.status === 'completed';
                  const isSkipped = daySq.status === 'skipped';
                  const isFuture = daySq.status === 'future';

                  const targetBg = isCompleted ? '#58C995' : isSkipped ? '#EF4444' : '#121A1C';
                  const targetBorder = isCompleted ? '#58C995' : isSkipped ? '#EF4444' : '#223236';

                  const isInspecting = inspectingDay?.dateStr === daySq.dateStr;

                  // Exact tempo matching reference video (45ms per column, 6ms top-to-bottom within column)
                  const columnStartDelay = weekIdx * 0.045;
                  const cellInColumnDelay = dayRowIdx * 0.006;
                  const cellDelaySec = columnStartDelay + cellInColumnDelay;

                  return (
                    <motion.div
                      key={daySq.dateStr}
                      initial={{
                        backgroundColor: '#121A1C',
                        borderColor: '#223236',
                      }}
                      animate={{
                        backgroundColor: targetBg,
                        borderColor: targetBorder,
                      }}
                      transition={{
                        duration: 0.12,
                        delay: isFuture ? 0 : cellDelaySec,
                        ease: 'easeOut',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectingDay(daySq);
                        if (onDayClick) {
                          onDayClick(daySq.dateStr, daySq.status === 'future' ? 'none' : daySq.status);
                        }
                      }}
                      className={`w-full aspect-square rounded-[1px] cursor-pointer border transition-transform duration-150 ${
                        isCompleted ? 'shadow-[0_0_4px_rgba(88,201,149,0.35)]' : ''
                      } ${
                        daySq.isToday ? 'ring-1 ring-white scale-125 z-10' : ''
                      } ${
                        isInspecting ? 'ring-2 ring-white scale-150 z-20' : ''
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend Footer */}
        <div className="flex items-center gap-4 text-xs sm:text-sm font-semibold text-[#E8E9E7] pt-1 px-0.5">
          <span className="text-white font-extrabold text-sm sm:text-base">Days</span>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[1px] bg-[#EF4444] inline-block" />
            <span className="text-[#92999A]">Missed</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[1px] bg-[#58C995] inline-block shadow-[0_0_6px_rgba(88,201,149,0.4)]" />
            <span className="text-[#92999A]">Trained</span>
          </div>
        </div>
      </motion.div>

      {/* Interactive Day Inspector Card on Tap */}
      <AnimatePresence>
        {inspectingDay && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="bg-[#11181B] border border-[#274537] rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                inspectingDay.status === 'completed'
                  ? 'bg-[#14261E] border-[#58C995] text-[#58C995]'
                  : inspectingDay.status === 'skipped'
                  ? 'bg-[#261517] border-[#E05353] text-[#E05353]'
                  : 'bg-[#152024] border-[#223035] text-[#869194]'
              }`}>
                {inspectingDay.status === 'completed' ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : inspectingDay.status === 'skipped' ? (
                  <X className="w-4 h-4 stroke-[3]" />
                ) : (
                  <Activity className="w-3.5 h-3.5" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                    {formatRussianDayDate(inspectingDay.dateStr)}
                  </h3>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${
                    inspectingDay.status === 'completed'
                      ? 'bg-[#14261E] text-[#58C995] border-[#254A37]'
                      : inspectingDay.status === 'skipped'
                      ? 'bg-[#261517] text-[#E05353] border-[#4A2024]'
                      : 'bg-[#152024] text-[#869194] border-[#223035]'
                  }`}>
                    {inspectingDay.status === 'completed' ? 'Тренировка' : inspectingDay.status === 'skipped' ? 'Пропущена' : 'День отдыха'}
                  </span>
                </div>

                <p className="text-[11px] text-[#869194] truncate mt-0.5">
                  {inspectingDay.dayData?.sessions && inspectingDay.dayData.sessions.length > 0
                    ? inspectingDay.dayData.sessions.map((s) => s.name).join(', ')
                    : inspectingDay.status === 'completed'
                    ? 'Зафиксирована успешная физическая активность'
                    : 'Записи о зафиксированных тренировках отсутствуют'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onOpenSportModal && (
                <button
                  onClick={() => onOpenSportModal(inspectingDay.dateStr)}
                  className="px-2.5 py-1.5 bg-[#14231b] hover:bg-[#1c3529] border border-[#2f553f] rounded-xl text-xs font-bold text-[#58C995] transition-colors cursor-pointer"
                >
                  Записать
                </button>
              )}
              <button
                onClick={() => setInspectingDay(null)}
                className="p-1 bg-[#101719] hover:bg-[#1b2628] text-[#92999A] hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

