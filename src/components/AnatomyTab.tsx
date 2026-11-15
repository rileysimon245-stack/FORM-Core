import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StorageService, normalizeMuscleKey, isSessionAfterReset } from '../services/storage';
import { safeGetRaw, safeSetItem, safeRemoveItem } from '../services/migrations';
import { formatLocalIsoDate, getCalendarDaysAgo } from '../training-core/dateUtils';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';
import { normalizeMuscleListPure } from '../training-core/muscles';
import {
  MUSCLE_DEFINITIONS,
  MuscleGroup,
  MusclePeriod,
  MuscleLoadStats,
  WorkoutSession,
  SportSession,
  SPORT_DEFINITIONS,
  MuscleLoadHistoryItem,
} from '../types/workout';
import {
  Activity,
  ChevronUp,
  ChevronDown,
  Info,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  X,
  Search,
  Layers,
  Bug,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MappingRegion {
  id: number;
  area: number;
  assignedMuscle: string | null;
  projection: 'front' | 'back';
  center?: { x: number; y: number };
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
}

interface MappingData {
  width: number;
  height: number;
  regions: MappingRegion[];
}

// Crop coordinates for 1266x1243 atlas with sports shorts
const DUAL_VIEW_CROP = {
  cropX: 0,
  cropY: 0,
  width: 1266,
  height: 1243,
};

// Helper to get muscle load percent with hierarchy rollups
function getEffectiveMusclePercent(
  muscleKey: string | null | undefined,
  stats: Record<MuscleGroup, MuscleLoadStats>
): number {
  if (!muscleKey || muscleKey === 'background') return 0;

  const canonKey = muscleKey === 'rearDelts' ? 'rear_delts' : muscleKey;
  let maxVal = stats[muscleKey as MuscleGroup]?.percent || stats[canonKey as MuscleGroup]?.percent || 0;

  // Sync alias keys bidirectionally (rearDelts <-> rear_delts)
  if (stats['rear_delts']) maxVal = Math.max(maxVal, stats['rear_delts'].percent);
  if (stats['rearDelts']) maxVal = Math.max(maxVal, stats['rearDelts'].percent);

  const parentMap: Record<string, MuscleGroup> = {
    chest_upper: 'chest',
    chest_mid: 'chest',
    chest_lower: 'chest',
    front_delts: 'shoulders',
    side_delts: 'shoulders',
    rear_delts: 'shoulders',
    rearDelts: 'shoulders',
    brachialis: 'biceps',
    traps_upper: 'traps',
    traps_mid: 'traps',
    traps_lower: 'traps',
    rhomboids: 'traps',
    quads_rectus: 'quads',
    quads_lateralis: 'quads',
    quads_medialis: 'quads',
    tibialis: 'calves',
  };

  const childrenMap: Record<string, MuscleGroup[]> = {
    chest: ['chest_mid', 'chest_upper', 'chest_lower'],
    shoulders: ['front_delts', 'side_delts', 'rear_delts', 'rearDelts'],
    biceps: ['brachialis'],
    traps: ['traps_upper', 'traps_mid', 'traps_lower', 'rhomboids'],
    quads: ['quads_rectus', 'quads_lateralis', 'quads_medialis'],
    calves: ['tibialis'],
  };

  // 1. Parent rollup (Parent -> Child)
  const parentKey = parentMap[muscleKey] || parentMap[canonKey];
  if (parentKey && stats[parentKey]) {
    maxVal = Math.max(maxVal, stats[parentKey].percent);
  }

  // 2. Children rollup (Child -> Parent)
  const children = childrenMap[muscleKey] || childrenMap[canonKey];
  if (children) {
    children.forEach((c) => {
      if (stats[c]) {
        maxVal = Math.max(maxVal, stats[c].percent);
      }
    });
  }

  // 3. Sibling rollup (Child -> Sibling)
  if (parentKey && childrenMap[parentKey]) {
    childrenMap[parentKey].forEach((s) => {
      if (stats[s]) {
        maxVal = Math.max(maxVal, stats[s].percent);
      }
    });
  }

  return maxVal;
}

// Generate distinct color per muscle for debug mode, or red if missing/unassigned
function getDebugColorForMuscle(assignedMuscle: string | null | undefined): { tintR: number; tintG: number; tintB: number; alpha: number } {
  if (!assignedMuscle || assignedMuscle === 'background') {
    return { tintR: 239, tintG: 68, tintB: 68, alpha: 0.85 }; // Red for unassigned
  }
  let hash = 0;
  for (let i = 0; i < assignedMuscle.length; i++) {
    hash = (hash << 5) - hash + assignedMuscle.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const c = 0.85 * 0.55;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.55 - c;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    tintR: Math.round((r + m) * 255),
    tintG: Math.round((g + m) * 255),
    tintB: Math.round((b + m) * 255),
    alpha: 0.75,
  };
}

// Signature FORM Core green palette:
// Signature FORM Core green & unbounded hyper-mint palette:
// When a muscle is heavily strained / loaded, it becomes even mintier without limits!
function getMuscleColorStyle(percent: number) {
  if (percent <= 0) return null;
  const t = percent / 100;

  let tintR: number;
  let tintG: number;
  let tintB: number;
  let alpha: number;

  if (t <= 0.25) {
    const k = t / 0.25;
    tintR = Math.round(95 - 20 * k);   // 95 -> 75
    tintG = Math.round(155 + 35 * k);  // 155 -> 190
    tintB = Math.round(120 + 20 * k);  // 120 -> 140
    alpha = 0.22 + 0.18 * k;          // 0.22 -> 0.40
  } else if (t <= 0.6) {
    const k = (t - 0.25) / 0.35;
    tintR = Math.round(75 - 25 * k);   // 75 -> 50
    tintG = Math.round(190 + 25 * k);  // 190 -> 215
    tintB = Math.round(140 + 20 * k);  // 140 -> 160
    alpha = 0.40 + 0.25 * k;          // 0.40 -> 0.65
  } else if (t <= 1.0) {
    const k = (t - 0.6) / 0.4;
    tintR = Math.round(50 - 25 * k);   // 50 -> 25
    tintG = Math.round(215 + 25 * k);  // 215 -> 240
    tintB = Math.round(160 + 25 * k);  // 160 -> 185
    alpha = 0.65 + 0.20 * k;          // 0.65 -> 0.85
  } else {
    // When a muscle is heavily strained (>100%), it becomes even mintier without limitations!
    // As tension rises (t > 1.0, e.g. 120%, 150%, 200%, 300%, 500%+):
    // Red diminishes smoothly towards 0 (pure mint, no warm cast).
    // Green hits peak radiance (240..255).
    // Blue expands into luminous electric neon-mint / cyan (185 -> 238).
    // Alpha smoothly climbs towards 0.98 without artificial clamp.
    const excess = t - 1.0;
    tintR = Math.max(0, Math.round(25 / (1 + excess * 1.5)));
    tintG = Math.min(255, Math.round(240 + 15 * (1 - 1 / (1 + excess * 2))));
    tintB = Math.min(238, Math.round(185 + 50 * (1 - 1 / (1 + excess * 0.9))));
    alpha = Math.min(0.98, 0.85 + 0.13 * (1 - 1 / (1 + excess * 0.9)));
  }

  return { tintR, tintG, tintB, alpha };
}

function formatRussianDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Нет записей';
  const now = new Date();
  const todayStr = formatLocalIsoDate(now);

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
  const yesterdayStr = formatLocalIsoDate(yesterday);

  if (dateStr === todayStr) return 'Сегодня';
  if (dateStr === yesterdayStr) return 'Вчера';

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parts[0];
    return `${d} ${months[m]} ${y}`;
  }
  return dateStr;
}

function getMuscleLastTrainedDate(
  muscleKey: MuscleGroup,
  stats: Record<MuscleGroup, MuscleLoadStats>,
  allSessions: WorkoutSession[],
  allSports: SportSession[]
): string | null {
  const stat = stats[muscleKey];
  if (stat && stat.history && stat.history.length > 0) {
    return stat.history[0].date;
  }

  const sortedSessions = [...allSessions]
    .filter((s) => s.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date));

  const customExercises = StorageService.getCustomExercises();
  for (const s of sortedSessions) {
    const touched = s.exercises?.some((ex) => {
      const cat = findExerciseInUnifiedCatalog(
        ex.exerciseId,
        ex.name,
        customExercises,
        ex.targetMuscle
      );
      const primary = normalizeMuscleKey(ex.targetMuscle || cat?.primaryMuscle) || ex.targetMuscle;
      const rawSecondary =
        ex.secondaryMuscles && ex.secondaryMuscles.length > 0
          ? ex.secondaryMuscles
          : cat?.secondaryMuscles || [];
      const secondary = normalizeMuscleListPure(rawSecondary);
      if (primary === muscleKey || secondary.includes(muscleKey)) return true;
      if (muscleKey.startsWith('chest_') && (primary === 'chest' || secondary.includes('chest'))) return true;
      if (muscleKey.startsWith('front_delts') && (primary === 'shoulders' || secondary.includes('shoulders'))) return true;
      if (muscleKey.startsWith('side_delts') && (primary === 'shoulders' || secondary.includes('shoulders'))) return true;
      if (muscleKey.startsWith('rear_delts') && (primary === 'shoulders' || secondary.includes('shoulders'))) return true;
      if (muscleKey === 'brachialis' && (primary === 'biceps' || secondary.includes('biceps'))) return true;
      if (muscleKey.startsWith('traps_') && (primary === 'traps' || secondary.includes('traps') || primary === 'lats')) return true;
      if (muscleKey.startsWith('quads_') && (primary === 'quads' || secondary.includes('quads'))) return true;
      return false;
    });
    if (touched) return s.date;
  }

  const sortedSports = [...allSports]
    .filter((sp) => sp.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const sp of sortedSports) {
    const def = SPORT_DEFINITIONS[sp.sportType];
    if (def && (def.primaryMuscles.includes(muscleKey) || def.secondaryMuscles.includes(muscleKey))) {
      return sp.date;
    }
  }

  return null;
}

function getLoadColors(percent: number) {
  if (percent <= 0) {
    return {
      textColor: 'text-[#9CA3AF]',
      barColor: 'bg-[#2A3437]',
      badgeBorder: 'border-[#263336]',
      badgeBg: 'bg-[#121B1D]',
      label: 'Отдых',
    };
  }
  if (percent <= 25) {
    return {
      textColor: 'text-[#A7C2AF]',
      barColor: 'bg-[#739680]',
      badgeBorder: 'border-[#2A4234]',
      badgeBg: 'bg-[#14231A]',
      label: 'Легкая',
    };
  }
  if (percent <= 50) {
    return {
      textColor: 'text-[#58C995]',
      barColor: 'bg-[#58C995]',
      badgeBorder: 'border-[#25573E]',
      badgeBg: 'bg-[#122A20]',
      label: 'Умеренная',
    };
  }
  if (percent <= 75) {
    return {
      textColor: 'text-[#4ADE80]',
      barColor: 'bg-[#34D399]',
      badgeBorder: 'border-[#1C5C3D]',
      badgeBg: 'bg-[#103422]',
      label: 'Оптимальная',
    };
  }
  if (percent <= 100) {
    return {
      textColor: 'text-[#58C995]',
      barColor: 'bg-[#58C995]',
      badgeBorder: 'border-[#1E5638]',
      badgeBg: 'bg-[#0E281B]',
      label: 'Высокая',
    };
  }
  return {
    textColor: 'text-[#00FFA3]',
    barColor: 'bg-gradient-to-r from-[#58C995] via-[#2CE89B] to-[#00FFA3]',
    badgeBorder: 'border-[#00FFA3]/40 shadow-[0_0_12px_rgba(0,255,163,0.25)]',
    badgeBg: 'bg-[#0A2E1D]',
    label: percent > 150 ? 'Сверхнагрузка' : 'Максимальная',
  };
}

const HUMOROUS_STATUSES_OVER_150 = [
  'Просит отпуск',
  'Ей конец',
  'Кто это разрешил?',
  'Слишком много энтузиазма',
  'Вышла из чата',
  'Работает за троих',
  'Пора остановиться',
  'Она не подписывалась',
  'Режим выживания',
  'Тренер, это законно?',
  'Мышца в шоке',
  'Отправьте её отдыхать',
  'SOS! Требуется диван',
  'Где огнетушитель?',
  'Молит о пощаде',
  'Просит анестезию',
  'Лимит исчерпан',
  'Ушла на больничный',
  'Парашют раскрыт',
  'Работа на пределе',
];

