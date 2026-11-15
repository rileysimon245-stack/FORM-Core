/**
 * ============================================================================
 * FORM Core — Чистое математическое ядро (без React и localStorage)
 * ============================================================================
 */

import { ExerciseSet, WorkoutExercise, ActivityIntensity } from '../types/workout';
import { TRAINING_ENGINE_CONFIG } from './config';

export type SetClassificationStatus =
  | 'counted'           // Зачётный рабочий подход (запас 0..3)
  | 'too_easy_working'  // Рабочий подход с запасом 4+ (не входит в зачётные)
  | 'warmup'            // Разминочный подход (не входит в зачётные)
  | 'unrated_legacy'    // Выполнен, но запас RIR не указан («без оценки»)
  | 'invalid_rir'       // Некорректное значение RIR (отрицательное, дробное, NaN/Infinity, не число)
  | 'incomplete';       // Подход не отмечен выполненным

export interface SetClassificationResult {
  status: SetClassificationStatus;
  isCounted: boolean;
  isFailure: boolean; // RIR === 0 (засчитывается, но никогда не рекомендуется)
  reason: string;
}

export function isSetCompletedPure(st: Partial<ExerciseSet> & Record<string, any>): boolean {
  if (!st) return false;
  const rawCompleted: unknown = st.completed;
  return (
    rawCompleted === true ||
    rawCompleted === 1 ||
    rawCompleted === 'true' ||
    st.done === true ||
    st.isDone === true
  );
}

/**
 * Классифицирует подход на зачётный / незачётный / без оценки.
 * Правило:
 * - Не выполнен -> incomplete
 * - Разминка -> warmup (не зачётный)
 * - Запас повторений (rir) отсутствует (undefined/null) -> unrated_legacy («без оценки», в зачётные НЕ входит)
 * - Невалидный тип, отрицательное, нецелое или нечисловое значение RIR -> invalid_rir (не зачётный, НЕ превращается в 0/отказ)
 * - Рабочий (целое 0 <= rir <= 3) -> counted
 * - rir >= 4 -> too_easy_working
 */
export function classifySet(st: Partial<ExerciseSet> & Record<string, any>): SetClassificationResult {
  if (!isSetCompletedPure(st)) {
    return {
      status: 'incomplete',
      isCounted: false,
      isFailure: false,
      reason: 'Подход не отмечен выполненным',
    };
  }

  if (st.setType === 'warmup') {
    return {
      status: 'warmup',
      isCounted: false,
      isFailure: false,
      reason: 'Разминочный подход не учитывается в рабочем объёме',
    };
  }

  if (st.rir === undefined || st.rir === null) {
    return {
      status: 'unrated_legacy',
      isCounted: false,
      isFailure: false,
      reason: 'Без оценки запаса повторений (RIR не указан)',
    };
  }

  if (
    typeof st.rir !== 'number' ||
    !Number.isFinite(st.rir) ||
    st.rir < 0 ||
    !Number.isInteger(st.rir)
  ) {
    return {
      status: 'invalid_rir',
      isCounted: false,
      isFailure: false,
      reason: 'Некорректное значение RIR (ожидается целое неотрицательное число)',
    };
  }

  const rir = st.rir;
  if (rir > TRAINING_ENGINE_CONFIG.countedSet.maxRirIncluded) {
    return {
      status: 'too_easy_working',
      isCounted: false,
      isFailure: false,
      reason: `Запас ${rir}+ повторений слишком велик для зачётного стимула`,
    };
  }

  return {
    status: 'counted',
    isCounted: true,
    isFailure: rir === TRAINING_ENGINE_CONFIG.countedSet.warnOnFailureRir,
    reason:
      rir === 0
        ? 'Зачётный рабочий подход (запас 0 / отказ — записывается, но не рекомендуется)'
        : `Зачётный рабочий подход (запас ${rir})`,
  };
}

export type EpleyEstimateResult =
  | {
      status: 'estimated';
      valueKg: number;
      isEstimate: true;
      note: string;
    }
  | {
      status: 'out_of_epley_range';
      valueKg: null;
      isEstimate: false;
      note: string;
    }
  | {
      status: 'insufficient_data';
      valueKg: null;
      isEstimate: false;
      note: string;
    };

/**
 * Оценка 1ПМ по формуле Эпли: вес * (1 + повторения / 30).
 * Строго для 1–10 повторений и веса > 0.
 * При >10 повторениях возвращает out_of_epley_range (прогресс считается по повторам).
 */
