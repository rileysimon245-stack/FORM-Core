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

  const isMuscleSelected = (m: MuscleGroup) => selectedMuscle === m;

  const renderPercent = (m: MuscleGroup) => {
    const val = stats[m]?.percent;
    if (val === undefined || val === 0) return '0%';
    return `${val}%`;
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Top Header: FORM logo + Settings icon */}
      <div className="w-full flex items-center justify-between pt-1 mb-2">
        <span className="font-serif text-lg font-bold tracking-widest text-[#E8E9E7]">
          FORM
        </span>
        {onOpenSettings && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onOpenSettings}
            className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] transition-colors rounded-lg cursor-pointer"
            title="Настройки"
          >
            <Settings className="w-4 h-4" />
          </motion.button>
        )}
      </div>

      {/* Screen Title: Карта мышц */}
      <div className="w-full text-left mb-2">
        <h2 className="text-2xl font-serif tracking-tight text-[#E8E9E7]">
          Карта мышц
        </h2>
      </div>

      {/* Central Anatomical Canvas: Both Front and Back figures displayed simultaneously */}
      <div className="relative w-full aspect-[1175/950] flex items-center justify-center overflow-hidden rounded-2xl bg-[#080D0E] my-1">
        <svg
          viewBox="-140 15 1175 950"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Soft Green Glow for selected active muscle */}
            <filter id="muscleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ========================================================= */}
          {/* 1. FRONT FIGURE (LEFT SIDE)                               */}
          {/* ========================================================= */}
          <image
            href="/assets/aistudio/front_figure_cropped.png"
            x="0"
            y="0"
            width="420"
            height="967"
            preserveAspectRatio="xMidYMid meet"
            className="filter brightness-95 contrast-105"
          />

          {/* FRONT MUSCLE HIGHLIGHT OVERLAYS */}
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
          </g>

          {/* FRONT LEADER LINES & LABELS (LEFT SIDE) */}
          {/* Плечи */}
          <g onClick={() => handleSelect('shoulders')} className="cursor-pointer group">
            <circle cx="105" cy="225" r={isMuscleSelected('shoulders') ? 5.5 : 4} fill={isMuscleSelected('shoulders') ? '#58C995' : '#556467'} />
            <polyline
              points="105,225 15,195 -5,195"
              fill="none"
              stroke={isMuscleSelected('shoulders') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('shoulders') ? '2.5' : '1.5'}
            />
            <text x="-12" y="190" textAnchor="end" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Плечи
            </text>
            <text
              x="-12"
              y="216"
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
            <circle cx="155" cy="245" r={isMuscleSelected('chest') ? 5.5 : 4} fill={isMuscleSelected('chest') ? '#58C995' : '#556467'} />
            <polyline
              points="155,245 15,260 -5,260"
              fill="none"
              stroke={isMuscleSelected('chest') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('chest') ? '2.5' : '1.5'}
            />
            <text x="-12" y="255" textAnchor="end" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Грудные
            </text>
            <text
              x="-12"
              y="281"
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
            <circle cx="95" cy="310" r={isMuscleSelected('biceps') ? 5.5 : 4} fill={isMuscleSelected('biceps') ? '#58C995' : '#556467'} />
            <polyline
              points="95,310 15,330 -5,330"
              fill="none"
              stroke={isMuscleSelected('biceps') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('biceps') ? '2.5' : '1.5'}
            />
            <text x="-12" y="325" textAnchor="end" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Бицепсы
            </text>
            <text
              x="-12"
              y="351"
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
            <circle cx="78" cy="415" r={isMuscleSelected('forearms') ? 5.5 : 4} fill={isMuscleSelected('forearms') ? '#58C995' : '#556467'} />
            <polyline
              points="78,415 15,415 -5,415"
              fill="none"
              stroke={isMuscleSelected('forearms') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('forearms') ? '2.5' : '1.5'}
            />
            <text x="-12" y="410" textAnchor="end" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Предплечья
            </text>
            <text
              x="-12"
              y="436"
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
            <circle cx="145" cy="615" r={isMuscleSelected('quads') ? 5.5 : 4} fill={isMuscleSelected('quads') ? '#58C995' : '#556467'} />
            <polyline
              points="145,615 15,605 -5,605"
              fill="none"
              stroke={isMuscleSelected('quads') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('quads') ? '2.5' : '1.5'}
            />
            <text x="-12" y="600" textAnchor="end" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Квадрицепсы
            </text>
            <text
              x="-12"
              y="626"
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
            <circle cx="145" cy="805" r={isMuscleSelected('calves') ? 5.5 : 4} fill={isMuscleSelected('calves') ? '#58C995' : '#556467'} />
            <polyline
              points="145,805 15,795 -5,795"
              fill="none"
              stroke={isMuscleSelected('calves') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('calves') ? '2.5' : '1.5'}
            />
            <text x="-12" y="790" textAnchor="end" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Икры
            </text>
            <text
              x="-12"
              y="816"
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
            <circle cx="205" cy="355" r={isMuscleSelected('abs') ? 5.5 : 4} fill={isMuscleSelected('abs') ? '#58C995' : '#556467'} />
            <polyline
              points="205,355 315,355 330,355"
              fill="none"
              stroke={isMuscleSelected('abs') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('abs') ? '2.5' : '1.5'}
            />
            <text x="340" y="350" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
              Пресс
            </text>
            <text
              x="340"
              y="376"
              textAnchor="start"
              fill={isMuscleSelected('abs') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('abs')}
            </text>
          </g>

          {/* ========================================================= */}
          {/* 2. BACK FIGURE (RIGHT SIDE) - Shifted by -140px           */}
          {/* ========================================================= */}
          <g transform="translate(-140, 0)">
            {/* BACK BASE IMAGE */}
            <image
              href="/assets/aistudio/back_figure_cropped.png"
              x="577"
              y="0"
              width="420"
              height="967"
              preserveAspectRatio="xMidYMid meet"
              className="filter brightness-95 contrast-105"
            />

            {/* BACK MUSCLE HIGHLIGHT OVERLAYS */}
            <g style={{ mixBlendMode: 'multiply' }}>
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

            {/* BACK LEADER LINES & LABELS (RIGHT SIDE) */}
            {/* Трапеции */}
            <g onClick={() => handleSelect('traps')} className="cursor-pointer group">
              <circle cx="800" cy="185" r={isMuscleSelected('traps') ? 5.5 : 4} fill={isMuscleSelected('traps') ? '#58C995' : '#556467'} />
              <polyline
                points="800,185 975,170 995,170"
                fill="none"
                stroke={isMuscleSelected('traps') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('traps') ? '2.5' : '1.5'}
              />
              <text x="1005" y="165" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Трапеции
              </text>
              <text
                x="1005"
                y="191"
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
              <circle cx="890" cy="225" r={isMuscleSelected('rearDelts') ? 5.5 : 4} fill={isMuscleSelected('rearDelts') ? '#58C995' : '#556467'} />
              <polyline
                points="890,225 975,220 995,220"
                fill="none"
                stroke={isMuscleSelected('rearDelts') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('rearDelts') ? '2.5' : '1.5'}
              />
              <text x="1005" y="215" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Задние дельты
              </text>
              <text
                x="1005"
                y="241"
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
              <circle cx="905" cy="305" r={isMuscleSelected('triceps') ? 5.5 : 4} fill={isMuscleSelected('triceps') ? '#58C995' : '#556467'} />
              <polyline
                points="905,305 975,290 995,290"
                fill="none"
                stroke={isMuscleSelected('triceps') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('triceps') ? '2.5' : '1.5'}
              />
              <text x="1005" y="285" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Трицепсы
              </text>
              <text
                x="1005"
                y="311"
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
              <circle cx="865" cy="345" r={isMuscleSelected('lats') ? 5.5 : 4} fill={isMuscleSelected('lats') ? '#58C995' : '#556467'} />
              <polyline
                points="865,345 975,345 995,345"
                fill="none"
                stroke={isMuscleSelected('lats') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('lats') ? '2.5' : '1.5'}
              />
              <text x="1005" y="340" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Широчайшие
              </text>
              <text
                x="1005"
                y="366"
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
              <circle cx="800" cy="425" r={isMuscleSelected('lowerback') ? 5.5 : 4} fill={isMuscleSelected('lowerback') ? '#58C995' : '#556467'} />
              <polyline
                points="800,425 975,415 995,415"
                fill="none"
                stroke={isMuscleSelected('lowerback') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('lowerback') ? '2.5' : '1.5'}
              />
              <text x="1005" y="410" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Разгибатели спины
              </text>
              <text
                x="1005"
                y="436"
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
              <circle cx="850" cy="510" r={isMuscleSelected('glutes') ? 5.5 : 4} fill={isMuscleSelected('glutes') ? '#58C995' : '#556467'} />
              <polyline
                points="850,510 975,500 995,500"
                fill="none"
                stroke={isMuscleSelected('glutes') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('glutes') ? '2.5' : '1.5'}
              />
              <text x="1005" y="495" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Ягодицы
              </text>
              <text
                x="1005"
                y="521"
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
              <circle cx="855" cy="625" r={isMuscleSelected('hamstrings') ? 5.5 : 4} fill={isMuscleSelected('hamstrings') ? '#58C995' : '#556467'} />
              <polyline
                points="855,625 975,625 995,625"
                fill="none"
                stroke={isMuscleSelected('hamstrings') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('hamstrings') ? '2.5' : '1.5'}
              />
              <text x="1005" y="620" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Бицепсы бедер
              </text>
              <text
                x="1005"
                y="646"
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
              <circle cx="860" cy="810" r={isMuscleSelected('calves') ? 5.5 : 4} fill={isMuscleSelected('calves') ? '#58C995' : '#556467'} />
              <polyline
                points="860,810 975,805 995,805"
                fill="none"
                stroke={isMuscleSelected('calves') ? '#58C995' : '#384346'}
                strokeWidth={isMuscleSelected('calves') ? '2.5' : '1.5'}
              />
              <text x="1005" y="800" textAnchor="start" fill="#E8E9E7" fontSize="20" fontWeight="600">
                Икры
              </text>
              <text
                x="1005"
                y="826"
                textAnchor="start"
                fill={isMuscleSelected('calves') ? '#58C995' : '#E8E9E7'}
                fontSize="24"
                fontWeight="700"
              >
                {renderPercent('calves')}
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* ========================================================= */}
      {/* BOTTOM SELECTED MUSCLE CARD (MATCHES REFERENCE EXACTLY)   */}
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

        {/* 3 Metric Columns */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1C2325]">
          <div>
            <span className="text-[11px] text-[#92999A] block mb-0.5">
              Нагрузка за неделю
            </span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
              {currentStat.weeklyTonnageKg.toLocaleString('ru-RU')} кг
            </span>
          </div>

          <div>
            <span className="text-[11px] text-[#92999A] block mb-0.5">
              Прошлые тренировки
            </span>
            <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
              {currentStat.recentWorkoutsCount}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-[#92999A] block mb-0.5">
              Восстановление
            </span>
            <span className="text-sm font-bold text-[#58C995] tabular-nums">
              ~ {currentStat.recoveryDays} дня
            </span>
          </div>
        </div>

        {/* Fatigue / Recovery Progress Bar */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] text-[#92999A] mb-1">
            <span>Уровень нагрузки</span>
            <span className="font-bold text-[#58C995] tabular-nums">{currentStat.percent}%</span>
          </div>
          <div className="w-full bg-[#1b2224] h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#58C995] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(5, currentStat.percent))}%` }}
            />
          </div>
        </div>

        {/* Medical / Estimation Disclaimer */}
        <div className="flex items-center gap-1.5 pt-1 text-[10px] text-[#6E7678]">
          <Info className="w-3.5 h-3.5 shrink-0 text-[#92999A]" />
          <span>Восстановление — приблизительная оценка. Не является медицинским показателем.</span>
        </div>
      </motion.div>

      {/* ========================================================= */}
      {/* DETAILED MUSCLE MODAL                                     */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showDetailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              variants={modalBackdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setShowDetailModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
            />

            <motion.div
              variants={modalDialogVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-3xl p-5 shadow-2xl z-10 space-y-4 max-h-[85vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#202729] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#14231b] border border-[#2f553f] flex items-center justify-center">
                    <Dumbbell className="w-4 h-4 text-[#58C995]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#E8E9E7]">
                      {getFullMuscleTitle(selectedMuscle)}
                    </h3>
                    <span className="text-[11px] text-[#58C995] font-medium">
                      Нагрузка: {currentStat.percent}% • Статус: {currentStat.status === 'fatigued' ? 'Утомлена' : currentStat.status === 'recovering' ? 'Восстановление' : 'Готова к нагрузкам'}
                    </span>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowDetailModal(false)}
                  className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] rounded-xl hover:bg-[#1E2628] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Recovery Guidance */}
              <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#58C995]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Рекомендация по восстановлению</span>
                </div>
                <p className="text-xs text-[#92999A] leading-relaxed">
                  {currentStat.percent > 70
                    ? 'Мышца получила высокую нагрузку за неделю. Рекомендуется дать минимум 48-72 часа отдыха перед следующей интенсивной силовой сессией.'
                    : currentStat.percent > 35
                    ? 'Оптимальный уровень нагрузки. Мышца готова к стандартному тренировочному объему.'
                    : 'Низкая нагрузка за последние 7 дней. Можно безопасно включать в тренировочный план на сегодня.'}
                </p>
              </div>

              {/* Top Exercises for this Muscle */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider block">
                  Лучшие упражнения из базы FORM:
                </span>
                <div className="space-y-1.5">
                  {getTopExercises(selectedMuscle).map((exName, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl flex items-center justify-between text-xs font-medium text-[#E8E9E7]"
                    >
                      <span>{exName}</span>
                      <span className="text-[10px] text-[#58C995] font-semibold px-2 py-0.5 bg-[#14231b] rounded-md border border-[#2f553f]">
                        Базовое
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Close Button */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowDetailModal(false)}
                className="w-full py-2.5 bg-[#1E2628] hover:bg-[#283336] text-[#E8E9E7] text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Закрыть
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
