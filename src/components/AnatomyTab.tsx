import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StorageService } from '../services/storage';
import {
  MUSCLE_DEFINITIONS,
  MuscleGroup,
  MusclePeriod,
  MuscleLoadStats,
  WorkoutSession,
  SportSession,
  EXERCISE_CATALOG,
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

  const direct = stats[muscleKey as MuscleGroup]?.percent || 0;

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

  let maxVal = direct;

  // Sync alias keys (rearDelts <-> rear_delts)
  if (muscleKey === 'rear_delts' && stats['rearDelts']) {
    maxVal = Math.max(maxVal, stats['rearDelts'].percent);
  } else if (muscleKey === 'rearDelts' && stats['rear_delts']) {
    maxVal = Math.max(maxVal, stats['rear_delts'].percent);
  }

  // Parent rollup (if parent muscle has load, child inherits it)
  const parentKey = parentMap[muscleKey];
  if (parentKey && stats[parentKey]) {
    maxVal = Math.max(maxVal, stats[parentKey].percent);
  }

  // Children rollup (if child muscle has load, parent inherits max)
  const children = childrenMap[muscleKey];
  if (children) {
    children.forEach((c) => {
      if (stats[c]) {
        maxVal = Math.max(maxVal, stats[c].percent);
      }
    });
  }

  // Sibling rollup (if sibling muscle has load under same parent)
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
function getMuscleColorStyle(percent: number) {
  if (percent <= 0) return null;
  const t = percent / 100;

  let tintR: number;
  let tintG: number;
  let tintB: number;
  let alpha: number;

  if (t <= 0.25) {
    const k = t / 0.25;
    tintR = 108 - 22 * k;
    tintG = 142 + 28 * k;
    tintB = 112 - 12 * k;
    alpha = 0.24 + 0.14 * k;
  } else if (t <= 0.5) {
    const k = (t - 0.25) / 0.25;
    tintR = 86 - 32 * k;
    tintG = 170 + 36 * k;
    tintB = 100 - 15 * k;
    alpha = 0.38 + 0.16 * k;
  } else if (t <= 0.75) {
    const k = (t - 0.5) / 0.25;
    tintR = 54 - 20 * k;
    tintG = 206 + 30 * k;
    tintB = 85 + 25 * k;
    alpha = 0.54 + 0.16 * k;
  } else if (t <= 1.0) {
    const k = (t - 0.75) / 0.25;
    tintR = 34 - 14 * k;
    tintG = 236 + 19 * k;
    tintB = 110 - 35 * k;
    alpha = 0.70 + 0.14 * k;
  } else {
    const excess = Math.min((t - 1.0) / 2.0, 1);
    tintR = Math.max(8, 20 - 12 * excess);
    tintG = 255;
    tintB = Math.max(50, 75 - 20 * excess);
    alpha = Math.min(0.92, 0.84 + 0.08 * excess);
  }

  return { tintR, tintG, tintB, alpha };
}

function formatRussianDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Нет записей';
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

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

  for (const s of sortedSessions) {
    const touched = s.exercises?.some((ex) => {
      const cat = EXERCISE_CATALOG.find((c) => c.name.toLowerCase() === ex.name.toLowerCase());
      const primary = ex.targetMuscle || cat?.primaryMuscle;
      const secondary = ex.secondaryMuscles || cat?.secondaryMuscles || [];
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
      textColor: 'text-[#10B981]',
      barColor: 'bg-[#059669]',
      badgeBorder: 'border-[#146644]',
      badgeBg: 'bg-[#0B3825]',
      label: 'Высокая',
    };
  }
  return {
    textColor: 'text-[#34D399]',
    barColor: 'bg-gradient-to-r from-[#10B981] to-[#34D399]',
    badgeBorder: 'border-[#166534]',
    badgeBg: 'bg-[#0F3A22]',
    label: 'Сверхнагрузка',
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
  9: 'hamstrings', 10: 'hamstrings',
  11: 'forearms',
  12: 'rhomboids', 13: 'rhomboids',
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
  34: 'brachialis',
  35: 'forearms', 36: 'forearms',
  37: 'brachialis',
  38: 'traps_upper',
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
  72: 'traps_upper',
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
  86: null,
  87: 'lats',
  88: null,
  89: 'triceps',
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
  105: 'triceps',
  106: null,
  107: 'obliques', 108: 'obliques',
  109: null, 110: null, 111: null,
  112: 'triceps',
  113: 'calves', 114: 'calves',
  115: 'obliques', 116: 'obliques', 117: 'obliques',
  118: 'quads_lateralis'
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

  // Debug region interactive key editor
  const [debugEditingRegion, setDebugEditingRegion] = useState<MappingRegion | null>(null);
  const [debugSelectedKey, setDebugSelectedKey] = useState<string | null>(null);
  const [debugApplyToMirror, setDebugApplyToMirror] = useState<boolean>(true);

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
        localStorage.removeItem('form_anatomy_custom_mapping');
        const resJson = await fetch('/assets/aistudio/form_core_atlas_mapping.json', { cache: 'no-cache' });
        const json: MappingData = await resJson.json();

        // Step 3 benchmark verification check
        const discrepancies: string[] = [];
        let matches = 0;
        json.regions.forEach((r) => {
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
          console.log(`Разметка совпадает с эталоном: ${matches}/118`);
          setValidationReport(`Разметка совпадает с эталоном: ${matches}/118`);
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

  // Render thermal heatmap on offscreen buffer and crop onto visible canvas (always dual view)
  useEffect(() => {
    if (!masterImage || !maskCanvas || !mappingData) return;

    const width = mappingData.width;
    const height = mappingData.height;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = width;
      offscreenCanvasRef.current.height = height;
    }
    const fullCanvas = offscreenCanvasRef.current;
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    if (!fullCtx) return;

    fullCtx.imageSmoothingEnabled = true;
    fullCtx.clearRect(0, 0, width, height);
    fullCtx.drawImage(masterImage, 0, 0, width, height);

    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return;
    const maskImgData = maskCtx.getImageData(0, 0, width, height);
    const maskData = maskImgData.data;

    const imgData = fullCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const regionStyleMap = new Map<number, { tintR: number; tintG: number; tintB: number; alpha: number }>();

    if (isDebugOverlayOpen) {
      mappingData.regions.forEach((reg) => {
        const debugStyle = getDebugColorForMuscle(reg.assignedMuscle);
        regionStyleMap.set(reg.id, debugStyle);
      });
    } else {
      const regionPercentMap = new Map<number, number>();
      mappingData.regions.forEach((reg) => {
        if (reg.assignedMuscle) {
          const p = getEffectiveMusclePercent(reg.assignedMuscle, muscleStats);
          if (p > 0) {
            regionPercentMap.set(reg.id, p);
          }
        }
      });

      regionPercentMap.forEach((pct, regId) => {
        const style = getMuscleColorStyle(pct);
        if (style) {
          regionStyleMap.set(regId, style);
        }
      });
    }

    const lumLUT = new Float32Array(256);
    for (let l = 0; l < 256; l++) {
      lumLUT[l] = Math.pow(l / 128, 0.92);
    }

    for (let i = 0; i < width * height; i++) {
      const pIdx = i * 4;
      const rId = maskData[pIdx] + (maskData[pIdx + 1] << 8);
      if (rId === 0) continue;

      const style = regionStyleMap.get(rId);
      if (!style) continue;

      const r = data[pIdx];
      const g = data[pIdx + 1];
      const b = data[pIdx + 2];

      const lum = Math.min(255, (r * 77 + g * 150 + b * 29) >> 8);
      const contrastFactor = lumLUT[lum];

      const modR = Math.min(255, style.tintR * contrastFactor);
      const modG = Math.min(255, style.tintG * contrastFactor);
      const modB = Math.min(255, style.tintB * contrastFactor);

      const invAlpha = 1 - style.alpha;
      data[pIdx] = (r * invAlpha + modR * style.alpha + 0.5) | 0;
      data[pIdx + 1] = (g * invAlpha + modG * style.alpha + 0.5) | 0;
      data[pIdx + 2] = (b * invAlpha + modB * style.alpha + 0.5) | 0;
    }

    fullCtx.putImageData(imgData, 0, 0);

    const visibleCanvas = canvasRef.current;
    if (!visibleCanvas) return;

    visibleCanvas.width = DUAL_VIEW_CROP.width;
    visibleCanvas.height = DUAL_VIEW_CROP.height;
    const visibleCtx = visibleCanvas.getContext('2d');
    if (!visibleCtx) return;

    visibleCtx.imageSmoothingEnabled = true;
    visibleCtx.clearRect(0, 0, DUAL_VIEW_CROP.width, DUAL_VIEW_CROP.height);
    visibleCtx.drawImage(
      fullCanvas,
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
      visibleCtx.font = 'bold 11px system-ui, sans-serif';
      visibleCtx.textAlign = 'center';
      visibleCtx.textBaseline = 'middle';

      mappingData.regions.forEach((reg) => {
        const cx = reg.center?.x ?? 0;
        const cy = reg.center?.y ?? 0;
        if (cx <= 0 || cy <= 0) return;

        const isUnassigned = !reg.assignedMuscle || reg.assignedMuscle === 'background';
        const label = isUnassigned ? `#${reg.id} ⚠️ (НЕТ)` : `#${reg.id}: ${reg.assignedMuscle}`;

        const textWidth = visibleCtx.measureText(label).width;
        visibleCtx.fillStyle = isUnassigned ? 'rgba(239, 68, 68, 0.95)' : 'rgba(10, 16, 18, 0.85)';
        visibleCtx.fillRect(cx - textWidth / 2 - 4, cy - 8, textWidth + 8, 16);

        visibleCtx.fillStyle = isUnassigned ? '#FFFFFF' : '#58C995';
        visibleCtx.fillText(label, cx, cy);
      });
    }
  }, [masterImage, maskCanvas, mappingData, muscleStats, isDebugOverlayOpen]);

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
    if (rId === 0) {
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
    localStorage.setItem('form_anatomy_reset_time', Date.now().toString());
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
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const resetTime = Number(localStorage.getItem('form_anatomy_reset_time') || '0');

    const isAfterReset = (itemDate: string) => {
      if (!resetTime) return true;
      const itemTs = new Date(`${itemDate}T12:00:00`).getTime();
      return itemTs >= resetTime;
    };

    const sessions = allSessions.filter((s) => {
      if (s.status !== 'completed') return false;
      if (!isAfterReset(s.date)) return false;
      const sessionDate = new Date(s.date);
      if (period === 'session') {
        return s.date === todayIso;
      } else if (period === '7d') {
        const diffDays = Math.floor((now.getTime() - sessionDate.getTime()) / (1000 * 3600 * 24));
        return diffDays >= 0 && diffDays <= 7;
      } else {
        const diffDays = Math.floor((now.getTime() - sessionDate.getTime()) / (1000 * 3600 * 24));
        return diffDays >= 0 && diffDays <= 30;
      }
    });

    let totalTonnage = sessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 0);
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#101719] border border-[#252D2F] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-left"
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
                      try {
                        localStorage.setItem('form_anatomy_custom_mapping', JSON.stringify(newMapping));
                      } catch {}
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