export function estimateEpley1RM(weightKg: number, reps: number): EpleyEstimateResult {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(reps) || reps < 1) {
    return {
      status: 'insufficient_data',
      valueKg: null,
      isEstimate: false,
      note: 'Недостаточно данных (нужен вес > 0 и повторения >= 1)',
    };
  }

  if (reps > TRAINING_ENGINE_CONFIG.epley.maxReliableReps) {
    return {
      status: 'out_of_epley_range',
      valueKg: null,
      isEstimate: false,
      note: `Подход длиннее ${TRAINING_ENGINE_CONFIG.epley.maxReliableReps} повторений — формула Эпли не применяется, оценивается прогресс повторений`,
    };
  }

  if (reps === 1) {
    return {
      status: 'estimated',
      valueKg: Math.round(weightKg * 10) / 10,
      isEstimate: true,
      note: 'Оценка 1ПМ по Эпли (1 повторение = рабочий вес)',
    };
  }

  const raw = weightKg * (1 + reps / 30);
  return {
    status: 'estimated',
    valueKg: Math.round(raw * 10) / 10,
    isEstimate: true,
    note: 'Оценка 1ПМ по формуле Эпли (надёжна в диапазоне 1–10 повторений)',
  };
}

/**
 * Консервативный возрастной режим:
 * Если возраст не указан (0 / null / undefined) или меньше 18 лет -> true.
 */
export function isConservativeAgeMode(age?: number | null): boolean {
  if (typeof age !== 'number' || !Number.isFinite(age) || age <= 0) {
    return true;
  }
  return age < TRAINING_ENGINE_CONFIG.safety.adultMinAge;
}

/**
 * Сопоставление устаревшей текстовой интенсивности (только для старых записей без rpe)
 * с ориентировочной шкалой RPE 1..10.
 */
export function mapLegacySportIntensityToRpe(legacyIntensity?: ActivityIntensity): number {
  const map = TRAINING_ENGINE_CONFIG.sport.legacyIntensityToRpe;
  if (legacyIntensity === 'high') return map.high;
  if (legacyIntensity === 'low') return map.low;
  return map.medium;
}

export interface SportLoadResult {
  loadUnits: number;
  usedRpe: number | null;
  isLegacyMapping: boolean;
  isValid: boolean;
  error?: string;
}

/**
 * Нагрузка для бокса и других видов спорта: длительность (мин) * субъективная тяжесть (1–10).
 * Явно переданный rpe обязан быть конечным числом от 1 до 10 — при невалидном rpe
 * отката к legacyIntensity НЕ происходит.
 * Для старых записей, где rpe отсутствует (undefined/null), применяется mapLegacySportIntensityToRpe.
 */
export function calculateSportLoad(params: {
  durationMinutes: number;
  rpe?: number | null;
  legacyIntensity?: ActivityIntensity;
}): SportLoadResult {
  if (
    typeof params.durationMinutes !== 'number' ||
    !Number.isFinite(params.durationMinutes) ||
    params.durationMinutes < 0
  ) {
    return {
      loadUnits: 0,
      usedRpe: null,
      isLegacyMapping: false,
      isValid: false,
      error: 'Некорректная длительность спортивной сессии (ожидается конечное число >= 0)',
    };
  }

  const duration = Math.round(params.durationMinutes);

  if (params.rpe !== undefined && params.rpe !== null) {
    if (
      typeof params.rpe !== 'number' ||
      !Number.isFinite(params.rpe) ||
      params.rpe < TRAINING_ENGINE_CONFIG.sport.minRpe ||
      params.rpe > TRAINING_ENGINE_CONFIG.sport.maxRpe
    ) {
      return {
        loadUnits: 0,
        usedRpe: null,
        isLegacyMapping: false,
        isValid: false,
        error: `Некорректное значение RPE (ожидается число от ${TRAINING_ENGINE_CONFIG.sport.minRpe} до ${TRAINING_ENGINE_CONFIG.sport.maxRpe})`,
      };
    }

    const rpeVal = Math.round(params.rpe);
    const loadUnits = duration * rpeVal;
    if (!Number.isFinite(loadUnits)) {
      return {
        loadUnits: 0,
        usedRpe: null,
        isLegacyMapping: false,
        isValid: false,
        error: 'Переполнение расчёта спортивной нагрузки',
      };
    }

    return {
      loadUnits,
      usedRpe: rpeVal,
      isLegacyMapping: false,
      isValid: true,
    };
  }

  const fallbackRpe = mapLegacySportIntensityToRpe(params.legacyIntensity);
  const loadUnits = duration * fallbackRpe;
  return {
    loadUnits: Number.isFinite(loadUnits) ? loadUnits : 0,
    usedRpe: fallbackRpe,
    isLegacyMapping: true,
    isValid: Number.isFinite(loadUnits),
  };
}

function toSafeNonNegativeNumber(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
}

/**
 * Эквивалент нагрузки для упражнений с собственным весом:
 * 50% массы тела пользователя (округлено до целых кг).
 * Если масса тела пользователя неизвестна (0, null, undefined, <= 0, NaN), возвращает 0 — без выдумывания веса.
 */
export function getBodyweightEquivalentKg(userWeightKg?: number | null): number {
  const parsed = toSafeNonNegativeNumber(userWeightKg);
  if (parsed <= 0) return 0;
  return Math.round(parsed * 0.5);
}

