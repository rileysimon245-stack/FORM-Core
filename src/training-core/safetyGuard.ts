/**
 * ============================================================================
 * FORM Core — Safety Guard (Модуль безопасности с правом вето)
 * ============================================================================
 * Имеет право вето над любым повышением нагрузки или рекомендацией программы.
 * Никогда не рекомендует работу до отказа (RIR=0) и тренировки через боль.
 */

import type {
  MuscleGroup,
  UserFitnessParameters,
  UserProfile,
  WellbeingCheckin,
  WorkoutSession,
} from '../types/workout';
import type { FullExerciseItem } from '../data/exerciseTypes';
import { TRAINING_ENGINE_CONFIG } from './config';
import { isConservativeAgeMode } from './coreMath';
import { normalizeMuscleKeyPure } from './muscles';
import { resolveExerciseInUnifiedCatalog } from './catalog';
import { getCalendarDaysAgo } from './dateUtils';

export interface SafetyCheckInput {
  age?: number | null;
  targetMuscle?: MuscleGroup | string | null;
  painByMuscle?: Partial<Record<MuscleGroup | string, number>>; // 0 = нет, 1..10 = боль
  generalPainLevel?: number; // 0..10
  daysSinceLastSession?: number | null;
  hadRepDropRecently?: boolean;
  proposedWeightKg?: number;
  previousBestWeightKg?: number;
}

export interface SafetyEvaluation {
  allowWeightIncrease: boolean;
  allowFailureSets: false; // Всегда false по методике системы
  conservativeMode: boolean;
  requiresUserConfirmation: boolean;
  vetoReasons: string[];
  advisories: string[];
}

export function evaluateSafetyGuard(input: SafetyCheckInput): SafetyEvaluation {
  const vetoReasons: string[] = [];
  const advisories: string[] = [];
  let requiresUserConfirmation = false;

  // 0. Валидация возраста и выбор возрастного режима
  const ageProvided = input.age !== undefined && input.age !== null;
  const isInvalidAge =
    ageProvided && (typeof input.age !== 'number' || !Number.isFinite(input.age) || input.age < 0);

  const conservativeMode = isConservativeAgeMode(input.age);
  if (isInvalidAge) {
    vetoReasons.push(
      'Некорректное значение возраста во входных данных — автоматическое повышение нагрузки заблокировано.'
    );
  } else if (conservativeMode) {
    if (!input.age || input.age <= 0) {
      advisories.push(
        'Возраст в профиле не указан — включён консервативный режим: без проверки максимума, без подходов до отказа и без быстрого роста веса.'
      );
    } else {
      advisories.push(
        `Возраст ${input.age} лет (< 18) — действует консервативный режим безопасности: приоритет техники, без проверки максимума и без отказных подходов.`
      );
    }
  }

  // 1. Проверка боли (общая + painByMuscle с нормализацией ключей, даже если targetMuscle не передан)
  const minPain = TRAINING_ENGINE_CONFIG.safety.minPainToVetoIncrease;
  let hasPainVeto = false;
  let hasInvalidPainInput = false;

  if (input.generalPainLevel !== undefined && input.generalPainLevel !== null) {
    if (
      typeof input.generalPainLevel !== 'number' ||
      !Number.isFinite(input.generalPainLevel) ||
      input.generalPainLevel < 0
    ) {
      hasInvalidPainInput = true;
    } else if (input.generalPainLevel >= minPain) {
      hasPainVeto = true;
    }
  }

  const hasRawTarget =
    typeof input.targetMuscle === 'string' && input.targetMuscle.trim().length > 0;
  const normTargetMuscle = hasRawTarget ? normalizeMuscleKeyPure(input.targetMuscle) : null;
  const isTargetUnknown = hasRawTarget && normTargetMuscle === null;

  if (isTargetUnknown) {
    advisories.push(
      `Целевая группа мышц "${input.targetMuscle}" не распознана — применяется усиленная проверка боли по всем зонам.`
    );
  }

  let hasOtherAreaPainAdvisory = false;
  if (input.painByMuscle && typeof input.painByMuscle === 'object' && !Array.isArray(input.painByMuscle)) {
    for (const [rawKey, rawVal] of Object.entries(input.painByMuscle)) {
      if (rawVal === undefined || rawVal === null) continue;
      if (typeof rawVal !== 'number' || !Number.isFinite(rawVal) || rawVal < 0) {
        hasInvalidPainInput = true;
        continue;
      }
      if (rawVal >= minPain) {
        const normKey = normalizeMuscleKeyPure(rawKey);
        if (!normTargetMuscle || normKey === null || normKey === normTargetMuscle) {
          // Если targetMuscle не указан/не распознан, ИЛИ зона боли не распознана, ИЛИ совпадает с целевой мышцей — блокируем
          hasPainVeto = true;
        } else {
          hasOtherAreaPainAdvisory = true;
        }
      }
    }
  }

  if (hasInvalidPainInput) {
    vetoReasons.push(
      'Некорректное значение уровня боли во входных данных — автоматическое повышение нагрузки заблокировано.'
    );
  }

  if (hasPainVeto) {
    vetoReasons.push(
      'Отмечена боль — повышение нагрузки заблокировано. Тренировки при дискомфорте или боли не рекомендуются.'
    );
  } else if (hasOtherAreaPainAdvisory) {
    advisories.push(
      'Отмечена боль в другой мышечной группе — соблюдайте осторожность и снижайте нагрузку при дискомфорте.'
    );
  }

  // 2. Проверка перерыва > 14 дней (и валидности числа)
  if (input.daysSinceLastSession !== undefined && input.daysSinceLastSession !== null) {
    if (
      typeof input.daysSinceLastSession !== 'number' ||
      !Number.isFinite(input.daysSinceLastSession) ||
      input.daysSinceLastSession < 0
    ) {
      vetoReasons.push(
        'Некорректное количество дней с последней тренировки — автоматическое повышение веса заблокировано.'
      );
    } else if (input.daysSinceLastSession > TRAINING_ENGINE_CONFIG.progression.breakDaysThreshold) {
      vetoReasons.push(
        `Перерыв составил ${input.daysSinceLastSession} дн. (> ${TRAINING_ENGINE_CONFIG.progression.breakDaysThreshold} дн.) — повышение веса заблокировано до плавного возвращения в режим.`
      );
    }
  }

  // 3. Проверка падения повторений
  if (input.hadRepDropRecently) {
    vetoReasons.push(
      'Зафиксировано снижение повторений — повышение веса временно заблокировано, приоритет восстановлению и стабилизации результата.'
    );
  }

  // 4. Проверка корректности весов, безопасного шага (~5% / maxWeightStepRatio) и аномального скачка (>=35%)
  const hasProposed = input.proposedWeightKg !== undefined && input.proposedWeightKg !== null;
  const hasPrevBest = input.previousBestWeightKg !== undefined && input.previousBestWeightKg !== null;

  const proposedInvalid =
    hasProposed &&
    (typeof input.proposedWeightKg !== 'number' ||
      !Number.isFinite(input.proposedWeightKg) ||
      input.proposedWeightKg <= 0);
  const prevInvalid =
    hasPrevBest &&
    (typeof input.previousBestWeightKg !== 'number' ||
      !Number.isFinite(input.previousBestWeightKg) ||
      input.previousBestWeightKg <= 0);

  if (proposedInvalid || prevInvalid) {
    vetoReasons.push(
      'Некорректное значение рабочего веса (ожидается конечное положительное число) — повышение веса заблокировано.'
    );
  } else if (hasProposed !== hasPrevBest) {
    vetoReasons.push(
      'Недостаточно данных о базовом и предлагаемом весе для проверки шага прогрессии — автоматическое повышение заблокировано.'
    );
  } else if (
    hasProposed &&
    hasPrevBest &&
    typeof input.proposedWeightKg === 'number' &&
    typeof input.previousBestWeightKg === 'number' &&
    input.proposedWeightKg > input.previousBestWeightKg
  ) {
    const ratio = input.proposedWeightKg / input.previousBestWeightKg;
    if (ratio >= TRAINING_ENGINE_CONFIG.progression.anomalousWeightJumpRatio) {
      requiresUserConfirmation = true;
      vetoReasons.push(
        `Введён аномально высокий скачок веса (${input.previousBestWeightKg} → ${input.proposedWeightKg} кг) — требуется ручное подтверждение пользователя.`
      );
    } else if (ratio - 1 > TRAINING_ENGINE_CONFIG.progression.maxWeightStepRatio) {
      const pct = Math.round((ratio - 1) * 100);
      vetoReasons.push(
        conservativeMode
          ? `Консервативный режим: повышение веса на ${pct}% превышает безопасный шаг (~5%) — автоматическое повышение заблокировано.`
          : `Повышение веса на ${pct}% превышает безопасный шаг (~5%) — автоматическое повышение заблокировано.`
      );
    }
  }

  return {
    allowWeightIncrease: vetoReasons.length === 0,
    allowFailureSets: false,
    conservativeMode,
    requiresUserConfirmation,
    vetoReasons,
    advisories,
  };
}

