import React, { useState, useMemo } from 'react';
import { UserProfile, MuscleLoadStats, MuscleGroup, WorkoutSession } from '../types/workout';
import { StorageService } from '../services/storage';
import { FormSelect } from './common/FormSelect';
import { ExerciseProgressModal } from './ExerciseProgressModal';
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
import { DS, DS_CARD, DS_BUTTON, DS_INPUT, DS_MODAL } from '../styles/designSystem';

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
  const [showDetailedProgress, setShowDetailedProgress] = useState(false);

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
        <h1 className="text-2xl font-bold tracking-tight text-[#F0F3F2]">
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
          className="h-9 px-3 bg-[#121A1C] border border-[#1C2628] rounded-xl text-xs font-semibold text-[#9AA3A5] hover:text-[#F0F3F2] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Edit2 className="w-3.5 h-3.5 text-[#58C995]" />
          <span>Изменить</span>
        </motion.button>
      </div>

      {/* Athlete Bio Card */}
      <div className={`${DS_CARD.base}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#11241C] border border-[#2A5943] flex items-center justify-center text-[#58C995] shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#F0F3F2] truncate">
                {profile.name || 'Не указано'}
              </h2>
              <span className="text-[10px] text-[#9AA3A5] bg-[#0A1012] px-2 py-0.5 rounded-lg border border-[#161F21]">
                {profile.experienceLevel || 'Средний уровень'}
              </span>
            </div>
            <span className="text-xs text-[#58C995] font-semibold block truncate mt-0.5">
              {profile.fitnessGoal || 'Цель не выбрана'}
            </span>
          </div>
        </div>

        {/* 4 Stats Grid: Age, Height, Weight, Total Sessions */}
        <div className="grid grid-cols-4 gap-2 text-center py-2.5 bg-[#0A1012] rounded-xl border border-[#161F21]">
          <div>
            <span className="text-[10px] text-[#5F6B6E] block font-medium">Возраст</span>
            <span className="text-xs sm:text-sm font-bold text-[#F0F3F2] font-mono tabular-nums">
              {profile.age > 0 ? `${profile.age} лет` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#5F6B6E] block font-medium">Рост</span>
            <span className="text-xs sm:text-sm font-bold text-[#F0F3F2] font-mono tabular-nums">
              {profile.heightCm > 0 ? `${profile.heightCm} см` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#5F6B6E] block font-medium">Вес</span>
            <span className="text-xs sm:text-sm font-bold text-[#F0F3F2] font-mono tabular-nums">
              {profile.weightKg > 0 ? `${profile.weightKg} кг` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#5F6B6E] block font-medium">Тренировок</span>
            <span className="text-xs sm:text-sm font-bold text-[#58C995] font-mono tabular-nums">
              {totalCompletedCount}
            </span>
          </div>
        </div>
      </div>

      {/* PERSONAL FITNESS SETTINGS & EQUIPMENT ENTRANCES */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-[#9AA3A5] uppercase tracking-wider block px-1">
          Персональные настройки и инвентарь
        </span>

        {/* 1. Мои параметры */}
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={onOpenParameters}
          className="w-full text-left bg-[#121A1C] border border-[#1C2628] hover:border-[#31644E] rounded-2xl p-4 transition-all flex items-center justify-between group cursor-pointer"
        >
          <div className="space-y-1.5 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#11241C] text-[#58C995] flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-[#F0F3F2] group-hover:text-[#58C995] transition-colors">
                Мои параметры
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#9AA3A5]">
              <span className="px-2 py-0.5 bg-[#0A1012] rounded-md border border-[#161F21] text-[#58C995]">
                {userParams.goal || 'Цель не выбрана'}
              </span>
              <span className="px-2 py-0.5 bg-[#0A1012] rounded-md border border-[#161F21]">
                {userParams.level || 'Уровень не указан'}
              </span>
              <span className="px-2 py-0.5 bg-[#0A1012] rounded-md border border-[#161F21]">
                {userParams.location || 'Локация не выбрана'}
              </span>
              <span className="px-2 py-0.5 bg-[#0A1012] rounded-md border border-[#161F21]">
                {userParams.daysPerWeek > 0 ? `${userParams.daysPerWeek} дня/нед` : 'Дни не выбраны'}
              </span>
            </div>

            {userParams.healthRestrictions && userParams.healthRestrictions.length > 0 && (
              <p className="text-[10px] text-[#E5A842] flex items-center gap-1">
                <span>Ограничения: {userParams.healthRestrictions.join(', ')}</span>
              </p>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-[#9AA3A5] group-hover:text-[#58C995] transition-colors shrink-0" />
        </motion.button>

        {/* 2. Мой инвентарь */}
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={onOpenEquipment}
          className="w-full text-left bg-[#121A1C] border border-[#1C2628] hover:border-[#31644E] rounded-2xl p-4 transition-all flex items-center justify-between group cursor-pointer"
        >
          <div className="space-y-1.5 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#11241C] text-[#58C995] flex items-center justify-center">
                <Dumbbell className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-[#F0F3F2] group-hover:text-[#58C995] transition-colors">
                Мой инвентарь
              </span>
            </div>

            <p className="text-[11px] text-[#9AA3A5]">
              {activeEquipmentCount > 0 ? (
                <>Выбрано: <span className="font-bold text-[#58C995]">{activeEquipmentCount} предметов</span></>
              ) : (
                <span className="text-[#5F6B6E]">Инвентарь не выбран (0 предметов)</span>
              )}
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-[#9AA3A5] group-hover:text-[#58C995] transition-colors shrink-0" />
        </motion.button>
      </div>

      {/* WORKING WEIGHT PROGRESSION (1RM / ИСТОРИЯ ВЕСОВ) */}
      <div className={`${DS_CARD.base} space-y-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#58C995]" />
            <span className="text-sm font-bold text-[#F0F3F2]">
              Динамика рабочих весов
            </span>
          </div>
          {realPersonalRecord && realPersonalRecord.maxWeight > 0 ? (
            <span className="text-xs font-mono font-bold text-[#58C995] tabular-nums">
              {realPersonalRecord.maxWeight} кг (макс)
            </span>
          ) : (
            <span className="text-xs text-[#5F6B6E]">Пока нет рекорда</span>
          )}
        </div>

        {/* Lift Selector Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0A1012] rounded-xl border border-[#161F21]">
          {(['bench', 'squat', 'deadlift', 'pullups'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedLift(key)}
              className={`py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                selectedLift === key
                  ? 'bg-[#11241C] text-[#58C995] border border-[#2A5943]'
                  : 'text-[#9AA3A5] hover:text-[#F0F3F2]'
              }`}
            >
              {key === 'bench' ? 'Жим' : key === 'squat' ? 'Присед' : key === 'deadlift' ? 'Тяга' : 'Турник'}
            </button>
          ))}
        </div>

        {/* Progression Visualizer or Clean Empty State */}
        {hasLiftData ? (
          <div
            onClick={() => setShowDetailedProgress(true)}
            className="bg-[#0A1012] rounded-xl p-3 border border-[#161F21] hover:border-[#31644E] transition-all cursor-pointer group shadow-xs active:scale-[0.985]"
            title="Нажмите, чтобы открыть подробный интерактивный график"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#9AA3A5] group-hover:text-[#58C995] font-medium transition-colors">
                {currentLiftName} — прогресс:
              </span>
              <span className="text-[11px] text-[#58C995] flex items-center gap-1 font-semibold">
                <TrendingUp className="w-3 h-3 text-[#58C995]" />
                <span>Подробный график</span>
              </span>
            </div>
            <div className="flex items-end justify-between h-24 pt-4 px-2 gap-3">
              {realLiftHistory.map((pt, idx) => {
                const maxVal = Math.max(...realLiftHistory.map((h) => h.maxWeight), 1);
                const heightPercent = Math.max(15, Math.round((pt.maxWeight / maxVal) * 100));

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[10px] font-mono font-bold text-[#F0F3F2] tabular-nums">
                      {pt.maxWeight}
                    </span>
                    <div className="w-full bg-[#162124] rounded-t-md h-full max-h-16 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-[#58C995] rounded-t-md transition-all duration-300"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#5F6B6E] font-mono">{pt.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-[#0A1012] rounded-xl p-4 border border-[#161F21] text-center space-y-1.5">
            <AlertCircle className="w-5 h-5 text-[#5F6B6E] mx-auto opacity-70" />
            <p className="text-xs font-semibold text-[#F0F3F2]">
              Пока нет данных для «{currentLiftName}»
            </p>
            <p className="text-[11px] text-[#5F6B6E] max-w-xs mx-auto">
              Проведите тренировку с записью рабочих весов в этом упражнении, чтобы увидеть динамику и личные рекорды.
            </p>
          </div>
        )}
      </div>

      {/* OVERALL ACTIVITY & REAL LIFETIME STATS */}
      <div className={`${DS_CARD.base} space-y-3`}>
        <span className="text-[11px] font-bold text-[#9AA3A5] uppercase tracking-wider block">
          Общая статистика активности
        </span>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[#0A1012] p-3 rounded-xl border border-[#161F21]">
            <div className="flex items-center gap-2 text-xs text-[#9AA3A5] mb-1">
              <Award className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Общий тоннаж</span>
            </div>
            <span className="text-lg font-mono font-bold text-[#F0F3F2] tabular-nums">
              {totalTons} тонн
            </span>
          </div>

          <div className="bg-[#0A1012] p-3 rounded-xl border border-[#161F21]">
            <div className="flex items-center gap-2 text-xs text-[#9AA3A5] mb-1">
              <Zap className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Регулярность</span>
            </div>
            <span className="text-lg font-mono font-bold text-[#F0F3F2] tabular-nums">
              {complianceRate}%
            </span>
          </div>

          <div className="bg-[#0A1012] p-3 rounded-xl border border-[#161F21]">
            <div className="flex items-center gap-2 text-xs text-[#9AA3A5] mb-1">
              <Clock className="w-3.5 h-3.5 text-[#9AA3A5]" />
              <span>Ср. длительность</span>
            </div>
            <span className="text-lg font-mono font-bold text-[#F0F3F2] tabular-nums">
              {avgDurationMinutes > 0 ? `${avgDurationMinutes} мин` : '—'}
            </span>
          </div>

          <div className="bg-[#0A1012] p-3 rounded-xl border border-[#161F21]">
            <div className="flex items-center gap-2 text-xs text-[#9AA3A5] mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Дней без пропуска</span>
            </div>
            <span className="text-lg font-mono font-bold text-[#58C995] tabular-nums">
              {realStreak} дней
            </span>
          </div>
        </div>
      </div>

      {/* APP SETTINGS ENTRANCE */}
      <div className={`${DS_CARD.base}`}>
        <button
          onClick={onOpenSettings}
          className="w-full py-3.5 px-3.5 bg-[#0A1012] border border-[#161F21] hover:border-[#31644E] rounded-xl flex items-center justify-between text-xs text-[#F0F3F2] font-semibold transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#11241C] border border-[#2A5943] flex items-center justify-center text-[#58C995] group-hover:scale-105 transition-transform">
              <Settings className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="block text-sm font-bold text-[#F0F3F2] group-hover:text-[#58C995] transition-colors">
                Настройки приложения
              </span>
              <span className="block text-[11px] text-[#9AA3A5]">
                Внешний вид, таймер отдыха, вибрация, уведомления
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#9AA3A5] group-hover:text-[#58C995] transition-colors" />
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
            className={DS_MODAL.backdrop}
          >
            <motion.div
              variants={modalDialogVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={DS_MODAL.dialog}
            >
              <div className={DS_MODAL.header}>
                <h3 className="text-sm font-bold text-[#F0F3F2]">Редактирование профиля</h3>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsEditingProfile(false)}
                  className="p-1 text-[#9AA3A5] hover:text-[#F0F3F2] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              <form onSubmit={handleSaveProfile} className="p-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#9AA3A5] mb-1">
                    Имя пользователя
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Например, Иван"
                    className={DS_INPUT.text + ' w-full'}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#9AA3A5] mb-1">
                      Возраст
                    </label>
                    <input
                      type="number"
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value)}
                      placeholder="—"
                      className={DS_INPUT.numeric + ' w-full'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#9AA3A5] mb-1">
                      Рост (см)
                    </label>
                    <input
                      type="number"
                      value={editHeight}
                      onChange={(e) => setEditHeight(e.target.value)}
                      placeholder="—"
                      className={DS_INPUT.numeric + ' w-full'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#9AA3A5] mb-1">
                      Вес (кг)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      placeholder="—"
                      className={DS_INPUT.numeric + ' w-full'}
                    />
                  </div>
                </div>

                {/* Level of preparation */}
                <div>
                  <label className="block text-xs font-semibold text-[#9AA3A5] mb-1.5">
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
                            ? 'bg-[#11241C] text-[#58C995] border-[#2A5943]'
                            : 'bg-[#0A1012] text-[#9AA3A5] border-[#161F21] hover:text-[#F0F3F2]'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Goal Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[#9AA3A5] mb-1.5">
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
                            ? 'bg-[#11241C] text-[#58C995] border-[#2A5943]'
                            : 'bg-[#0A1012] text-[#9AA3A5] border-[#161F21]'
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
                    className={DS_INPUT.text + ' w-full'}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#161F21]">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className={DS_BUTTON.secondary + ' flex-1'}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className={DS_BUTTON.primary + ' flex-1'}
                  >
                    Сохранить
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exercise Progress Modal */}
      {showDetailedProgress && (
        <ExerciseProgressModal
          exercise={{ name: currentLiftName }}
          onClose={() => setShowDetailedProgress(false)}
        />
      )}
    </div>
  );
};