export interface SetLoadCalculationInput {
  isBodyweight: boolean;
  weightKg?: number | null;
  reps?: number | null;
  userBodyWeightKg?: number | null;
  /**
   * Явное дополнительное отягощение для упражнений с собственным весом.
   * Если передано (не undefined/null), используется вместо weightKg во избежание двойного учёта.
   * В текущей модели ExerciseSet доп. вес хранится в weightKg.
   */
  additionalWeightKg?: number | null;
}

export interface SetLoadCalculationResult {
  effectiveWeightKg: number;
  bodyweightEquivalentKg: number;
  additionalWeightKg: number;
  reps: number;
  volumeKg: number;
}

/**
 * Единый расчёт вклада одного подхода в тренировочный тоннаж:
 * - Обычное упражнение (isBodyweight = false):
 *   effectiveWeight = max(0, weightKg); при 0 кг или отсутствии веса -> 0 кг (никаких fallbackWeight/массы тела).
 * - Упражнение с собственным весом (isBodyweight = true):
 *   effectiveWeight = getBodyweightEquivalentKg(userBodyWeightKg) + additionalWeightKg (без двойного учёта).
 * - Объём подхода = effectiveWeight * max(0, reps).
 */
export function calculateSetLoad(input: SetLoadCalculationInput): SetLoadCalculationResult {
  const isBodyweight = Boolean(input.isBodyweight);
  const reps = toSafeNonNegativeNumber(input.reps);

  if (!isBodyweight) {
    const workingWeight = toSafeNonNegativeNumber(input.weightKg);
    const rawVolume = workingWeight * reps;
    return {
      effectiveWeightKg: workingWeight,
      bodyweightEquivalentKg: 0,
      additionalWeightKg: 0,
      reps,
      volumeKg: Number.isFinite(rawVolume) ? rawVolume : 0,
    };
  }

  const bodyweightEquivalentKg = getBodyweightEquivalentKg(input.userBodyWeightKg);
  const hasExplicitAdditional =
    input.additionalWeightKg !== undefined && input.additionalWeightKg !== null;
  const additionalWeightKg = hasExplicitAdditional
    ? toSafeNonNegativeNumber(input.additionalWeightKg)
    : toSafeNonNegativeNumber(input.weightKg);

  const effectiveWeightKg = bodyweightEquivalentKg + additionalWeightKg;
  const rawVolume = effectiveWeightKg * reps;

  return {
    effectiveWeightKg,
    bodyweightEquivalentKg,
    additionalWeightKg,
    reps,
    volumeKg: Number.isFinite(rawVolume) ? rawVolume : 0,
  };
}

/**
 * Единый расчёт объёма одного упражнения по выполненным подходам.
 */
export function calculateExerciseVolumeKg(
  exercise: Pick<WorkoutExercise, 'isBodyweight' | 'sets' | 'skipped'>,
  userBodyWeightKg?: number | null,
  options?: { includeSkipped?: boolean }
): number {
  if (!exercise) return 0;
  if (!options?.includeSkipped && exercise.skipped) return 0;
  if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) return 0;

  let total = 0;
  for (const st of exercise.sets) {
    if (!isSetCompletedPure(st)) continue;
    const { volumeKg } = calculateSetLoad({
      isBodyweight: Boolean(exercise.isBodyweight),
      weightKg: st.weightKg,
      reps: st.reps,
      userBodyWeightKg,
    });
    total += volumeKg;
  }

  return Number.isFinite(total) ? Math.round(total) : 0;
}

/**
 * Единый расчёт суммарного тоннажа, числа выполненных подходов и повторений тренировки.
 */
export function calculateWorkoutMetrics(
  exercises: Array<Pick<WorkoutExercise, 'isBodyweight' | 'sets' | 'skipped'>> | undefined | null,
  userBodyWeightKg?: number | null
): {
  totalVolumeKg: number;
  completedSets: number;
  totalReps: number;
} {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { totalVolumeKg: 0, completedSets: 0, totalReps: 0 };
  }

  let rawVolume = 0;
  let completedSets = 0;
  let totalReps = 0;

  for (const ex of exercises) {
    if (!ex || ex.skipped || !Array.isArray(ex.sets)) continue;
    for (const st of ex.sets) {
      if (!isSetCompletedPure(st)) continue;
      completedSets += 1;
      const load = calculateSetLoad({
        isBodyweight: Boolean(ex.isBodyweight),
        weightKg: st.weightKg,
        reps: st.reps,
        userBodyWeightKg,
      });
      rawVolume += load.volumeKg;
      totalReps += load.reps;
    }
  }

  return {
    totalVolumeKg: Number.isFinite(rawVolume) ? Math.round(rawVolume) : 0,
    completedSets,
    totalReps: Number.isFinite(totalReps) ? Math.round(totalReps) : 0,
  };
}