// ============================================================================
// Расширенная проверка Safety Guard для упражнений, программ и старта сессии
// ============================================================================

export const HEALTH_RESTRICTION_PRESETS = {
  NO_AXIAL_SPINE_LOAD: 'Без осевой нагрузки на позвоночник',
  PROTECT_KNEES: 'Беречь коленные суставы',
  PROTECT_SHOULDERS: 'Беречь плечевые суставы',
  NO_DEEP_BENDS_OR_ARCHES: 'Без глубоких наклонов и прогибов',
  AVOID_SHARP_JUMPS: 'Избегать резких прыжков',
} as const;

export interface SafetyUserContext {
  age?: number | null;
  excludedExercises?: string[];
  healthRestrictions?: string[];
  painByMuscle?: Partial<Record<MuscleGroup | string, number>>;
  generalPainLevel?: number;
  daysSinceLastSession?: number | null;
  hadRepDropRecently?: boolean;
}

export interface ExerciseSafetyCandidate {
  exerciseId?: string | null;
  name: string;
  targetMuscle?: MuscleGroup | string | null;
  secondaryMuscles?: (MuscleGroup | string)[] | null;
  requiredEquipment?: string | null;
  isBodyweight?: boolean;
  targetWeight?: number | null;
  sets?: number | readonly unknown[];
  reps?: number | string;
}

export interface ExerciseSafetyDecision {
  allowed: boolean;
  blockedByExclusion: boolean;
  blockedByHealthRestriction: boolean;
  blockedByPain: boolean;
  blockedByAge: boolean;
  blockedByWeight?: boolean;
  matchedRestrictions: string[];
  vetoReasons: string[];
  advisories: string[];
  conservativeMode: boolean;
  allowFailureSets: false;
}

export interface WorkoutLaunchSafetyEvaluation {
  allowed: boolean;
  conservativeMode: boolean;
  allowFailureSets: false;
  blockedExercises: Array<{
    index: number;
    exercise: ExerciseSafetyCandidate;
    decision: ExerciseSafetyDecision;
  }>;
  safeExercises: ExerciseSafetyCandidate[];
  vetoReasons: string[];
  advisories: string[];
}

