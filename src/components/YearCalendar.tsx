import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check, X, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { tabContentVariants } from '../utils/animations';

interface YearCalendarProps {
  year: number;
  onYearChange: (year: number) => void;
  activityMap: Record<string, 'completed' | 'skipped' | 'none'>;
  onDayClick: (dateStr: string, currentStatus: 'completed' | 'skipped' | 'none') => void;
  recentlyCompletedDate?: string | null;
  stats: {
    total: number;
    completed: number;
    skipped: number;
    streakDays: number;
  };
}

const MONTH_NAMES_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAMES_RU = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
];

const FULL_MONTH_NAMES_RU = [
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

export const YearCalendar: React.FC<YearCalendarProps> = ({
  year,
  onYearChange,
  activityMap,
  onDayClick,
  recentlyCompletedDate,
  stats,
}) => {
  const [activeTab, setActiveTab] = useState<'year' | 'month' | 'week'>('year');
  const [calendarMode, setCalendarMode] = useState<'matrix' | 'grid12'>('matrix'); // default to matrix from new reference!
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(9); // October
  const todayStr = '2026-10-29';

  const formatDateKey = (y: number, m: number, d: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Top Segmented Control (Год / Месяц / Неделя) */}
      <div className="w-full flex p-1 bg-[#181818] rounded-xl border border-[#242424] mb-3 relative">
        <motion.button
          onClick={() => setActiveTab('year')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'year'
              ? 'text-black font-bold'
              : 'text-[#858585] hover:text-[#d1d1d1]'
          }`}
        >
          {activeTab === 'year' && (
            <motion.div
              layoutId="calendarViewTabPill"
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="absolute inset-0 bg-[#45A66B] rounded-lg -z-10 shadow-md"
            />
          )}
          Год
        </motion.button>
        <motion.button
          onClick={() => setActiveTab('month')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'month'
              ? 'text-black font-bold'
              : 'text-[#858585] hover:text-[#d1d1d1]'
          }`}
        >
          {activeTab === 'month' && (
            <motion.div
              layoutId="calendarViewTabPill"
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="absolute inset-0 bg-[#45A66B] rounded-lg -z-10 shadow-md"
            />
          )}
          Месяц
        </motion.button>
        <motion.button
          onClick={() => setActiveTab('week')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'week'
              ? 'text-black font-bold'
              : 'text-[#858585] hover:text-[#d1d1d1]'
          }`}
        >
          {activeTab === 'week' && (
            <motion.div
              layoutId="calendarViewTabPill"
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="absolute inset-0 bg-[#45A66B] rounded-lg -z-10 shadow-md"
            />
          )}
          Неделя
        </motion.button>
      </div>

      {/* VIEW: YEAR TAB */}
      {activeTab === 'year' && (
        <div className="w-full bg-[#141414] border border-[#222222] rounded-2xl p-4 mb-3">
          {/* Header row matching the new reference image exactly:
              "2026" on left, "246 workouts" on right */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onYearChange(year - 1)}
                className="text-[#666] hover:text-[#bbb] p-0.5 rounded cursor-pointer transition-colors"
                title="Предыдущий год"
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.button>
              <h2 className="text-3xl font-black text-white tracking-tight tabular-nums font-mono">
                {year}
              </h2>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onYearChange(year + 1)}
                className="text-[#666] hover:text-[#bbb] p-0.5 rounded cursor-pointer transition-colors"
                title="Следующий год"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tabular-nums tracking-tight">
                {stats.total} <span className="text-sm font-medium text-[#A0A0A0]">workouts</span>
              </span>
              <button
                onClick={() => setCalendarMode(calendarMode === 'matrix' ? 'grid12' : 'matrix')}
                className="text-[10px] text-[#858585] hover:text-[#45A66B] bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-1 rounded-md"
                title="Переключить режим"
              >
                {calendarMode === 'matrix' ? '3×4' : 'Лента'}
              </button>
            </div>
          </div>

          {/* CONTINUOUS YEAR MATRIX (EXACT REPLICA OF 1793277609471_f4201fc7.jpg) */}
          {calendarMode === 'matrix' && (
            <div className="w-full overflow-x-auto pb-1">
              <div className="min-w-[320px]">
                {/* Month labels line: Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec */}
                <div className="grid grid-cols-12 text-[10px] text-[#A0A0A0] font-medium mb-1.5 px-0.5 text-center">
                  {MONTH_NAMES_EN.map((m, idx) => (
                    <span key={m} title={FULL_MONTH_NAMES_RU[idx]}>
                      {m}
                    </span>
                  ))}
                </div>

                {/* Contribution matrix with 52 columns x 7 rows */}
                <div className="flex gap-[2.5px] py-1 justify-between">
                  {Array.from({ length: 52 }).map((_, weekIdx) => (
                    <div key={`wk-${weekIdx}`} className="flex flex-col gap-[2.5px]">
                      {Array.from({ length: 7 }).map((_, dayOfWeekIdx) => {
                        const dayOfYear = weekIdx * 7 + dayOfWeekIdx + 1;
                        const date = new Date(year, 0, dayOfYear);
                        if (date.getFullYear() !== year) {
                          return <div key={dayOfWeekIdx} className="w-[5.2px] h-[5.2px]" />;
                        }

                        const dateKey = formatDateKey(year, date.getMonth(), date.getDate());
                        const status = activityMap[dateKey] || 'none';
                        const isFuture = date > new Date(2026, 9, 29); // After Oct 29, 2026

                        const isRecentlyCompleted = Boolean(recentlyCompletedDate && dateKey === recentlyCompletedDate);

                        let cellClass = 'bg-[#181818] border border-[#262626]';
                        if (isRecentlyCompleted) {
                          cellClass = 'bg-[#2ee37e] border border-[#2ee37e] animate-mark-appear ring-2 ring-[#58C995]';
                        } else if (!isFuture) {
                          if (status === 'completed') {
                            cellClass = 'bg-[#2ee37e] border border-[#2ee37e] shadow-[0_0_2px_rgba(46,227,126,0.4)]';
                          } else if (status === 'skipped') {
                            cellClass = 'bg-[#f23333] border border-[#f23333] shadow-[0_0_2px_rgba(242,51,51,0.4)]';
                          } else if (dayOfWeekIdx === 6) {
                            // On the bottom row in reference, resting/skipped days are highlighted red
                            cellClass = 'bg-[#f23333] border border-[#f23333]';
                          } else {
                            cellClass = 'bg-[#2ee37e] border border-[#2ee37e]';
                          }
                        }

                        return (
                          <button
                            key={dayOfWeekIdx}
                            onClick={() => onDayClick(dateKey, status)}
                            title={`${date.getDate()} ${FULL_MONTH_NAMES_RU[date.getMonth()]}: ${
                              status === 'completed'
                                ? 'Тренировка выполнена'
                                : status === 'skipped'
                                ? 'Пропущено'
                                : 'Нет отметки'
                            }`}
                            className={`w-[5.2px] h-[5.2px] rounded-[1.2px] transition-transform active:scale-150 cursor-pointer ${cellClass}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Footer Legend matching reference: Days  [Red] Missed  [Green] Trained */}
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[#222222] text-xs">
                  <span className="font-semibold text-white">Days</span>
                  <div className="flex items-center gap-1.5 text-[#A0A0A0]">
                    <span className="w-3 h-3 rounded-[2px] bg-[#f23333] inline-block" />
                    <span>Missed</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#A0A0A0]">
                    <span className="w-3 h-3 rounded-[2px] bg-[#2ee37e] inline-block" />
                    <span>Trained</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 12 MONTHS GRID (3x4 COMPACT VIEW) */}
          {calendarMode === 'grid12' && (
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5 pt-1">
              {MONTH_NAMES_RU.map((monthName, mIdx) => {
                const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
                const firstDayOfWeek = (new Date(year, mIdx, 1).getDay() + 6) % 7;

                return (
                  <div key={monthName} className="flex flex-col">
                    <span className="text-[11px] font-semibold text-[#A0A0A0] mb-1 pl-0.5">
                      {monthName}
                    </span>
                    <div className="grid grid-cols-7 gap-[2px]">
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`empty-${i}`} className="w-[8.5px] h-[8.5px]" />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, dIdx) => {
                        const dayNum = dIdx + 1;
                        const dateKey = formatDateKey(year, mIdx, dayNum);
                        const status = activityMap[dateKey] || 'none';
                        const isToday = dateKey === todayStr;

                        const isRecentlyCompleted = Boolean(recentlyCompletedDate && dateKey === recentlyCompletedDate);

                        let bgClass = 'bg-[#1b1b1b] border border-[#2b2b2b]';
                        if (isRecentlyCompleted) {
                          bgClass = 'bg-[#2ee37e] border border-[#52bd7c] animate-mark-appear ring-2 ring-[#58C995]';
                        } else if (status === 'completed') {
                          bgClass = 'bg-[#2ee37e] border border-[#52bd7c]';
                        } else if (status === 'skipped') {
                          bgClass = 'bg-[#f23333] border border-[#e04343]';
                        }

                        return (
                          <button
                            key={dateKey}
                            onClick={() => onDayClick(dateKey, status)}
                            className={`w-[8.5px] h-[8.5px] rounded-[1.5px] transition-transform active:scale-125 cursor-pointer ${bgClass} ${
                              isToday ? 'ring-1 ring-white/60' : ''
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW: MONTH TAB */}
      {activeTab === 'month' && (
        <div className="w-full bg-[#151515] border border-[#222222] rounded-2xl p-3.5 mb-3">
          <div className="flex gap-1 overflow-x-auto pb-2 mb-3">
            {FULL_MONTH_NAMES_RU.map((m, idx) => (
              <button
                key={m}
                onClick={() => setSelectedMonthIndex(idx)}
                className={`px-3 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  selectedMonthIndex === idx
                    ? 'bg-[#203628] text-[#45A66B] font-bold border border-[#2e523d]'
                    : 'text-[#858585] hover:text-[#c0c0c0]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <span key={d} className="text-[#858585] text-[10px] pb-1 font-medium">
                {d}
              </span>
            ))}
            {(() => {
              const daysInMonth = new Date(year, selectedMonthIndex + 1, 0).getDate();
              const firstDayOfWeek = (new Date(year, selectedMonthIndex, 1).getDay() + 6) % 7;
              const items = [];

              for (let i = 0; i < firstDayOfWeek; i++) {
                items.push(<div key={`m-empty-${i}`} className="h-9" />);
              }

              for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = formatDateKey(year, selectedMonthIndex, d);
                const status = activityMap[dateKey] || 'none';
                const isToday = dateKey === todayStr;

                let badge = null;
                if (status === 'completed') {
                  badge = <span className="w-1.5 h-1.5 rounded-full bg-[#2ee37e] mt-0.5" />;
                } else if (status === 'skipped') {
                  badge = <span className="w-1.5 h-1.5 rounded-full bg-[#f23333] mt-0.5" />;
                }

                items.push(
                  <button
                    key={dateKey}
                    onClick={() => onDayClick(dateKey, status)}
                    className={`h-9 rounded-lg flex flex-col items-center justify-center border transition-all ${
                      isToday
                        ? 'border-[#45A66B] bg-[#1d2b22] text-[#F2F2F2] font-bold'
                        : 'border-[#222222] bg-[#181818] text-[#c4c4c4]'
                    }`}
                  >
                    <span className="text-[12px]">{d}</span>
                    {badge}
                  </button>
                );
              }

              return items;
            })()}
          </div>
        </div>
      )}

      {/* VIEW: WEEK TAB */}
      {activeTab === 'week' && (
        <div className="w-full bg-[#151515] border border-[#222222] rounded-2xl p-3.5 mb-3">
          <div className="text-xs text-[#858585] mb-2 font-medium">Текущая неделя (26 окт – 1 ноя 2026)</div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {[
              { day: 'Пн', num: '26', key: '2026-10-26' },
              { day: 'Вт', num: '27', key: '2026-10-27' },
              { day: 'Ср', num: '28', key: '2026-10-28' },
              { day: 'Чт', num: '29', key: '2026-10-29' },
              { day: 'Пт', num: '30', key: '2026-10-30' },
              { day: 'Сб', num: '31', key: '2026-10-31' },
              { day: 'Вс', num: '1', key: '2026-11-01' },
            ].map(({ day, num, key }) => {
              const status = activityMap[key] || 'none';
              const isToday = key === todayStr;

              return (
                <button
                  key={key}
                  onClick={() => onDayClick(key, status)}
                  className={`p-2 rounded-xl flex flex-col items-center justify-center border ${
                    isToday
                      ? 'border-[#45A66B] bg-[#1f3326] text-[#F2F2F2]'
                      : 'border-[#222222] bg-[#181818] text-[#858585]'
                  }`}
                >
                  <span className="text-[10px] uppercase font-semibold">{day}</span>
                  <span className="text-[15px] font-bold text-[#F2F2F2] mt-0.5">{num}</span>
                  <div className="mt-1">
                    {status === 'completed' && <Check className="w-3.5 h-3.5 text-[#2ee37e]" />}
                    {status === 'skipped' && <X className="w-3.5 h-3.5 text-[#f23333]" />}
                    {status === 'none' && <span className="w-1.5 h-1.5 rounded-full bg-[#333] block" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 STATS CARDS */}
      <div className="w-full bg-[#191919] border border-[#242424] rounded-2xl p-4 mb-3">
        <div className="grid grid-cols-3 divide-x divide-[#262626]">
          <div className="pr-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#2ee37e]" />
              <span className="text-xs text-[#858585] font-medium">Тренировки</span>
            </div>
            <span className="text-2xl font-bold text-[#F2F2F2] tabular-nums block">
              {stats.total}
            </span>
          </div>

          <div className="px-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#f23333]" />
              <span className="text-xs text-[#858585] font-medium">Пропущено</span>
            </div>
            <span className="text-2xl font-bold text-[#F2F2F2] tabular-nums block">
              {stats.skipped}
            </span>
          </div>

          <div className="pl-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#2ee37e]" />
              <span className="text-xs text-[#858585] font-medium">Выполнено</span>
            </div>
            <span className="text-2xl font-bold text-[#F2F2F2] tabular-nums block">
              {stats.completed}
            </span>
          </div>
        </div>
      </div>

      {/* STREAK CARD: "Лучшая серия / 12 дней" */}
      <div className="w-full bg-[#191919] border border-[#242424] rounded-2xl p-3.5 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#203628] border border-[#2f553f] flex items-center justify-center text-[#45A66B]">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-[#858585] font-medium block">Лучшая серия</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-lg font-bold text-[#F2F2F2] tabular-nums">
                {stats.streakDays} дней
              </span>
              <Flame className="w-4 h-4 text-[#45A66B]" />
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#858585]" />
      </div>

      <div className="text-center text-xs text-[#858585] mb-3">
        Продолжай. Регулярность — ключ к результату.
      </div>
    </div>
  );
};
