import React, { useState, useMemo } from 'react';
import { UserProfile, MuscleLoadStats, MuscleGroup, WorkoutSession } from '../types/workout';
import { MuscleMap } from './MuscleMap';
import { StorageService } from '../services/storage';
import { FormSelect } from './common/FormSelect';
import {
  User,
  Edit2,
  TrendingUp,
  Award,
  Zap,
  Clock,
  Settings,
  CheckCircle2,
  ChevronRight,
  Sliders,
  Dumbbell,
  Shield,
  Activity,
  X,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface ProfileTabProps {
  profile: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  muscleStats: Record<MuscleGroup, MuscleLoadStats>;
  sessions: WorkoutSession[];
  onOpenEquipment: () => void;
  onOpenParameters: () => void;
  onOpenSettings: () => void;
}

const LIFT_NAMES = {
  bench: 'Жим штанги лежа',
  squat: 'Приседания со штангой',
  deadlift: 'Становая тяга',
  pullups: 'Подтягивания',
};

export const ProfileTab: React.FC<ProfileTabProps> = ({
  profile,
  onUpdateProfile,
  muscleStats,
  sessions,
  onOpenEquipment,
  onOpenParameters,
  onOpenSettings,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(profile.name || '');
  const [editAge, setEditAge] = useState(profile.age > 0 ? String(profile.age) : '');
  const [editHeight, setEditHeight] = useState(profile.heightCm > 0 ? String(profile.heightCm) : '');
  const [editWeight, setEditWeight] = useState(profile.weightKg > 0 ? String(profile.weightKg) : '');
  const [editGoal, setEditGoal] = useState(profile.fitnessGoal || '');
  const [editLevel, setEditLevel] = useState(profile.experienceLevel || 'Средний');

  // Selected lift for weight progression
  const [selectedLift, setSelectedLift] = useState<'bench' | 'squat' | 'deadlift' | 'pullups'>('bench');

  const userParams = StorageService.getUserParameters();
  const equipmentList = StorageService.getEquipmentList();
  const activeEquipmentCount = equipmentList.filter((e) => e.selected || e.owned).length;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      name: editName.trim(),
      age: Number(editAge) || 0,
      heightCm: Number(editHeight) || 0,
      weightKg: Number(editWeight) || 0,
      fitnessGoal: editGoal.trim() || 'Развитие мышц',
      experienceLevel: editLevel || 'Средний',
    };
    onUpdateProfile(updated);

    // Synchronize to user fitness parameters
    const currentParams = StorageService.getUserParameters();
    StorageService.saveUserParameters({
      ...currentParams,
      goal: (updated.fitnessGoal as any) || currentParams.goal,
      level: (updated.experienceLevel as any) || currentParams.level,
    });

    setIsEditingProfile(false);
  };

  // Real lifetime stats computed strictly from actual sessions
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'completed'),
    [sessions]
  );
  const totalCompletedCount = completedSessions.length;
  const totalTonnageKg = useMemo(
    () => completedSessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 0),
    [completedSessions]
  );
  const totalTons = totalTonnageKg > 0 ? (totalTonnageKg / 1000).toFixed(1) : '0';

  const totalMinutes = completedSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const avgDurationMinutes = totalCompletedCount > 0 ? Math.round(totalMinutes / totalCompletedCount) : 0;

  const yearStats = StorageService.getYearStats();
  const realStreak = yearStats.streakDays || 0;
  const complianceRate =
    yearStats.total > 0 ? Math.round((yearStats.completed / yearStats.total) * 100) : 0;

  // Real Progression Data for selected lift
  const currentLiftName = LIFT_NAMES[selectedLift];
  const realLiftHistory = useMemo(() => {
    return StorageService.getExerciseHistory(currentLiftName);
  }, [currentLiftName, sessions]);

  const realPersonalRecord = useMemo(() => {
    return StorageService.getPersonalRecord(currentLiftName);
  }, [currentLiftName, sessions]);

  const hasLiftData = realLiftHistory.length > 0 || (realPersonalRecord && realPersonalRecord.maxWeight > 0);

  return (
    <div className="w-full flex flex-col pb-4 space-y-4">
      {/* Profile Header */}
      <div className="pt-2 px-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[#E8E9E7]">
          Профиль
        </h1>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setEditName(profile.name || '');
            setEditAge(profile.age > 0 ? String(profile.age) : '');
            setEditHeight(profile.heightCm > 0 ? String(profile.heightCm) : '');
            setEditWeight(profile.weightKg > 0 ? String(profile.weightKg) : '');
            setEditGoal(profile.fitnessGoal || '');
            setEditLevel(profile.experienceLevel || 'Средний');
            setIsEditingProfile(true);
          }}
          className="px-3 py-1.5 bg-[#101719] border border-[#252D2F] rounded-xl text-xs font-semibold text-[#92999A] hover:text-[#E8E9E7] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Edit2 className="w-3.5 h-3.5 text-[#58C995]" />
          <span>Изменить</span>
        </motion.button>
      </div>

      {/* Athlete Bio Card */}
      <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#14231b] border border-[#2f553f] flex items-center justify-center text-[#58C995] shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#E8E9E7] truncate">
                {profile.name || 'Не указано'}
              </h2>
              <span className="text-[10px] text-[#92999A] bg-[#080D0E] px-2 py-0.5 rounded-md border border-[#202729]">
                {profile.experienceLevel || 'Средний уровень'}
              </span>
            </div>
            <span className="text-xs text-[#58C995] font-semibold block truncate mt-0.5">
              {profile.fitnessGoal || 'Цель не выбрана'}
            </span>
          </div>
        </div>

        {/* 4 Stats Grid: Age, Height, Weight, Total Sessions */}
        <div className="grid grid-cols-4 gap-2 text-center py-2.5 bg-[#080D0E] rounded-xl border border-[#202729]">
          <div>
            <span className="text-[10px] text-[#92999A] block">Возраст</span>
            <span className="text-xs sm:text-sm font-bold text-[#E8E9E7] tabular-nums">
              {profile.age > 0 ? `${profile.age} лет` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#92999A] block">Рост</span>
            <span className="text-xs sm:text-sm font-bold text-[#E8E9E7] tabular-nums">
              {profile.heightCm > 0 ? `${profile.heightCm} см` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#92999A] block">Вес</span>
            <span className="text-xs sm:text-sm font-bold text-[#E8E9E7] tabular-nums">
              {profile.weightKg > 0 ? `${profile.weightKg} кг` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#92999A] block">Тренировок</span>
            <span className="text-xs sm:text-sm font-bold text-[#58C995] tabular-nums">
              {totalCompletedCount}
            </span>
          </div>
        </div>
      </div>

      {/* PERSONAL FITNESS SETTINGS & EQUIPMENT ENTRANCES */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block px-1">
          Персональные настройки и инвентарь
        </span>

        {/* 1. Мои параметры */}
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={onOpenParameters}
          className="w-full text-left bg-[#101719] border border-[#252D2F] hover:border-[#58C995] rounded-2xl p-4 transition-all flex items-center justify-between group cursor-pointer"
        >
          <div className="space-y-1.5 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#14231b] text-[#58C995] flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-[#E8E9E7] group-hover:text-[#58C995] transition-colors">
                Мои параметры
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#92999A]">
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729] text-[#58C995]">
                {userParams.goal || 'Цель не выбрана'}
              </span>
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729]">
                {userParams.level || 'Уровень не указан'}
              </span>
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729]">
                {userParams.location || 'Локация не выбрана'}
              </span>
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729]">
                {userParams.daysPerWeek > 0 ? `${userParams.daysPerWeek} дня/нед` : 'Дни не выбраны'}
              </span>
            </div>

            {userParams.healthRestrictions && userParams.healthRestrictions.length > 0 && (
              <p className="text-[10px] text-[#c87a32] flex items-center gap-1">
                <span>Ограничения: {userParams.healthRestrictions.join(', ')}</span>
              </p>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-[#92999A] group-hover:text-[#58C995] transition-colors shrink-0" />
        </motion.button>

        {/* 2. Мой инвентарь */}
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={onOpenEquipment}
          className="w-full text-left bg-[#101719] border border-[#252D2F] hover:border-[#58C995] rounded-2xl p-4 transition-all flex items-center justify-between group cursor-pointer"
        >
          <div className="space-y-1.5 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#14231b] text-[#58C995] flex items-center justify-center">
                <Dumbbell className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-[#E8E9E7] group-hover:text-[#58C995] transition-colors">
                Мой инвентарь
              </span>
            </div>

            <p className="text-[11px] text-[#92999A]">
              {activeEquipmentCount > 0 ? (
                <>Выбрано: <span className="font-bold text-[#58C995]">{activeEquipmentCount} предметов</span></>
              ) : (
                <span className="text-[#92999A]">Инвентарь не выбран (0 предметов)</span>
              )}
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-[#92999A] group-hover:text-[#58C995] transition-colors shrink-0" />
        </motion.button>
      </div>

      {/* ANATOMICAL MUSCLE MAP */}
      <div className="w-full pt-1">
        <MuscleMap stats={muscleStats} onOpenSettings={onOpenSettings} />
      </div>

      {/* WORKING WEIGHT PROGRESSION (1RM / ИСТОРИЯ ВЕСОВ) */}
      <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#58C995]" />
            <span className="text-sm font-bold text-[#E8E9E7]">
              Динамика рабочих весов
            </span>
          </div>
          {realPersonalRecord && realPersonalRecord.maxWeight > 0 ? (
            <span className="text-xs font-bold text-[#58C995] tabular-nums">
              {realPersonalRecord.maxWeight} кг (макс)
            </span>
          ) : (
            <span className="text-xs text-[#92999A]">Пока нет рекорда</span>
          )}
        </div>

        {/* Lift Selector Pills */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#080D0E] rounded-xl border border-[#202729]">
          {(['bench', 'squat', 'deadlift', 'pullups'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedLift(key)}
              className={`py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                selectedLift === key
                  ? 'bg-[#14231b] text-[#58C995] border border-[#2f553f]'
                  : 'text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              {key === 'bench' ? 'Жим' : key === 'squat' ? 'Присед' : key === 'deadlift' ? 'Тяга' : 'Турник'}
            </button>
          ))}
        </div>

        {/* Progression Visualizer or Clean Empty State */}
        {hasLiftData ? (
          <div className="bg-[#080D0E] rounded-xl p-3 border border-[#202729]">
            <span className="text-xs text-[#92999A] font-medium block mb-2">
              {currentLiftName} — прогресс по тренировкам:
            </span>
            <div className="flex items-end justify-between h-24 pt-4 px-2 gap-3">
              {realLiftHistory.map((pt, idx) => {
                const maxVal = Math.max(...realLiftHistory.map((h) => h.maxWeight), 1);
                const heightPercent = Math.max(15, Math.round((pt.maxWeight / maxVal) * 100));

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[10px] font-bold text-[#E8E9E7] tabular-nums">
                      {pt.maxWeight}
                    </span>
                    <div className="w-full bg-[#1b2224] rounded-t-md h-full max-h-16 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-[#58C995] rounded-t-md transition-all duration-500"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#92999A]">{pt.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-[#080D0E] rounded-xl p-4 border border-[#202729] text-center space-y-1.5">
            <AlertCircle className="w-5 h-5 text-[#92999A] mx-auto opacity-70" />
            <p className="text-xs font-semibold text-[#E8E9E7]">
              Пока нет данных для «{currentLiftName}»
            </p>
            <p className="text-[11px] text-[#6b7577] max-w-xs mx-auto">
              Проведите тренировку с записью рабочих весов в этом упражнении, чтобы увидеть динамику и личные рекорды.
            </p>
          </div>
        )}
      </div>

      {/* OVERALL ACTIVITY & REAL LIFETIME STATS */}
      <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-3">
        <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block">
          Общая статистика активности
        </span>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729]">
            <div className="flex items-center gap-2 text-xs text-[#92999A] mb-1">
              <Award className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Общий тоннаж</span>
            </div>
            <span className="text-lg font-bold text-[#E8E9E7] tabular-nums">
              {totalTons} тонн
            </span>
          </div>

          <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729]">
            <div className="flex items-center gap-2 text-xs text-[#92999A] mb-1">
              <Zap className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Регулярность</span>
            </div>
            <span className="text-lg font-bold text-[#E8E9E7] tabular-nums">
              {complianceRate}%
            </span>
          </div>

          <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729]">
            <div className="flex items-center gap-2 text-xs text-[#92999A] mb-1">
              <Clock className="w-3.5 h-3.5 text-[#92999A]" />
              <span>Ср. длительность</span>
            </div>
            <span className="text-lg font-bold text-[#E8E9E7] tabular-nums">
              {avgDurationMinutes > 0 ? `${avgDurationMinutes} мин` : '—'}
            </span>
          </div>

          <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729]">
            <div className="flex items-center gap-2 text-xs text-[#92999A] mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Дней без пропуска</span>
            </div>
            <span className="text-lg font-bold text-[#58C995] tabular-nums">
              {realStreak} дней
            </span>
          </div>
        </div>
      </div>

      {/* APP SETTINGS ENTRANCE (Single entry point to settings per requirement 5) */}
      <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4">
        <button
          onClick={onOpenSettings}
          className="w-full py-3.5 px-3.5 bg-[#080D0E] border border-[#202729] hover:border-[#58C995] rounded-xl flex items-center justify-between text-xs text-[#E8E9E7] font-semibold transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#14231b] border border-[#2f553f] flex items-center justify-center text-[#58C995] group-hover:scale-105 transition-transform">
              <Settings className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="block text-sm font-bold text-[#E8E9E7] group-hover:text-[#58C995] transition-colors">
                Настройки приложения
              </span>
              <span className="block text-[11px] text-[#92999A]">
                Внешний вид, таймер отдыха, вибрация, уведомления
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#92999A] group-hover:text-[#58C995] transition-colors" />
        </button>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditingProfile && (
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
              className="w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-1 border-b border-[#252D2F]">
                <h3 className="text-base font-bold text-[#E8E9E7]">Редактирование профиля</h3>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsEditingProfile(false)}
                  className="p-1 text-[#92999A] hover:text-[#E8E9E7] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#92999A] mb-1">
                    Имя пользователя
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Например, Иван"
                    className="w-full bg-[#080D0E] border border-[#252D2F] focus:border-[#58C995] rounded-xl px-3 py-2 text-sm text-[#E8E9E7] outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#92999A] mb-1">
                      Возраст
                    </label>
                    <input
                      type="number"
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value)}
                      placeholder="—"
                      className="w-full bg-[#080D0E] border border-[#252D2F] focus:border-[#58C995] rounded-xl px-2.5 py-2 text-sm text-[#E8E9E7] outline-none text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#92999A] mb-1">
                      Рост (см)
                    </label>
                    <input
                      type="number"
                      value={editHeight}
                      onChange={(e) => setEditHeight(e.target.value)}
                      placeholder="—"
                      className="w-full bg-[#080D0E] border border-[#252D2F] focus:border-[#58C995] rounded-xl px-2.5 py-2 text-sm text-[#E8E9E7] outline-none text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#92999A] mb-1">
                      Вес (кг)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      placeholder="—"
                      className="w-full bg-[#080D0E] border border-[#252D2F] focus:border-[#58C995] rounded-xl px-2.5 py-2 text-sm text-[#E8E9E7] outline-none text-center"
                    />
                  </div>
                </div>

                {/* Level of preparation */}
                <div>
                  <label className="block text-xs font-semibold text-[#92999A] mb-1.5">
                    Уровень подготовки
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Начинающий', 'Средний', 'Продвинутый'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setEditLevel(lvl)}
                        className={`py-2 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                          editLevel === lvl
                            ? 'bg-[#14231b] text-[#58C995] border-[#58C995]'
                            : 'bg-[#080D0E] text-[#92999A] border-[#252D2F] hover:text-[#E8E9E7]'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Goal Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[#92999A] mb-1.5">
                    Основная цель
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['Развитие мышц', 'Сила', 'Похудение / Рельеф', 'Выносливость', 'Общая форма'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setEditGoal(g)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                          editGoal === g
                            ? 'bg-[#14231b] text-[#58C995] border-[#58C995]'
                            : 'bg-[#080D0E] text-[#92999A] border-[#252D2F]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={editGoal}
                    onChange={(e) => setEditGoal(e.target.value)}
                    placeholder="Или укажите свою цель..."
                    className="w-full bg-[#080D0E] border border-[#252D2F] focus:border-[#58C995] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#252D2F]">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="flex-1 py-2.5 bg-[#080D0E] border border-[#252D2F] rounded-xl text-xs font-bold text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#58C995] text-black font-extrabold text-xs rounded-xl hover:bg-[#68d7a4] transition-colors cursor-pointer shadow-md"
                  >
                    Сохранить изменения
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