export function normalizeSafetyToken(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

export function matchesExcludedExercise(
  exercise: Pick<ExerciseSafetyCandidate, 'exerciseId' | 'name'>,
  excludedExercises?: string[]
): boolean {
  if (!Array.isArray(excludedExercises) || excludedExercises.length === 0) {
    return false;
  }

  const normName = normalizeSafetyToken(exercise.name);
  const normId = normalizeSafetyToken(exercise.exerciseId);

  return excludedExercises.some((rawExcluded) => {
    const token = normalizeSafetyToken(rawExcluded);
    if (!token) return false;
    if (normName && normName === token) return true;
    if (normId && normId === token) return true;
    if (token.length >= 4 && normName && normName.includes(token)) return true;
    return false;
  });
}

function isBarbellOrLoadedAxialExercise(
  normName: string,
  normId: string,
  requiredEquipment?: string | null
): boolean {
  const isBarbell = requiredEquipment === 'barbell';
  const isMachine = requiredEquipment === 'gym_machines';

  if (
    normName.includes('становая тяга') ||
    normName.includes('deadlift') ||
    normName.includes('румынская тяга') ||
    normName.includes('good morning') ||
    normName.includes('армейский жим') ||
    normName.includes('приседания со штангой') ||
    normName.includes('фронтальные приседания') ||
    normName.includes('приседания с паузой') ||
    normName.includes('приседания в смите') ||
    normName.includes('гакк-приседания') ||
    normName.includes('жим штанги стоя') ||
    normName.includes('жим гантелей стоя') ||
    normName.includes('тяга штанги в наклоне') ||
    normName.includes('шраги со штангой') ||
    normId.includes('barbell_back_squats') ||
    normId.includes('barbell_front_squats') ||
    normId.includes('smith_machine_squats') ||
    normId.includes('pause_squats') ||
    normId.includes('hack_squats') ||
    normId.includes('romanian_deadlift') ||
    normId.includes('good_morning') ||
    normId.includes('barbell_overhead_press_standing') ||
    normId.includes('dumbbell_shoulder_press_standing') ||
    normId.includes('barbell_row_bent_over') ||
    normId.includes('shrugs_barbell')
  ) {
    return true;
  }

  if (isBarbell && (normName.includes('присед') || normName.includes('тяга') || normName.includes('стоя'))) {
    // Жим стоя / тяга в наклоне / приседания со штангой дают осевую нагрузку на позвоночник
    if (!normName.includes('лежа') && !normName.includes('наклонной скамье') && !normName.includes('сгибания')) {
      return true;
    }
  }

  if (isMachine && normName.includes('присед')) {
    return true;
  }

  return false;
}

function isKneeLoadingExercise(normName: string, normId: string): boolean {
  // Прыжковые, приседания, выпады, жимы ногами и разгибания коленей
  if (
    normName.includes('присед') ||
    normName.includes('squat') ||
    normName.includes('выпад') ||
    normName.includes('lunge') ||
    normName.includes('болгарск') ||
    normName.includes('жим ногами') ||
    normName.includes('leg press') ||
    normName.includes('разгибание ног') ||
    normName.includes('шаги на платформу') ||
    normName.includes('step_ups') ||
    normName.includes('стульчик у стены') ||
    normName.includes('выпрыгиван') ||
    normId.includes('squat') ||
    normId.includes('lunge') ||
    normId.includes('leg_press') ||
    normId.includes('leg_extensions') ||
    normId.includes('step_ups')
  ) {
    return true;
  }

  if (isPlyometricJumpExercise(normName, normId)) {
    return true;
  }

  return false;
}

function isShoulderLoadingExercise(
  normName: string,
  normId: string,
  normPrimaryMuscle: MuscleGroup | null
): boolean {
  // Прямые упражнения на переднюю/среднюю дельту или общий плечевой сустав (за исключением щадящих изометрических)
  if (
    normPrimaryMuscle === 'shoulders' ||
    normPrimaryMuscle === 'front_delts' ||
    normPrimaryMuscle === 'side_delts'
  ) {
    return true;
  }

  if (
    normName.includes('армейский жим') ||
    normName.includes('жим гантелей сидя') ||
    normName.includes('жим гантелей стоя') ||
    normName.includes('жим штанги стоя') ||
    normName.includes('жим штанги сидя') ||
    normName.includes('тяга штанги к подбородку') ||
    normName.includes('махи гантелями') ||
    normName.includes('подъем гантелей перед собой') ||
    normName.includes('подъем диска перед собой') ||
    normName.includes('отжимания на брусьях') ||
    normName.includes('обратные отжимания') ||
    normName.includes('отжимания уголком') ||
    normName.includes('pike') ||
    normName.includes('из-за головы') ||
    normName.includes('французский жим') ||
    normName.includes('пуловер') ||
    normId.includes('shoulder_press') ||
    normId.includes('overhead_press') ||
    normId.includes('upright_row') ||
    normId.includes('dips') ||
    normId.includes('overhead_dumbbell_tricep') ||
    normId.includes('skull_crusher') ||
    normId.includes('french_press') ||
    normId.includes('pullover')
  ) {
    return true;
  }

  return false;
}

function isDeepBendOrArchExercise(normName: string, normId: string): boolean {
  // Важно: не блокировать "на наклонной скамье" (это угол скамьи, а не наклон корпуса)
  const hasTorsoBend =
    normName.includes('в наклоне') ||
    normName.includes('боковые наклоны') ||
    normName.includes('наклоны на одной ноге') ||
    normName.includes('наклон корпуса');

  if (
    hasTorsoBend ||
    normName.includes('гиперэкстенз') ||
    normName.includes('становая тяга') ||
    normName.includes('румынская тяга') ||
    normName.includes('good morning') ||
    normName.includes('супермен') ||
    normName.includes('лодочка') ||
    normName.includes('hollow body') ||
    normName.includes('прогиб') ||
    normName.includes('кошка-корова') ||
    normName.includes('кошки-коровы') ||
    normName.includes('собака мордой вниз') ||
    normName.includes('величайшая растяжка') ||
    normName.includes('поза сфинкса') ||
    normId.includes('hyperextension') ||
    normId.includes('romanian_deadlift') ||
    normId.includes('good_morning') ||
    normId.includes('bent_over') ||
    normId.includes('side_bends') ||
    normId.includes('superman') ||
    normId.includes('boat_exercise')
  ) {
    return true;
  }

  return false;
}

function isPlyometricJumpExercise(normName: string, normId: string): boolean {
  // Явно щадящий вариант "Бёрпи без прыжка" не содержит прыжков
  if (normName.includes('без прыжка') || normId.includes('no_jump')) {
    return false;
  }

  if (
    normName.includes('прыж') ||
    normName.includes('выпрыгиван') ||
    normName.includes('скакалк') ||
    normName.includes('джампинг') ||
    normName.includes('jumping') ||
    normName.includes('бёрпи') ||
    normName.includes('берпи') ||
    normName.includes('бег на месте') ||
    normName.includes('высокое поднятие коленей') ||
    normId.includes('jump') ||
    normId.includes('burpee') ||
    normId.includes('jogging') ||
    normId.includes('high_knees')
  ) {
    return true;
  }

  return false;
}

export function matchesHealthRestrictions(
  exercise: Pick<
    ExerciseSafetyCandidate,
    'exerciseId' | 'name' | 'targetMuscle' | 'requiredEquipment'
  >,
  healthRestrictions?: string[]
): string[] {
  if (!Array.isArray(healthRestrictions) || healthRestrictions.length === 0) {
    return [];
  }

  const normName = normalizeSafetyToken(exercise.name);
  const normId = normalizeSafetyToken(exercise.exerciseId);
  const normPrimary = normalizeMuscleKeyPure(exercise.targetMuscle);
  const matched: string[] = [];

  for (const rawRestriction of healthRestrictions) {
    const restNorm = normalizeSafetyToken(rawRestriction);
    if (!restNorm) continue;

    if (
      (restNorm.includes('осев') || restNorm.includes('позвоночник')) &&
      isBarbellOrLoadedAxialExercise(normName, normId, exercise.requiredEquipment)
    ) {
      matched.push(rawRestriction);
      continue;
    }

    if (restNorm.includes('колен') && isKneeLoadingExercise(normName, normId)) {
      matched.push(rawRestriction);
      continue;
    }

    if (restNorm.includes('плеч') && isShoulderLoadingExercise(normName, normId, normPrimary)) {
      matched.push(rawRestriction);
      continue;
    }

    if (
      (restNorm.includes('наклон') || restNorm.includes('прогиб')) &&
      isDeepBendOrArchExercise(normName, normId)
    ) {
      matched.push(rawRestriction);
      continue;
    }

    if (
      (restNorm.includes('прыж') || restNorm.includes('ударн')) &&
      isPlyometricJumpExercise(normName, normId)
    ) {
      matched.push(rawRestriction);
    }
  }

  return matched;
}

export function evaluateExerciseSafety(
  exercise: ExerciseSafetyCandidate,
  context: SafetyUserContext
): ExerciseSafetyDecision {
  const vetoReasons: string[] = [];
  const advisories: string[] = [];

  // Базовая проверка Safety Guard (возраст, консервативный режим, боль, перерыв)
  const baseEval = evaluateSafetyGuard({
    age: context.age,
    targetMuscle: exercise.targetMuscle,
    painByMuscle: context.painByMuscle,
    generalPainLevel: context.generalPainLevel,
    daysSinceLastSession: context.daysSinceLastSession,
    hadRepDropRecently: context.hadRepDropRecently,
  });

  advisories.push(...baseEval.advisories);

  // Проверка возраста на некорректное значение (< 0 / NaN / Infinity)
  const ageProvided = context.age !== undefined && context.age !== null;
  const blockedByAge =
    ageProvided &&
    (typeof context.age !== 'number' || !Number.isFinite(context.age) || context.age < 0);
  if (blockedByAge) {
    vetoReasons.push(
      'Некорректное значение возраста в профиле — выполнение упражнений заблокировано до исправления данных.'
    );
  }

  // Проверка списка исключённых упражнений пользователя
  const blockedByExclusion = matchesExcludedExercise(exercise, context.excludedExercises);
  if (blockedByExclusion) {
    vetoReasons.push(`Упражнение «${exercise.name}» находится в списке исключённых.`);
  }

  // Проверка ограничений по здоровью пользователя
  const matchedRestrictions = matchesHealthRestrictions(exercise, context.healthRestrictions);
  const blockedByHealthRestriction = matchedRestrictions.length > 0;
  if (blockedByHealthRestriction) {
    vetoReasons.push(
      `Упражнение «${exercise.name}» противоречит ограничению: ${matchedRestrictions.join(', ')}.`
    );
  }

  // Проверка выраженной боли для целевой или вторичной мышечной группы / суставов
  let blockedByPain = false;
  const generalPain = context.generalPainLevel;
  if (typeof generalPain === 'number' && Number.isFinite(generalPain) && generalPain >= 3) {
    blockedByPain = true;
    vetoReasons.push(
      `Отмечена боль в суставах/связках (${generalPain}/10) — упражнение «${exercise.name}» заблокировано Safety Guard.`
    );
  } else if (
    context.painByMuscle &&
    typeof context.painByMuscle === 'object' &&
    !Array.isArray(context.painByMuscle)
  ) {
    const normPrimary = normalizeMuscleKeyPure(exercise.targetMuscle);
    const normSecondaries = (exercise.secondaryMuscles || [])
      .map((m) => normalizeMuscleKeyPure(m))
      .filter((m): m is MuscleGroup => m !== null);
    const affectedMuscles = new Set<MuscleGroup>([
      ...(normPrimary ? [normPrimary] : []),
      ...normSecondaries,
    ]);

    for (const [rawZone, rawLevel] of Object.entries(context.painByMuscle)) {
      if (typeof rawLevel !== 'number' || !Number.isFinite(rawLevel) || rawLevel < 2) continue;
      const normZone = normalizeMuscleKeyPure(rawZone);
      if (
        normZone === null ||
        affectedMuscles.size === 0 ||
        affectedMuscles.has(normZone)
      ) {
        blockedByPain = true;
        vetoReasons.push(
          `Отмечена боль в задействованной группе мышц (${rawLevel}/10) — упражнение «${exercise.name}» заблокировано Safety Guard.`
        );
        break;
      }
    }
  }

  // Лёгкая боль (1/10) — предупреждение (а повышение веса всё равно блокируется в evaluateSafetyGuard)
  if (!blockedByPain && baseEval.vetoReasons.length > 0 && !blockedByAge) {
    for (const reason of baseEval.vetoReasons) {
      if (!advisories.includes(reason)) {
        advisories.push(reason);
      }
    }
  }

  return {
    allowed: vetoReasons.length === 0,
    blockedByExclusion,
    blockedByHealthRestriction,
    blockedByPain,
    blockedByAge,
    matchedRestrictions,
    vetoReasons,
    advisories,
    conservativeMode: baseEval.conservativeMode,
    allowFailureSets: false,
  };
}

export function evaluateWorkoutLaunchSafety<T extends ExerciseSafetyCandidate>(
  exercises: T[],
  context: SafetyUserContext
): WorkoutLaunchSafetyEvaluation {
  const baseEval = evaluateSafetyGuard({
    age: context.age,
    painByMuscle: context.painByMuscle,
    generalPainLevel: context.generalPainLevel,
    daysSinceLastSession: context.daysSinceLastSession,
    hadRepDropRecently: context.hadRepDropRecently,
  });

  const vetoSet = new Set<string>();
  const advisorySet = new Set<string>(baseEval.advisories);
  const blockedExercises: WorkoutLaunchSafetyEvaluation['blockedExercises'] = [];
  const safeExercises: ExerciseSafetyCandidate[] = [];

  const ageProvided = context.age !== undefined && context.age !== null;
  const invalidAge =
    ageProvided &&
    (typeof context.age !== 'number' || !Number.isFinite(context.age) || context.age < 0);
  if (invalidAge) {
    vetoSet.add(
      'Некорректное значение возраста в профиле — запуск тренировки заблокирован до исправления данных.'
    );
  }

  if (
    typeof context.generalPainLevel === 'number' &&
    Number.isFinite(context.generalPainLevel) &&
    context.generalPainLevel >= 3
  ) {
    vetoSet.add(
      `Отмечена выраженная боль в суставах/связках (${context.generalPainLevel}/10) — тренировка заблокирована Safety Guard.`
    );
  }

  (exercises || []).forEach((ex, index) => {
    const decision = evaluateExerciseSafety(ex, context);
    decision.advisories.forEach((a) => advisorySet.add(a));
    if (!decision.allowed) {
      decision.vetoReasons.forEach((v) => vetoSet.add(v));
      blockedExercises.push({ index, exercise: ex, decision });
    } else {
      safeExercises.push(ex);
    }
  });

  return {
    allowed: vetoSet.size === 0 && blockedExercises.length === 0,
    conservativeMode: baseEval.conservativeMode,
    allowFailureSets: false,
    blockedExercises,
    safeExercises,
    vetoReasons: Array.from(vetoSet),
    advisories: Array.from(advisorySet),
  };
}

// ============================================================================
// Единая чистая проверка Safety Guard на основе снимка данных (CR-002 / CR-003)
// ============================================================================

export interface SafetyStorageSnapshot {
  profile?: Pick<UserProfile, 'age'> | null;
  userParameters?: Pick<
    UserFitnessParameters,
    'excludedExercises' | 'healthRestrictions'
  > | null;
  checkins?: WellbeingCheckin[];
  sessions?: WorkoutSession[];
  activeDraft?: WorkoutSession | null;
  customExercises?: FullExerciseItem[];
}

export interface ExerciseWeightCheckResult {
  evaluation: SafetyEvaluation;
  allowed: boolean;
  requiresUserConfirmation: boolean;
  canOverrideWithConfirmation: boolean;
  baselineBestWeightKg: number;
  vetoReasons: string[];
  advisories: string[];
  conservativeMode: boolean;
}

function getLatestRecentCheckinPure(
  checkins: WellbeingCheckin[],
  now: Date = new Date()
): WellbeingCheckin | null {
  if (!Array.isArray(checkins) || checkins.length === 0) return null;

  const recent = checkins
    .filter((c) => {
      if (!c || !c.date) return false;
      const daysAgo = getCalendarDaysAgo(c.date, now);
      return daysAgo !== null && daysAgo >= 0 && daysAgo <= 2;
    })
    .sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  return recent[0] || null;
}

function isPositionalIdPure(rawId?: string | null): boolean {
  if (!rawId) return true;
  return /^ex_\d+(_\d+)?$/i.test(rawId.trim());
}

export function buildSafetyContextFromData(
  data: SafetyStorageSnapshot,
  now: Date = new Date()
): SafetyUserContext {
  const profile = data.profile;
  const userParams = data.userParameters;
  const checkins = data.checkins || [];
  const sessions = data.sessions || [];

  const latestCheckin = getLatestRecentCheckinPure(checkins, now);

  const completedDates = sessions
    .filter((s) => s && s.status === 'completed' && Boolean(s.date))
    .map((s) => s.date)
    .sort((a, b) => b.localeCompare(a));

  const daysSinceLastSession =
    completedDates.length > 0 ? getCalendarDaysAgo(completedDates[0], now) : null;

  return {
    age: profile?.age,
    excludedExercises: Array.isArray(userParams?.excludedExercises)
      ? userParams.excludedExercises
      : [],
    healthRestrictions: Array.isArray(userParams?.healthRestrictions)
      ? userParams.healthRestrictions
      : [],
    generalPainLevel: latestCheckin?.jointPain,
    painByMuscle: latestCheckin?.painByMuscle,
    daysSinceLastSession:
      daysSinceLastSession !== null && daysSinceLastSession >= 0
        ? daysSinceLastSession
        : null,
  };
}

export function getExerciseProgressionStatsFromData(
  exercise: Pick<ExerciseSafetyCandidate, 'exerciseId' | 'name' | 'targetMuscle'>,
  data: SafetyStorageSnapshot,
  now: Date = new Date()
): {
  previousBestWeightKg: number;
  inProgressBestWeightKg: number;
  hadRepDropRecently: boolean;
  daysSinceLastExerciseSession: number | null;
} {
  const customExercises = data.customExercises || [];
  const sessions = data.sessions || [];
  const targetRawId = isPositionalIdPure(exercise.exerciseId)
    ? null
    : exercise.exerciseId?.trim() || null;
  const targetNormName = normalizeSafetyToken(exercise.name);
  const targetLookup = resolveExerciseInUnifiedCatalog(
    targetRawId,
    exercise.name,
    customExercises,
    exercise.targetMuscle
  );
  const targetNormMuscle = normalizeMuscleKeyPure(
    exercise.targetMuscle || targetLookup.entry?.primaryMuscle
  );
  const isAmbiguous =
    !targetRawId &&
    Boolean(targetNormName) &&
    resolveExerciseInUnifiedCatalog(null, exercise.name, customExercises, null).status ===
      'ambiguous_name';

  const matchesExerciseRecord = (ex: {
    exerciseId?: string | null;
    name?: string;
    targetMuscle?: string | null;
  }): boolean => {
    const exRawId = isPositionalIdPure(ex.exerciseId) ? null : ex.exerciseId?.trim() || null;
    const exLookup = resolveExerciseInUnifiedCatalog(
      exRawId,
      ex.name,
      customExercises,
      ex.targetMuscle
    );
    const exNormName = normalizeSafetyToken(ex.name);
    const exNormMuscle = normalizeMuscleKeyPure(
      ex.targetMuscle || exLookup.entry?.primaryMuscle
    );

    if (targetRawId && exRawId) {
      return targetRawId === exRawId;
    }
    if (targetLookup.entry && exLookup.entry) {
      return targetLookup.entry.id === exLookup.entry.id;
    }
    const nameMatch = Boolean(targetNormName) && exNormName === targetNormName;
    if (nameMatch && isAmbiguous && targetNormMuscle && exNormMuscle) {
      return targetNormMuscle === exNormMuscle;
    }
    return nameMatch;
  };

  const completedSessions = sessions
    .filter((s) => s && s.status === 'completed' && Array.isArray(s.exercises))
    .sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.completedAt || 0) - (a.completedAt || 0);
    });

  let previousBestWeightKg = 0;
  let lastExerciseDate: string | null = null;
  const sessionPerformances: Array<{
    bestWeight: number;
    totalReps: number;
    bestRepsAtTopWeight: number;
  }> = [];

  for (const s of completedSessions) {
    let matchedBestWeight = -1;
    let matchedTotalReps = 0;
    let matchedBestRepsAtTop = 0;
    let foundInSession = false;

    for (const ex of s.exercises) {
      if (!ex || ex.skipped || !Array.isArray(ex.sets)) continue;
      if (!matchesExerciseRecord(ex)) continue;

      const completedSets = ex.sets.filter(
        (st) =>
          st &&
          (st.completed === true || (st as any).done === true || (st as any).isDone === true) &&
          typeof st.weightKg === 'number' &&
          Number.isFinite(st.weightKg) &&
          st.weightKg >= 0
      );

      if (completedSets.length === 0) continue;

      foundInSession = true;
      for (const st of completedSets) {
        const w = st.weightKg || 0;
        const r = Number.isFinite(Number(st.reps)) ? Number(st.reps) : 0;
        if (w > previousBestWeightKg) previousBestWeightKg = w;
        if (w > matchedBestWeight) {
          matchedBestWeight = w;
          matchedBestRepsAtTop = r;
        } else if (w === matchedBestWeight && r > matchedBestRepsAtTop) {
          matchedBestRepsAtTop = r;
        }
        matchedTotalReps += r;
      }
    }

    if (foundInSession) {
      if (lastExerciseDate === null && s.date) {
        lastExerciseDate = s.date;
      }
      sessionPerformances.push({
        bestWeight: Math.max(0, matchedBestWeight),
        totalReps: matchedTotalReps,
        bestRepsAtTopWeight: matchedBestRepsAtTop,
      });
    }
  }

  let hadRepDropRecently = false;
  if (sessionPerformances.length >= 2) {
    const latest = sessionPerformances[0];
    const prior = sessionPerformances[1];
    if (
      latest.bestWeight <= prior.bestWeight &&
      (latest.bestRepsAtTopWeight < prior.bestRepsAtTopWeight ||
        latest.totalReps < prior.totalReps)
    ) {
      hadRepDropRecently = true;
    }
  }

  // Также учитываем уже заданный рабочий вес в активной / незавершённой сессии (CR-002)
  let inProgressBestWeightKg = 0;
  const inProgressSessions: WorkoutSession[] = [];
  if (data.activeDraft && Array.isArray(data.activeDraft.exercises)) {
    inProgressSessions.push(data.activeDraft);
  }
  for (const s of sessions) {
    if (s && s.status === 'in_progress' && Array.isArray(s.exercises)) {
      if (!data.activeDraft || s.id !== data.activeDraft.id) {
        inProgressSessions.push(s);
      }
    }
  }

  for (const s of inProgressSessions) {
    for (const ex of s.exercises) {
      if (!ex || ex.skipped || !Array.isArray(ex.sets)) continue;
      if (!matchesExerciseRecord(ex)) continue;
      for (const st of ex.sets) {
        if (
          st &&
          typeof st.weightKg === 'number' &&
          Number.isFinite(st.weightKg) &&
          st.weightKg > inProgressBestWeightKg
        ) {
          inProgressBestWeightKg = st.weightKg;
        }
      }
    }
  }

  const rawDaysAgo = lastExerciseDate ? getCalendarDaysAgo(lastExerciseDate, now) : null;
  const daysSinceLastExerciseSession =
    rawDaysAgo !== null && rawDaysAgo >= 0 ? rawDaysAgo : null;

  return {
    previousBestWeightKg,
    inProgressBestWeightKg,
    hadRepDropRecently,
    daysSinceLastExerciseSession,
  };
}

