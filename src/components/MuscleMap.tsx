import React, { useState, useEffect, useMemo } from 'react';
import {
  MuscleGroup,
  MuscleLoadStats,
  MUSCLE_DEFINITIONS,
  EXERCISE_CATALOG,
  MusclePeriod,
} from '../types/workout';
import { StorageService } from '../services/storage';
import {
  Info,
  Dumbbell,
  BarChart3,
  Settings,
  ShieldCheck,
  X,
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MuscleMapProps {
  stats?: Record<MuscleGroup, MuscleLoadStats>;
  onSelectMuscle?: (muscle: MuscleGroup) => void;
  onOpenSettings?: () => void;
}

type ViewMode = 'front' | 'back';

// Heatmap palette based on honest workout load
function getHeatmapColor(percent: number, isSelected: boolean, hasData: boolean) {
  if (isSelected) {
    return {
      fill: hasData ? 'rgba(88, 201, 149, 0.45)' : 'rgba(88, 201, 149, 0.28)',
      stroke: '#58C995',
      strokeWidth: 2.8,
      fillOpacity: 0.85,
      glow: true,
      label: hasData ? `${percent}%` : 'Не нагружалась',
    };
  }

  if (!hasData || percent === 0) {
    return {
      fill: 'rgba(15, 23, 26, 0.18)',
      stroke: 'rgba(85, 105, 112, 0.22)',
      strokeWidth: 1.0,
      fillOpacity: 0.15,
      glow: false,
      label: 'Не нагружалась',
    };
  }

  if (percent <= 30) {
    return {
      fill: 'rgba(134, 239, 172, 0.35)',
      stroke: '#4ADE80',
      strokeWidth: 1.3,
      fillOpacity: 0.45,
      glow: false,
      label: 'Низкая нагрузка',
    };
  }

  if (percent <= 60) {
    return {
      fill: 'rgba(34, 197, 94, 0.42)',
      stroke: '#22C55E',
      strokeWidth: 1.5,
      fillOpacity: 0.55,
      glow: false,
      label: 'Средняя нагрузка',
    };
  }

  if (percent <= 85) {
    return {
      fill: 'rgba(22, 163, 74, 0.55)',
      stroke: '#16A34A',
      strokeWidth: 1.7,
      fillOpacity: 0.68,
      glow: false,
      label: 'Высокая нагрузка',
    };
  }

  // > 85%
  return {
    fill: 'rgba(20, 83, 45, 0.72)',
    stroke: '#58C995',
    strokeWidth: 2.0,
    fillOpacity: 0.82,
    glow: false,
    label: 'Очень высокая нагрузка',
  };
}

export const MuscleMap: React.FC<MuscleMapProps> = ({
  stats: externalStats,
  onSelectMuscle,
  onOpenSettings,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('front');
  const [period, setPeriod] = useState<MusclePeriod>('7d');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'exercises' | 'stats'>('info');

  // Load real stats for the selected period directly from storage
  const [periodStats, setPeriodStats] = useState<Record<MuscleGroup, MuscleLoadStats>>(() =>
    StorageService.getMuscleStats(period)
  );

  // Recalculate stats when period changes or external stats trigger an update
  useEffect(() => {
    setPeriodStats(StorageService.getMuscleStats(period));
  }, [period, externalStats]);

  const stats = periodStats;

  const currentDef = selectedMuscle ? MUSCLE_DEFINITIONS[selectedMuscle] : null;
  const currentStat: MuscleLoadStats | null = selectedMuscle
    ? stats[selectedMuscle] || {
        muscle: selectedMuscle,
        nameRu: currentDef?.nameRu || 'Мышца',
        percent: 0,
        weeklyTonnageKg: 0,
        recentWorkoutsCount: 0,
        exerciseCount: 0,
        setsCount: 0,
        recoveryDays: null,
        recoveryTime: null,
        status: 'recovered',
        history: [],
        hasData: false,
      }
    : null;

  const handleSelect = (m: MuscleGroup) => {
    setSelectedMuscle(m);
    if (onSelectMuscle) onSelectMuscle(m);
  };

  const isMuscleSelected = (m: MuscleGroup) => selectedMuscle === m;

  // Target exercises from catalog for selected muscle
  const exercisesForMuscle = useMemo(() => {
    if (!selectedMuscle) return [];
    return EXERCISE_CATALOG.filter((ex) => {
      if (ex.primaryMuscle === selectedMuscle) return true;
      if (ex.secondaryMuscles?.includes(selectedMuscle)) return true;

      // Smart catalog matching for detailed muscle groups
      const exName = ex.name.toLowerCase();
      if (selectedMuscle === 'chest_upper' && ex.primaryMuscle === 'chest') {
        return exName.includes('наклон') || exName.includes('вверх');
      }
      if (selectedMuscle === 'chest_mid' && ex.primaryMuscle === 'chest') {
        return exName.includes('лежа') || exName.includes('пол') || exName.includes('кроссовер');
      }
      if (selectedMuscle === 'chest_lower' && ex.primaryMuscle === 'chest') {
        return exName.includes('брусь') || exName.includes('вниз');
      }
      if (selectedMuscle === 'front_delts' && ex.primaryMuscle === 'shoulders') {
        return exName.includes('армей') || exName.includes('вверх') || exName.includes('передн');
      }
      if (selectedMuscle === 'side_delts' && ex.primaryMuscle === 'shoulders') {
        return exName.includes('мах') || exName.includes('разводк') || exName.includes('боков');
      }
      if (selectedMuscle === 'rear_delts' && (ex.primaryMuscle === 'shoulders' || ex.primaryMuscle === 'rearDelts')) {
        return true;
      }
      if (selectedMuscle === 'brachialis' && ex.primaryMuscle === 'biceps') {
        return exName.includes('молот') || exName.includes('обратн');
      }
      if (selectedMuscle === 'traps_upper' && ex.primaryMuscle === 'traps') {
        return true;
      }
      if (selectedMuscle === 'traps_mid' && (ex.primaryMuscle === 'traps' || ex.primaryMuscle === 'lats')) {
        return exName.includes('тяга') || exName.includes('сведение');
      }
      if (selectedMuscle === 'traps_lower' && (ex.primaryMuscle === 'traps' || ex.primaryMuscle === 'lats')) {
        return exName.includes('подтягиван') || exName.includes('вертикальн');
      }
      if (selectedMuscle === 'rhomboids' && (ex.primaryMuscle === 'traps' || ex.primaryMuscle === 'lats')) {
        return exName.includes('горизонтальн') || exName.includes('наклон');
      }
      if (selectedMuscle === 'quads_rectus' && ex.primaryMuscle === 'quads') {
        return exName.includes('разгибан') || exName.includes('выпад');
      }
      if (selectedMuscle === 'quads_lateralis' && ex.primaryMuscle === 'quads') {
        return exName.includes('присед') || exName.includes('жим ногами');
      }
      if (selectedMuscle === 'quads_medialis' && ex.primaryMuscle === 'quads') {
        return exName.includes('присед') || exName.includes('разгибан') || exName.includes('гакк');
      }

      return false;
    });
  }, [selectedMuscle]);

  return (
    <div className="w-full flex flex-col items-center select-none pb-4">
      {/* Top Header */}
      <div className="w-full flex items-center justify-between pt-1 mb-2 px-0.5">
        <div>
          <span className="font-serif text-xl font-bold tracking-widest text-[#E8E9E7]">
            FORM
          </span>
          <span className="text-[11px] text-[#92999A] block font-medium">
            Интерактивный атлас мышц
          </span>
        </div>

        {onOpenSettings && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-xl bg-[#101719] border border-[#252D2F] flex items-center justify-center text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer"
            title="Настройки"
          >
            <Settings className="w-4 h-4" />
          </motion.button>
        )}
      </div>

      {/* Screen Title & Controls Section */}
      <div className="w-full text-left mb-2 px-0.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-serif tracking-tight text-[#E8E9E7]">
            Анатомия мышц
          </h2>

          {/* Period selector */}
          <div className="flex items-center p-0.5 bg-[#101719] border border-[#252D2F] rounded-xl">
            <button
              onClick={() => setPeriod('session')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                period === 'session'
                  ? 'bg-[#14231b] text-[#58C995] border border-[#2f553f] shadow-sm'
                  : 'text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              Сегодня
            </button>
            <button
              onClick={() => setPeriod('7d')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                period === '7d'
                  ? 'bg-[#14231b] text-[#58C995] border border-[#2f553f] shadow-sm'
                  : 'text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              7 дней
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                period === '30d'
                  ? 'bg-[#14231b] text-[#58C995] border border-[#2f553f] shadow-sm'
                  : 'text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              30 дней
            </button>
          </div>
        </div>

        {/* View Mode Switcher: FRONT and BACK ONLY (Removed "Оба вида") */}
        <div className="flex items-center p-1 bg-[#101719] border border-[#252D2F] rounded-xl w-full">
          <button
            type="button"
            onClick={() => setViewMode('front')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              viewMode === 'front'
                ? 'bg-[#182821] text-[#58C995] border border-[#2f553f] shadow-sm'
                : 'text-[#92999A] hover:text-[#E8E9E7]'
            }`}
          >
            Спереди
          </button>
          <button
            type="button"
            onClick={() => setViewMode('back')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              viewMode === 'back'
                ? 'bg-[#182821] text-[#58C995] border border-[#2f553f] shadow-sm'
                : 'text-[#92999A] hover:text-[#E8E9E7]'
            }`}
          >
            Сзади
          </button>
        </div>
      </div>

      {/* Central Anatomical Canvas: Independent Portrait Projections */}
      <div className="relative w-full max-w-[390px] sm:max-w-[430px] aspect-[456/1100] max-h-[620px] flex items-center justify-center overflow-hidden rounded-2xl bg-[#080D0E] my-1 border border-[#1a2224] shadow-2xl">
        {/* Glow filter definition */}
        <svg className="absolute w-0 h-0" aria-hidden="true" focusable="false">
          <defs>
            <filter id="muscleGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0 0 0 0 0.345   0 0 0 0 0.788   0 0 0 0 0.584  0 0 0 0.9 0"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        {/* 1. FRONT PROJECTION (Image: 456x1200, ViewBox: 0 45 456 1090) */}
        {viewMode === 'front' && (
          <svg
            key="front-svg"
            viewBox="0 45 456 1090"
            className="w-full h-full object-contain"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Front Image Asset */}
            <image
              href="/assets/aistudio/1793615800573_ee14e923.jpg"
              x="0"
              y="0"
              width="456"
              height="1200"
              preserveAspectRatio="xMidYMid meet"
              className="opacity-95"
            />

            <g id="front-muscles" style={{ mixBlendMode: 'screen' }}>
              {/* CHEST: UPPER PART (Верх груди - ключичная часть) */}
              {(() => {
                const s = getHeatmapColor(stats.chest_upper?.percent || 0, isMuscleSelected('chest_upper'), Boolean(stats.chest_upper?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('chest_upper')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('chest_upper') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M148,272 C172,268 202,270 224,282 C223,303 205,310 182,310 C158,308 144,292 148,272 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M308,272 C284,268 254,270 232,282 C233,303 251,310 274,310 C298,308 312,292 308,272 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* CHEST: MID PART (Середина груди - грудинная часть) */}
              {(() => {
                const s = getHeatmapColor(stats.chest_mid?.percent || 0, isMuscleSelected('chest_mid'), Boolean(stats.chest_mid?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('chest_mid')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('chest_mid') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M142,302 C168,304 200,306 224,312 C223,338 206,346 180,346 C155,344 138,328 142,302 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M314,302 C288,304 256,306 232,312 C233,338 250,346 276,346 C301,344 318,328 314,302 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* CHEST: LOWER PART (Низ груди - реберная часть) */}
              {(() => {
                const s = getHeatmapColor(stats.chest_lower?.percent || 0, isMuscleSelected('chest_lower'), Boolean(stats.chest_lower?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('chest_lower')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('chest_lower') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M150,340 C175,344 205,344 223,338 C220,366 195,376 166,370 C148,364 145,352 150,340 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M306,340 C281,344 251,344 233,338 C236,366 261,376 290,370 C308,364 311,352 306,340 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* SHOULDERS: FRONT DELTS (Передняя дельта) */}
              {(() => {
                const s = getHeatmapColor(stats.front_delts?.percent || 0, isMuscleSelected('front_delts'), Boolean(stats.front_delts?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('front_delts')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('front_delts') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M116,268 C135,268 148,276 145,300 C141,328 123,342 110,342 C98,336 96,316 102,288 C108,274 112,268 116,268 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M340,268 C321,268 308,276 311,300 C315,328 333,342 346,342 C358,336 360,316 354,288 C348,274 344,268 340,268 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* SHOULDERS: SIDE DELTS (Средняя дельта) */}
              {(() => {
                const s = getHeatmapColor(stats.side_delts?.percent || 0, isMuscleSelected('side_delts'), Boolean(stats.side_delts?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('side_delts')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('side_delts') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M86,285 C104,280 114,288 111,312 C105,340 93,356 78,352 C72,340 72,314 86,285 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M370,285 C352,280 342,288 345,312 C351,340 363,356 378,352 C384,340 384,314 370,285 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* ARMS: BICEPS (Бицепс) */}
              {(() => {
                const s = getHeatmapColor(stats.biceps?.percent || 0, isMuscleSelected('biceps'), Boolean(stats.biceps?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('biceps')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('biceps') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M96,344 C118,344 126,358 124,396 C121,432 108,446 94,444 C84,441 81,416 87,374 C90,356 93,344 96,344 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M360,344 C338,344 330,358 332,396 C335,432 348,446 362,444 C372,441 375,416 369,374 C366,356 363,344 360,344 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* ARMS: BRACHIALIS (Брахиалис) */}
              {(() => {
                const s = getHeatmapColor(stats.brachialis?.percent || 0, isMuscleSelected('brachialis'), Boolean(stats.brachialis?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('brachialis')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('brachialis') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M72,360 C86,356 92,362 89,388 C86,416 75,434 66,430 C63,418 63,394 69,372 C70,364 71,360 72,360 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M384,360 C370,356 364,362 367,388 C370,416 381,434 390,430 C393,418 393,394 387,372 C386,364 385,360 384,360 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* ARMS: FOREARMS (Предплечья спереди) */}
              {(() => {
                const s = getHeatmapColor(stats.forearms?.percent || 0, isMuscleSelected('forearms'), Boolean(stats.forearms?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('forearms')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('forearms') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M44,450 C68,442 98,452 104,490 C108,528 92,572 74,600 C62,596 52,568 40,518 C34,490 36,462 44,450 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M412,450 C388,442 358,452 352,490 C348,528 364,572 382,600 C394,596 404,568 416,518 C422,490 420,462 412,450 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* CORE: ABS (Пресс / прямая мышца живота) */}
              {(() => {
                const s = getHeatmapColor(stats.abs?.percent || 0, isMuscleSelected('abs'), Boolean(stats.abs?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('abs')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('abs') ? 'url(#muscleGlow)' : undefined}
                  >
                    {/* Upper Abs Segments */}
                    <path
                      d="M196,380 C216,380 240,380 260,380 C264,420 264,430 260,432 C240,432 216,432 196,432 C192,430 192,420 196,380 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    {/* Mid Abs Segments */}
                    <path
                      d="M194,438 C216,438 240,438 262,438 C266,478 266,488 262,490 C240,490 216,490 194,490 C190,488 190,478 194,438 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    {/* Lower Abs Segment */}
                    <path
                      d="M192,496 C216,496 240,496 264,496 C266,526 256,535 228,536 C200,535 190,526 192,496 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* CORE: OBLIQUES (Косые мышцы живота) */}
              {(() => {
                const s = getHeatmapColor(stats.obliques?.percent || 0, isMuscleSelected('obliques'), Boolean(stats.obliques?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('obliques')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('obliques') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M148,390 C175,385 188,395 186,435 C184,480 180,515 160,530 C146,515 142,460 144,410 C145,398 146,392 148,390 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M308,390 C281,385 268,395 270,435 C272,480 276,515 296,530 C310,515 314,460 312,410 C311,398 310,392 308,390 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LEGS: QUADS - RECTUS FEMORIS (Прямая мышца бедра) */}
              {(() => {
                const s = getHeatmapColor(stats.quads_rectus?.percent || 0, isMuscleSelected('quads_rectus'), Boolean(stats.quads_rectus?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('quads_rectus')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('quads_rectus') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M154,690 C172,690 182,710 180,750 C178,790 172,830 162,834 C152,830 148,790 146,750 C146,710 148,690 154,690 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M302,690 C284,690 274,710 276,750 C278,790 284,830 294,834 C304,830 308,790 310,750 C310,710 308,690 302,690 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LEGS: QUADS - VASTUS LATERALIS (Латеральная широкая мышца бедра) */}
              {(() => {
                const s = getHeatmapColor(stats.quads_lateralis?.percent || 0, isMuscleSelected('quads_lateralis'), Boolean(stats.quads_lateralis?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('quads_lateralis')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('quads_lateralis') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M116,700 C138,695 148,705 144,745 C140,795 132,845 120,855 C110,845 108,790 110,740 C111,715 113,702 116,700 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M340,700 C318,695 308,705 312,745 C316,795 324,845 336,855 C346,845 348,790 346,740 C345,715 343,702 340,700 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LEGS: QUADS - VASTUS MEDIALIS (Медиальная широкая / «капля» над коленом) */}
              {(() => {
                const s = getHeatmapColor(stats.quads_medialis?.percent || 0, isMuscleSelected('quads_medialis'), Boolean(stats.quads_medialis?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('quads_medialis')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('quads_medialis') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M172,805 C192,800 205,815 204,845 C202,875 186,880 174,875 C166,865 166,835 172,805 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M284,805 C264,800 251,815 252,845 C254,875 270,880 282,875 C290,865 290,835 284,805 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LEGS: CALVES (Икроножные мышцы спереди) */}
              {(() => {
                const s = getHeatmapColor(stats.calves?.percent || 0, isMuscleSelected('calves'), Boolean(stats.calves?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('calves')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('calves') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M120,900 C155,895 175,915 172,975 C168,1030 152,1065 140,1065 C126,1060 114,1015 114,960 C114,925 116,905 120,900 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M336,900 C301,895 281,915 284,975 C288,1030 304,1065 316,1065 C330,1060 342,1015 342,960 C342,925 340,905 336,900 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}
            </g>
          </svg>
        )}

        {/* 2. BACK PROJECTION (Image: 444x1200, ViewBox: 0 45 444 1090) */}
        {viewMode === 'back' && (
          <svg
            key="back-svg"
            viewBox="0 45 444 1090"
            className="w-full h-full object-contain"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Back Image Asset */}
            <image
              href="/assets/aistudio/1793615808686_75ee0cf8.jpg"
              x="0"
              y="0"
              width="444"
              height="1200"
              preserveAspectRatio="xMidYMid meet"
              className="opacity-95"
            />

            <g id="back-muscles" style={{ mixBlendMode: 'screen' }}>
              {/* TRAPS: UPPER (Верхняя трапеция) */}
              {(() => {
                const s = getHeatmapColor(stats.traps_upper?.percent || 0, isMuscleSelected('traps_upper'), Boolean(stats.traps_upper?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('traps_upper')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('traps_upper') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M154,200 C182,190 214,204 216,245 C196,258 174,258 152,240 C146,225 148,210 154,200 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M278,200 C250,190 218,204 216,245 C236,258 258,258 280,240 C286,225 284,210 278,200 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* TRAPS: MID (Средняя трапеция) */}
              {(() => {
                const s = getHeatmapColor(stats.traps_mid?.percent || 0, isMuscleSelected('traps_mid'), Boolean(stats.traps_mid?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('traps_mid')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('traps_mid') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M216,245 C238,258 256,275 252,320 C234,345 224,355 216,365 C208,355 198,345 180,320 C176,275 194,258 216,245 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* TRAPS: LOWER (Нижняя трапеция) */}
              {(() => {
                const s = getHeatmapColor(stats.traps_lower?.percent || 0, isMuscleSelected('traps_lower'), Boolean(stats.traps_lower?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('traps_lower')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('traps_lower') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M216,355 C228,360 238,375 234,425 C224,440 219,445 216,450 C213,445 208,440 198,425 C194,375 204,360 216,355 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* RHOMBOIDS (Ромбовидные мышцы) */}
              {(() => {
                const s = getHeatmapColor(stats.rhomboids?.percent || 0, isMuscleSelected('rhomboids'), Boolean(stats.rhomboids?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('rhomboids')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('rhomboids') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M152,275 C176,270 192,275 188,315 C184,342 172,352 154,345 C146,330 146,295 152,275 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M280,275 C256,270 240,275 244,315 C248,342 260,352 278,345 C286,330 286,295 280,275 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* SHOULDERS: REAR DELTS (Задняя дельта) */}
              {(() => {
                const s = getHeatmapColor(stats.rear_delts?.percent || 0, isMuscleSelected('rear_delts'), Boolean(stats.rear_delts?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('rear_delts')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('rear_delts') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M92,260 C118,255 140,265 138,295 C135,322 118,335 100,332 C88,322 84,295 92,260 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M340,260 C314,255 292,265 294,295 C297,322 314,335 332,332 C344,322 348,295 340,260 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* ARMS: TRICEPS (Трицепс) */}
              {(() => {
                const s = getHeatmapColor(stats.triceps?.percent || 0, isMuscleSelected('triceps'), Boolean(stats.triceps?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('triceps')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('triceps') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M58,335 C82,330 96,342 94,385 C91,428 78,450 62,446 C50,436 48,395 58,335 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M374,335 C350,330 336,342 338,385 C341,428 354,450 370,446 C382,436 384,395 374,335 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* ARMS: FOREARMS BACK (Предплечья сзади) */}
              {(() => {
                const s = getHeatmapColor(stats.forearms?.percent || 0, isMuscleSelected('forearms'), Boolean(stats.forearms?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('forearms')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('forearms') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M28,452 C52,445 78,455 84,495 C88,535 74,575 58,600 C48,595 40,568 28,518 C22,490 22,464 28,452 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M404,452 C380,445 354,455 348,495 C344,535 358,575 374,600 C384,595 392,568 404,518 C410,490 410,464 404,452 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* BACK: LATS (Широчайшие мышцы спины) */}
              {(() => {
                const s = getHeatmapColor(stats.lats?.percent || 0, isMuscleSelected('lats'), Boolean(stats.lats?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('lats')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('lats') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M128,340 C162,340 188,355 186,410 C184,465 168,515 138,515 C124,495 118,435 120,380 C122,355 125,342 128,340 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M304,340 C270,340 244,355 246,410 C248,465 264,515 294,515 C308,495 314,435 312,380 C310,355 307,342 304,340 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LOWER BODY: GLUTES (Ягодичные мышцы) */}
              {(() => {
                const s = getHeatmapColor(stats.glutes?.percent || 0, isMuscleSelected('glutes'), Boolean(stats.glutes?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('glutes')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('glutes') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M120,545 C158,540 210,548 214,600 C216,655 198,685 160,685 C132,680 116,635 116,585 C116,560 118,548 120,545 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M312,545 C274,540 222,548 218,600 C216,655 234,685 272,685 C300,680 316,635 316,585 C316,560 314,548 312,545 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LOWER BODY: HAMSTRINGS (Бицепс бедра) */}
              {(() => {
                const s = getHeatmapColor(stats.hamstrings?.percent || 0, isMuscleSelected('hamstrings'), Boolean(stats.hamstrings?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('hamstrings')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('hamstrings') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M118,695 C145,690 198,695 196,750 C194,815 182,875 160,880 C140,875 122,835 116,775 C114,735 116,705 118,695 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M314,695 C287,690 234,695 236,750 C238,815 250,875 272,880 C292,875 310,835 316,775 C318,735 316,705 314,695 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}

              {/* LOWER BODY: CALVES BACK (Икроножные мышцы сзади) */}
              {(() => {
                const s = getHeatmapColor(stats.calves?.percent || 0, isMuscleSelected('calves'), Boolean(stats.calves?.hasData));
                return (
                  <g
                    onClick={() => handleSelect('calves')}
                    className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                    filter={isMuscleSelected('calves') ? 'url(#muscleGlow)' : undefined}
                  >
                    <path
                      d="M108,895 C146,890 172,905 170,965 C166,1025 150,1065 138,1065 C124,1060 110,1015 106,960 C104,925 106,905 108,895 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                    <path
                      d="M324,895 C286,890 260,905 262,965 C266,1025 282,1065 294,1065 C308,1060 322,1015 326,960 C328,925 326,905 324,895 Z"
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      fillOpacity={s.fillOpacity}
                    />
                  </g>
                );
              })()}
            </g>
          </svg>
        )}
      </div>

      {/* Selected Muscle Card: Dynamic, independent and honest */}
      <AnimatePresence mode="wait">
        {selectedMuscle && currentDef && currentStat ? (
          <motion.div
            key={selectedMuscle}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full bg-[#101719] border border-[#252D2F] rounded-2xl p-4 mt-3 space-y-3 shadow-xl"
          >
            {/* Card Top: Muscle Name + Category + Close Button */}
            <div className="flex items-start justify-between border-b border-[#202729] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[#E8E9E7]">
                    {currentDef.nameRu}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#162124] text-[#92999A] border border-[#263337]">
                    {currentDef.category === 'upper'
                      ? 'Верх тела'
                      : currentDef.category === 'lower'
                      ? 'Низ тела'
                      : 'Мышцы кора'}
                  </span>
                </div>
                <p className="text-xs text-[#92999A] mt-0.5">
                  {currentDef.locationRu}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMuscle(null)}
                className="w-7 h-7 rounded-lg bg-[#141C1E] border border-[#202729] flex items-center justify-center text-[#92999A] hover:text-[#E8E9E7] transition-colors cursor-pointer shrink-0"
                title="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dedicated Recovery Block (БЛОК «ВОССТАНОВЛЕНИЕ») */}
            <div className="p-3 bg-[#080D0E] border border-[#1F2729] rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#58C995]" />
                  Восстановление мышцы
                </span>

                {currentStat.hasData ? (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      currentStat.status === 'recovered'
                        ? 'bg-[#14261d] text-[#58C995] border-[#2e5a40]'
                        : currentStat.status === 'recovering'
                        ? 'bg-[#262414] text-[#EAB308] border-[#5a542e]'
                        : 'bg-[#291616] text-[#EF4444] border-[#5a2e2e]'
                    }`}
                  >
                    {currentStat.status === 'recovered'
                      ? 'Полностью восстановлена'
                      : currentStat.status === 'recovering'
                      ? 'В процессе восстановления'
                      : 'Требуется отдых'}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#141A1C] text-[#869092] border border-[#232C2E]">
                    Нет данных
                  </span>
                )}
              </div>

              {currentStat.hasData ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2 bg-[#101719] border border-[#202729] rounded-lg">
                    <span className="text-[10px] text-[#92999A] block mb-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#58C995]" />
                      Время восстановления:
                    </span>
                    <span className="text-sm font-bold text-[#58C995]">
                      {currentStat.recoveryTime || 'Восстановлена'}
                    </span>
                  </div>

                  <div className="p-2 bg-[#101719] border border-[#202729] rounded-lg">
                    <span className="text-[10px] text-[#92999A] block mb-0.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#92999A]" />
                      Физиологическая норма:
                    </span>
                    <span className="text-sm font-semibold text-[#E8E9E7]">
                      ~{currentDef.recoveryHours} ч.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-1 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#92999A]">Статус нагрузки:</span>
                    <span className="font-semibold text-[#A0A8AA]">Не нагружалась</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#92999A]">Время восстановления:</span>
                    <span className="font-semibold text-[#58C995]">Не требуется</span>
                  </div>
                  <p className="text-[11px] text-[#6E7678] pt-1 leading-relaxed">
                    Мышца не получала тренировочной нагрузки за выбранный период (
                    {period === 'session' ? 'сегодня' : period === '7d' ? '7 дней' : '30 дней'}).
                    Таймер восстановления не запущен.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Metrics Bar: Real stats only */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-center">
                <span className="text-[10px] text-[#92999A] block mb-0.5">Нагрузка</span>
                <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                  {currentStat.hasData ? `${currentStat.percent}%` : '0%'}
                </span>
                <span className="text-[9px] text-[#6E7678] block">
                  {currentStat.hasData ? `${currentStat.weeklyTonnageKg.toLocaleString('ru-RU')} кг` : '0 кг'}
                </span>
              </div>

              <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-center">
                <span className="text-[10px] text-[#92999A] block mb-0.5">Подходов</span>
                <span className="text-sm font-bold text-[#58C995] tabular-nums">
                  {currentStat.setsCount}
                </span>
                <span className="text-[9px] text-[#6E7678] block">
                  за {period === 'session' ? 'сегодня' : period === '7d' ? '7 дней' : '30 дней'}
                </span>
              </div>

              <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-center">
                <span className="text-[10px] text-[#92999A] block mb-0.5">Упражнений</span>
                <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                  {currentStat.exerciseCount}
                </span>
                <span className="text-[9px] text-[#6E7678] block">
                  в каталоге: {exercisesForMuscle.length}
                </span>
              </div>
            </div>

            {/* 3 Tabs: [Информация] [Упражнения] [Статистика] */}
            <div className="flex p-1 bg-[#141C1E] rounded-xl border border-[#202729]">
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'info'
                    ? 'bg-[#182821] text-[#58C995] border border-[#2f553f]'
                    : 'text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Информация</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('exercises')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'exercises'
                    ? 'bg-[#182821] text-[#58C995] border border-[#2f553f]'
                    : 'text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                <Dumbbell className="w-3.5 h-3.5" />
                <span>Упражнения ({exercisesForMuscle.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('stats')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'stats'
                    ? 'bg-[#182821] text-[#58C995] border border-[#2f553f]'
                    : 'text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Статистика</span>
              </button>
            </div>

            {/* Tab 1: ИНФОРМАЦИЯ */}
            {activeTab === 'info' && (
              <div className="space-y-2.5 pt-1 text-xs">
                <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] space-y-1">
                  <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
                    Расположение
                  </span>
                  <p className="text-xs text-[#C5CBCD] leading-relaxed">
                    {currentDef.locationRu}
                  </p>
                </div>

                <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] space-y-1">
                  <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
                    Анатомическая функция
                  </span>
                  <p className="text-xs text-[#C5CBCD] leading-relaxed">
                    {currentDef.functionRu}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: УПРАЖНЕНИЯ */}
            {activeTab === 'exercises' && (
              <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
                {exercisesForMuscle.length > 0 ? (
                  exercisesForMuscle.map((ex) => {
                    const isPrimary = ex.primaryMuscle === selectedMuscle;
                    return (
                      <div
                        key={ex.id}
                        className="p-3 bg-[#080D0E] border border-[#202729] rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-[#E8E9E7]">{ex.name}</div>
                          <div className="text-[11px] text-[#92999A]">
                            {ex.type} • {ex.difficulty}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            isPrimary
                              ? 'bg-[#14231b] text-[#58C995] border-[#2f553f]'
                              : 'bg-[#161d20] text-[#92999A] border-[#252D2F]'
                          }`}
                        >
                          {isPrimary ? 'Основная' : 'Второстепенная'}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-6 text-center text-xs text-[#92999A]">
                    В каталоге пока нет упражнений для этой группы.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: СТАТИСТИКА */}
            {activeTab === 'stats' && (
              <div className="space-y-3 pt-1 text-xs">
                {currentStat.hasData ? (
                  <>
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-[#92999A] uppercase tracking-wider block">
                        История нагрузки по тренировкам:
                      </span>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {currentStat.history.map((h, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-semibold text-[#E8E9E7] block">
                                {h.exerciseName}
                              </span>
                              <span className="text-[10px] text-[#92999A]">{h.date}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-[#58C995] block tabular-nums">
                                {h.volumeKg.toLocaleString('ru-RU')} кг
                              </span>
                              <span className="text-[10px] text-[#92999A] block">
                                {h.sets} {h.sets === 1 ? 'подход' : 'подходов'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-[#080D0E] rounded-xl border border-[#202729] text-center space-y-1">
                    <p className="text-xs font-semibold text-[#E8E9E7]">
                      Нет данных
                    </p>
                    <p className="text-[11px] text-[#6b7577]">
                      За выбранный период ({period === 'session' ? 'сегодня' : period === '7d' ? '7 дней' : '30 дней'})
                      эта мышца не нагружалась.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="w-full p-3 bg-[#101719]/80 border border-[#202729] rounded-xl mt-2 text-center text-xs text-[#92999A] flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#58C995] animate-pulse" />
            <span>Нажмите на мышцу на теле для просмотра нагрузки и восстановления</span>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