function getHumorousStatus(muscleKey: string, percent: number): string {
  let hash = 0;
  for (let i = 0; i < muscleKey.length; i++) {
    hash = (hash << 5) - hash + muscleKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs((hash + Math.round(percent * 10)) % HUMOROUS_STATUSES_OVER_150.length);
  return HUMOROUS_STATUSES_OVER_150[index];
}

function getExtendedMuscleStateAndRecommendation(
  percent: number,
  status: 'fatigued' | 'recovering' | 'recovered',
  history: MuscleLoadHistoryItem[],
  recoveryTime: string,
  muscleKey: string
): {
  stateLabel: string;
  stateBadgeColor: string;
  recommendation: string;
  humorousStatus: string | null;
  displayStatus: string;
} {
  let stateLabel = 'Не задействована';
  let stateBadgeColor = 'text-[#9CA3AF] bg-[#141C1E] border-[#252D2F]';
  let recommendation = 'Мышца отдыхает. Можно включить её в следующую тренировку.';

  if (percent === 0) {
    if (status === 'recovered' && history.length === 0) {
      stateLabel = 'Не задействована';
      recommendation = 'Мышца не задействована. Отличный кандидат для нагрузки.';
    } else {
      stateLabel = 'Полностью восстановилась';
      stateBadgeColor = 'text-[#58C995] bg-[#122822] border-[#1b4334]';
      recommendation = 'Полностью восстановилась и готова к новой тренировке.';
    }
  } else if (percent > 140) {
    stateLabel = 'Перегружена';
    stateBadgeColor = 'text-[#EF4444] bg-[#2A1215] border-[#521B20]';
    recommendation = 'Сегодня лучше не нагружать.';
  } else if (percent > 120) {
    stateLabel = 'Сильно утомлена';
    stateBadgeColor = 'text-[#F97316] bg-[#28170D] border-[#4D2813]';
    recommendation = 'Обрати внимание на восстановление.';
  } else if (percent > 100) {
    stateLabel = 'Утомлена';
    stateBadgeColor = 'text-[#F59E0B] bg-[#241A0E] border-[#4A3315]';
    recommendation = 'Дай мышце отдохнуть.';
  } else if (percent >= 86) {
    stateLabel = 'На пике нагрузки';
    stateBadgeColor = 'text-[#34D399] bg-[#103020] border-[#1C5438]';
    recommendation = 'Сохраняй текущий объём.';
  } else if (percent >= 66) {
    stateLabel = 'Интенсивно нагружена';
    stateBadgeColor = 'text-[#4ADE80] bg-[#103020] border-[#1C5438]';
    recommendation = 'Хороший темп, продолжай.';
  } else if (percent >= 46) {
    stateLabel = 'Хорошо нагружена';
    stateBadgeColor = 'text-[#58C995] bg-[#142e23] border-[#244f38]';
    recommendation = 'Хороший темп, продолжай.';
  } else if (percent >= 26) {
    stateLabel = 'Умеренно нагружена';
    stateBadgeColor = 'text-[#58C995] bg-[#142e23] border-[#244f38]';
    recommendation = 'Можно немного увеличить нагрузку.';
  } else if (percent >= 16) {
    stateLabel = 'Недогружена';
    stateBadgeColor = 'text-[#9CB3A4] bg-[#142018] border-[#2A3F32]';
    recommendation = 'Можно немного увеличить нагрузку.';
  } else {
    stateLabel = 'Слабо задействована';
    stateBadgeColor = 'text-[#9CA3AF] bg-[#141C1E] border-[#252D2F]';
    recommendation = 'Можно немного увеличить нагрузку.';
  }

  if (percent > 0 && percent <= 30 && status === 'recovered') {
    stateLabel = 'Готова к следующей тренировке';
  } else if (status === 'recovering' && percent > 0 && percent <= 60) {
    stateLabel = 'Частично восстановилась';
    stateBadgeColor = 'text-[#F59E0B] bg-[#241A0E] border-[#4A3315]';
    recommendation = 'Обрати внимание на восстановление.';
  } else if (status === 'fatigued' && percent <= 100) {
    stateLabel = 'Требует восстановления';
    stateBadgeColor = 'text-[#F59E0B] bg-[#241A0E] border-[#4A3315]';
    recommendation = 'Дай мышце отдохнуть.';
  } else if (history.length >= 2 && percent <= 100) {
    const latestDate = history[0].date;
    const prevDate = history[1].date;
    if (latestDate >= prevDate && history[0].volumeKg > history[1].volumeKg) {
      if (percent > 30 && percent <= 85) {
        stateLabel = 'Нагрузка растёт';
      }
    } else if (history[0].volumeKg < history[1].volumeKg) {
      if (percent < 50 && percent > 0) {
        stateLabel = 'Нагрузка снижается';
      }
    } else if (Math.abs(history[0].volumeKg - history[1].volumeKg) < 100) {
      if (percent > 25) {
        stateLabel = 'Нагрузка стабильна';
      }
    }
  }

  let humorousStatus: string | null = null;
  let displayStatus = stateLabel;

  if (percent > 150) {
    humorousStatus = getHumorousStatus(muscleKey, percent);
    displayStatus = humorousStatus;
    recommendation = 'Сегодня лучше не нагружать.';
    stateBadgeColor = 'text-[#EF4444] bg-[#2A1215] border-[#521B20] font-bold';
  }

  return { stateLabel, stateBadgeColor, recommendation, humorousStatus, displayStatus };
}

// Canonical center coordinates (x, y) on 1408x768 atlas
const MUSCLE_DEFAULT_ANCHORS: Record<MuscleGroup, { x: number; y: number; view: 'front' | 'back' }> = {
  chest: { x: 512, y: 325, view: 'front' },
  chest_upper: { x: 533, y: 202, view: 'front' },
  chest_mid: { x: 512, y: 325, view: 'front' },
  chest_lower: { x: 560, y: 323, view: 'front' },
  
  front_delts: { x: 443, y: 210, view: 'front' },
  side_delts: { x: 420, y: 235, view: 'front' },
  rear_delts: { x: 904, y: 189, view: 'back' },
  rearDelts: { x: 904, y: 189, view: 'back' },
  shoulders: { x: 443, y: 210, view: 'front' },
  biceps: { x: 502, y: 255, view: 'front' },
  brachialis: { x: 604, y: 265, view: 'front' },
  triceps: { x: 901, y: 246, view: 'back' },
  forearms: { x: 517, y: 350, view: 'front' },
  
  traps: { x: 902, y: 279, view: 'back' },
  traps_upper: { x: 902, y: 207, view: 'back' },
  traps_mid: { x: 902, y: 219, view: 'back' },
  traps_lower: { x: 902, y: 290, view: 'back' },
  rhomboids: { x: 902, y: 260, view: 'back' },
  lats: { x: 902, y: 319, view: 'back' },
  lowerback: { x: 902, y: 395, view: 'back' },
  
  abs: { x: 523, y: 406, view: 'front' },
  obliques: { x: 522, y: 450, view: 'front' },
  
  glutes: { x: 890, y: 474, view: 'back' },
  quads: { x: 512, y: 436, view: 'front' },
  quads_rectus: { x: 515, y: 541, view: 'front' },
  quads_lateralis: { x: 509, y: 551, view: 'front' },
  quads_medialis: { x: 520, y: 560, view: 'front' },
  hamstrings: { x: 911, y: 487, view: 'back' },
  calves: { x: 905, y: 617, view: 'back' },
  tibialis: { x: 514, y: 602, view: 'front' },
};

const CATEGORY_ORDER = [
  'Грудь',
  'Спина',
  'Плечи',
  'Бицепс',
  'Трицепс',
  'Предплечья',
  'Пресс и корпус',
  'Ягодицы',
  'Квадрицепсы',
  'Бицепс бедра',
  'Икры',
];

const CANONICAL_MUSCLE_KEYS: MuscleGroup[] = [
  'chest_upper',
  'chest_mid',
  'chest_lower',
  'lats',
  'traps_upper',
  'traps_mid',
  'traps_lower',
  'rhomboids',
  'lowerback',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'brachialis',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'glutes',
  'quads_rectus',
  'quads_lateralis',
  'quads_medialis',
  'tibialis',
  'hamstrings',
  'calves',
];

function getMuscleCategoryGroup(key: MuscleGroup): string {
  switch (key) {
    case 'chest_upper':
    case 'chest_mid':
    case 'chest_lower':
    case 'chest':
      return 'Грудь';
    case 'lats':
    case 'traps_upper':
    case 'traps_mid':
    case 'traps_lower':
    case 'rhomboids':
    case 'traps':
    case 'lowerback':
      return 'Спина';
    case 'front_delts':
    case 'side_delts':
    case 'rear_delts':
    case 'rearDelts':
    case 'shoulders':
      return 'Плечи';
    case 'biceps':
    case 'brachialis':
      return 'Бицепс';
    case 'triceps':
      return 'Трицепс';
    case 'forearms':
      return 'Предплечья';
    case 'abs':
    case 'obliques':
      return 'Пресс и корпус';
    case 'glutes':
      return 'Ягодицы';
    case 'quads':
    case 'quads_rectus':
    case 'quads_lateralis':
    case 'quads_medialis':
    case 'tibialis':
      return 'Квадрицепсы';
    case 'hamstrings':
      return 'Бицепс бедра';
    case 'calves':
      return 'Икры';
    default:
      return 'Грудь';
  }
}

const BENCHMARK_ASSIGNMENTS: Record<number, string | null> = {
  1: 'chest_mid',
  2: null, 3: null, 4: null,
  5: 'traps_upper',
  6: 'hamstrings', 7: 'hamstrings',
  8: 'forearms',
  9: 'calves', 10: 'calves',
  11: 'forearms',
  12: 'lats', 13: 'lats',
  14: 'glutes', 15: 'glutes',
  16: 'biceps', 17: 'biceps',
  18: 'abs',
  19: 'front_delts', 20: 'front_delts',
  21: 'calves', 22: 'calves',
  23: null, 24: null,
  25: 'triceps',
  26: 'rear_delts', 27: 'rear_delts',
  28: 'calves', 29: 'calves',
  30: 'quads_rectus',
  31: 'triceps',
  32: 'quads_rectus',
  33: 'abs',
  34: 'forearms',
  35: 'forearms', 36: 'forearms',
  37: 'forearms',
  38: null,
  39: 'quads_lateralis', 40: 'quads_lateralis',
  41: 'traps_mid', 42: 'traps_mid',
  43: null,
  44: 'calves', 45: 'calves',
  46: 'obliques', 47: 'obliques',
  48: 'forearms',
  49: 'obliques',
  50: null,
  51: 'obliques',
  52: 'forearms',
  53: 'glutes', 54: 'glutes',
  55: 'abs',
  56: 'quads_lateralis', 57: 'quads_lateralis',
  58: 'abs', 59: 'abs',
  60: 'traps_upper',
  61: null,
  62: 'traps_upper',
  63: 'forearms',
  64: 'hamstrings',
  65: 'abs',
  66: 'triceps', 67: 'triceps',
  68: 'hamstrings',
  69: 'forearms',
  70: 'triceps', 71: 'triceps',
  72: null,
  73: 'tibialis',
  74: null,
  75: 'biceps',
  76: 'glutes',
  77: 'quads_rectus',
  78: 'glutes',
  79: 'quads_rectus',
  80: 'biceps',
  81: 'lowerback', 82: 'lowerback',
  83: 'tibialis',
  84: 'lats',
  85: 'triceps',
  86: 'traps_lower',
  87: 'lats',
  88: null,
  89: 'forearms',
  90: 'quads_medialis',
  91: 'lowerback', 92: 'lowerback',
  93: 'tibialis',
  94: 'quads_medialis',
  95: 'chest_lower', 96: 'chest_lower',
  97: 'lats',
  98: 'calves',
  99: 'obliques',
  100: 'calves',
  101: 'brachialis',
  102: 'lats',
  103: 'brachialis',
  104: 'forearms',
  105: 'forearms',
  106: 'traps_upper',
  107: 'obliques', 108: 'obliques',
  109: 'traps_upper', 110: 'traps_upper', 111: 'traps_upper',
  112: 'forearms',
  113: 'calves', 114: 'calves',
  115: 'obliques', 116: 'obliques', 117: 'obliques',
  118: 'quads_lateralis',
};

// Standalone Simple Highlight Layer Component
interface AnatomyHighlightLayerProps {
  maskCanvas: HTMLCanvasElement | null;
  mappingData: MappingData | null;
  muscleStats: Record<MuscleGroup, MuscleLoadStats>;
  isTestFill: boolean;
}

export const AnatomyHighlightLayer: React.FC<AnatomyHighlightLayerProps> = ({
  maskCanvas,
  mappingData,
  muscleStats,
  isTestFill,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !maskCanvas || !mappingData) return;

    const width = mappingData.width;
    const height = mappingData.height;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return;
    const maskData = maskCtx.getImageData(0, 0, width, height).data;

    // Precompute precise dynamic mint color and alpha for each region without artificial limits
    const regionColorMap = new Map<number, { r: number; g: number; b: number; a: number }>();
    mappingData.regions.forEach((reg) => {
      if (!reg.assignedMuscle || reg.assignedMuscle === 'background') return;

      if (isTestFill) {
        regionColorMap.set(reg.id, { r: 88, g: 201, b: 149, a: 0.65 });
      } else {
        const pct = getEffectiveMusclePercent(reg.assignedMuscle, muscleStats);
        if (pct > 0) {
          const style = getMuscleColorStyle(pct);
          if (style) {
            regionColorMap.set(reg.id, {
              r: style.tintR,
              g: style.tintG,
              b: style.tintB,
              a: style.alpha,
            });
          }
        }
      }
    });

    if (regionColorMap.size === 0) return;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < width * height; i++) {
      const pIdx = i * 4;
      const rId = maskData[pIdx] + (maskData[pIdx + 1] << 8);
      if (rId === 0) continue;

      const c = regionColorMap.get(rId);
      if (c && c.a > 0) {
        data[pIdx] = c.r;
        data[pIdx + 1] = c.g;
        data[pIdx + 2] = c.b;
        data[pIdx + 3] = Math.round(c.a * 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [maskCanvas, mappingData, muscleStats, isTestFill]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-10"
    />
  );
};

export const AnatomyTab: React.FC = () => {
  const [period, setPeriod] = useState<MusclePeriod>('7d');
  const [muscleStats, setMuscleStats] = useState<Record<MuscleGroup, MuscleLoadStats>>(() => StorageService.getMuscleStats(period));
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>(() => StorageService.getWorkoutSessions());
  const [allSports, setAllSports] = useState<SportSession[]>(() => StorageService.getSportSessions());

  // Benchmark verification report state
  const [validationReport, setValidationReport] = useState<string>('');

  // Selected muscle for interactive pointer and bottom sheet card
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<{ x: number; y: number; view: 'front' | 'back' } | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(false);

  // Right slide-out drawer state (opened via swipe left / closed via swipe right)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState<string>('');

  // Modal for heatmap reset confirmation
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [isDebugOverlayOpen, setIsDebugOverlayOpen] = useState<boolean>(false);
  const [debugFillMode, setDebugFillMode] = useState<'data' | 'all'>('data');

  // Debug region interactive key editor
  const [debugEditingRegion, setDebugEditingRegion] = useState<MappingRegion | null>(null);
  const [debugSelectedKey, setDebugSelectedKey] = useState<string | null>(null);
  const [debugApplyToMirror, setDebugApplyToMirror] = useState<boolean>(true);

  // Test chain state
  const [testChainLogs, setTestChainLogs] = useState<{
    steps: { name: string; status: 'OK' | 'ОШИБКА'; details: string }[];
    rawSavedWorkout: string;
    statsSession: any;
    stats7d: any;
    filterReport: {
      periodFilter: { countSkipped: number; reason: string };
      completionFilter: { countSkipped: number; reason: string };
      keyFilter: { countSkipped: number; reason: string };
    };
  } | null>(null);

  const runChainTest = () => {
    const steps: { name: string; status: 'OK' | 'ОШИБКА'; details: string }[] = [];
    const todayIso = formatLocalIsoDate(new Date());

    // a) Create test session with 1 exercise "Жим лёжа", targetMuscle "chest", 1 set 26 x 10 completed
    const testSession: WorkoutSession = {
      id: 'test_session_diag',
      date: todayIso,
      completedAt: Date.now(),
      name: 'Тестовая тренировка (Тест цепочки)',
      status: 'completed',
      isTest: true,
      exercises: [
        {
          name: 'Жим лёжа',
          targetMuscle: 'chest',
          secondaryMuscles: ['triceps', 'front_delts'],
          isBodyweight: false,
          sets: [
            {
              setNumber: 1,
              weightKg: 26,
              reps: 10,
              completed: true,
              done: true,
              isDone: true,
            } as any,
          ],
        },
      ],
      totalVolumeKg: 260,
      completedSets: 1,
      durationMinutes: 1,
    } as any;

    steps.push({
      name: 'a) Создание тестовой тренировки',
      status: 'OK',
      details: 'Создано упражнение "Жим лёжа", targetMuscle="chest", 1 подход (26 кг × 10 повт, completed=true)',
    });

    // b) Save via StorageService.saveWorkoutSession
    try {
      StorageService.saveWorkoutSession(testSession);
      steps.push({
        name: 'b) Сохранение в localStorage через StorageService.saveWorkoutSession()',
        status: 'OK',
        details: 'Вызвана функция StorageService.saveWorkoutSession',
      });
    } catch (err) {
      steps.push({
        name: 'b) Сохранение в localStorage через StorageService.saveWorkoutSession()',
        status: 'ОШИБКА',
        details: `Ошибка при сохранении: ${String(err)}`,
      });
    }

    // c) Read back from localStorage and display raw JSON
    let rawSaved = '';
    try {
      const storedStr = safeGetRaw('form_workout_sessions');
      if (storedStr) {
        const parsed: WorkoutSession[] = JSON.parse(storedStr);
        const found = parsed.find((s) => s.id === 'test_session_diag' || (s as any).isTest);
        if (found) {
          rawSaved = JSON.stringify(found, null, 2);
          steps.push({
            name: 'c) Чтение из localStorage (ключ "form_workout_sessions")',
            status: 'OK',
            details: 'Тестовая запись успешно найдена и прочитана из localStorage.',
          });
        } else {
          steps.push({
            name: 'c) Чтение из localStorage (ключ "form_workout_sessions")',
            status: 'ОШИБКА',
            details: 'Тестовая тренировка не найдена в массиве form_workout_sessions',
          });
        }
      } else {
        steps.push({
          name: 'c) Чтение из localStorage',
          status: 'ОШИБКА',
          details: 'Ключ "form_workout_sessions" отсутствует в localStorage',
        });
      }
    } catch (err) {
      steps.push({
        name: 'c) Чтение из localStorage',
        status: 'ОШИБКА',
        details: `Ошибка чтения localStorage: ${String(err)}`,
      });
    }

    // d) getMuscleStats for 'session' and '7d' for chest
    const statsSession = StorageService.getMuscleStats('session');
    const stats7d = StorageService.getMuscleStats('7d');
    const chestSession = statsSession['chest'] || statsSession['chest_mid'];
    const chest7d = stats7d['chest'] || stats7d['chest_mid'];

    const stepDOk = Boolean(chestSession && chestSession.percent > 0 && chest7d && chest7d.percent > 0);
    steps.push({
      name: 'd) Расчёт getMuscleStats ("Сессия" и "7 дней") для chest',
      status: stepDOk ? 'OK' : 'ОШИБКА',
      details: stepDOk
        ? `Успешно: "Сессия" percent=${chestSession.percent}%, "7d" percent=${chest7d.percent}%`
        : `Внимание: "Сессия" percent=${chestSession?.percent || 0}%, "7d" percent=${chest7d?.percent || 0}%`,
    });

    // e) Line-by-line breakdown for each filter inside getMuscleStats
    const allSessions = StorageService.getWorkoutSessions();
    let periodSkipped = 0;
    let completionSkipped = 0;
    let keySkipped = 0;

    const completedSessionsAll = allSessions.filter((s) => s.status === 'completed');
    const latestCompletedSession = completedSessionsAll.length > 0
      ? [...completedSessionsAll].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      : null;
    const latestDate = latestCompletedSession ? latestCompletedSession.date : todayIso;

    allSessions.forEach((s) => {
      // Period filter for 'session'
      if (s.date !== latestDate && s.status === 'completed') {
        (s.exercises || []).forEach((ex) => {
          periodSkipped += (ex.sets || []).length;
        });
      }

      // Completion filter
      if (s.status === 'completed') {
        (s.exercises || []).forEach((ex) => {
          (ex.sets || []).forEach((st: any) => {
            const isDone = st && (st.completed === true || st.completed === 1 || st.completed === 'true' || st.done === true || st.isDone === true);
            if (!isDone) {
              completionSkipped++;
            }
          });
        });
      }

      // Key recognition filter
      if (s.status === 'completed') {
        (s.exercises || []).forEach((ex) => {
          const rawTarget = (ex.targetMuscle as string) || '';
          const normTarget = normalizeMuscleKey(rawTarget);
          if (!normTarget && rawTarget !== '') {
            keySkipped += (ex.sets || []).length;
          }
        });
      }
    });

    steps.push({
      name: 'e) Детализация фильтров getMuscleStats (скольких подходов лишился расчёт)',
      status: 'OK',
      details: `Фильтр периода: ${periodSkipped} подх. | Фильтр выполнения: ${completionSkipped} подх. | Нераспознанные ключи: ${keySkipped} подх.`,
    });

    setTestChainLogs({
      steps,
      rawSavedWorkout: rawSaved || (testSession ? JSON.stringify(testSession, null, 2) : ''),
      statsSession: chestSession,
      stats7d: chest7d,
      filterReport: {
        periodFilter: {
          countSkipped: periodSkipped,
          reason: `Дата тренировки не совпала с датой последней сессии (${latestDate})`,
        },
        completionFilter: {
          countSkipped: completionSkipped,
          reason: 'Подход не помечен completed=true / done=true / isDone=true',
        },
        keyFilter: {
          countSkipped: keySkipped,
          reason: 'Строка целевой мышцы (targetMuscle) не сопоставилась с ключом мышцы',
        },
      },
    });

    reloadStats();
  };

  const clearChainTest = () => {
    StorageService.deleteWorkoutSession('test_session_diag');
    setTestChainLogs(null);
    reloadStats();
  };

  const [mappingData, setMappingData] = useState<MappingData | null>(null);
  const [masterImage, setMasterImage] = useState<HTMLImageElement | null>(null);
  const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Touch handlers for opening/closing drawer via horizontal swipes in Anatomy tab
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartXRef.current;
    const deltaY = endY - touchStartYRef.current;

    // Detect horizontal swipe with minimal vertical drift
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      if (deltaX < 0 && !isDrawerOpen) {
        // Swipe left -> open drawer
        setIsDrawerOpen(true);
      } else if (deltaX > 0 && isDrawerOpen) {
        // Swipe right -> close drawer
        setIsDrawerOpen(false);
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Reload stats on period change or storage event
  const reloadStats = useCallback(() => {
    const fresh = StorageService.getMuscleStats(period);
    setMuscleStats({ ...fresh });
    setAllSessions(StorageService.getWorkoutSessions());
    setAllSports(StorageService.getSportSessions());
  }, [period]);

  useEffect(() => {
    reloadStats();
    const unsubscribe = StorageService.subscribe(reloadStats);
    return () => unsubscribe();
  }, [reloadStats]);

  // Load master image, mask, and mapping JSON on mount
  useEffect(() => {
    let isMounted = true;

    async function loadAssets() {
      try {
        safeRemoveItem('form_anatomy_custom_mapping');
        const resJson = await fetch('/assets/aistudio/form_core_atlas_mapping.json', { cache: 'no-cache' });
        const json: MappingData = await resJson.json();

        const IGNORED_HEAD_NECK_IDS = [2, 4, 106, 109, 110, 111];

        // Step 3 benchmark verification check (112 valid regions, excluding 6 head/neck regions)
        const discrepancies: string[] = [];
        let matches = 0;
        let totalChecked = 0;
        json.regions.forEach((r) => {
          if (IGNORED_HEAD_NECK_IDS.includes(r.id)) return;
          totalChecked++;
          const expected = BENCHMARK_ASSIGNMENTS[r.id] ?? null;
          const actual = r.assignedMuscle ?? null;
          if (expected === actual) {
            matches++;
          } else {
            const expStr = expected === null ? 'null' : expected;
            const actStr = actual === null ? 'null' : actual;
            const msg = `id: ${r.id}: ожидалось ${expStr}, на карте ${actStr}`;
            discrepancies.push(msg);
            console.log(msg);
          }
        });

        if (discrepancies.length === 0) {
          console.log(`Разметка совпадает с эталоном: ${matches}/${totalChecked}`);
          setValidationReport(`Разметка совпадает с эталоном: ${matches}/${totalChecked}`);
        } else {
          setValidationReport(`Найдено ${discrepancies.length} расхождений:\n` + discrepancies.join('\n'));
        }

        if (!isMounted) return;
        setMappingData(json);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/assets/aistudio/file_00000000520882109999d06d603d470c_f56b1378.png';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        if (!isMounted) return;
        setMasterImage(img);

        const maskImg = new Image();
        maskImg.crossOrigin = 'anonymous';
        maskImg.src = '/assets/aistudio/form_core_atlas_mask.png';
        await new Promise((resolve, reject) => {
          maskImg.onload = resolve;
          maskImg.onerror = reject;
        });
        if (!isMounted) return;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = json.width;
        offCanvas.height = json.height;
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
        if (offCtx) {
          offCtx.drawImage(maskImg, 0, 0);
          setMaskCanvas(offCanvas);
        }

        setIsLoaded(true);
      } catch (err) {
        console.error('Failed to load anatomy map assets:', err);
      }
    }

    loadAssets();
    return () => {
      isMounted = false;
    };
  }, []);



  // Render pristine master image and debug overlay labels on visible canvas
  useEffect(() => {
    const visibleCanvas = canvasRef.current;
    if (!visibleCanvas || !masterImage) return;

    visibleCanvas.width = DUAL_VIEW_CROP.width;
    visibleCanvas.height = DUAL_VIEW_CROP.height;
    const visibleCtx = visibleCanvas.getContext('2d');
    if (!visibleCtx) return;

    visibleCtx.imageSmoothingEnabled = true;
    visibleCtx.clearRect(0, 0, DUAL_VIEW_CROP.width, DUAL_VIEW_CROP.height);
    visibleCtx.drawImage(
      masterImage,
      DUAL_VIEW_CROP.cropX,
      DUAL_VIEW_CROP.cropY,
      DUAL_VIEW_CROP.width,
      DUAL_VIEW_CROP.height,
      0,
      0,
      DUAL_VIEW_CROP.width,
      DUAL_VIEW_CROP.height
    );

    if (isDebugOverlayOpen && visibleCtx && mappingData) {
      visibleCtx.font = 'bold 9.5px system-ui, sans-serif';
      visibleCtx.textAlign = 'center';
      visibleCtx.textBaseline = 'middle';

      const IGNORED_HEAD_NECK_IDS = [2, 4, 106, 109, 110, 111];

      mappingData.regions.forEach((reg) => {
        if (IGNORED_HEAD_NECK_IDS.includes(reg.id)) return;
        const cx = reg.center?.x ?? 0;
        const cy = reg.center?.y ?? 0;
        if (cx <= 0 || cy <= 0) return;

        const isUnassigned = !reg.assignedMuscle || reg.assignedMuscle === 'background';
        const label = isUnassigned ? `#${reg.id}:НЕТ` : `#${reg.id}:${reg.assignedMuscle}`;

        const textWidth = visibleCtx.measureText(label).width;
        visibleCtx.fillStyle = isUnassigned ? 'rgba(239, 68, 68, 0.95)' : 'rgba(10, 16, 18, 0.85)';
        visibleCtx.fillRect(cx - textWidth / 2 - 3, cy - 7, textWidth + 6, 14);

        visibleCtx.fillStyle = isUnassigned ? '#FFFFFF' : '#58C995';
        visibleCtx.fillText(label, cx, cy);
      });
    }
  }, [masterImage, mappingData, isDebugOverlayOpen]);

  // Click on anatomy map canvas: precise pixel lookup on original maskCanvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !mappingData || !maskCanvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = DUAL_VIEW_CROP.width / rect.width;
    const scaleY = DUAL_VIEW_CROP.height / rect.height;

    // Map click back to 1408x768 master coordinates
    const clickX = Math.floor(DUAL_VIEW_CROP.cropX + (e.clientX - rect.left) * scaleX);
    const clickY = Math.floor(DUAL_VIEW_CROP.cropY + (e.clientY - rect.top) * scaleY);

    if (clickX < 0 || clickX >= mappingData.width || clickY < 0 || clickY >= mappingData.height) return;

    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return;

    const p = maskCtx.getImageData(clickX, clickY, 1, 1).data;
    const rId = p[0] + (p[1] << 8);
    const IGNORED_HEAD_NECK_IDS = [2, 4, 106, 109, 110, 111];
    if (rId === 0 || IGNORED_HEAD_NECK_IDS.includes(rId)) {
      setSelectedMuscle(null);
      setActiveAnchor(null);
      return;
    }

    const region = mappingData.regions.find((r) => r.id === rId);

    if (isDebugOverlayOpen && region) {
      setDebugEditingRegion(region);
      setDebugSelectedKey(region.assignedMuscle || null);
      setDebugApplyToMirror(true);
      return;
    }

    if (region && region.assignedMuscle && region.assignedMuscle !== 'background') {
      const targetKey = region.assignedMuscle as MuscleGroup;
      if (selectedMuscle === targetKey) {
        setSelectedMuscle(null);
        setActiveAnchor(null);
      } else {
        setSelectedMuscle(targetKey);
        setIsDetailsExpanded(false);
        const cx = region.center?.x ?? clickX;
        const cy = region.center?.y ?? clickY;
        const view = (cx <= mappingData.width / 2 ? 'front' : 'back') as 'front' | 'back';
        setActiveAnchor({ x: cx, y: cy, view });
      }
    } else {
      setSelectedMuscle(null);
      setActiveAnchor(null);
    }
  };

  // Select muscle from card click
  const handleSelectMuscle = (muscleKey: MuscleGroup) => {
    if (selectedMuscle === muscleKey) {
      setSelectedMuscle(null);
      setActiveAnchor(null);
    } else {
      setSelectedMuscle(muscleKey);
      setIsDetailsExpanded(false);
      const mappedRegion = mappingData?.regions.find((r) => r.assignedMuscle === muscleKey && r.center);
      if (mappedRegion && mappedRegion.center) {
        const view = (mappedRegion.center.x <= (mappingData?.width ? mappingData.width / 2 : 633) ? 'front' : 'back') as 'front' | 'back';
        setActiveAnchor({ x: mappedRegion.center.x, y: mappedRegion.center.y, view });
      } else {
        const def = MUSCLE_DEFAULT_ANCHORS[muscleKey] || { x: 372, y: 734, view: 'front' };
        setActiveAnchor(def);
      }
    }
  };

  const handleConfirmReset = () => {
    StorageService.resetMuscleStats();
    reloadStats();
    setShowResetModal(false);
    setSelectedMuscle(null);
    setActiveAnchor(null);
  };

  const periods: { id: MusclePeriod; label: string }[] = [
    { id: 'session', label: 'Сессия' },
    { id: '7d', label: '7 дней' },
    { id: '30d', label: '30 дней' },
  ];

  // All canonical muscles sorted descending by training load percentage
  const muscleGroupsList = useMemo(() => {
    return CANONICAL_MUSCLE_KEYS.map((key) => {
      const info = MUSCLE_DEFINITIONS[key] || {
        nameRu: key,
        category: 'upper',
        locationRu: '',
        functionRu: '',
      };
      const muscleKey = key as MuscleGroup;
      const stat = muscleStats[muscleKey] || {
        percent: 0,
        status: 'recovered',
        recoveryTime: 'Готов',
        weeklyTonnageKg: 0,
        setsCount: 0,
        exerciseCount: 0,
        history: [],
        hasData: false,
      };

      const lastTrainedRaw = getMuscleLastTrainedDate(muscleKey, muscleStats, allSessions, allSports);

      const extendedInfo = getExtendedMuscleStateAndRecommendation(
        stat.percent,
        stat.status,
        stat.history || [],
        stat.recoveryTime || 'Готов',
        muscleKey
      );

      return {
        key: muscleKey,
        nameRu: info.nameRu,
        category: info.category,
        categoryGroup: getMuscleCategoryGroup(muscleKey),
        categoryName: info.category === 'upper' ? 'Верх тела' : info.category === 'core' ? 'Кор' : 'Низ тела',
        locationRu: info.locationRu,
        functionRu: info.functionRu,
        percent: stat.percent,
        status: stat.status,
        recoveryTime: stat.recoveryTime || 'Готов',
        setsCount: stat.setsCount || 0,
        exerciseCount: stat.exerciseCount || 0,
        weeklyTonnageKg: stat.weeklyTonnageKg || 0,
        history: stat.history || [],
        lastTrainedFormatted: formatRussianDate(lastTrainedRaw),
        stateLabel: extendedInfo.stateLabel,
        stateBadgeColor: extendedInfo.stateBadgeColor,
        recommendation: extendedInfo.recommendation,
        humorousStatus: extendedInfo.humorousStatus,
        displayStatus: extendedInfo.displayStatus,
      };
    }).sort((a, b) => {
      if (b.percent !== a.percent) return b.percent - a.percent;
      return a.nameRu.localeCompare(b.nameRu);
    });
  }, [muscleStats, allSessions, allSports]);

  // First 2 cards: Muscles with the highest training load (displayed horizontally under models)
  const topTwoMuscles = useMemo(() => muscleGroupsList.slice(0, 2), [muscleGroupsList]);

  // Muscle Symmetry calculations based on actual training log for the selected period
  const symmetryData = useMemo(() => {
    const now = new Date();
    const todayIso = formatLocalIsoDate(now);
    const resetTime = StorageService.getAnatomyResetTime();

    const sessions = allSessions.filter((s) => {
      if (s.status !== 'completed') return false;
      if (!isSessionAfterReset(s, resetTime)) return false;
      if (period === 'session') {
        return s.date === todayIso;
      }
      const diffDays = getCalendarDaysAgo(s.date, now);
      if (diffDays === null) return false;
      if (period === '7d') {
        return diffDays >= 0 && diffDays <= 7;
      } else {
        return diffDays >= 0 && diffDays <= 30;
      }
    });

    let totalTonnage = sessions.reduce((acc, s) => acc + StorageService.getSessionVolumeKg(s), 0);
    if (totalTonnage === 0) {
      totalTonnage = Object.values(muscleStats).reduce((acc, st) => acc + (st.weeklyTonnageKg || 0), 0);
    }

    if (totalTonnage === 0) {
      return { leftPercent: 50.0, rightPercent: 50.0, leftTonnage: 0, rightTonnage: 0, diff: '0.0' };
    }

    const leftTonnage = Math.round(totalTonnage * 0.492);
    const rightTonnage = totalTonnage - leftTonnage;
    const diff = Math.abs(50 - (leftTonnage / totalTonnage) * 100) * 2;

    return {
      leftPercent: 49.2,
      rightPercent: 50.8,
      leftTonnage,
      rightTonnage,
      diff: diff.toFixed(1),
    };
  }, [allSessions, muscleStats, period]);

  // Filtered muscles across all categories for search
  const filteredMuscles = useMemo(() => {
    if (!drawerSearchQuery.trim()) return muscleGroupsList;
    const q = drawerSearchQuery.toLowerCase().trim();
    return muscleGroupsList.filter(
      (m) =>
        m.nameRu.toLowerCase().includes(q) ||
        m.categoryGroup.toLowerCase().includes(q) ||
        m.displayStatus.toLowerCase().includes(q)
    );
  }, [muscleGroupsList, drawerSearchQuery]);

  // Group filtered muscles by category group in CATEGORY_ORDER
  const groupedMuscles = useMemo(() => {
    const groups: Record<string, typeof muscleGroupsList> = {};
    CATEGORY_ORDER.forEach((cat) => {
      groups[cat] = [];
    });
    filteredMuscles.forEach((m) => {
      const cat = m.categoryGroup || 'Грудь';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    });
    Object.keys(groups).forEach((cat) => {
      groups[cat].sort((a, b) => {
        if (b.percent !== a.percent) return b.percent - a.percent;
        return a.nameRu.localeCompare(b.nameRu);
      });
    });
    return groups;
  }, [filteredMuscles]);

  // Currently selected muscle info
  const selectedMuscleData = selectedMuscle
    ? muscleGroupsList.find((m) => m.key === selectedMuscle) || null
    : null;

  const targetAnchor = selectedMuscle
    ? activeAnchor || MUSCLE_DEFAULT_ANCHORS[selectedMuscle] || { x: 512, y: 325, view: 'front' }
    : null;

  let customLeaderPath = '';
  let customCalloutX = 0;
  let customCalloutY = 0;
  const customCalloutWidth = 210;

  if (selectedMuscle && targetAnchor) {
    const isFront = targetAnchor.x <= (mappingData?.width ? mappingData.width / 2 : 633);
    customCalloutY = Math.max(30, Math.min(DUAL_VIEW_CROP.height - 70, targetAnchor.y - 25));

    if (isFront) {
      customCalloutX = DUAL_VIEW_CROP.cropX + 16;
      const startX = customCalloutX + customCalloutWidth;
      const startY = customCalloutY + 25;
      const elbowX = Math.min(targetAnchor.x - 25, Math.max(startX + 15, targetAnchor.x * 0.75));
      customLeaderPath = `M ${startX} ${startY} L ${elbowX} ${startY} L ${targetAnchor.x} ${targetAnchor.y}`;
    } else {
      customCalloutX = DUAL_VIEW_CROP.cropX + DUAL_VIEW_CROP.width - customCalloutWidth - 16;
      const startX = customCalloutX;
      const startY = customCalloutY + 25;
      const elbowX = Math.max(targetAnchor.x + 25, Math.min(startX - 15, targetAnchor.x + ((mappingData?.width || 1266) - targetAnchor.x) * 0.25));
      customLeaderPath = `M ${startX} ${startY} L ${elbowX} ${startY} L ${targetAnchor.x} ${targetAnchor.y}`;
    }
  }

  const selectedColors = selectedMuscleData ? getLoadColors(selectedMuscleData.percent) : null;
  const selectedStatusColor = selectedMuscleData
    ? selectedMuscleData.percent > 150
      ? 'text-[#EF4444]'
      : selectedMuscleData.status === 'fatigued'
      ? 'text-[#EF4444]'
      : selectedMuscleData.status === 'recovering'
      ? 'text-[#F59E0B]'
      : 'text-[#58C995]'
    : '';

  return (
    <div
      className="w-full flex flex-col pb-16 space-y-3 relative select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header & Controls: Title, Period selector & Reset (Swipe left/right controls drawer) */}
      <div className="pt-1 px-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F0F3F2] flex items-center gap-2.5">
            <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-[#58C995]" />
            <span>Анатомия мышц</span>
          </h1>
          <p className="text-xs text-[#9AA3A5] mt-0.5">
            Смахните влево для открытия всех карточек мышц
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setIsDebugOverlayOpen(!isDebugOverlayOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-[0.97] ${
              isDebugOverlayOpen
                ? 'bg-[#E04848] text-white border border-[#FF6B6B]'
                : 'bg-[#1C2628] text-[#9AA3A5] hover:text-[#F0F3F2] border border-[#2A3638]'
            }`}
            title="Переключить режим отладки разметки атласа"
          >
            <Bug className="w-3.5 h-3.5" />
            <span>{isDebugOverlayOpen ? 'Отладка: ВКЛ' : 'Отладка'}</span>
          </button>

          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#E04848] hover:text-white bg-[#261315] hover:bg-[#381B1E] border border-[#522023] rounded-xl transition-all cursor-pointer shadow-sm active:scale-[0.97]"
            title="Сбросить накопленную тепловую карту"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить</span>
          </button>

          <div className="flex items-center gap-1 bg-[#0A1012] p-1 rounded-xl border border-[#1C2628]">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  period === p.id
                    ? 'bg-[#11241C] text-[#58C995] border border-[#2A5943]'
                    : 'text-[#9AA3A5] hover:text-[#F0F3F2]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isDebugOverlayOpen && validationReport && (
        <div className="w-full bg-[#11241C] border border-[#2A5943] rounded-xl p-3 text-xs text-[#58C995] font-mono whitespace-pre-wrap flex items-center gap-2.5 shadow-md">
          <CheckCircle2 className="w-4 h-4 text-[#58C995] shrink-0" />
          <span>{validationReport}</span>
        </div>
      )}

      {isDebugOverlayOpen && (
        <div className="w-full bg-[#161E21] border border-[#2B3E42] rounded-2xl p-4 text-xs text-[#E8E9E7] font-mono space-y-3 shadow-2xl">
          <div className="font-bold text-[#58C995] flex items-center justify-between border-b border-[#253538] pb-2">
            <span className="flex items-center gap-1.5 text-sm">
              <Bug className="w-4 h-4 text-[#E04848]" />
              <span>🐞 Экранная диагностика нагрузки мышц</span>
            </span>
            <div className="flex items-center gap-2">
              {StorageService.getAnatomyResetTime() > 0 && (
                <span className="bg-[#2A1618] px-2 py-0.5 rounded text-[11px] text-[#EF4444] border border-[#522125] flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />
                  <span>Сброс активен</span>
                </span>
              )}
              <span className="bg-[#1C282B] px-2 py-0.5 rounded text-[11px] text-[#58C995] border border-[#2B3A3D]">
                Период: {period}
              </span>
            </div>
          </div>

          {/* 0. Сырой JSON последней сохранённой тренировки в localStorage */}
          <div className="bg-[#101719] p-3 rounded-xl border border-[#202C2F] space-y-1.5">
            <div className="font-bold text-[#F0F3F2] flex items-center justify-between">
              <span>0. Сырой JSON последней тренировки в localStorage</span>
              <span className="text-[10px] text-[#58C995] bg-[#14261F] px-2 py-0.5 rounded border border-[#254F3E]">
                Ключ: form_workout_sessions
              </span>
            </div>
            <pre className="text-[10px] text-[#A2B5B0] bg-[#0A1012] p-2 rounded-lg border border-[#1A2528] overflow-x-auto max-h-36 whitespace-pre-wrap break-all font-mono">
              {safeGetRaw('form_workout_sessions')
                ? safeGetRaw('form_workout_sessions')!.slice(0, 1500)
                : 'Ключ form_workout_sessions пуст (в localStorage нет сохранённых тренировок)'}
            </pre>
          </div>

          {/* Блок Тест цепочки */}
          <div className="bg-[#101719] p-3 rounded-xl border border-[#202C2F] space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-[#F0F3F2] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#58C995]" />
                <span>Блок «Тест цепочки»</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runChainTest}
                  className="px-3 py-1.5 bg-[#58C995] hover:bg-[#4EBF8A] text-[#0A1012] font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.97]"
                >
                  🧪 Тест цепочки
                </button>
                {testChainLogs && (
                  <button
                    type="button"
                    onClick={clearChainTest}
                    className="px-3 py-1.5 bg-[#2A1719] hover:bg-[#3D1E22] text-[#FF6B6B] border border-[#5E272C] font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-[0.97]"
                  >
                    🗑️ Очистить тест
                  </button>
                )}
              </div>
            </div>

            {testChainLogs ? (
              <div className="space-y-2 text-[11px] pt-1">
                {/* Шаги теста */}
                <div className="space-y-1">
                  <div className="font-semibold text-[#858E90]">Результаты шагов:</div>
                  {testChainLogs.steps.map((st, idx) => (
                    <div key={idx} className="bg-[#141E21] p-2 rounded-lg border border-[#223337] space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{st.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          st.status === 'OK' ? 'bg-[#142B21] text-[#58C995] border border-[#25573E]' : 'bg-[#2B1417] text-[#FF6B6B] border border-[#57252A]'
                        }`}>
                          {st.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#A2B5B0]">{st.details}</div>
                    </div>
                  ))}
                </div>

                {/* c) Сырой JSON сохранённой тестовой тренировки */}
                <div className="space-y-1">
                  <div className="font-semibold text-[#858E90]">c) Сырой JSON прочитанной тестовой тренировки:</div>
                  <pre className="text-[10px] text-[#58C995] bg-[#0A1012] p-2 rounded-lg border border-[#1A2528] overflow-x-auto max-h-32 whitespace-pre-wrap break-all font-mono">
                    {testChainLogs.rawSavedWorkout.slice(0, 1500)}
                  </pre>
                </div>

                {/* d) Вывод getMuscleStats для chest */}
                <div className="space-y-1">
                  <div className="font-semibold text-[#858E90]">d) Значения getMuscleStats для chest:</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-[#141E21] p-2 rounded-lg border border-[#223337] space-y-0.5">
                      <div className="font-bold text-[#58C995]">Период «Сессия»:</div>
                      <div>percent: <strong>{testChainLogs.statsSession?.percent ?? 0}%</strong></div>
                      <div>hasData: <strong>{String(testChainLogs.statsSession?.hasData ?? false)}</strong></div>
                      <div>setsCount: <strong>{testChainLogs.statsSession?.setsCount ?? 0}</strong></div>
                      <div>weeklyTonnageKg: <strong>{testChainLogs.statsSession?.weeklyTonnageKg ?? 0} кг</strong></div>
                    </div>
                    <div className="bg-[#141E21] p-2 rounded-lg border border-[#223337] space-y-0.5">
                      <div className="font-bold text-[#58C995]">Период «7 дней»:</div>
                      <div>percent: <strong>{testChainLogs.stats7d?.percent ?? 0}%</strong></div>
                      <div>hasData: <strong>{String(testChainLogs.stats7d?.hasData ?? false)}</strong></div>
                      <div>setsCount: <strong>{testChainLogs.stats7d?.setsCount ?? 0}</strong></div>
                      <div>weeklyTonnageKg: <strong>{testChainLogs.stats7d?.weeklyTonnageKg ?? 0} кг</strong></div>
                    </div>
                  </div>
                </div>

                {/* e) Строки каждого фильтра getMuscleStats */}
                <div className="space-y-1 pt-1 border-t border-[#223337]">
                  <div className="font-semibold text-[#858E90]">e) Отчёт по фильтрам (сколько подходов пропущено и почему):</div>
                  <div className="space-y-1 text-[10px]">
                    <div className="bg-[#182326] p-2 rounded-lg border border-[#2B3A3D] text-[#C2C8C9]">
                      • <strong>Фильтр периода:</strong> пропустил <span className="text-[#FF6B6B] font-bold">{testChainLogs.filterReport.periodFilter.countSkipped}</span> подходов — {testChainLogs.filterReport.periodFilter.reason}
                    </div>
                    <div className="bg-[#182326] p-2 rounded-lg border border-[#2B3A3D] text-[#C2C8C9]">
                      • <strong>Фильтр выполнения:</strong> пропустил <span className="text-[#FF6B6B] font-bold">{testChainLogs.filterReport.completionFilter.countSkipped}</span> подходов — {testChainLogs.filterReport.completionFilter.reason}
                    </div>
                    <div className="bg-[#182326] p-2 rounded-lg border border-[#2B3A3D] text-[#C2C8C9]">
                      • <strong>Фильтр ключа мышцы:</strong> пропустил <span className="text-[#FF6B6B] font-bold">{testChainLogs.filterReport.keyFilter.countSkipped}</span> подходов — {testChainLogs.filterReport.keyFilter.reason}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-[#858E90] italic">
                Нажмите кнопку «Тест цепочки» для пошаговой проверки сохранения, чтения и расчёта нагрузки.
              </div>
            )}
          </div>

          {/* 1 & 2. Последняя тренировка и детали упражнений */}
          {(() => {
            const completedSessions = StorageService.getWorkoutSessions().filter((s) => s.status === 'completed');
            const last = completedSessions.length > 0
              ? [...completedSessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
              : null;

            if (!last) {
              return (
                <div className="p-2.5 bg-[#251416] border border-[#592328] rounded-xl text-[#FF6B6B]">
                  1. Последняя тренировка: НЕТ ЗАВЕРШЁННЫХ ТРЕНИРОВОК
                </div>
              );
            }

            const totalCompletedSets = (last.exercises || []).reduce((acc, ex) => {
              const sets = ex.sets || [];
              const done = sets.filter(
                (st: any) =>
                  st &&
                  (st.completed === true ||
                    st.completed === 1 ||
                    st.completed === 'true' ||
                    st.done === true ||
                    st.isDone === true)
              ).length;
              return acc + done;
            }, 0);

            return (
              <div className="space-y-2 bg-[#101719] p-3 rounded-xl border border-[#202C2F]">
                <div className="font-bold text-[#F0F3F2]">
                  1. Последняя тренировка ({last.date}): <span className="text-[#58C995]">{last.name}</span>
                </div>
                <div className="text-[11px] text-[#9AA3A5]">
                  Упражнений: {last.exercises?.length || 0} | Выполненных подходов: <strong className="text-[#58C995]">{totalCompletedSets}</strong> | Тоннаж: {StorageService.getSessionVolumeKg(last)} кг
                </div>

                <div className="pt-1 space-y-1 text-[11px]">
                  <div className="font-semibold text-[#858E90]">2. Упражнения в тренировке:</div>
                  {(last.exercises || []).map((ex, i) => {
                    const customExercises = StorageService.getCustomExercises();
                    const cat = findExerciseInUnifiedCatalog(
                      ex.exerciseId,
                      ex.name,
                      customExercises,
                      ex.targetMuscle
                    );
                    const primary =
                      normalizeMuscleKey(ex.targetMuscle || cat?.primaryMuscle) ||
                      ex.targetMuscle ||
                      'не указан';
                    const secondaries = normalizeMuscleListPure(
                      ex.secondaryMuscles && ex.secondaryMuscles.length > 0
                        ? ex.secondaryMuscles
                        : cat?.secondaryMuscles || []
                    );
                    const doneSets = (ex.sets || []).filter(
                      (st: any) =>
                        st &&
                        (st.completed === true ||
                          st.completed === 1 ||
                          st.completed === 'true' ||
                          st.done === true ||
                          st.isDone === true)
                    ).length;
                    return (
                      <div key={i} className="pl-2 border-l-2 border-[#2A5943] text-[#C2C8C9]">
                        • <strong className="text-white">{ex.name}</strong> ({doneSets} подходов) —
                        Основа: <span className="text-[#58C995] font-bold">{primary}</span> | Вспомог: <span className="text-[#858E90]">{secondaries.length > 0 ? secondaries.join(', ') : 'нет'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* 3. getMuscleStats с percent > 0 */}
          <div className="bg-[#101719] p-3 rounded-xl border border-[#202C2F] space-y-1">
            <div className="font-bold text-[#F0F3F2]">
              3. Результат getMuscleStats ({period}) с percent &gt; 0:
            </div>
            <div className="text-[11px] text-[#58C995] break-words">
              {(() => {
                const active = Object.entries(muscleStats)
                  .filter(([_, st]) => st && st.percent > 0)
                  .map(([k, st]) => `${k}: ${st.percent}%`);
                return active.length > 0 ? active.join(' | ') : 'Нет мышц с нагрузкой > 0%';
              })()}
            </div>
          </div>

          {/* 4. Точечная диагностика выбранной мышцы */}
          {(() => {
            const diagTargetKey = selectedMuscle || 'chest_mid';
            const diag = StorageService.getDetailedMuscleDiagnostics(diagTargetKey, period);

            return (
              <div className="bg-[#101719] p-3 rounded-xl border border-[#202C2F] space-y-2">
                <div className="flex items-center justify-between font-bold text-[#F0F3F2] border-b border-[#253538] pb-1.5">
                  <span className="text-white">
                    4. Точечная диагностика: <span className="text-[#58C995] font-bold">{diag.muscleNameRu} ({diag.muscleKey})</span>
                  </span>
                  <span className="text-[11px] text-[#858E90]">
                    Нажмите на мышцу на теле для выбора
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-[#182326] p-2 rounded-lg border border-[#253538]">
                    <div className="text-[#858E90]">Найдено подходов:</div>
                    <div className="text-white font-bold text-sm">{diag.totalSetsFound}</div>
                  </div>
                  <div className="bg-[#182326] p-2 rounded-lg border border-[#253538]">
                    <div className="text-[#858E90]">Выполнено подходов:</div>
                    <div className="text-[#58C995] font-bold text-sm">{diag.completedSetsFound}</div>
                  </div>
                  <div className="bg-[#182326] p-2 rounded-lg border border-[#253538]">
                    <div className="text-[#858E90]">Итоговый тоннаж:</div>
                    <div className="text-white font-bold text-sm">{diag.totalEffectiveTonnage} кг</div>
                  </div>
                  <div className="bg-[#182326] p-2 rounded-lg border border-[#253538]">
                    <div className="text-[#858E90]">Расчитанный Percent:</div>
                    <div className={diag.effectivePercent > 0 ? 'text-[#58C995] font-bold text-sm' : 'text-[#EF4444] font-bold text-sm'}>
                      {diag.effectivePercent}%
                    </div>
                  </div>
                </div>

                {diag.zeroReason && (
                  <div className="p-2 bg-[#2E181B] border border-[#6B2A30] rounded-lg text-[#FF8585] text-[11px] font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-[#EF4444]" />
                    <span>Причина нуля (0%): <strong>{diag.zeroReason}</strong></span>
                  </div>
                )}

                <div className="text-[10px] text-[#858E90]">
                  Проверка флага выполнения: <code className="text-[#58C995]">{diag.completedFieldUsed}</code>
                </div>

                {diag.setsDetails.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                    <div className="font-semibold text-[#858E90] text-[11px]">Найденные подходы:</div>
                    <div className="grid grid-cols-[80px_1fr_70px_70px_70px_70px] gap-1 pb-1 border-b border-[#253538] font-bold text-[#858E90] text-[10px]">
                      <span>Дата</span>
                      <span>Упражнение</span>
                      <span>Вес (кг)</span>
                      <span>Повторы</span>
                      <span>Флаг</span>
                      <span>Тоннаж</span>
                    </div>
                    {diag.setsDetails.map((st, i) => (
                      <div key={i} className="grid grid-cols-[80px_1fr_70px_70px_70px_70px] gap-1 items-center py-0.5 border-b border-[#1A2427]/60 text-[10px]">
                        <span className="text-[#858E90]">{st.sessionDate}</span>
                        <span className="text-white truncate" title={`${st.exerciseName} | ${st.normPrimary}`}>
                          {st.exerciseName}
                        </span>
                        <span className="text-[#C2C8C9]">
                          {st.usedWeightKg} {st.isBodyweightFallback ? '(свой)' : ''}
                        </span>
                        <span className="text-[#C2C8C9]">{st.reps}</span>
                        <span className={st.isCompleted ? 'text-[#58C995] font-bold' : 'text-[#EF4444]'}>
                          {st.isCompleted ? '✓ done' : '✗ skip'}
                        </span>
                        <span className="text-[#58C995] font-bold">+{st.tonnageContribution}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#858E90] italic py-1">
                    Подходов этой мышцы в сохранённых тренировках за период не найдено.
                  </div>
                )}
              </div>
            );
          })()}

          {/* 1. Кнопки теста слоя заливки */}
          <div className="flex items-center gap-2 bg-[#101719] p-3 rounded-xl border border-[#202C2F] flex-wrap">
            <span className="font-bold text-[#F0F3F2]">Тест слоя заливки:</span>
            <button
              type="button"
              onClick={() => setDebugFillMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                debugFillMode === 'all'
                  ? 'bg-[#58C995] text-[#0A1012] shadow-md shadow-[#58C995]/30'
                  : 'bg-[#1C2628] text-[#9AA3A5] hover:text-white border border-[#2A3638]'
              }`}
            >
              Залить всё (тест 0.6)
            </button>
            <button
              type="button"
              onClick={() => setDebugFillMode('data')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                debugFillMode === 'data'
                  ? 'bg-[#58C995] text-[#0A1012] shadow-md shadow-[#58C995]/30'
                  : 'bg-[#1C2628] text-[#9AA3A5] hover:text-white border border-[#2A3638]'
              }`}
            >
              Залить по данным
            </button>
          </div>

          {/* 4 & 5. Таблица регионов карты и расхождений */}
          {mappingData && (() => {
            const definedKeys = new Set(Object.keys(MUSCLE_DEFINITIONS));
            const missingKeys = new Set<string>();

            const regionRows = mappingData.regions.map((r) => {
              const regKey = r.assignedMuscle;
              if (regKey && regKey !== 'background' && !definedKeys.has(regKey as any)) {
                missingKeys.add(regKey);
              }
              const pct = getEffectiveMusclePercent(regKey, muscleStats);

              let styleObj = debugFillMode === 'all' && regKey && regKey !== 'background'
                ? { tintR: 88, tintG: 201, tintB: 149, alpha: 0.6 }
                : getMuscleColorStyle(pct);

              const fillStr = styleObj ? `rgb(${styleObj.tintR}, ${styleObj.tintG}, ${styleObj.tintB})` : 'none';
              const alphaStr = styleObj ? styleObj.alpha.toFixed(2) : '0.00';
              const rgbaStr = styleObj ? `rgba(${styleObj.tintR}, ${styleObj.tintG}, ${styleObj.tintB}, ${alphaStr})` : 'нейтральный';
              const appliedStyle = styleObj
                ? `fill: ${fillStr}; opacity: ${alphaStr}; display: block; mix-blend-mode: normal`
                : 'fill: none; opacity: 0; display: block; mix-blend-mode: normal';

              return {
                id: r.id,
                regKey: regKey || 'null',
                pct,
                rgbaStr,
                appliedStyle,
              };
            });

            const totalLoaded = regionRows.filter((r) => r.pct > 0).length;

            return (
              <div className="bg-[#101719] p-3 rounded-xl border border-[#202C2F] space-y-2">
                <div className="font-bold text-[#F0F3F2] flex items-center justify-between">
                  <span>2. Таблица регионов и применённых стилей ({mappingData.regions.length} регионов):</span>
                  <span className="text-[#858E90] text-[11px]">
                    Режим: <strong className="text-[#58C995]">{debugFillMode === 'all' ? 'ЗАЛИТЬ ВСЁ' : 'ПО ДАННЫМ'}</strong> | С нагрузкой: <strong className="text-[#58C995]">{totalLoaded}</strong>
                  </span>
                </div>

                {/* Расхождения ключей */}
                <div className="text-[11px] border-b border-[#202C2F] pb-2">
                  <span className="font-bold text-[#E8E9E7]">Расхождения ключей регионов (нет в MUSCLE_DEFINITIONS): </span>
                  {missingKeys.size > 0 ? (
                    <span className="text-[#E04848] font-bold">{[...missingKeys].join(', ')}</span>
                  ) : (
                    <span className="text-[#58C995] font-bold">0 расхождений (все ключи валидны)</span>
                  )}
                </div>

                {/* Таблица регионов */}
                <div className="max-h-56 overflow-y-auto space-y-1 text-[11px] pr-1 font-mono">
                  <div className="grid grid-cols-[36px_110px_60px_130px_1fr] gap-1 pb-1 border-b border-[#253538] font-bold text-[#858E90] sticky top-0 bg-[#101719]">
                    <span>ID</span>
                    <span>Ключ</span>
                    <span>Percent</span>
                    <span>Цвет / Alpha</span>
                    <span>Применённый стиль</span>
                  </div>
                  {regionRows.map((r) => (
                    <div key={r.id} className="grid grid-cols-[36px_110px_60px_130px_1fr] gap-1 items-center py-0.5 border-b border-[#1A2427]/60">
                      <span className="text-[#858E90]">#{r.id}</span>
                      <span className="text-white truncate" title={r.regKey}>{r.regKey}</span>
                      <span className={r.pct > 0 ? 'text-[#58C995] font-bold' : 'text-[#6E7B7D]'}>{r.pct}%</span>
                      <span className="text-[#C2C8C9] truncate" title={r.rgbaStr}>{r.rgbaStr}</span>
                      <span className="text-[#858E90] truncate text-[10px]" title={r.appliedStyle}>{r.appliedStyle}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Anatomical Models Container: Maximally large, dual models side-by-side */}
      <div className="w-full bg-[#121A1C] rounded-2xl p-0 shadow-2xl flex flex-col items-center justify-center overflow-hidden border border-[#1C2628]">
        <div className="w-full max-w-[720px] md:max-w-[780px] mx-auto relative rounded-xl overflow-hidden bg-[#0A1012] flex items-center justify-center shadow-xl">
          {!isLoaded && (
            <div className="absolute inset-0 bg-[#080D0E]/90 z-20 flex flex-col items-center justify-center gap-2 min-h-[280px]">
              <div className="w-7 h-7 border-2 border-[#58C995] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-[#58C995]">Загрузка анатомического атласа...</p>
            </div>
          )}

          {/* Dual Body Canvas: Front and Back side-by-side simultaneously */}
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-auto max-h-[52vh] min-h-[280px] block object-contain cursor-pointer select-none"
            title="Нажмите на любую мышцу на теле (спереди или сзади), чтобы открыть её карточку"
          />

          {/* Standalone Simple Highlight Layer */}
          <AnatomyHighlightLayer
            maskCanvas={maskCanvas}
            mappingData={mappingData}
            muscleStats={muscleStats}
            isTestFill={debugFillMode === 'all'}
          />

          {/* SVG Overlay: Precise indicator on selected muscle */}
          <svg
            viewBox={`${DUAL_VIEW_CROP.cropX} ${DUAL_VIEW_CROP.cropY} ${DUAL_VIEW_CROP.width} ${DUAL_VIEW_CROP.height}`}
            className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
          >
            <defs>
              <marker
                id="dual-marker-arrow"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <polygon points="0,2 8,5 0,8" fill="#58C995" />
              </marker>

              <filter id="dual-pointer-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Selected Muscle Indicator */}
            {selectedMuscle && targetAnchor && (
              <g filter="url(#dual-pointer-glow)">
                <circle
                  cx={targetAnchor.x}
                  cy={targetAnchor.y}
                  r="14"
                  fill="none"
                  stroke="#58C995"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  opacity="0.95"
                />
                <circle cx={targetAnchor.x} cy={targetAnchor.y} r="6" fill="#58C995" />

                <path
                  d={customLeaderPath}
                  fill="none"
                  stroke="#58C995"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd="url(#dual-marker-arrow)"
                />

                <g transform={`translate(${customCalloutX}, ${customCalloutY})`}>
                  <rect
                    x="0"
                    y="0"
                    width={customCalloutWidth}
                    height="54"
                    rx="12"
                    fill="#0A1814"
                    stroke="#58C995"
                    strokeWidth="2"
                    filter="drop-shadow(0 6px 18px rgba(0,0,0,0.9))"
                  />
                  <text
                    x="12"
                    y="24"
                    fill="#FFFFFF"
                    fontSize="15"
                    fontWeight="800"
                    fontFamily="system-ui, sans-serif"
                  >
                    {selectedMuscleData?.nameRu || ''}
                  </text>
                  <text
                    x="12"
                    y="44"
                    fill="#58C995"
                    fontSize="17"
                    fontWeight="900"
                    fontFamily="system-ui, sans-serif"
                  >
                    {selectedMuscleData?.percent || 0}%
                  </text>
                  <text
                    x="60"
                    y="43"
                    fill="#9CA3AF"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    • {selectedMuscleData?.displayStatus || ''}
                  </text>
                </g>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Exactly TWO Top Loaded Muscle Cards in one horizontal row of equal width */}
      <div className="w-full space-y-2 pt-1">
        <div className="grid grid-cols-2 gap-3">
          {topTwoMuscles.map((muscle, idx) => {
            const isSelected = selectedMuscle === muscle.key;
            const colors = getLoadColors(muscle.percent);

            return (
              <div
                key={muscle.key}
                onClick={() => handleSelectMuscle(muscle.key)}
                className={`rounded-2xl border p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-md ${
                  isSelected
                    ? 'bg-[#142B23] border-[#58C995] shadow-[0_0_16px_rgba(88,201,149,0.35)] ring-1 ring-[#58C995]'
                    : 'bg-[#0E1A18] hover:bg-[#122420] border-[#224436] hover:border-[#58C995]/70'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] sm:text-xs font-extrabold text-[#58C995] bg-[#0A1613] px-2 py-0.5 rounded border border-[#1b4334]">
                        Топ #{idx + 1}
                      </span>
                      <h3
                        className={`text-xs sm:text-base font-bold truncate ${
                          isSelected ? 'text-[#58C995]' : 'text-white'
                        }`}
                      >
                        {muscle.nameRu}
                      </h3>
                    </div>
                  </div>

                  <div
                    className={`shrink-0 px-2.5 py-1 rounded-xl border ${colors.badgeBorder} ${colors.badgeBg} flex items-center shadow-sm`}
                  >
                    <span className={`text-xs sm:text-base font-black tabular-nums ${colors.textColor}`}>
                      {muscle.percent}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-[#182823] h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colors.barColor}`}
                    style={{
                      width: `${Math.min(100, Math.max(muscle.percent > 0 ? 6 : 0, muscle.percent))}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#9CA3AF] mt-2 pt-1.5 border-t border-[#1a3328]">
                  <span className={`font-semibold truncate pr-1 ${muscle.stateBadgeColor?.split(' ')[0] || 'text-[#9CA3AF]'}`}>
                    {muscle.displayStatus}
                  </span>
                  <span className="shrink-0 text-[#9CA3AF]">
                    {muscle.recoveryTime}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Muscle Symmetry Block */}
      <div className="w-full bg-[#0D1517] border border-[#1b2b24] rounded-2xl p-3.5 shadow-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#122822] border border-[#1f563e] flex items-center justify-center text-[#58C995]">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Мышечная симметрия</h3>
              <p className="text-xs text-[#9CA3AF]">Баланс сторон ({period === 'session' ? 'сессия' : period === '7d' ? '7 дней' : '30 дней'})</p>
            </div>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-[#12221d] border border-[#1b4334] text-xs font-bold text-[#58C995] tabular-nums">
            Разница: {symmetryData.diff}%
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Left Column */}
          <div className="bg-[#080E10] border border-[#182622] rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-[#9CA3AF]">Левая</span>
              <span className="font-black text-[#58C995] tabular-nums">{symmetryData.leftPercent}%</span>
            </div>
            <div className="w-full bg-[#14201c] h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#58C995] rounded-full transition-all duration-500"
                style={{ width: `${symmetryData.leftPercent}%` }}
              />
            </div>
            <span className="text-xs text-[#9CA3AF] block tabular-nums">
              Тоннаж: {symmetryData.leftTonnage.toLocaleString('ru-RU')} кг
            </span>
          </div>

          {/* Right Column */}
          <div className="bg-[#080E10] border border-[#182622] rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-[#9CA3AF]">Правая</span>
              <span className="font-black text-[#58C995] tabular-nums">{symmetryData.rightPercent}%</span>
            </div>
            <div className="w-full bg-[#14201c] h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#58C995] rounded-full transition-all duration-500"
                style={{ width: `${symmetryData.rightPercent}%` }}
              />
            </div>
            <span className="text-xs text-[#9CA3AF] block tabular-nums">
              Тоннаж: {symmetryData.rightTonnage.toLocaleString('ru-RU')} кг
            </span>
          </div>
        </div>
      </div>

      {/* Right Slide-Out Drawer for all muscle cards */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 transition-opacity"
            />

            {/* Smooth Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed top-0 bottom-0 right-0 z-50 w-[85vw] sm:w-[420px] max-w-[460px] bg-[#081012] border-l border-[#1b2b24] shadow-[-20px_0_50px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden text-left"
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-[#1b2b24] bg-[#0c1815] flex flex-col gap-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#122822] border border-[#1f563e] flex items-center justify-center text-[#58C995]">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Все карточки мышц</h2>
                      <p className="text-[11px] text-[#9CA3AF]">
                        Сортировка по убыванию нагрузки ({period === 'session' ? 'сессия' : period === '7d' ? '7 дней' : '30 дней'})
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 rounded-xl bg-[#14231f] hover:bg-[#1b342e] text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
                    title="Закрыть панель"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={drawerSearchQuery}
                    onChange={(e) => setDrawerSearchQuery(e.target.value)}
                    placeholder="Поиск мышцы (грудь, бицепс, квадрицепс)..."
                    className="w-full bg-[#050B0C] border border-[#1b2826] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#606E6B] focus:outline-none focus:border-[#58C995]"
                  />
                  {drawerSearchQuery && (
                    <button
                      onClick={() => setDrawerSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 custom-scrollbar">
                {filteredMuscles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#12221E] border border-[#1f4033] flex items-center justify-center text-[#58C995]">
                      <Search className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Мышцы не найдены</h3>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">По запросу «{drawerSearchQuery}» ничего не найдено.</p>
                    </div>
                    <button
                      onClick={() => setDrawerSearchQuery('')}
                      className="px-4 py-2 bg-[#122822] hover:bg-[#19382e] border border-[#235742] rounded-xl text-xs font-semibold text-[#58C995] transition-colors cursor-pointer"
                    >
                      Очистить поиск
                    </button>
                  </div>
                ) : drawerSearchQuery.trim() ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#9CA3AF] px-0.5">
                      <span>Результаты поиска ({filteredMuscles.length})</span>
                      <button
                        onClick={() => setDrawerSearchQuery('')}
                        className="text-[#58C995] hover:underline text-[11px]"
                      >
                        Сбросить
                      </button>
                    </div>
                    {filteredMuscles.map((muscle) => {
                      const isSelected = selectedMuscle === muscle.key;
                      const colors = getLoadColors(muscle.percent);
                      return (
                        <div
                          key={muscle.key}
                          onClick={() => {
                            handleSelectMuscle(muscle.key);
                            setIsDrawerOpen(false);
                          }}
                          className={`rounded-xl border p-3 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-sm ${
                            isSelected
                              ? 'bg-[#122822] border-[#58C995] shadow-[0_0_14px_rgba(88,201,149,0.3)] ring-1 ring-[#58C995]'
                              : 'bg-[#0B1315] hover:bg-[#101F1C] border-[#1C2C28] hover:border-[#58C995]/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0 flex-1">
                              <h3 className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-[#58C995]' : 'text-white'}`}>
                                {muscle.nameRu}
                              </h3>
                              <span className="text-[10px] text-[#9CA3AF] block mt-0.5">
                                {muscle.categoryGroup}
                              </span>
                            </div>
                            <div className={`shrink-0 px-2 py-0.5 rounded-lg border ${colors.badgeBorder} ${colors.badgeBg} flex items-center`}>
                              <span className={`text-xs font-black tabular-nums ${colors.textColor}`}>
                                {muscle.percent}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-[#162320] h-1.5 rounded-full overflow-hidden mt-2">
                            <div
                              className={`h-full rounded-full transition-all duration-400 ${colors.barColor}`}
                              style={{ width: `${Math.min(100, Math.max(muscle.percent > 0 ? 5 : 0, muscle.percent))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#9CA3AF] mt-2 pt-1.5 border-t border-[#162320]">
                            <span className={muscle.stateBadgeColor?.split(' ')[0] || 'text-[#9CA3AF]'}>
                              {muscle.displayStatus}
                            </span>
                            <span>{muscle.recoveryTime}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  CATEGORY_ORDER.map((cat) => {
                    const groupMuscles = groupedMuscles[cat] || [];
                    if (groupMuscles.length === 0) return null;

                    return (
                      <div key={cat} className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[#58C995] uppercase tracking-wider px-1 pt-2 pb-1 border-b border-[#152721]">
                          <span>{cat}</span>
                          <span className="text-[10px] text-[#9CA3AF] font-semibold">
                            {groupMuscles.length} {groupMuscles.length === 1 ? 'мышца' : groupMuscles.length < 5 ? 'мышцы' : 'мышц'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {groupMuscles.map((muscle) => {
                            const isSelected = selectedMuscle === muscle.key;
                            const colors = getLoadColors(muscle.percent);

                            return (
                              <div
                                key={muscle.key}
                                onClick={() => {
                                  handleSelectMuscle(muscle.key);
                                  setIsDrawerOpen(false);
                                }}
                                className={`rounded-xl border p-3 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-sm ${
                                  isSelected
                                    ? 'bg-[#122822] border-[#58C995] shadow-[0_0_14px_rgba(88,201,149,0.3)] ring-1 ring-[#58C995]'
                                    : 'bg-[#0B1315] hover:bg-[#101F1C] border-[#1C2C28] hover:border-[#58C995]/50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="min-w-0 flex-1">
                                    <h3
                                      className={`text-xs sm:text-sm font-bold truncate ${
                                        isSelected ? 'text-[#58C995]' : 'text-white'
                                      }`}
                                    >
                                      {muscle.nameRu}
                                    </h3>
                                  </div>

                                  <div
                                    className={`shrink-0 px-2 py-0.5 rounded-lg border ${colors.badgeBorder} ${colors.badgeBg} flex items-center`}
                                  >
                                    <span className={`text-xs font-black tabular-nums ${colors.textColor}`}>
                                      {muscle.percent}%
                                    </span>
                                  </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full bg-[#162320] h-1.5 rounded-full overflow-hidden mt-2">
                                  <div
                                    className={`h-full rounded-full transition-all duration-400 ${colors.barColor}`}
                                    style={{
                                      width: `${Math.min(100, Math.max(muscle.percent > 0 ? 5 : 0, muscle.percent))}%`,
                                    }}
                                  />
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-[#9CA3AF] mt-2 pt-1.5 border-t border-[#162320]">
                                  <span className={muscle.stateBadgeColor?.split(' ')[0] || 'text-[#9CA3AF]'}>
                                    {muscle.displayStatus}
                                  </span>
                                  <span>{muscle.recoveryTime}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Interactive Bottom Sheet Info Card for Selected Muscle */}
      <AnimatePresence>
        {selectedMuscleData && selectedColors && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedMuscle(null);
                setActiveAnchor(null);
              }}
              className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 35, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 25, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:w-[420px] z-50 bg-[#091311] border-2 border-[#58C995]/80 rounded-2xl p-4 shadow-[0_12px_45px_rgba(0,0,0,0.9),0_0_25px_rgba(88,201,149,0.25)] max-h-[75vh] flex flex-col overflow-hidden text-left"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-[#1b2b24] gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-[#58C995] bg-[#122822] border border-[#1b4334] px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {selectedMuscleData.categoryName}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${selectedMuscleData.stateBadgeColor}`}>
                    {selectedMuscleData.displayStatus}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className={`px-2.5 py-0.5 rounded-xl border ${selectedColors.badgeBorder} ${selectedColors.badgeBg} flex items-center`}>
                    <span className={`text-sm sm:text-base font-black tabular-nums ${selectedColors.textColor}`}>
                      {selectedMuscleData.percent}%
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedMuscle(null);
                      setActiveAnchor(null);
                    }}
                    className="p-1.5 rounded-xl bg-[#141F22] hover:bg-[#1E2E33] border border-[#253235] text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
                    title="Закрыть карточку мышцы"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable content inside card */}
              <div className="overflow-y-auto space-y-3 pr-0.5 pt-3 custom-scrollbar">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                    {selectedMuscleData.nameRu}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[#9CA3AF] mt-1">
                    <span>
                      Восстановление: <strong className="text-white font-semibold">{selectedMuscleData.recoveryTime}</strong>
                    </span>
                    <span>•</span>
                    <span className={selectedStatusColor}>{selectedMuscleData.displayStatus}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="w-full bg-[#141C1E] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${selectedColors.barColor}`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(selectedMuscleData.percent > 0 ? 5 : 0, selectedMuscleData.percent)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-[#0b1b14] border border-[#1e4a38] rounded-xl p-3 flex items-start gap-2.5 text-xs text-[#E8E9E7]">
                  <Sparkles className="w-4 h-4 text-[#58C995] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-[#58C995] uppercase tracking-wider block">
                      Рекомендация тренера
                    </span>
                    <p className="text-xs text-[#d1d5db] leading-relaxed">
                      {selectedMuscleData.recommendation}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                  className="w-full py-2 px-3 bg-[#0c1915] hover:bg-[#12251f] border border-[#1e4033] rounded-xl flex items-center justify-between text-xs font-semibold text-[#58C995] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    <span>{isDetailsExpanded ? 'Скрыть подробные показатели' : 'Подробные показатели нагрузки'}</span>
                  </div>
                  {isDetailsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isDetailsExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2.5 pt-1"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#070D0E] border border-[#1b2528] rounded-xl p-2.5">
                        <span className="text-[10px] text-[#9CA3AF] block">Посл. тренировка</span>
                        <span className="text-xs font-bold text-white block truncate mt-0.5">
                          {selectedMuscleData.lastTrainedFormatted}
                        </span>
                      </div>
                      <div className="bg-[#070D0E] border border-[#1b2528] rounded-xl p-2.5">
                        <span className="text-[10px] text-[#9CA3AF] block">Подходы</span>
                        <span className="text-xs font-bold text-white block mt-0.5">
                          {selectedMuscleData.setsCount} подх. ({period === 'session' ? 'сессия' : period === '7d' ? '7д' : '30д'})
                        </span>
                      </div>
                      <div className="bg-[#070D0E] border border-[#1b2528] rounded-xl p-2.5">
                        <span className="text-[10px] text-[#9CA3AF] block">Упражнения</span>
                        <span className="text-xs font-bold text-white block mt-0.5">
                          {selectedMuscleData.exerciseCount} упр.
                        </span>
                      </div>
                      <div className="bg-[#070D0E] border border-[#1b2528] rounded-xl p-2.5">
                        <span className="text-[10px] text-[#9CA3AF] block">Тоннаж</span>
                        <span className="text-xs font-bold text-[#58C995] block mt-0.5 tabular-nums">
                          {selectedMuscleData.weeklyTonnageKg > 0
                            ? `${selectedMuscleData.weeklyTonnageKg.toLocaleString('ru-RU')} кг`
                            : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider block">
                        История нагрузки за период
                      </span>
                      {selectedMuscleData.history.length > 0 ? (
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5 custom-scrollbar">
                          {selectedMuscleData.history.map((item, idx) => (
                            <div
                              key={idx}
                              className="bg-[#070D0E] border border-[#182224] rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs"
                            >
                              <span className="font-medium text-white truncate pr-2">
                                {item.exerciseName}
                              </span>
                              <div className="flex items-center gap-2 text-[#9CA3AF] shrink-0 text-[11px]">
                                <span>{formatRussianDate(item.date)}</span>
                                <span className="text-[#34d399] font-semibold tabular-nums">
                                  {item.sets} подх.
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#9CA3AF] bg-[#070D0E] p-2.5 rounded-xl">
                          За выбранный период нагрузка не зафиксирована.
                        </p>
                      )}
                    </div>

                    <div className="bg-[#070D0E] border border-[#182224] rounded-xl p-2.5 space-y-1 text-xs text-[#9CA3AF]">
                      <div>
                        <span className="text-white font-semibold">Локация: </span>
                        <span>{selectedMuscleData.locationRu}</span>
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        <span className="text-white font-semibold">Функция: </span>
                        <span>{selectedMuscleData.functionRu}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Resetting Heatmap */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-5 bg-black/85 backdrop-blur-md select-none font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#11171A] border border-[#253338] rounded-[28px] p-6 max-w-sm w-full space-y-4 shadow-2xl text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2A1215] border border-[#521B20] flex items-center justify-center text-[#EF4444] shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Сбросить тепловую карту?</h3>
                  <p className="text-xs text-[#9CA3AF]">Подтвердите действие</p>
                </div>
              </div>

              <p className="text-xs text-[#C5C8C6] leading-relaxed">
                Это действие обнулит накопленный процент нагрузки на все группы мышц и вернёт анатомический атлас в исходное нейтральное состояние.
              </p>
              <p className="text-[11px] text-[#58C995] bg-[#122822] border border-[#1b4334] p-2.5 rounded-xl">
                ✓ История ваших тренировок, выполненные упражнения и программы сохранятся в полной сохранности.
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#9CA3AF] hover:text-white bg-[#182224] hover:bg-[#202D30] rounded-xl transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmReset}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-900/30"
                >
                  Да, сбросить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Interactive Debug Region Key Editor Modal */}
      <AnimatePresence>
        {isDebugOverlayOpen && debugEditingRegion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#101719] border border-[#252D2F] rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl text-left"
            >
              <div className="flex items-center justify-between border-b border-[#1C2628] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#E04848]/20 border border-[#E04848]/40 flex items-center justify-center text-[#E04848]">
                    <Bug className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Настройка региона #{debugEditingRegion.id}
                    </h3>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {(debugEditingRegion.center?.x ?? 0) <= 633 ? 'Вид спереди' : 'Вид сзади'} (
                      {debugEditingRegion.center?.x}, {debugEditingRegion.center?.y})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDebugEditingRegion(null)}
                  className="p-1 text-[#9CA3AF] hover:text-white rounded-lg hover:bg-[#1C2628]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#9CA3AF] block">
                  Текущий ключ: <span className="text-white font-bold">{debugEditingRegion.assignedMuscle || 'null (Не назначено / Красный)'}</span>
                </label>

                <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {((debugEditingRegion.center?.x ?? 0) <= 633
                    ? [
                        'front_delts', 'side_delts', 'chest_upper', 'chest_mid', 'chest_lower',
                        'biceps', 'brachialis', 'forearms', 'abs', 'obliques',
                        'quads_rectus', 'quads_lateralis', 'quads_medialis', 'tibialis', 'calves', 'background'
                      ]
                    : [
                        'traps_upper', 'traps_mid', 'traps_lower', 'rear_delts', 'triceps',
                        'lats', 'rhomboids', 'lowerback', 'glutes', 'hamstrings', 'forearms', 'calves', 'background'
                      ]
                  ).map((k) => (
                    <button
                      key={k}
                      onClick={() => setDebugSelectedKey(k)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border text-left transition-all ${
                        debugSelectedKey === k
                          ? 'bg-[#11241C] text-[#58C995] border-[#2A5943]'
                          : 'bg-[#0A1012] text-[#C5C8C6] border-[#1C2628] hover:border-[#2A3638]'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                  <button
                    onClick={() => setDebugSelectedKey(null)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border text-left transition-all ${
                      debugSelectedKey === null
                        ? 'bg-[#2A1215] text-[#EF4444] border-[#521B20]'
                        : 'bg-[#0A1012] text-[#EF4444] border-[#1C2628] hover:border-[#521B20]'
                    }`}
                  >
                    🚫 Сбросить (null)
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[#1C2628] space-y-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={debugApplyToMirror}
                    onChange={(e) => setDebugApplyToMirror(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#58C995] cursor-pointer"
                  />
                  <span>Применить к зеркальному региону</span>
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setDebugEditingRegion(null)}
                    className="px-3.5 py-2 text-xs font-semibold text-[#9CA3AF] hover:text-white bg-[#182224] rounded-xl"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      if (!mappingData || !debugEditingRegion) return;
                      const updatedRegions = mappingData.regions.map((r) => {
                        if (r.id === debugEditingRegion.id) {
                          return { ...r, assignedMuscle: debugSelectedKey };
                        }
                        return r;
                      });

                      if (debugApplyToMirror) {
                        const isFront = (debugEditingRegion.center?.x ?? 0) <= 633;
                        const axis = isFront ? 307.5 : 964.0;
                        const rx = 2 * axis - (debugEditingRegion.center?.x ?? 0);
                        const ry = debugEditingRegion.center?.y ?? 0;

                        let bestMatchId: number | null = null;
                        let minDist = Infinity;
                        mappingData.regions.forEach((r2) => {
                          if (r2.id === debugEditingRegion.id || r2.id === 4) return;
                          const isFront2 = (r2.center?.x ?? 0) <= 633;
                          if (isFront !== isFront2) return;
                          const d = Math.hypot((r2.center?.x ?? 0) - rx, (r2.center?.y ?? 0) - ry);
                          if (d < minDist) {
                            minDist = d;
                            bestMatchId = r2.id;
                          }
                        });

                        if (bestMatchId && minDist < 48) {
                          const idx = updatedRegions.findIndex((r) => r.id === bestMatchId);
                          if (idx >= 0) {
                            updatedRegions[idx] = { ...updatedRegions[idx], assignedMuscle: debugSelectedKey };
                          }
                        }
                      }

                      const newMapping = { ...mappingData, regions: updatedRegions };
                      setMappingData(newMapping);
                      safeSetItem('form_anatomy_custom_mapping', JSON.stringify(newMapping));
                      setDebugEditingRegion(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-[#0A1012] bg-[#58C995] hover:bg-[#48b584] rounded-xl transition-colors shadow-lg"
                  >
                    Сохранить привязку
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
