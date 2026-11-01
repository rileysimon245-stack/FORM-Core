import React, { useState } from 'react';
import { MuscleGroup, MuscleLoadStats, MUSCLE_DEFINITIONS, EXERCISE_CATALOG } from '../types/workout';
import { Info, Dumbbell, BarChart3, Settings, Calendar, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MuscleMapProps {
  stats: Record<MuscleGroup, MuscleLoadStats>;
  onSelectMuscle?: (muscle: MuscleGroup) => void;
  onOpenSettings?: () => void;
}

export const MuscleMap: React.FC<MuscleMapProps> = ({ stats, onSelectMuscle, onOpenSettings }) => {
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup>('chest');
  const [activeTab, setActiveTab] = useState<'info' | 'exercises' | 'stats'>('info');

  const currentDef = MUSCLE_DEFINITIONS[selectedMuscle];
  const currentStat: MuscleLoadStats = stats[selectedMuscle] || {
    muscle: selectedMuscle,
    nameRu: currentDef?.nameRu || 'Мышца',
    percent: 0,
    weeklyTonnageKg: 0,
    recentWorkoutsCount: 0,
    exerciseCount: 0,
    setsCount: 0,
    recoveryDays: 0,
    status: 'recovered',
    history: [],
    hasData: false,
  };

  const handleSelect = (m: MuscleGroup) => {
    setSelectedMuscle(m);
    if (onSelectMuscle) onSelectMuscle(m);
  };

  // Find all exercises targeting this muscle from catalog
  const exercisesForMuscle = EXERCISE_CATALOG.filter(
    (ex) => ex.primaryMuscle === selectedMuscle || ex.secondaryMuscles?.includes(selectedMuscle)
  );

  const isMuscleSelected = (m: MuscleGroup) => selectedMuscle === m;

  const renderPercent = (m: MuscleGroup) => {
    const val = stats[m]?.percent;
    if (val === undefined || val === 0) return '0%';
    return `${val}%`;
  };

  return (
    <div className="w-full flex flex-col items-center select-none pb-2">
      {/* Top Header: FORM title + Settings icon (No fake status bar) */}
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

      {/* Screen Title */}
      <div className="w-full text-left mb-2 px-0.5">
        <h2 className="text-2xl font-serif tracking-tight text-[#E8E9E7]">
          Анатомия мышц
        </h2>
      </div>

      {/* Central Anatomical Canvas: Dual Models (Front & Back simultaneously, no switcher) */}
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

            {/* OBLIQUES (Косые мышцы живота) */}
            <g
              onClick={() => handleSelect('obliques')}
              className="cursor-pointer"
              filter={isMuscleSelected('obliques') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M128,320 L160,320 L160,425 L132,425 Q125,370 128,320 Z"
                fill={isMuscleSelected('obliques') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('obliques') ? 0.95 : 0.65}
              />
              <path
                d="M272,320 L240,320 L240,425 L268,425 Q275,370 272,320 Z"
                fill={isMuscleSelected('obliques') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('obliques') ? 0.95 : 0.65}
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

            {/* TIBIALIS (Передняя большеберцовая мышца) */}
            <g
              onClick={() => handleSelect('tibialis')}
              className="cursor-pointer"
              filter={isMuscleSelected('tibialis') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M138,745 Q130,810 142,885 L156,885 Q152,810 148,745 Z"
                fill={isMuscleSelected('tibialis') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('tibialis') ? 0.95 : 0.65}
              />
              <path
                d="M262,745 Q270,810 258,885 L244,885 Q248,810 252,745 Z"
                fill={isMuscleSelected('tibialis') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('tibialis') ? 0.95 : 0.65}
              />
            </g>

            {/* CALVES (FRONT) */}
            <g
              onClick={() => handleSelect('calves')}
              className="cursor-pointer"
              filter={isMuscleSelected('calves') ? 'url(#muscleGlow)' : undefined}
            >
              <path
                d="M124,740 Q114,795 126,865 L136,865 Q132,795 130,740 Z"
                fill={isMuscleSelected('calves') ? '#58C995' : '#83CBA5'}
                fillOpacity={isMuscleSelected('calves') ? 0.9 : 0.6}
              />
              <path
                d="M276,740 Q286,795 274,865 L264,865 Q268,795 270,740 Z"
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

          {/* Тибиалис / Большеберцовая */}
          <g onClick={() => handleSelect('tibialis')} className="cursor-pointer group">
            <circle cx="145" cy="815" r={isMuscleSelected('tibialis') ? 5.5 : 4} fill={isMuscleSelected('tibialis') ? '#58C995' : '#556467'} />
            <polyline
              points="145,815 15,805 -5,805"
              fill="none"
              stroke={isMuscleSelected('tibialis') ? '#58C995' : '#384346'}
              strokeWidth={isMuscleSelected('tibialis') ? '2.5' : '1.5'}
            />
            <text x="-12" y="800" textAnchor="end" fill="#E8E9E7" fontSize="18" fontWeight="600">
              Большеберцовая
            </text>
            <text
              x="-12"
              y="824"
              textAnchor="end"
              fill={isMuscleSelected('tibialis') ? '#58C995' : '#E8E9E7'}
              fontSize="24"
              fontWeight="700"
            >
              {renderPercent('tibialis')}
            </text>
          </g>

          {/* CENTER: Пресс & Косые */}
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
      {/* DETAILED INTERACTIVE CARD WITH 3 TABS                     */}
      {/* ========================================================= */}
      <div className="w-full bg-[#101719] border border-[#252D2F] rounded-2xl p-4 mt-2 shadow-lg space-y-3">
        {/* Header: Selected Muscle badge + Name */}
        <div className="flex items-center justify-between pb-2 border-b border-[#1C2325]">
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
            <div>
              <h3 className="text-base font-bold text-[#E8E9E7]">
                {currentDef?.nameRu || 'Мышца'}
              </h3>
              <span className="text-[11px] text-[#58C995] font-semibold">
                Нагрузка: {currentStat.percent}% • Восстановление: ~{currentStat.recoveryDays} дн.
              </span>
            </div>
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

        {/* Tab 1: ИНФОРМАЦИЯ (Анатомия, расположение, функция) */}
        {activeTab === 'info' && (
          <div className="space-y-2.5 pt-1 text-xs">
            {/* Location */}
            <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] space-y-1">
              <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
                Расположение
              </span>
              <p className="text-xs text-[#C5CBCD] leading-relaxed">
                {currentDef?.locationRu}
              </p>
            </div>

            {/* Function */}
            <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] space-y-1">
              <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
                Анатомическая функция
              </span>
              <p className="text-xs text-[#C5CBCD] leading-relaxed">
                {currentDef?.functionRu}
              </p>
            </div>

            {/* Recovery advice */}
            <div className="p-3 bg-[#080D0E] rounded-xl border border-[#202729] flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#58C995] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-[#E8E9E7]">
                  Время полного восстановления: ~{currentDef?.recoveryHours} часов
                </span>
                <p className="text-[11px] text-[#92999A]">
                  Оценка основана на физиологическом времени синтеза белка и регенерации волокон.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: УПРАЖНЕНИЯ (Из дневника) */}
        {activeTab === 'exercises' && (
          <div className="space-y-2 pt-1">
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

        {/* Tab 3: СТАТИСТИКА (Реальные данные тренировок) */}
        {activeTab === 'stats' && (
          <div className="space-y-3 pt-1 text-xs">
            {currentStat.hasData ? (
              <>
                {/* 3 Metric cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-center">
                    <span className="text-[10px] text-[#92999A] block mb-0.5">Тренировочный объём</span>
                    <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                      {currentStat.weeklyTonnageKg.toLocaleString('ru-RU')} кг
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-center">
                    <span className="text-[10px] text-[#92999A] block mb-0.5">Подходов выполнено</span>
                    <span className="text-sm font-bold text-[#58C995] tabular-nums">
                      {currentStat.setsCount}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl text-center">
                    <span className="text-[10px] text-[#92999A] block mb-0.5">Упражнений</span>
                    <span className="text-sm font-bold text-[#E8E9E7] tabular-nums">
                      {currentStat.exerciseCount}
                    </span>
                  </div>
                </div>

                {/* History list */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#92999A] uppercase tracking-wider block">
                    История нагрузки по тренировкам:
                  </span>
                  {currentStat.history.slice(0, 5).map((h, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#080D0E] border border-[#202729] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[#58C995] shrink-0" />
                        <div>
                          <div className="font-semibold text-[#E8E9E7]">{h.exerciseName}</div>
                          <div className="text-[10px] text-[#83CBA5]">{h.date}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-[#E8E9E7] tabular-nums">
                          {h.volumeKg.toLocaleString('ru-RU')} кг
                        </span>
                        <div className="text-[10px] text-[#92999A]">{h.sets} подх.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-6 px-4 bg-[#080D0E] border border-[#202729] rounded-xl text-center space-y-1.5">
                <BarChart3 className="w-8 h-8 text-[#58C995]/50 mx-auto mb-1" />
                <h4 className="text-xs font-bold text-[#E8E9E7]">
                  Нет данных о тренировках этой группы за выбранный период
                </h4>
                <p className="text-[11px] text-[#92999A] max-w-xs mx-auto">
                  Запишите выполненную тренировку с упражнениями на {currentDef?.nameRu.toLowerCase() || 'эту мышцу'}, чтобы увидеть динамику нагрузки и объём.
                </p>
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-[#6E7678]">
              <Info className="w-3.5 h-3.5 shrink-0 text-[#92999A]" />
              <span>Расчётный тренировочный объём не является физиологическим измерением активации волокон.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
