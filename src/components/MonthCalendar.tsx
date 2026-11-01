import React, { useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Dumbbell, Flame, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StorageService } from '../services/storage';
import { SPORT_DEFINITIONS, SportType, WeeklyScheduleDay } from '../types/workout';

interface MonthCalendarProps {
  activityMap: Record<string, 'completed' | 'skipped' | 'none'>;
  onDayClick: (dateStr: string, currentStatus: 'completed' | 'skipped' | 'none') => void;
  recentlyCompletedDate?: string | null;
  onYearChange?: (year: number) => void;
  weeklySchedule?: WeeklyScheduleDay[];
}

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  activityMap,
  onDayClick,
  recentlyCompletedDate,
  onYearChange,
  weeklySchedule = [],
}) => {
  // Real current date
  const now = new Date();
  const realCurrentYear = now.getFullYear();
  const realCurrentMonth = now.getMonth();
  const realTodayStr = `${realCurrentYear}-${String(realCurrentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [viewYear, setViewYear] = useState<number>(realCurrentYear);
  const [viewMonth, setViewMonth] = useState<number>(realCurrentMonth);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [selectedDate, setSelectedDate] = useState<string | null>(realTodayStr);

  // Swipe detection refs
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const prevMonth = () => {
    setDirection('left');
    if (viewMonth === 0) {
      const newY = viewYear - 1;
      setViewYear(newY);
      setViewMonth(11);
      onYearChange?.(newY);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    setDirection('right');
    if (viewMonth === 11) {
      const newY = viewYear + 1;
      setViewYear(newY);
      setViewMonth(0);
      onYearChange?.(newY);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const jumpToToday = () => {
    setDirection(viewYear > realCurrentYear || (viewYear === realCurrentYear && viewMonth > realCurrentMonth) ? 'left' : 'right');
    setViewYear(realCurrentYear);
    setViewMonth(realCurrentMonth);
    setSelectedDate(realTodayStr);
    onYearChange?.(realCurrentYear);
  };

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0) {
        nextMonth();
      } else {
        prevMonth();
      }
    }
  };

  // Build month calendar days grid
  const { days, monthWorkoutsCount, monthSportsCount, monthPlannedCount } = useMemo(() => {
    const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

    // Monday-based offset (0 = Mon, 6 = Sun)
    const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

    const list: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isPlanned: boolean;
      status: 'completed' | 'skipped' | 'none';
      dayData: ReturnType<typeof StorageService.getDayActivityData>;
      primarySport?: SportType;
    }> = [];

    let workoutsCount = 0;
    let sportsCount = 0;
    let plannedCount = 0;

    // 1. Leading days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dNum = daysInPrev - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      const status = activityMap[dateStr] || 'none';
      const dayData = StorageService.getDayActivityData(dateStr);
      const dayOfWeek = (new Date(prevY, prevM, dNum).getDay() + 6) % 7;
      const isPlanned = (weeklySchedule[dayOfWeek]?.activities?.length || 0) > 0;

      list.push({
        dateStr,
        dayNumber: dNum,
        isCurrentMonth: false,
        isToday: dateStr === realTodayStr,
        isPlanned,
        status,
        dayData,
      });
    }

    // 2. Days of current month
    for (let d = 1; d <= daysInCurrent; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const status = activityMap[dateStr] || 'none';
      const dayData = StorageService.getDayActivityData(dateStr);
      const dayOfWeek = (new Date(viewYear, viewMonth, d).getDay() + 6) % 7;
      const isPlanned = (weeklySchedule[dayOfWeek]?.activities?.length || 0) > 0;

      const strengthCount = dayData.sessions.filter((s) => s.type === 'strength').length;
      const sportSessions = dayData.sessions.filter((s) => s.type === 'sport');

      if (strengthCount > 0 || status === 'completed') {
        workoutsCount += Math.max(1, strengthCount);
      } else if (isPlanned) {
        plannedCount++;
      }

      if (sportSessions.length > 0) {
        sportsCount += sportSessions.length;
      }

      // Check primary sport if any
      let primarySport: SportType | undefined;
      const sportsList = StorageService.getSportSessions().filter((s) => s.date === dateStr);
      if (sportsList.length > 0) {
        primarySport = sportsList[0].sportType;
      }

      list.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === realTodayStr,
        isPlanned,
        status,
        dayData,
        primarySport,
      });
    }

    // 3. Trailing days to fill the final row (up to multiple of 7)
    const remaining = (7 - (list.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const status = activityMap[dateStr] || 'none';
      const dayData = StorageService.getDayActivityData(dateStr);
      const dayOfWeek = (new Date(nextY, nextM, d).getDay() + 6) % 7;
      const isPlanned = (weeklySchedule[dayOfWeek]?.activities?.length || 0) > 0;

      list.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateStr === realTodayStr,
        isPlanned,
        status,
        dayData,
      });
    }

    return {
      days: list,
      monthWorkoutsCount: workoutsCount,
      monthSportsCount: sportsCount,
      monthPlannedCount: plannedCount,
    };
  }, [viewYear, viewMonth, activityMap, realTodayStr, weeklySchedule]);

  const isCurrentMonthView = viewYear === realCurrentYear && viewMonth === realCurrentMonth;

  return (
    <div
      className="w-full bg-[#101719] border border-[#252D2F] rounded-2xl p-4 shadow-sm select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-[#58C995]" />
          <h2 className="text-base font-bold text-[#E8E9E7] tracking-tight">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {!isCurrentMonthView && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={jumpToToday}
              className="px-2 py-1 text-[11px] font-semibold text-[#58C995] bg-[#14231b] border border-[#2f553f] rounded-lg hover:bg-[#1a2f24] transition-colors cursor-pointer"
            >
              Сегодня
            </motion.button>
          )}

          <div className="flex items-center gap-1 bg-[#0c1214] border border-[#202729] rounded-xl p-0.5">
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={prevMonth}
              aria-label="Предыдущий месяц"
              className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={nextMonth}
              aria-label="Следующий месяц"
              className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Weekday Names Header */}
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {WEEKDAY_NAMES.map((name, idx) => (
          <div
            key={name}
            className={`text-[11px] font-bold uppercase tracking-wider py-1 ${
              idx >= 5 ? 'text-[#C83232]/70' : 'text-[#92999A]'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Animated Days Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${viewYear}-${viewMonth}`}
          initial={{ opacity: 0, x: direction === 'right' ? 12 : -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction === 'right' ? -12 : 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="grid grid-cols-7 gap-1"
        >
          {days.map((cell) => {
            const hasWorkout = cell.dayData.workoutsCount > 0 || cell.status === 'completed';
            const isSkipped = cell.status === 'skipped';
            const isSelected = selectedDate === cell.dateStr;
            const isJustFinished = recentlyCompletedDate === cell.dateStr;

            // Indicator color
            let dotColor = '#58C995'; // default strength green
            if (cell.primarySport && SPORT_DEFINITIONS[cell.primarySport]) {
              dotColor = SPORT_DEFINITIONS[cell.primarySport].color;
            } else if (isSkipped) {
              dotColor = '#C83232';
            }

            return (
              <motion.button
                key={cell.dateStr}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setSelectedDate(cell.dateStr);
                  onDayClick(cell.dateStr, cell.status);
                }}
                className={`aspect-square rounded-xl relative flex flex-col items-center justify-center p-0.5 transition-all cursor-pointer ${
                  !cell.isCurrentMonth
                    ? 'opacity-30 hover:opacity-60 bg-transparent'
                    : isSelected
                    ? 'bg-[#182620] border-2 border-[#58C995] shadow-[0_0_12px_rgba(88,201,149,0.3)]'
                    : cell.isToday
                    ? 'bg-[#121c1f] border border-[#3b4b4e]'
                    : cell.isPlanned && !hasWorkout
                    ? 'bg-[#0f1718] border border-[#233530]'
                    : 'bg-[#0d1416] hover:bg-[#151f22] border border-[#1b2528]'
                }`}
              >
                {/* Day Number */}
                <span
                  className={`text-xs font-semibold leading-none ${
                    cell.isToday
                      ? 'text-[#58C995] font-black'
                      : !cell.isCurrentMonth
                      ? 'text-[#6b7577]'
                      : isSelected
                      ? 'text-[#E8E9E7]'
                      : cell.isPlanned && !hasWorkout
                      ? 'text-[#A0B0A8]'
                      : 'text-[#C5C7C5]'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {/* Activity Dots / Badges */}
                <div className="flex items-center gap-0.5 mt-1 h-1.5 justify-center">
                  {hasWorkout && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isJustFinished ? 'animate-ping' : ''}`}
                      style={{ backgroundColor: dotColor }}
                      title="Активность завершена"
                    />
                  )}
                  {cell.isPlanned && !hasWorkout && !isSkipped && (
                    <span
                      className="w-1.5 h-1.5 rounded-full border border-[#58C995] bg-[#58C995]/20"
                      title="Запланирована тренировка"
                    />
                  )}
                  {cell.dayData.sessions.length > 1 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E5A93C]" title="Несколько занятий" />
                  )}
                  {isSkipped && !hasWorkout && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C83232]" title="Пропущено" />
                  )}
                </div>

                {/* Subtitle pulse if completed today */}
                {isJustFinished && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#58C995] ring-2 ring-[#080D0E]" />
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Month Summary Bar */}
      <div className="mt-3.5 pt-2.5 border-t border-[#202729] flex items-center justify-between text-[11px] text-[#92999A]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#58C995]" />
            <span>Выполнено: <b className="text-[#E8E9E7]">{monthWorkoutsCount}</b></span>
          </div>
          {monthPlannedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full border border-[#58C995] bg-[#58C995]/20" />
              <span>План: <b className="text-[#E8E9E7]">{monthPlannedCount}</b></span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#E06D53]" />
            <span>Спорт: <b className="text-[#E8E9E7]">{monthSportsCount}</b></span>
          </div>
        </div>

        <span className="text-[10px] text-[#6b7577]">
          Свайп для навигации
        </span>
      </div>
    </div>
  );
};
