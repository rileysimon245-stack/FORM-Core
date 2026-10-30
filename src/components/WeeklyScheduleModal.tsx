import React, { useState } from 'react';
import {
  WeeklyScheduleDay,
  DayActivityItem,
  SportType,
  ActivityIntensity,
  SPORT_DEFINITIONS,
} from '../types/workout';
import {
  X,
  Plus,
  Trash2,
  Clock,
  Calendar,
  Zap,
  Dumbbell,
  Swords,
  Trophy,
  Bike,
  Waves,
  Activity,
  Moon,
  Check,
  AlertCircle,
  ChevronRight,
  Info,
} from 'lucide-react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface WeeklyScheduleModalProps {
  initialSchedule: WeeklyScheduleDay[];
  onSave: (schedule: WeeklyScheduleDay[]) => void;
  onClose: () => void;
}

export const WeeklyScheduleModal: React.FC<WeeklyScheduleModalProps> = ({
  initialSchedule,
  onSave,
  onClose,
}) => {
  const [schedule, setSchedule] = useState<WeeklyScheduleDay[]>(
    initialSchedule && initialSchedule.length === 7
      ? initialSchedule
      : [
          { dayOfWeek: 0, dayName: 'Пн', fullDayName: 'Понедельник', activities: [] },
          { dayOfWeek: 1, dayName: 'Вт', fullDayName: 'Вторник', activities: [] },
          { dayOfWeek: 2, dayName: 'Ср', fullDayName: 'Среда', activities: [] },
          { dayOfWeek: 3, dayName: 'Чт', fullDayName: 'Четверг', activities: [] },
          { dayOfWeek: 4, dayName: 'Пт', fullDayName: 'Пятница', activities: [] },
          { dayOfWeek: 5, dayName: 'Сб', fullDayName: 'Суббота', activities: [] },
          { dayOfWeek: 6, dayName: 'Вс', fullDayName: 'Воскресенье', activities: [] },
        ]
  );

  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);

  // Quick preset loader helper
  const handleApplyPreset = (preset: 'box_and_iron' | 'basket_and_iron' | 'runner_strength' | 'clear') => {
    if (preset === 'clear') {
      setSchedule(
        schedule.map((d) => ({
          ...d,
          activities: [],
        }))
      );
      return;
    }

    if (preset === 'box_and_iron') {
      setSchedule([
        {
          dayOfWeek: 0,
          dayName: 'Пн',
          fullDayName: 'Понедельник',
          activities: [
            {
              id: `act_${Date.now()}_0`,
              sportType: 'strength',
              title: 'Силовая: Push (Грудь, Плечи, Трицепс)',
              startTime: '18:30',
              durationMinutes: 60,
              intensity: 'high',
              notes: 'Базовый силовой сплит',
            },
          ],
        },
        {
          dayOfWeek: 1,
          dayName: 'Вт',
          fullDayName: 'Вторник',
          activities: [
            {
              id: `act_${Date.now()}_1`,
              sportType: 'boxing',
              title: 'Бокс: Отработка ударов и челнок',
              startTime: '19:00',
              durationMinutes: 75,
              intensity: 'high',
              notes: 'Мешок, лапы, скакалка',
            },
          ],
        },
        {
          dayOfWeek: 2,
          dayName: 'Ср',
          fullDayName: 'Среда',
          activities: [
            {
              id: `act_${Date.now()}_2`,
              sportType: 'strength',
              title: 'Силовая: Pull (Спина, Дельты, Бицепс)',
              startTime: '18:30',
              durationMinutes: 60,
              intensity: 'high',
              notes: 'Тяжелые тяги и подтягивания',
            },
          ],
        },
        {
          dayOfWeek: 3,
          dayName: 'Чт',
          fullDayName: 'Четверг',
          activities: [
            {
              id: `act_${Date.now()}_3`,
              sportType: 'boxing',
              title: 'Бокс: Спарринги и защита',
              startTime: '19:00',
              durationMinutes: 60,
              intensity: 'medium',
              notes: 'Техника, работа в парах',
            },
          ],
        },
        {
          dayOfWeek: 4,
          dayName: 'Пт',
          fullDayName: 'Пятница',
          activities: [
            {
              id: `act_${Date.now()}_4`,
              sportType: 'strength',
              title: 'Силовая: Legs & Core (Ноги и Пресс)',
              startTime: '18:30',
              durationMinutes: 65,
              intensity: 'high',
              notes: 'Приседания, выпады, пресс',
            },
          ],
        },
        {
          dayOfWeek: 5,
          dayName: 'Сб',
          fullDayName: 'Суббота',
          activities: [
            {
              id: `act_${Date.now()}_5`,
              sportType: 'boxing',
              title: 'Бокс: Восстановительный кросс-раунд',
              startTime: '11:00',
              durationMinutes: 50,
              intensity: 'medium',
              notes: 'Бой с тенью, растяжка',
            },
          ],
        },
        {
          dayOfWeek: 6,
          dayName: 'Вс',
          fullDayName: 'Воскресенье',
          activities: [
            {
              id: `act_${Date.now()}_6`,
              sportType: 'rest',
              title: 'День отдыха и суперкомпенсации',
              startTime: '10:00',
              durationMinutes: 30,
              intensity: 'low',
              notes: 'Восстановление',
            },
          ],
        },
      ]);
    } else if (preset === 'basket_and_iron') {
      setSchedule([
        {
          dayOfWeek: 0,
          dayName: 'Пн',
          fullDayName: 'Понедельник',
          activities: [
            {
              id: `act_${Date.now()}_0`,
              sportType: 'strength',
              title: 'Силовая: Верх тела (Грудь и Спина)',
              startTime: '18:00',
              durationMinutes: 60,
              intensity: 'high',
            },
          ],
        },
        {
          dayOfWeek: 1,
          dayName: 'Вт',
          fullDayName: 'Вторник',
          activities: [
            {
              id: `act_${Date.now()}_1`,
              sportType: 'basketball',
              title: 'Баскетбол: Тренировка бросков и дриблинга',
              startTime: '19:30',
              durationMinutes: 75,
              intensity: 'medium',
            },
          ],
        },
        {
          dayOfWeek: 2,
          dayName: 'Ср',
          fullDayName: 'Среда',
          activities: [
            {
              id: `act_${Date.now()}_2`,
              sportType: 'strength',
              title: 'Силовая: Низ тела (Ноги и Пресс)',
              startTime: '18:00',
              durationMinutes: 60,
              intensity: 'high',
            },
          ],
        },
        {
          dayOfWeek: 3,
          dayName: 'Чт',
          fullDayName: 'Четверг',
          activities: [
            {
              id: `act_${Date.now()}_3`,
              sportType: 'rest',
              title: 'Отдых перед игрой',
              startTime: '20:00',
              durationMinutes: 0,
              intensity: 'low',
            },
          ],
        },
        {
          dayOfWeek: 4,
          dayName: 'Пт',
          fullDayName: 'Пятница',
          activities: [
            {
              id: `act_${Date.now()}_4`,
              sportType: 'strength',
              title: 'Силовая: Плечи и Руки',
              startTime: '18:00',
              durationMinutes: 55,
              intensity: 'medium',
            },
          ],
        },
        {
          dayOfWeek: 5,
          dayName: 'Сб',
          fullDayName: 'Суббота',
          activities: [
            {
              id: `act_${Date.now()}_5`,
              sportType: 'basketball',
              title: 'Баскетбол: Игра на счет 5х5',
              startTime: '11:00',
              durationMinutes: 90,
              intensity: 'high',
            },
          ],
        },
        {
          dayOfWeek: 6,
          dayName: 'Вс',
          fullDayName: 'Воскресенье',
          activities: [
            {
              id: `act_${Date.now()}_6`,
              sportType: 'rest',
              title: 'Восстановление',
              startTime: '12:00',
              durationMinutes: 0,
              intensity: 'low',
            },
          ],
        },
      ]);
    }
  };

  const handleAddActivity = (dayIndex: number) => {
    const next = [...schedule];
    const newAct: DayActivityItem = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sportType: 'boxing',
      title: 'Бокс: тренировка',
      startTime: '19:00',
      durationMinutes: 60,
      intensity: 'high',
      notes: '',
    };
    next[dayIndex].activities.push(newAct);
    setSchedule(next);
  };

  const handleDeleteActivity = (dayIndex: number, actId: string) => {
    const next = [...schedule];
    next[dayIndex].activities = next[dayIndex].activities.filter((a) => a.id !== actId);
    setSchedule(next);
  };

  const handleUpdateActivity = (
    dayIndex: number,
    actId: string,
    field: keyof DayActivityItem,
    val: any
  ) => {
    const next = [...schedule];
    const target = next[dayIndex].activities.find((a) => a.id === actId);
    if (target) {
      (target as any)[field] = val;
      if (field === 'sportType') {
        const def = SPORT_DEFINITIONS[val as SportType];
        if (def && (!target.title || target.title.includes('тренировка') || target.title.includes('Силовая') || target.title.includes('Бокс') || target.title.includes('Баскетбол'))) {
          target.title = `${def.nameRu}: занятие`;
        }
      }
      setSchedule(next);
    }
  };

  const currentDay = schedule[selectedDayIdx];

  const getSportIcon = (sport: SportType) => {
    switch (sport) {
      case 'strength':
        return <Dumbbell className="w-4 h-4 text-[#58C995]" />;
      case 'boxing':
        return <Swords className="w-4 h-4 text-[#E06D53]" />;
      case 'basketball':
        return <Trophy className="w-4 h-4 text-[#E5A93C]" />;
      case 'running':
        return <Zap className="w-4 h-4 text-[#4EA5D9]" />;
      case 'cycling':
        return <Bike className="w-4 h-4 text-[#44CF6C]" />;
      case 'swimming':
        return <Waves className="w-4 h-4 text-[#2EC4B6]" />;
      case 'rest':
        return <Moon className="w-4 h-4 text-[#92999A]" />;
      default:
        return <Activity className="w-4 h-4 text-[#A06CD5]" />;
    }
  };

  // Weekly total load calculation
  const totalWeeklyMinutes = schedule.reduce((acc, d) => {
    return acc + d.activities.reduce((sub, a) => sub + (a.durationMinutes || 0), 0);
  }, 0);

  const totalWeeklySessions = schedule.reduce((acc, d) => acc + d.activities.length, 0);

  return (
    <motion.div
      variants={modalBackdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3"
    >
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-lg bg-[#101719] border border-[#252D2F] rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#252D2F] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#E8E9E7] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#58C995]" />
              Конструктор недельного расписания
            </h2>
            <p className="text-[11px] text-[#92999A] mt-0.5">
              Учет силовой нагрузки, бокса, баскетбола и других видов спорта
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#92999A] hover:text-[#E8E9E7] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets Toolbar */}
        <div className="px-4 pt-3 pb-2 border-b border-[#252D2F]/60 bg-[#0d1315] space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider">
              Готовые шаблоны недели:
            </span>
            <button
              onClick={() => handleApplyPreset('clear')}
              className="text-[10px] text-[#C83232] hover:underline"
            >
              Очистить неделю
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => handleApplyPreset('box_and_iron')}
              className="px-2.5 py-1 bg-[#1c2426] hover:bg-[#252f32] text-[#E8E9E7] rounded-lg text-[11px] font-semibold border border-[#2e393b] whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <Swords className="w-3.5 h-3.5 text-[#E06D53]" />
              <span>3 Силовых + 3 Бокса (референс)</span>
            </button>

            <button
              onClick={() => handleApplyPreset('basket_and_iron')}
              className="px-2.5 py-1 bg-[#1c2426] hover:bg-[#252f32] text-[#E8E9E7] rounded-lg text-[11px] font-semibold border border-[#2e393b] whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5 text-[#E5A93C]" />
              <span>Силовые + Баскетбол</span>
            </button>
          </div>
        </div>

        {/* Days of Week Tabs: Пн, Вт, Ср, Чт, Пт, Сб, Вс */}
        <div className="px-3 pt-3 pb-1 shrink-0">
          <div className="grid grid-cols-7 gap-1 bg-[#080D0E] p-1 rounded-xl border border-[#202729]">
            {schedule.map((day, idx) => {
              const isSelected = selectedDayIdx === idx;
              const hasStrength = day.activities.some((a) => a.sportType === 'strength');
              const hasBoxing = day.activities.some((a) => a.sportType === 'boxing');
              const hasBasketball = day.activities.some((a) => a.sportType === 'basketball');
              const hasOther = day.activities.some(
                (a) => !['strength', 'boxing', 'basketball', 'rest'].includes(a.sportType)
              );

              return (
                <button
                  key={day.dayOfWeek}
                  onClick={() => setSelectedDayIdx(idx)}
                  className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer flex flex-col items-center justify-between ${
                    isSelected
                      ? 'bg-[#14231b] border border-[#2f553f] text-[#58C995]'
                      : 'text-[#92999A] hover:text-[#E8E9E7]'
                  }`}
                >
                  <span className="text-xs font-bold block">{day.dayName}</span>
                  {/* Indicator dots for scheduled sports */}
                  <div className="flex gap-0.5 mt-1 h-1.5">
                    {hasStrength && <div className="w-1.5 h-1.5 rounded-full bg-[#58C995]" />}
                    {hasBoxing && <div className="w-1.5 h-1.5 rounded-full bg-[#E06D53]" />}
                    {hasBasketball && <div className="w-1.5 h-1.5 rounded-full bg-[#E5A93C]" />}
                    {hasOther && <div className="w-1.5 h-1.5 rounded-full bg-[#4EA5D9]" />}
                    {day.activities.length === 0 && (
                      <div className="w-1 h-1 rounded-full bg-[#333]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#E8E9E7]">
                {currentDay.fullDayName}
              </h3>
              <span className="text-xs text-[#92999A]">
                {currentDay.activities.length === 0
                  ? 'Нет запланированных занятий (свободный день)'
                  : `${currentDay.activities.length} запланированных активности`}
              </span>
            </div>

            <button
              onClick={() => handleAddActivity(selectedDayIdx)}
              className="py-1.5 px-3 bg-[#14231b] border border-[#2f553f] text-[#58C995] rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[#1a3124] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить занятие</span>
            </button>
          </div>

          {/* List of activities for this day */}
          {currentDay.activities.length === 0 ? (
            <div className="p-8 text-center bg-[#080D0E] rounded-xl border border-[#202729] space-y-2">
              <Moon className="w-8 h-8 text-[#555] mx-auto" />
              <p className="text-xs font-semibold text-[#E8E9E7]">
                В этот день занятий не запланировано
              </p>
              <p className="text-[11px] text-[#92999A]">
                Вы можете добавить силовую тренировку, бокс, баскетбол, бег или оставить день для отдыха.
              </p>
              <button
                onClick={() => handleAddActivity(selectedDayIdx)}
                className="mt-2 py-2 px-4 bg-[#171D1F] hover:bg-[#202729] border border-[#252D2F] rounded-xl text-xs font-bold text-[#58C995] inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Запланировать тренировку</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {currentDay.activities.map((act, actIdx) => {
                const sportDef = SPORT_DEFINITIONS[act.sportType] || SPORT_DEFINITIONS.other_sport;

                return (
                  <div
                    key={act.id}
                    className="p-3.5 bg-[#080D0E] border border-[#202729] rounded-xl space-y-3 relative group"
                  >
                    {/* Top Row: Sport Icon + Sport Selector + Delete */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#101719] border border-[#252D2F] flex items-center justify-center shrink-0">
                          {getSportIcon(act.sportType)}
                        </div>

                        <select
                          value={act.sportType}
                          onChange={(e) =>
                            handleUpdateActivity(
                              selectedDayIdx,
                              act.id,
                              'sportType',
                              e.target.value as SportType
                            )
                          }
                          className="bg-[#101719] border border-[#252D2F] rounded-lg px-2.5 py-1 text-xs text-[#E8E9E7] font-semibold focus:outline-none focus:border-[#58C995]"
                        >
                          <option value="strength">🏋️ Силовая тренировка</option>
                          <option value="boxing">🥊 Бокс / Единоборства</option>
                          <option value="basketball">🏀 Баскетбол</option>
                          <option value="running">🏃 Бег / Кардио</option>
                          <option value="cycling">🚴 Велоспорт</option>
                          <option value="swimming">🏊 Плавание</option>
                          <option value="other_sport">⚡ Другой вид спорта</option>
                          <option value="rest">🌙 День отдыха</option>
                        </select>
                      </div>

                      <button
                        onClick={() => handleDeleteActivity(selectedDayIdx, act.id)}
                        className="p-1.5 text-[#92999A] hover:text-[#C83232] rounded-lg transition-colors shrink-0"
                        title="Удалить активность"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Title Input */}
                    <div>
                      <label className="text-[10px] text-[#92999A] font-semibold block mb-1">
                        Название занятия
                      </label>
                      <input
                        type="text"
                        value={act.title}
                        onChange={(e) =>
                          handleUpdateActivity(selectedDayIdx, act.id, 'title', e.target.value)
                        }
                        placeholder="например: Силовая (Грудь и Трицепс) или Спарринги"
                        className="w-full bg-[#101719] border border-[#252D2F] rounded-lg px-2.5 py-1.5 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
                      />
                    </div>

                    {/* Start Time, Duration & Intensity Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-[#92999A] font-semibold block mb-1">
                          Время
                        </label>
                        <input
                          type="time"
                          value={act.startTime || '18:00'}
                          onChange={(e) =>
                            handleUpdateActivity(selectedDayIdx, act.id, 'startTime', e.target.value)
                          }
                          className="w-full bg-[#101719] border border-[#252D2F] rounded-lg px-2 py-1 text-xs text-[#E8E9E7] font-mono focus:outline-none focus:border-[#58C995]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[#92999A] font-semibold block mb-1">
                          Длительность
                        </label>
                        <div className="flex items-center bg-[#101719] border border-[#252D2F] rounded-lg px-2 py-1">
                          <input
                            type="number"
                            min="10"
                            max="240"
                            step="5"
                            value={act.durationMinutes}
                            onChange={(e) =>
                              handleUpdateActivity(
                                selectedDayIdx,
                                act.id,
                                'durationMinutes',
                                Number(e.target.value) || 45
                              )
                            }
                            className="w-full bg-transparent text-xs text-[#E8E9E7] font-mono focus:outline-none"
                          />
                          <span className="text-[10px] text-[#92999A] pl-1">мин</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-[#92999A] font-semibold block mb-1">
                          Интенсивность
                        </label>
                        <select
                          value={act.intensity}
                          onChange={(e) =>
                            handleUpdateActivity(
                              selectedDayIdx,
                              act.id,
                              'intensity',
                              e.target.value as ActivityIntensity
                            )
                          }
                          className="w-full bg-[#101719] border border-[#252D2F] rounded-lg px-1.5 py-1 text-[11px] text-[#E8E9E7] font-semibold focus:outline-none focus:border-[#58C995]"
                        >
                          <option value="low">🟢 Лёгкая</option>
                          <option value="medium">🟡 Средняя</option>
                          <option value="high">🔴 Высокая</option>
                        </select>
                      </div>
                    </div>

                    {/* Muscle impact explanation */}
                    {sportDef.primaryMuscles.length > 0 && (
                      <div className="p-2 bg-[#101719] rounded-lg border border-[#1d2426] text-[10px] text-[#92999A] flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#58C995] shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[#E8E9E7] font-semibold">Нагрузка на анатомию: </span>
                          <span>
                            {sportDef.primaryMuscles.map((m) => m).join(', ')} (основные),{' '}
                            {sportDef.secondaryMuscles.map((m) => m).join(', ')} (вторичные)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <input
                      type="text"
                      value={act.notes || ''}
                      onChange={(e) =>
                        handleUpdateActivity(selectedDayIdx, act.id, 'notes', e.target.value)
                      }
                      placeholder="Заметки: раунды, веса, экипировка..."
                      className="w-full bg-[#101719] border border-[#252D2F] rounded-lg px-2.5 py-1 text-[11px] text-[#92999A] focus:outline-none focus:border-[#58C995]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Summary & Save */}
        <div className="p-4 border-t border-[#252D2F] bg-[#0d1315] shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#92999A]">
            <span>Всего за неделю:</span>
            <span className="font-bold text-[#E8E9E7]">
              {totalWeeklySessions} тренировок • {Math.round(totalWeeklyMinutes / 60)} ч {totalWeeklyMinutes % 60} мин
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#171D1F] hover:bg-[#202729] text-[#92999A] font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                onSave(schedule);
                onClose();
              }}
              className="flex-1 py-2.5 bg-[#58C995] hover:bg-[#68d7a4] text-black font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Сохранить расписание
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
