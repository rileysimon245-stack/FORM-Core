import React, { useState } from 'react';
import { X, Check, AlertCircle, Dumbbell, Play, Plus, Swords, Trophy, Zap, Bike, Waves, Activity, Moon, Trash2, Edit3, Calendar } from 'lucide-react';
import { WorkoutSession, SportSession, SPORT_DEFINITIONS, SportType, WeeklyScheduleDay } from '../types/workout';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface DayDetailsModalProps {
  dateStr: string;
  currentStatus: 'completed' | 'skipped' | 'none';
  strengthSessions?: WorkoutSession[];
  sportSessions?: SportSession[];
  weeklySchedule?: WeeklyScheduleDay[];
  onSetStatus: (newStatus: 'completed' | 'skipped' | 'none') => void;
  onStartWorkoutForDay: () => void;
  onAddSportSession: (date: string) => void;
  onEditSportSession?: (session: SportSession) => void;
  onDeleteSportSession?: (sessionId: string) => void;
  onDeleteStrengthSession?: (sessionId: string) => void;
  onClose: () => void;
}

export const DayDetailsModal: React.FC<DayDetailsModalProps> = ({
  dateStr,
  currentStatus,
  strengthSessions = [],
  sportSessions = [],
  weeklySchedule = [],
  onSetStatus,
  onStartWorkoutForDay,
  onAddSportSession,
  onEditSportSession,
  onDeleteSportSession,
  onDeleteStrengthSession,
  onClose,
}) => {
  // Format Russian date e.g. "29 октября 2026, Четверг"
  const formatDateRu = (iso: string) => {
    try {
      const [y, m, d] = iso.split('-');
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      });
    } catch {
      return iso;
    }
  };

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

  const dayOfWeek = (() => {
    try {
      const [y, m, d] = dateStr.split('-');
      return (new Date(Number(y), Number(m) - 1, Number(d)).getDay() + 6) % 7;
    } catch {
      return 0;
    }
  })();
  const scheduledActivities = weeklySchedule[dayOfWeek]?.activities || [];

  const totalSessionsCount = strengthSessions.length + sportSessions.length;

  return (
    <motion.div
      variants={modalBackdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
    >
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-md bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-4 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#252D2F] shrink-0">
          <div>
            <span className="text-[11px] text-[#92999A] block font-medium capitalize">
              {formatDateRu(dateStr)}
            </span>
            <h3 className="text-base font-bold text-[#E8E9E7]">
              Активность дня ({totalSessionsCount} сессий)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#92999A] hover:text-[#E8E9E7] p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Activities List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {/* Current Day Status Badge */}
          <div className="p-2.5 bg-[#080D0E] rounded-xl border border-[#202729] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  currentStatus === 'completed'
                    ? 'bg-[#58C995]'
                    : currentStatus === 'skipped'
                    ? 'bg-[#C83232]'
                    : 'bg-[#444]'
                }`}
              />
              <span className="text-xs font-semibold text-[#E8E9E7]">
                {currentStatus === 'completed'
                  ? 'День выполнен'
                  : currentStatus === 'skipped'
                  ? 'День пропущен'
                  : 'Нет активных отметок'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onSetStatus('completed')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  currentStatus === 'completed'
                    ? 'bg-[#14231b] text-[#58C995] border border-[#2f553f]'
                    : 'text-[#92999A] hover:text-[#58C995]'
                }`}
              >
                Выполнено
              </button>
              <button
                onClick={() => onSetStatus('skipped')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  currentStatus === 'skipped'
                    ? 'bg-[#2a1714] text-[#C83232] border border-[#552720]'
                    : 'text-[#92999A] hover:text-[#C83232]'
                }`}
              >
                Пропуск
              </button>
              {currentStatus !== 'none' && (
                <button
                  onClick={() => onSetStatus('none')}
                  className="px-1.5 py-1 text-[10px] text-[#666] hover:text-[#999]"
                  title="Снять отметку"
                >
                  Сброс
                </button>
              )}
            </div>
          </div>

          {/* Scheduled in weekly plan */}
          {scheduledActivities.length > 0 && (
            <div className="p-3 bg-[#111c18] border border-[#234234] rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-[#58C995] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Запланировано по расписанию ({scheduledActivities.length})</span>
              </span>
              {scheduledActivities.map((act) => (
                <div key={act.id} className="flex items-center justify-between bg-[#0b1411] p-2 rounded-lg border border-[#1b3026]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#162a20] flex items-center justify-center text-[#58C995]">
                      {getSportIcon(act.sportType)}
                    </div>
                    <div>
                      <span className="font-semibold text-xs text-[#E8E9E7] block">{act.title}</span>
                      <span className="text-[10px] text-[#92999A]">{act.startTime} • ~{act.durationMinutes} мин</span>
                    </div>
                  </div>
                  {act.sportType === 'strength' ? (
                    <button
                      onClick={() => {
                        onStartWorkoutForDay();
                        onClose();
                      }}
                      className="px-2 py-1 bg-[#58C995] text-black text-[10px] font-bold rounded-lg hover:bg-[#68d7a4] cursor-pointer"
                    >
                      Начать
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        onAddSportSession(dateStr);
                        onClose();
                      }}
                      className="px-2 py-1 bg-[#233f33] text-[#58C995] text-[10px] font-bold rounded-lg hover:bg-[#2d5041] cursor-pointer"
                    >
                      Записать
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Strength Sessions Section */}
          {strengthSessions.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block">
                Выполненные силовые ({strengthSessions.length})
              </span>
              {strengthSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3 bg-[#080D0E] border border-[#202729] rounded-xl space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#14231b] border border-[#2f553f] flex items-center justify-center text-[#58C995]">
                        <Dumbbell className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-[#E8E9E7]">{sess.name}</h4>
                        <span className="text-[10px] text-[#92999A]">
                          {sess.programName || 'Силовая сессия'} • {sess.startTime || '18:00'}
                        </span>
                      </div>
                    </div>

                    {onDeleteStrengthSession && (
                      <button
                        onClick={() => onDeleteStrengthSession(sess.id)}
                        className="p-1 text-[#92999A] hover:text-[#C83232] cursor-pointer"
                        title="Удалить запись"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 py-1.5 bg-[#101719] rounded-lg px-2 text-center text-[11px]">
                    <div>
                      <span className="text-[9px] text-[#92999A] block">Время</span>
                      <span className="font-bold text-[#E8E9E7]">{sess.durationMinutes} мин</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#92999A] block">Тоннаж</span>
                      <span className="font-bold text-[#58C995]">
                        {sess.totalVolumeKg?.toLocaleString('ru-RU') || 0} кг
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#92999A] block">Подходов</span>
                      <span className="font-bold text-[#E8E9E7]">{sess.completedSets}</span>
                    </div>
                  </div>

                  {sess.exercises && sess.exercises.length > 0 && (
                    <div className="text-[10px] text-[#92999A] bg-[#0c1214] p-1.5 rounded-lg border border-[#1a2224]">
                      <span className="text-[#C5CBCD] font-semibold">Упражнения: </span>
                      {sess.exercises.map((e) => e.name).join(', ')}
                    </div>
                  )}

                  {sess.notes && (
                    <p className="text-[10px] text-[#92999A] italic">«{sess.notes}»</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Multi-Sport Sessions Section (Boxing, Basketball, Running, etc.) */}
          {sportSessions.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block">
                Спортивные занятия ({sportSessions.length})
              </span>
              {sportSessions.map((sp) => {
                const sportDef = SPORT_DEFINITIONS[sp.sportType] || SPORT_DEFINITIONS.other_sport;

                return (
                  <div
                    key={sp.id}
                    className="p-3 bg-[#080D0E] border border-[#202729] rounded-xl space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#101719] border border-[#252D2F] flex items-center justify-center">
                          {getSportIcon(sp.sportType)}
                        </div>
                        <div>
                          <h4 className="font-bold text-[#E8E9E7]">{sp.title}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-[#92999A]">
                              {sp.startTime || '19:00'} • {sp.actualDurationMinutes || sp.plannedDurationMinutes} мин
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                sp.intensity === 'high'
                                  ? 'bg-[#2a1714] text-[#E06D53]'
                                  : sp.intensity === 'medium'
                                  ? 'bg-[#2b2210] text-[#E5A93C]'
                                  : 'bg-[#14231b] text-[#58C995]'
                              }`}
                            >
                              {sp.intensity === 'high' ? 'Высокая' : sp.intensity === 'medium' ? 'Средняя' : 'Лёгкая'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {onEditSportSession && (
                          <button
                            onClick={() => onEditSportSession(sp)}
                            className="p-1 text-[#92999A] hover:text-[#58C995]"
                            title="Изменить занятие"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteSportSession && (
                          <button
                            onClick={() => onDeleteSportSession(sp.id)}
                            className="p-1 text-[#92999A] hover:text-[#C83232]"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Load points strip */}
                    <div className="flex items-center justify-between text-[10px] text-[#92999A] bg-[#101719] px-2.5 py-1.5 rounded-lg border border-[#1d2426]">
                      <span>Нагрузка: ~{sp.loadScore || 50} баллов</span>
                      <span className="font-semibold text-[#E8E9E7]">
                        Статус: {sp.status === 'completed' ? 'Выполнено' : sp.status === 'planned' ? 'Запланировано' : 'Пропущено'}
                      </span>
                    </div>

                    {sp.notes && (
                      <p className="text-[10px] text-[#92999A] italic">«{sp.notes}»</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalSessionsCount === 0 && (
            <div className="p-6 text-center text-[#92999A] bg-[#080D0E] rounded-xl border border-[#202729] space-y-1">
              <Calendar className="w-6 h-6 text-[#555] mx-auto mb-1" />
              <p className="font-semibold text-[#E8E9E7]">На этот день пока нет записей</p>
              <p className="text-[11px]">
                Нажмите кнопки ниже, чтобы начать силовую тренировку или записать бокс, баскетбол и др.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="space-y-2 pt-2 border-t border-[#252D2F] shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onAddSportSession(dateStr);
                onClose();
              }}
              className="py-2.5 px-3 bg-[#101719] hover:bg-[#1a2326] border border-[#252D2F] text-[#E8E9E7] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#58C995]" />
              <span>+ Бокс / Спорт</span>
            </button>

            <button
              onClick={() => {
                onStartWorkoutForDay();
                onClose();
              }}
              className="py-2.5 px-3 bg-[#58C995] hover:bg-[#68d7a4] text-black text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-md cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Силовая сессия</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
