import React, { useState } from 'react';
import { MuscleGroup, MuscleLoadStats } from '../types/workout';
import { ChevronRight, Info, Settings, X, Dumbbell, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { androidTapFeedback, modalBackdropVariants, modalDialogVariants } from '../utils/animations';

interface MuscleMapProps {
  stats: Record<MuscleGroup, MuscleLoadStats>;
  onSelectMuscle?: (muscle: MuscleGroup) => void;
  onOpenSettings?: () => void;
}

export const MuscleMap: React.FC<MuscleMapProps> = ({ stats, onSelectMuscle, onOpenSettings }) => {
  // View mode: 'both' | 'front' | 'back'
  const [view, setView] = useState<'both' | 'front' | 'back'>('both');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup>('chest');
  const [showDetailModal, setShowDetailModal] = useState(false);

  const currentStat = stats[selectedMuscle] || {
    muscle: selectedMuscle,
    nameRu: 'Грудные',
    percent: 68,
    weeklyTonnageKg: 8420,
    recentWorkoutsCount: 3,
    recoveryDays: 2,
    status: 'fatigued',
  };

  const handleSelect = (m: MuscleGroup) => {
    setSelectedMuscle(m);
    if (onSelectMuscle) onSelectMuscle(m);
  };

  const getFullMuscleTitle = (muscle: MuscleGroup): string => {
    switch (muscle) {
      case 'chest':
        return 'Грудные мышцы';
      case 'shoulders':
        return 'Дельтовидные мышцы (плечи)';
      case 'biceps':
        return 'Двуглавая мышца (бицепс)';
      case 'triceps':
        return 'Трехглавая мышца (трицепс)';
      case 'forearms':
        return 'Мышцы предплечья';
      case 'abs':
        return 'Мышцы пресса и кора';
      case 'quads':
        return 'Четырехглавая мышца (квадрицепс)';
      case 'hamstrings':
        return 'Задняя поверхность бедра';
      case 'calves':
        return 'Икроножные мышцы';
      case 'lats':
        return 'Широчайшие мышцы спины';
      case 'traps':
        return 'Трапециевидные мышцы';
      case 'rearDelts':
        return 'Задние дельты';
      case 'lowerback':
        return 'Разгибатели спины (поясница)';
      case 'glutes':
        return 'Ягодичные мышцы';
      default:
        return 'Мышцы';
    }
  };

  const getTopExercises = (muscle: MuscleGroup): string[] => {
    switch (muscle) {
      case 'chest':
        return ['Жим штанги лежа', 'Отжимания на брусьях', 'Разведение гантелей'];
      case 'shoulders':
        return ['Армейский жим стоя', 'Махи гантелями в стороны', 'Жим гантелей сидя'];
      case 'biceps':
        return ['Подъем штанги на бицепс', 'Молотковые сгибания', 'Подтягивания обратным хватом'];
      case 'triceps':
        return ['Французский жим', 'Разгибания на блоке', 'Отжимания узким хватом'];
      case 'forearms':
        return ['Сгибания запястий со штангой', 'Вис на перекладине с весом'];
      case 'abs':
        return ['Подъем ног в висе', 'Скручивания на наклонной скамье', 'Планка'];
      case 'quads':
        return ['Приседания со штангой', 'Жим ногами в тренажере', 'Выпады с гантелями'];
      case 'hamstrings':
        return ['Румынская тяга', 'Сгибания ног лежа', 'Гиперэкстензия'];
      case 'calves':
        return ['Подъемы на носки стоя со штангой', 'Подъемы на носки сидя'];
      case 'lats':
        return ['Подтягивания широким хватом', 'Тяга верхнего блока', 'Тяга штанги в наклоне'];
      case 'traps':
        return ['Шраги с гантелями', 'Шраги со штангой', 'Тяга к подбородку'];
      case 'rearDelts':
        return ['Разведение гантелей в наклоне', 'Face Pull на блоке'];
      case 'lowerback':
        return ['Становая тяга классическая', 'Гиперэкстензия с блином'];
      case 'glutes':
        return ['Ягодичный мост со штангой', 'Глубокие приседания', 'Болгарские выпады'];
      default:
        return ['Базовые упражнения'];
    }
  };

  const handleToggleView = (targetView: 'front' | 'back') => {
    if (view === targetView) {
      setView('both');
    } else {
      setView(targetView);
    }
  };

  // ViewBox coordinates for SVG overlay over the 997 x 967 cropped base image
  // 'both': '-160 0 1317 967'
  // 'front': '-160 0 640 967'
  // 'back': '520 0 640 967'
  const viewBox =
    view === 'front'
      ? '-200 -15 740 985'
      : view === 'back'
      ? '460 -15 740 985'
      : '-260 -15 1520 985';

  const isMuscleSelected = (m: MuscleGroup) => selectedMuscle === m;

  const renderPercent = (m: MuscleGroup) => {
    const val = stats[m]?.percent;
    if (val === undefined || val === 0) return '0%';
    return `${val}%`;
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Top Header: FORM logo + Gear settings */}
      <div className="w-full flex items-center justify-between pt-1 mb-2">
        <span className="font-serif text-lg font-bold tracking-widest text-[#E8E9E7]">
          FORM
        </span>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] transition-colors rounded-lg"
            title="Настройки"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Screen Title: Карта мышц */}
      <div className="w-full text-left mb-3">
        <h2 className="text-2xl font-serif tracking-tight text-[#E8E9E7]">
          Карта мышц
        </h2>
      </div>

      {/* Segmented View Switcher: [Вид спереди]  [Вид сзади] */}
      <div className="w-full flex p-1 bg-[#101719] border border-[#252D2F] rounded-2xl mb-2 shadow-inner relative">
        <motion.button
          onClick={() => handleToggleView('front')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
            view === 'front' || view === 'both'
              ? 'text-[#E8E9E7] font-bold'
              : 'text-[#92999A] hover:text-[#E8E9E7]'
          }`}
        >
          {(view === 'front' || view === 'both') && (
            <motion.div
              layoutId="muscleViewIndicator"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#315D4B] rounded-xl -z-10 shadow-sm"
            />
          )}
          Вид спереди
        </motion.button>
        <motion.button
          onClick={() => handleToggleView('back')}
          whileTap={{ scale: 0.96 }}
          className={`relative z-10 flex-1 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
            view === 'back'
              ? 'text-[#E8E9E7] font-bold'
              : 'text-[#92999A] hover:text-[#E8E9E7]'
          }`}
        >
          {view === 'back' && (
            <motion.div
              layoutId="muscleViewIndicator"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#315D4B] rounded-xl -z-10 shadow-sm"
            />
          )}
          Вид сзади
        </motion.button>
      </div>

      {/* Mode hint */}
      <div className="w-full flex justify-end px-1 mb-1">
        <motion.button
          onClick={() => setView(view === 'both' ? 'front' : 'both')}
          whileTap={{ scale: 0.95 }}
          className="text-[11px] text-[#58C995] hover:underline flex items-center gap-1 font-medium cursor-pointer"
        >
          {view === 'both' ? 'Увеличить вид' : 'Показать оба ракурса'}
        </motion.button>
      </div>

      {/* Central Athletic Anatomical Canvas: Uses exactly the user's authentic drawing */}
      <div className="relative w-full aspect-[400/360] max-h-[460px] flex items-center justify-center overflow-hidden rounded-xl bg-[#080D0E]">
        <svg
          viewBox={viewBox}
          className="w-full h-full transition-all duration-500 ease-in-out"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Soft Green Glow for selected active muscle */}
            <filter id="muscleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 1. BASE GRAPHIC: Exactly the attached image file (cropped with transparent outer background) */}
          <image
            href="/assets/aistudio/muscle_atlas_cropped.png"
            x="0"
            y="0"
            width="997"
            height="967"
            preserveAspectRatio="xMidYMid meet"
            className="filter brightness-95 contrast-105"
          />

          {/* 2. OVERLAY LAYER: Colored Semi-Transparent Muscle Highlights (multiply blend on light body fills) */}
          <g style={{ mixBlendMode: 'multiply' }}>
            {/* FRONT DELTOIDS */}
            <g
              onClick={() => handleSelect('shoulders')}
              className="cursor-pointer"
              filter={isMuscleSelected('shoulders') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M130,195 Q90,210 80,248 Q98,270 120,265 Q135,240 135,200 Z"
                fill={isMuscleSelected('shoulders') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('shoulders') ? 0.95 : 0.65}
              />
              <path
                d="M270,195 Q310,210 320,248 Q302,270 280,265 Q265,240 265,200 Z"
                fill={isMuscleSelected('shoulders') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('shoulders') ? 0.95 : 0.65}
              />
            </g>

            {/* CHEST / PECTORALS */}
            <g
              onClick={() => handleSelect('chest')}
              className="cursor-pointer"
              filter={isMuscleSelected('chest') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M135,215 Q195,215 195,255 Q195,278 140,278 Q115,260 135,215 Z"
                fill={isMuscleSelected('chest') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('chest') ? 0.95 : 0.7}
              />
              <path
                d="M265,215 Q205,215 205,255 Q205,278 260,278 Q285,260 265,215 Z"
                fill={isMuscleSelected('chest') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('chest') ? 0.95 : 0.7}
              />
            </g>

            {/* BICEPS */}
            <g
              onClick={() => handleSelect('biceps')}
              className="cursor-pointer"
              filter={isMuscleSelected('biceps') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M102,268 Q78,285 82,345 Q108,348 114,330 Q116,285 102,268 Z"
                fill={isMuscleSelected('biceps') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('biceps') ? 0.95 : 0.65}
              />
              <path
                d="M298,268 Q322,285 318,345 Q292,348 286,330 Q284,285 298,268 Z"
                fill={isMuscleSelected('biceps') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('biceps') ? 0.95 : 0.65}
              />
            </g>

            {/* FOREARMS */}
            <g
              onClick={() => handleSelect('forearms')}
              className="cursor-pointer"
              filter={isMuscleSelected('forearms') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M85,355 Q60,380 68,485 Q88,488 95,470 Q98,395 85,355 Z"
                fill={isMuscleSelected('forearms') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('forearms') ? 0.9 : 0.6}
              />
              <path
                d="M315,355 Q340,380 332,485 Q312,488 305,470 Q302,395 315,355 Z"
                fill={isMuscleSelected('forearms') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('forearms') ? 0.9 : 0.6}
              />
            </g>

            {/* ABS / RECTUS ABDOMINIS */}
            <g
              onClick={() => handleSelect('abs')}
              className="cursor-pointer"
              filter={isMuscleSelected('abs') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M165,285 L235,285 L235,425 L165,425 Z"
                fill={isMuscleSelected('abs') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('abs') ? 0.95 : 0.68}
              />
            </g>

            {/* QUADS */}
            <g
              onClick={() => handleSelect('quads')}
              className="cursor-pointer"
              filter={isMuscleSelected('quads') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M135,535 Q110,575 125,690 Q155,715 178,690 Q182,590 180,535 Z"
                fill={isMuscleSelected('quads') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('quads') ? 0.95 : 0.7}
              />
              <path
                d="M265,535 Q290,575 275,690 Q245,715 222,690 Q218,590 220,535 Z"
                fill={isMuscleSelected('quads') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('quads') ? 0.95 : 0.7}
              />
            </g>

            {/* CALVES (FRONT) */}
            <g
              onClick={() => handleSelect('calves')}
              className="cursor-pointer"
              filter={isMuscleSelected('calves') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M132,740 Q118,795 132,885 Q158,885 162,795 Q158,740 132,740 Z"
                fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('calves') ? 0.9 : 0.6}
              />
              <path
                d="M268,740 Q282,795 268,885 Q242,885 238,795 Q242,740 268,740 Z"
                fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('calves') ? 0.9 : 0.6}
              />
            </g>

            {/* TRAPS (BACK) */}
            <g
              onClick={() => handleSelect('traps')}
              className="cursor-pointer"
              filter={isMuscleSelected('traps') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M795,130 L845,175 L835,260 L795,310 L755,260 L745,175 Z"
                fill={isMuscleSelected('traps') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('traps') ? 0.95 : 0.7}
              />
            </g>

            {/* REAR DELTS */}
            <g
              onClick={() => handleSelect('rearDelts')}
              className="cursor-pointer"
              filter={isMuscleSelected('rearDelts') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M740,195 Q700,210 690,248 Q708,270 730,265 Q745,240 745,200 Z"
                fill={isMuscleSelected('rearDelts') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('rearDelts') ? 0.9 : 0.65}
              />
              <path
                d="M860,195 Q900,210 910,248 Q892,270 870,265 Q855,240 855,200 Z"
                fill={isMuscleSelected('rearDelts') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('rearDelts') ? 0.9 : 0.65}
              />
            </g>

            {/* TRICEPS */}
            <g
              onClick={() => handleSelect('triceps')}
              className="cursor-pointer"
              filter={isMuscleSelected('triceps') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M698,265 Q674,285 678,345 Q704,348 710,330 Q712,285 698,265 Z"
                fill={isMuscleSelected('triceps') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('triceps') ? 0.95 : 0.65}
              />
              <path
                d="M902,265 Q926,285 922,345 Q896,348 890,330 Q888,285 902,265 Z"
                fill={isMuscleSelected('triceps') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('triceps') ? 0.95 : 0.65}
              />
            </g>

            {/* LATS */}
            <g
              onClick={() => handleSelect('lats')}
              className="cursor-pointer"
              filter={isMuscleSelected('lats') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M752,265 L718,295 Q722,385 765,395 L770,325 Z"
                fill={isMuscleSelected('lats') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('lats') ? 0.95 : 0.7}
              />
              <path
                d="M848,265 L882,295 Q878,385 835,395 L830,325 Z"
                fill={isMuscleSelected('lats') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('lats') ? 0.95 : 0.7}
              />
            </g>

            {/* LOWER BACK */}
            <g
              onClick={() => handleSelect('lowerback')}
              className="cursor-pointer"
              filter={isMuscleSelected('lowerback') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M770,395 L830,395 L835,465 L765,465 Z"
                fill={isMuscleSelected('lowerback') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('lowerback') ? 0.95 : 0.65}
              />
            </g>

            {/* GLUTES */}
            <g
              onClick={() => handleSelect('glutes')}
              className="cursor-pointer"
              filter={isMuscleSelected('glutes') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M742,465 Q728,515 758,555 Q788,550 790,490 L785,465 Z"
                fill={isMuscleSelected('glutes') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('glutes') ? 0.95 : 0.7}
              />
              <path
                d="M858,465 Q872,515 842,555 Q812,550 810,490 L815,465 Z"
                fill={isMuscleSelected('glutes') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('glutes') ? 0.95 : 0.7}
              />
            </g>

            {/* HAMSTRINGS */}
            <g
              onClick={() => handleSelect('hamstrings')}
              className="cursor-pointer"
              filter={isMuscleSelected('hamstrings') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M732,555 Q720,615 738,700 L768,700 Q782,615 772,555 Z"
                fill={isMuscleSelected('hamstrings') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('hamstrings') ? 0.95 : 0.7}
              />
              <path
                d="M868,555 Q880,615 862,700 L832,700 Q818,615 828,555 Z"
                fill={isMuscleSelected('hamstrings') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('hamstrings') ? 0.95 : 0.7}
              />
            </g>

            {/* CALVES (BACK) */}
            <g
              onClick={() => handleSelect('calves')}
              className="cursor-pointer"
              filter={isMuscleSelected('calves') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M730,740 Q715,795 730,885 Q756,885 760,795 Q756,740 730,740 Z"
                fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('calves') ? 0.9 : 0.65}
              />
              <path
                d="M870,740 Q885,795 870,885 Q844,885 840,795 Q844,740 870,740 Z"
                fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('calves') ? 0.9 : 0.65}
              />
            </g>
          </g>

          {/* 3. LEADER LINES AND LABELS OVERLAY */}
          {/* LEFT SIDE (FRONT) */}
          {/* Плечи */}
          <g onClick={() => handleSelect('shoulders')} className="cursor-pointer group">
            <circle cx="105" cy="225" r="4.5" fill={isMuscleSelected('shoulders') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="105,225 10,195 -10,195"
              fill="none"
              stroke={isMuscleSelected('shoulders') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('shoulders') ? '2.5' : '1.5'}
            />
            <text x="-16" y="190" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Плечи
            </text>
            <text
              x="-16"
              y="214"
              textAnchor="end"
              fill={isMuscleSelected('shoulders') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('shoulders')}
            </text>
          </g>

          {/* Грудные */}
          <g onClick={() => handleSelect('chest')} className="cursor-pointer group">
            <circle cx="155" cy="245" r="4.5" fill={isMuscleSelected('chest') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="155,245 10,265 -10,265"
              fill="none"
              stroke={isMuscleSelected('chest') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('chest') ? '2.5' : '1.5'}
            />
            <text x="-16" y="260" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Грудные
            </text>
            <text
              x="-16"
              y="284"
              textAnchor="end"
              fill={isMuscleSelected('chest') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('chest')}
            </text>
          </g>

          {/* Бицепсы */}
          <g onClick={() => handleSelect('biceps')} className="cursor-pointer group">
            <circle cx="95" cy="310" r="4.5" fill={isMuscleSelected('biceps') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="95,310 10,335 -10,335"
              fill="none"
              stroke={isMuscleSelected('biceps') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('biceps') ? '2.5' : '1.5'}
            />
            <text x="-16" y="330" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Бицепсы
            </text>
            <text
              x="-16"
              y="354"
              textAnchor="end"
              fill={isMuscleSelected('biceps') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('biceps')}
            </text>
          </g>

          {/* Предплечья */}
          <g onClick={() => handleSelect('forearms')} className="cursor-pointer group">
            <circle cx="78" cy="420" r="4.5" fill={isMuscleSelected('forearms') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="78,420 10,430 -10,430"
              fill="none"
              stroke={isMuscleSelected('forearms') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('forearms') ? '2.5' : '1.5'}
            />
            <text x="-16" y="425" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Предплечья
            </text>
            <text
              x="-16"
              y="449"
              textAnchor="end"
              fill={isMuscleSelected('forearms') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('forearms')}
            </text>
          </g>

          {/* Квадрицепсы */}
          <g onClick={() => handleSelect('quads')} className="cursor-pointer group">
            <circle cx="145" cy="620" r="4.5" fill={isMuscleSelected('quads') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="145,620 10,615 -10,615"
              fill="none"
              stroke={isMuscleSelected('quads') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('quads') ? '2.5' : '1.5'}
            />
            <text x="-16" y="610" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Квадрицепсы
            </text>
            <text
              x="-16"
              y="634"
              textAnchor="end"
              fill={isMuscleSelected('quads') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('quads')}
            </text>
          </g>

          {/* Икры (Front) */}
          <g onClick={() => handleSelect('calves')} className="cursor-pointer group">
            <circle cx="145" cy="810" r="4.5" fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="145,810 10,805 -10,805"
              fill="none"
              stroke={isMuscleSelected('calves') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('calves') ? '2.5' : '1.5'}
            />
            <text x="-16" y="800" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Икры
            </text>
            <text
              x="-16"
              y="824"
              textAnchor="end"
              fill={isMuscleSelected('calves') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('calves')}
            </text>
          </g>

          {/* CENTER: Пресс */}
          <g onClick={() => handleSelect('abs')} className="cursor-pointer group">
            <circle cx="205" cy="355" r="4.5" fill={isMuscleSelected('abs') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="205,355 350,355 380,355"
              fill="none"
              stroke={isMuscleSelected('abs') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('abs') ? '2.5' : '1.5'}
            />
            <text x="390" y="350" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Пресс
            </text>
            <text
              x="390"
              y="374"
              textAnchor="start"
              fill={isMuscleSelected('abs') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('abs')}
            </text>
          </g>

          {/* RIGHT SIDE (BACK) */}
          {/* Трапеции */}
          <g onClick={() => handleSelect('traps')} className="cursor-pointer group">
            <circle cx="810" cy="190" r="4.5" fill={isMuscleSelected('traps') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="810,190 990,175 1010,175"
              fill="none"
              stroke={isMuscleSelected('traps') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('traps') ? '2.5' : '1.5'}
            />
            <text x="1020" y="170" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Трапеции
            </text>
            <text
              x="1020"
              y="194"
              textAnchor="start"
              fill={isMuscleSelected('traps') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('traps')}
            </text>
          </g>

          {/* Задние дельты */}
          <g onClick={() => handleSelect('rearDelts')} className="cursor-pointer group">
            <circle cx="895" cy="225" r="4.5" fill={isMuscleSelected('rearDelts') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="895,225 990,225 1010,225"
              fill="none"
              stroke={isMuscleSelected('rearDelts') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('rearDelts') ? '2.5' : '1.5'}
            />
            <text x="1020" y="220" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Задние дельты
            </text>
            <text
              x="1020"
              y="244"
              textAnchor="start"
              fill={isMuscleSelected('rearDelts') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('rearDelts')}
            </text>
          </g>

          {/* Трицепсы */}
          <g onClick={() => handleSelect('triceps')} className="cursor-pointer group">
            <circle cx="910" cy="305" r="4.5" fill={isMuscleSelected('triceps') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="910,305 990,295 1010,295"
              fill="none"
              stroke={isMuscleSelected('triceps') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('triceps') ? '2.5' : '1.5'}
            />
            <text x="1020" y="290" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Трицепсы
            </text>
            <text
              x="1020"
              y="314"
              textAnchor="start"
              fill={isMuscleSelected('triceps') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('triceps')}
            </text>
          </g>

          {/* Широчайшие */}
          <g onClick={() => handleSelect('lats')} className="cursor-pointer group">
            <circle cx="865" cy="345" r="4.5" fill={isMuscleSelected('lats') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="865,345 990,350 1010,350"
              fill="none"
              stroke={isMuscleSelected('lats') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('lats') ? '2.5' : '1.5'}
            />
            <text x="1020" y="346" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Широчайшие
            </text>
            <text
              x="1020"
              y="370"
              textAnchor="start"
              fill={isMuscleSelected('lats') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('lats')}
            </text>
          </g>

          {/* Разгибатели спины */}
          <g onClick={() => handleSelect('lowerback')} className="cursor-pointer group">
            <circle cx="800" cy="425" r="4.5" fill={isMuscleSelected('lowerback') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="800,425 990,415 1010,415"
              fill="none"
              stroke={isMuscleSelected('lowerback') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('lowerback') ? '2.5' : '1.5'}
            />
            <text x="1020" y="410" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Разгибатели спины
            </text>
            <text
              x="1020"
              y="434"
              textAnchor="start"
              fill={isMuscleSelected('lowerback') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('lowerback')}
            </text>
          </g>

          {/* Ягодицы */}
          <g onClick={() => handleSelect('glutes')} className="cursor-pointer group">
            <circle cx="850" cy="510" r="4.5" fill={isMuscleSelected('glutes') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="850,510 990,500 1010,500"
              fill="none"
              stroke={isMuscleSelected('glutes') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('glutes') ? '2.5' : '1.5'}
            />
            <text x="1020" y="495" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Ягодицы
            </text>
            <text
              x="1020"
              y="519"
              textAnchor="start"
              fill={isMuscleSelected('glutes') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('glutes')}
            </text>
          </g>

          {/* Бицепсы бедер */}
          <g onClick={() => handleSelect('hamstrings')} className="cursor-pointer group">
            <circle cx="855" cy="625" r="4.5" fill={isMuscleSelected('hamstrings') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="855,625 990,630 1010,630"
              fill="none"
              stroke={isMuscleSelected('hamstrings') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('hamstrings') ? '2.5' : '1.5'}
            />
            <text x="1020" y="625" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Бицепсы бедер
            </text>
            <text
              x="1020"
              y="649"
              textAnchor="start"
              fill={isMuscleSelected('hamstrings') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('hamstrings')}
            </text>
          </g>

          {/* Икры (Back) */}
          <g onClick={() => handleSelect('calves')} className="cursor-pointer group">
            <circle cx="860" cy="810" r="4.5" fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'} />
            <polyline
              points="860,810 990,810 1010,810"
              fill="none"
              stroke={isMuscleSelected('calves') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('calves') ? '2.5' : '1.5'}
            />
            <text x="1020" y="805" textAnchor="start" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Икры
            </text>
            <text
              x="1020"
              y="829"
              textAnchor="start"
              fill={isMuscleSelected('calves') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('calves')}
            </text>
          </g>
        </svg>
      </div>

      {/* ========================================================= */}
      {/* BOTTOM SELECTED MUSCLE CARD                               */}
      {/* ========================================================= */}
      <motion.div
        onClick={() => setShowDetailModal(true)}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.15 }}
        className="w-full bg-[#101719] border border-[#252D2F] rounded-2xl p-4 mt-2 transition-colors hover:border-[#384346] cursor-pointer shadow-lg space-y-3"
      >
        {/* Top row: Muscle Icon + Muscle Name + Chevron */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#14231b] border border-[#2f553f] flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-[#58C995] fill-none stroke-current stroke-[2.2] stroke-linecap-round stroke-linejoin-round"
              >
                <path d="M17 4c-3 1-5 4-5 8s2 7 5 8" />
                <path d="M12 4c-3 1-5 4-5 8s2 7 5 8" />
                <path d="M7 6c-2 1-3 3-3 6s1 5 3 6" />
              </svg>
            </div>
            <span className="text-base font-bold text-[#E8E9E7]">
              {getFullMuscleTitle(selectedMuscle)}
            </span>
          </div>

          <ChevronRight className="w-5 h-5 text-[#92999A]" />
        </div>

        {/* 3 Metric Columns in one horizontal row */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-left">
          <div>
            <span className="text-[11px] text-[#92999A] block font-normal">
              Нагрузка за неделю
            </span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums mt-0.5 block">
              {currentStat.weeklyTonnageKg > 0
                ? `${currentStat.weeklyTonnageKg.toLocaleString('ru-RU')} кг`
                : 'Недостаточно данных'}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-[#92999A] block font-normal">
              Прошлые тренировки
            </span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums mt-0.5 block">
              {currentStat.recentWorkoutsCount > 0 ? currentStat.recentWorkoutsCount : '0'}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-[#92999A] block font-normal">
              Восстановление
            </span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums mt-0.5 block">
              ~ {currentStat.recoveryDays} дня
            </span>
          </div>
        </div>

        {/* Horizontal load progress bar */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-1.5 bg-[#171D1F] border border-[#252D2F] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#58C995] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, currentStat.percent)}%` }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="text-xs font-semibold text-[#E8E9E7] tabular-nums shrink-0">
            {currentStat.percent > 0 ? `${currentStat.percent}%` : 'Недостаточно данных'}
          </span>
        </div>

        {/* Small info disclaimer in grey */}
        <div className="flex items-center gap-1.5 pt-1 text-[#92999A] text-[10px]">
          <Info className="w-3.5 h-3.5 shrink-0 opacity-80" />
          <span>Восстановление — приблизительная оценка. Не является медицинским показателем.</span>
        </div>
      </motion.div>

      {/* Detail Breakdown Modal on clicking the card */}
      <AnimatePresence>
        {showDetailModal && (
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
              <div className="flex items-center justify-between pb-2 border-b border-[#252D2F]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#58C995]" />
                  <h3 className="text-base font-bold text-[#E8E9E7]">
                    {getFullMuscleTitle(selectedMuscle)}
                  </h3>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowDetailModal(false)}
                  className="p-1 text-[#92999A] hover:text-[#E8E9E7] rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Quick status summary */}
              <div className="bg-[#080D0E] p-3 rounded-xl border border-[#202729] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#92999A]">Текущая нагрузка:</span>
                  <span className="font-bold text-[#58C995]">
                    {currentStat.percent > 0 ? `${currentStat.percent}%` : 'Недостаточно данных'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#92999A]">Недельный объем:</span>
                  <span className="font-bold text-[#E8E9E7]">
                    {currentStat.weeklyTonnageKg > 0
                      ? `${currentStat.weeklyTonnageKg.toLocaleString('ru-RU')} кг`
                      : 'Недостаточно данных'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#92999A]">Проведено сессий:</span>
                  <span className="font-bold text-[#E8E9E7]">{currentStat.recentWorkoutsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#92999A]">Осталось восстановления:</span>
                  <span className="font-bold text-[#E8E9E7]">~ {currentStat.recoveryDays} дня</span>
                </div>
              </div>

              {/* Top exercises for this muscle */}
              <div>
                <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block mb-2">
                  Эффективные упражнения
                </span>
                <div className="space-y-1.5">
                  {getTopExercises(selectedMuscle).map((exName, idx) => (
                    <motion.div
                      key={idx}
                      whileHover={{ x: 2 }}
                      className="p-2.5 bg-[#080D0E] rounded-xl border border-[#202729] flex items-center gap-2 text-xs text-[#E8E9E7] transition-colors"
                    >
                      <Dumbbell className="w-3.5 h-3.5 text-[#58C995] shrink-0" />
                      <span>{exName}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowDetailModal(false)}
                className="w-full py-2.5 bg-[#58C995] hover:bg-[#68d7a4] text-black font-bold text-xs rounded-xl transition-colors shadow-md cursor-pointer"
              >
                Закрыть
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