function enrichCandidateForSafety(
  exercise: ExerciseSafetyCandidate,
  customExercises: FullExerciseItem[] = []
): ExerciseSafetyCandidate {
  const needsLookup =
    !exercise.targetMuscle ||
    !exercise.requiredEquipment ||
    !exercise.secondaryMuscles ||
    exercise.secondaryMuscles.length === 0;
  if (!needsLookup) return exercise;

  const lookup = resolveExerciseInUnifiedCatalog(
    isPositionalIdPure(exercise.exerciseId) ? null : exercise.exerciseId,
    exercise.name,
    customExercises,
    exercise.targetMuscle
  ).entry;

  if (!lookup) return exercise;

  return {
    ...exercise,
    exerciseId: exercise.exerciseId || lookup.id,
    targetMuscle: exercise.targetMuscle || lookup.primaryMuscle,
    secondaryMuscles:
      exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0
        ? exercise.secondaryMuscles
        : lookup.secondaryMuscles,
    requiredEquipment: exercise.requiredEquipment || lookup.requiredEquipment,
    isBodyweight:
      exercise.isBodyweight !== undefined ? exercise.isBodyweight : lookup.isBodyweight,
  };
}

export function evaluateWeightIncreaseSafetyFromData(
  exercise: ExerciseSafetyCandidate,
  proposedWeightKg: number,
  currentSetWeightKg: number | undefined,
  data: SafetyStorageSnapshot,
  now: Date = new Date()
): ExerciseWeightCheckResult {
  const enrichedExercise = enrichCandidateForSafety(exercise, data.customExercises || []);
  const context = buildSafetyContextFromData(data, now);
  const {
    previousBestWeightKg,
    inProgressBestWeightKg,
    hadRepDropRecently,
    daysSinceLastExerciseSession,
  } = getExerciseProgressionStatsFromData(enrichedExercise, data, now);

  const baselineBest = Math.max(previousBestWeightKg, 0);
  const effectiveCurrent =
    typeof currentSetWeightKg === 'number' &&
    Number.isFinite(currentSetWeightKg) &&
    currentSetWeightKg > 0
      ? currentSetWeightKg
      : 0;
  // База сравнения прогрессии: завершённая история (>0), иначе уже установленный вес в текущей/незавершённой сессии
  const comparisonBase =
    baselineBest > 0 ? baselineBest : Math.max(effectiveCurrent, inProgressBestWeightKg);
  // Перерыв > 14 дней учитывается для упражнений с завершённой историей, а не для первого старта нового упражнения
  const effectiveBreakDays =
    baselineBest > 0 ? (daysSinceLastExerciseSession ?? context.daysSinceLastSession) : null;
  const effectiveRepDrop = baselineBest > 0 ? hadRepDropRecently : false;

  // 1. Проверяем невалидное предлагаемое значение веса
  if (
    typeof proposedWeightKg !== 'number' ||
    !Number.isFinite(proposedWeightKg) ||
    proposedWeightKg < 0
  ) {
    const evalBad = evaluateSafetyGuard({
      age: context.age,
      targetMuscle: enrichedExercise.targetMuscle,
      painByMuscle: context.painByMuscle,
      generalPainLevel: context.generalPainLevel,
      daysSinceLastSession: effectiveBreakDays,
      hadRepDropRecently: effectiveRepDrop,
      proposedWeightKg,
      previousBestWeightKg: comparisonBase > 0 ? comparisonBase : 1,
    });
    return {
      evaluation: evalBad,
      allowed: false,
      requiresUserConfirmation: false,
      canOverrideWithConfirmation: false,
      baselineBestWeightKg: baselineBest,
      vetoReasons: evalBad.vetoReasons,
      advisories: evalBad.advisories,
      conservativeMode: evalBad.conservativeMode,
    };
  }

  // 2. Жёсткие ограничения самого упражнения (исключения, здоровье, выраженная боль, невалидный возраст)
  const exerciseDecision = evaluateExerciseSafety(enrichedExercise, {
    ...context,
    daysSinceLastSession: effectiveBreakDays,
    hadRepDropRecently: effectiveRepDrop,
  });

  if (!exerciseDecision.allowed) {
    const passiveEval = evaluateSafetyGuard({
      age: context.age,
      targetMuscle: enrichedExercise.targetMuscle,
      painByMuscle: context.painByMuscle,
      generalPainLevel: context.generalPainLevel,
      daysSinceLastSession: effectiveBreakDays,
      hadRepDropRecently: effectiveRepDrop,
    });
    const mergedVetos = Array.from(
      new Set([...exerciseDecision.vetoReasons, ...passiveEval.vetoReasons])
    );
    return {
      evaluation: {
        ...passiveEval,
        allowWeightIncrease: false,
        requiresUserConfirmation: false,
        vetoReasons: mergedVetos,
      },
      allowed: false,
      requiresUserConfirmation: false,
      canOverrideWithConfirmation: false,
      baselineBestWeightKg: baselineBest,
      vetoReasons: mergedVetos,
      advisories: Array.from(
        new Set([...exerciseDecision.advisories, ...passiveEval.advisories])
      ),
      conservativeMode: passiveEval.conservativeMode,
    };
  }

  const isSettingInitialWeight = comparisonBase === 0 && proposedWeightKg > 0;
  const isIncreasingTargetSet = proposedWeightKg > effectiveCurrent;
  const isIncreasingAboveBaseline = comparisonBase > 0 && proposedWeightKg > comparisonBase;

  // 3. Снижение или сохранение уже установленного рабочего веса (<= comparisonBase и <= current) не является повышением
  if (!isSettingInitialWeight && !isIncreasingTargetSet && !isIncreasingAboveBaseline) {
    const passiveEval = evaluateSafetyGuard({
      age: context.age,
      targetMuscle: enrichedExercise.targetMuscle,
      painByMuscle: context.painByMuscle,
      generalPainLevel: context.generalPainLevel,
    });
    return {
      evaluation: passiveEval,
      allowed: true,
      requiresUserConfirmation: false,
      canOverrideWithConfirmation: false,
      baselineBestWeightKg: baselineBest,
      vetoReasons: [],
      advisories: passiveEval.advisories,
      conservativeMode: passiveEval.conservativeMode,
    };
  }

  // 4. Задание самого первого рабочего веса для нового упражнения (comparisonBase === 0)
  // Не должно блокироваться перерывом > 14 дней по другим упражнениям, но обязано учитывать боль и возраст.
  if (isSettingInitialWeight) {
    const firstWeightEval = evaluateSafetyGuard({
      age: context.age,
      targetMuscle: enrichedExercise.targetMuscle,
      painByMuscle: context.painByMuscle,
      generalPainLevel: context.generalPainLevel,
      daysSinceLastSession: null,
      hadRepDropRecently: false,
    });
    return {
      evaluation: firstWeightEval,
      allowed: firstWeightEval.allowWeightIncrease,
      requiresUserConfirmation: false,
      canOverrideWithConfirmation: false,
      baselineBestWeightKg: 0,
      vetoReasons: firstWeightEval.vetoReasons,
      advisories: firstWeightEval.advisories,
      conservativeMode: firstWeightEval.conservativeMode,
    };
  }

  // 5. Непосредственная проверка условий помимо скачка (боль, перерыв по этому упражнению, падение повторов, возраст)
  const nonJumpConditionEval = evaluateSafetyGuard({
    age: context.age,
    targetMuscle: enrichedExercise.targetMuscle,
    painByMuscle: context.painByMuscle,
    generalPainLevel: context.generalPainLevel,
    daysSinceLastSession: effectiveBreakDays,
    hadRepDropRecently: effectiveRepDrop,
  });

  // 6. Если есть база сравнения (completed > 0 или уже установленный вес в текущей/незавершённой сессии) и идёт рост выше базы
  const evaluation = isIncreasingAboveBaseline
    ? evaluateSafetyGuard({
        age: context.age,
        targetMuscle: enrichedExercise.targetMuscle,
        painByMuscle: context.painByMuscle,
        generalPainLevel: context.generalPainLevel,
        daysSinceLastSession: effectiveBreakDays,
        hadRepDropRecently: effectiveRepDrop,
        proposedWeightKg,
        previousBestWeightKg: comparisonBase,
      })
    : nonJumpConditionEval;

  // Подтверждение возможно ТОЛЬКО если единственная причина вето — аномальный скачок веса (>= 35%), без боли/перерыва/падения повторов/ошибки возраста/ограничений
  const canOverrideWithConfirmation =
    evaluation.requiresUserConfirmation && nonJumpConditionEval.vetoReasons.length === 0;

  return {
    evaluation,
    allowed: evaluation.allowWeightIncrease,
    requiresUserConfirmation: evaluation.requiresUserConfirmation,
    canOverrideWithConfirmation,
    baselineBestWeightKg: baselineBest,
    vetoReasons: evaluation.vetoReasons,
    advisories: evaluation.advisories,
    conservativeMode: evaluation.conservativeMode,
  };
}

