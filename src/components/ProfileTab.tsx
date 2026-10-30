import React, { useState } from 'react';
import { UserProfile, MuscleLoadStats, MuscleGroup, WorkoutSession } from '../types/workout';
import { MuscleMap } from './MuscleMap';
import { StorageService } from '../services/storage';
import {
  User,
  Edit2,
  TrendingUp,
  Award,
  Zap,
  Clock,
  Download,
  Upload,
  Smartphone,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Sliders,
  Dumbbell,
  Shield,
  Activity,
  X,
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
  onOpenApkGuide: () => void;
  onExportData: () => void;
  onImportData: () => void;
  onResetData: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  profile,
  onUpdateProfile,
  muscleStats,
  sessions,
  onOpenEquipment,
  onOpenParameters,
  onOpenApkGuide,
  onExportData,
  onImportData,
  onResetData,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editAge, setEditAge] = useState(profile.age);
  const [editHeight, setEditHeight] = useState(profile.heightCm);
  const [editWeight, setEditWeight] = useState(profile.weightKg);
  const [editGoal, setEditGoal] = useState(profile.fitnessGoal);

  // Selected lift for weight progression
  const [selectedLift, setSelectedLift] = useState<'bench' | 'squat' | 'deadlift' | 'pullups'>('bench');

  const userParams = StorageService.getUserParameters();
  const equipmentList = StorageService.getEquipmentList();
  const activeEquipmentCount = equipmentList.filter((e) => e.selected || e.owned).length;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      name: editName.trim(),
      age: Number(editAge) || 28,
      heightCm: Number(editHeight) || 180,
      weightKg: Number(editWeight) || 80,
      fitnessGoal: editGoal,
    });
    setIsEditingProfile(false);
  };

  // Compute lifetime aggregate stats
  const totalCompletedCount = 238 + sessions.length; // baseline seeded + newly completed
  const totalTonnageKg = sessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 1845000);
  const totalTons = (totalTonnageKg / 1000).toFixed(1);

  // Dynamic progression points for key lifts
  const progressionData: Record<string, { label: string; current1RM: number; history: { date: string; weight: number }[] }> = {
    bench: {
      label: 'Жим штанги лежа',
      current1RM: 105,
      history: [
        { date: 'Май', weight: 85 },
        { date: 'Июль', weight: 92.5 },
        { date: 'Сен', weight: 97.5 },
        { date: 'Окт', weight: 105 },
      ],
    },
    squat: {
      label: 'Приседания со штангой',
      current1RM: 135,
      history: [
        { date: 'Май', weight: 110 },
        { date: 'Июль', weight: 120 },
        { date: 'Сен', weight: 127.5 },
        { date: 'Окт', weight: 135 },
      ],
    },
    deadlift: {
      label: 'Становая тяга',
      current1RM: 155,
      history: [
        { date: 'Май', weight: 130 },
        { date: 'Июль', weight: 140 },
        { date: 'Сен', weight: 147.5 },
        { date: 'Окт', weight: 155 },
      ],
    },
    pullups: {
      label: 'Подтягивания с весом',
      current1RM: 30,
      history: [
        { date: 'Май', weight: 15 },
        { date: 'Июль', weight: 20 },
        { date: 'Сен', weight: 25 },
        { date: 'Окт', weight: 30 },
      ],
    },
  };

  const currentLiftData = progressionData[selectedLift];

  return (
    <div className="w-full flex flex-col pb-24 space-y-4">
      {/* Profile Header */}
      <div className="pt-2 px-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[#E8E9E7]">
          Профиль
        </h1>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsEditingProfile(true)}
          className="px-3 py-1.5 bg-[#101719] border border-[#252D2F] rounded-xl text-xs font-semibold text-[#92999A] hover:text-[#E8E9E7] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Edit2 className="w-3.5 h-3.5 text-[#58C995]" />
          <span>Изменить</span>
        </motion.button>
      </div>

      {/* Athlete Bio Card */}
      <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#14231b] border border-[#2f553f] flex items-center justify-center text-[#58C995]">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#E8E9E7]">{profile.name}</h2>
            <span className="text-xs text-[#58C995] font-semibold block">
              {profile.fitnessGoal}
            </span>
          </div>
        </div>

        {/* 4 Stats Grid: Age, Height, Weight, Total Sessions */}
        <div className="grid grid-cols-4 gap-2 text-center py-2 bg-[#080D0E] rounded-xl border border-[#202729]">
          <div>
            <span className="text-[10px] text-[#92999A] block">Возраст</span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
              {profile.age} лет
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#92999A] block">Рост</span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
              {profile.heightCm} см
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#92999A] block">Вес</span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
              {profile.weightKg} кг
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#92999A] block">Тренировок</span>
            <span className="text-sm font-bold text-[#58C995] tabular-nums">
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
                {userParams.goal}
              </span>
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729]">
                {userParams.level}
              </span>
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729]">
                {userParams.location}
              </span>
              <span className="px-2 py-0.5 bg-[#080D0E] rounded-md border border-[#202729]">
                {userParams.daysPerWeek} дня/нед
              </span>
            </div>

            {userParams.healthRestrictions.length > 0 && (
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
              Выбрано: <span className="font-bold text-[#58C995]">{activeEquipmentCount} предметов</span> из каталога инвентаря
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-[#92999A] group-hover:text-[#58C995] transition-colors shrink-0" />
        </motion.button>
      </div>

      {/* ANATOMICAL MUSCLE MAP (EXACT MATCH REFERENCE IMAGE 2) */}
      <div className="w-full pt-1">
        <MuscleMap stats={muscleStats} onOpenSettings={onOpenApkGuide} />
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
          <span className="text-xs font-bold text-[#58C995] tabular-nums">
            {currentLiftData.current1RM} кг (макс)
          </span>
        </div>

        {/* Lift Selector Pills */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#080D0E] rounded-xl border border-[#202729]">
          {(['bench', 'squat', 'deadlift', 'pullups'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedLift(key)}
              className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                selectedLift === key
                  ? 'bg-[#14231b] text-[#58C995] border border-[#2f553f]'
                  : 'text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              {key === 'bench' ? 'Жим' : key === 'squat' ? 'Присед' : key === 'deadlift' ? 'Тяга' : 'Турник'}
            </button>
          ))}
        </div>

        {/* Progression Bar Visualizer */}
        <div className="bg-[#080D0E] rounded-xl p-3 border border-[#202729]">
          <span className="text-xs text-[#92999A] font-medium block mb-2">
            {currentLiftData.label} — прогресс за последние месяцы:
          </span>
          <div className="flex items-end justify-between h-24 pt-4 px-2 gap-3">
            {currentLiftData.history.map((pt, idx) => {
              const maxVal = currentLiftData.current1RM * 1.1;
              const heightPercent = Math.round((pt.weight / maxVal) * 100);

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-[10px] font-bold text-[#E8E9E7] tabular-nums">
                    {pt.weight}
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
      </div>

      {/* OVERALL ACTIVITY & LIFETIME STATS */}
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
              96.8%
            </span>
          </div>

          <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729]">
            <div className="flex items-center gap-2 text-xs text-[#92999A] mb-1">
              <Clock className="w-3.5 h-3.5 text-[#92999A]" />
              <span>Ср. длительность</span>
            </div>
            <span className="text-lg font-bold text-[#E8E9E7] tabular-nums">
              58 мин
            </span>
          </div>

          <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729]">
            <div className="flex items-center gap-2 text-xs text-[#92999A] mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#58C995]" />
              <span>Дней без пропуска</span>
            </div>
            <span className="text-lg font-bold text-[#58C995] tabular-nums">
              12 дней
            </span>
          </div>
        </div>
      </div>

      {/* SYSTEM & ANDROID APK PACKAGING / DATA */}
      <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-2">
        <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block mb-1">
          Приложение & Экспорт
        </span>

        {/* APK Packaging Guide Trigger */}
        <button
          onClick={onOpenApkGuide}
          className="w-full py-3 px-3.5 bg-[#080D0E] border border-[#202729] hover:border-[#58C995] rounded-xl flex items-center justify-between text-xs text-[#E8E9E7] font-semibold transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-[#58C995]" />
            <span>Инструкция по упаковке в Android APK</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#92999A]" />
        </button>

        {/* Export Data */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onExportData}
            className="py-2.5 px-3 bg-[#080D0E] border border-[#202729] hover:border-[#384346] rounded-xl flex items-center justify-center gap-1.5 text-xs text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Экспорт JSON</span>
          </button>
          <button
            onClick={onImportData}
            className="py-2.5 px-3 bg-[#080D0E] border border-[#202729] hover:border-[#384346] rounded-xl flex items-center justify-center gap-1.5 text-xs text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Импорт JSON</span>
          </button>
        </div>

        {/* Reset All App Data */}
        <button
          onClick={onResetData}
          className="w-full py-2.5 px-3 bg-[#080D0E] border border-[#202729] hover:border-[#C83232] rounded-xl flex items-center justify-center gap-1.5 text-xs text-[#92999A] hover:text-[#C83232] transition-colors mt-2 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Сбросить данные до исходных</span>
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
              className="w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-1 border-b border-[#252D2F]">
                <h3 className="text-base font-bold text-[#E8E9E7]">Изменить анкету</h3>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsEditingProfile(false)}
                  className="p-1 text-[#92999A] hover:text-[#E8E9E7] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#92999A] mb-1">
                    Имя атлета
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] android-input"
                    required
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
                      onChange={(e) => setEditAge(Number(e.target.value))}
                      className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-2 py-2 text-xs text-[#E8E9E7] text-center android-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#92999A] mb-1">
                      Рост (см)
                    </label>
                    <input
                      type="number"
                      value={editHeight}
                      onChange={(e) => setEditHeight(Number(e.target.value))}
                      className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-2 py-2 text-xs text-[#E8E9E7] text-center android-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#92999A] mb-1">
                      Вес (кг)
                    </label>
                    <input
                      type="number"
                      value={editWeight}
                      onChange={(e) => setEditWeight(Number(e.target.value))}
                      className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-2 py-2 text-xs text-[#E8E9E7] text-center android-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#92999A] mb-1">
                    Главная цель
                  </label>
                  <select
                    value={editGoal}
                    onChange={(e) => setEditGoal(e.target.value)}
                    className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] android-input"
                  >
                    <option value="Развитие мышц">Развитие мышц</option>
                    <option value="Сила">Сила</option>
                    <option value="Выносливость">Выносливость</option>
                    <option value="Общая физическая подготовка">Общая физическая подготовка</option>
                    <option value="Улучшение физической формы">Улучшение физической формы</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="flex-1 py-2 text-xs font-semibold text-[#92999A] hover:text-[#E8E9E7] bg-[#080D0E] border border-[#252D2F] rounded-xl transition-colors cursor-pointer"
                  >
                    Отмена
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="submit"
                    className="flex-1 py-2 text-xs font-bold text-black bg-[#58C995] hover:bg-[#68d7a4] rounded-xl transition-colors shadow-md cursor-pointer"
                  >
                    Сохранить
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