export function evaluateWorkoutLaunchSafetyWithData<T extends ExerciseSafetyCandidate>(
  exercises: T[],
  data: SafetyStorageSnapshot,
  now: Date = new Date()
): WorkoutLaunchSafetyEvaluation {
  const customExercises = data.customExercises || [];
  const enrichedList = (exercises || []).map((ex) =>
    enrichCandidateForSafety(ex, customExercises)
  );
  const context = buildSafetyContextFromData(data, now);
  const baseEval = evaluateWorkoutLaunchSafety(enrichedList, context);

  const vetoSet = new Set<string>(baseEval.vetoReasons);
  const advisorySet = new Set<string>(baseEval.advisories);
  const blockedMap = new Map<
    number,
    { index: number; exercise: ExerciseSafetyCandidate; decision: ExerciseSafetyDecision }
  >();
  for (const b of baseEval.blockedExercises) {
    blockedMap.set(b.index, b);
  }
  const safeExercises: ExerciseSafetyCandidate[] = [];

  enrichedList.forEach((ex, index) => {
    const existingBlocked = blockedMap.get(index);
    const rawTargetW = ex.targetWeight;
    const hasInvalidTargetW =
      rawTargetW !== undefined &&
      rawTargetW !== null &&
      (typeof rawTargetW !== 'number' || !Number.isFinite(rawTargetW) || rawTargetW < 0);
    const hasPositiveLoadedTargetW =
      !ex.isBodyweight &&
      typeof rawTargetW === 'number' &&
      Number.isFinite(rawTargetW) &&
      rawTargetW > 0;

    let weightCheck: ExerciseWeightCheckResult | null = null;
    if (hasInvalidTargetW || hasPositiveLoadedTargetW) {
      weightCheck = evaluateWeightIncreaseSafetyFromData(
        ex,
        rawTargetW as number,
        undefined,
        data,
        now
      );
      weightCheck.advisories.forEach((a) => advisorySet.add(a));
    }

    if (weightCheck && !weightCheck.allowed) {
      const prevDecision =
        existingBlocked?.decision || evaluateExerciseSafety(ex, context);
      const mergedVetos = Array.from(
        new Set([...prevDecision.vetoReasons, ...weightCheck.vetoReasons])
      );
      mergedVetos.forEach((v) => vetoSet.add(v));
      blockedMap.set(index, {
        index,
        exercise: ex,
        decision: {
          ...prevDecision,
          allowed: false,
          blockedByWeight: true,
          vetoReasons: mergedVetos,
          advisories: Array.from(
            new Set([...prevDecision.advisories, ...weightCheck.advisories])
          ),
        },
      });
    } else if (!existingBlocked) {
      safeExercises.push(ex);
    }
  });

  const blockedExercises = Array.from(blockedMap.values()).sort(
    (a, b) => a.index - b.index
  );

  return {
    allowed: vetoSet.size === 0 && blockedExercises.length === 0,
    conservativeMode: baseEval.conservativeMode,
    allowFailureSets: false,
    blockedExercises,
    safeExercises,
    vetoReasons: Array.from(vetoSet),
    advisories: Array.from(advisorySet),
  };
}
