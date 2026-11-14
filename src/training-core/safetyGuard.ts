/**
 * ============================================================================
 * FORM Core — Safety Guard (Модуль безопасности с правом вето)
 * ============================================================================
 * Имеет право вето над любым повышением нагрузки или рекомендацией программы.
 * Никогда не рекомендует работу до отказа (RIR=0) и тренировки через боль.
 */

import { MuscleGroup } from '../types/workout';
import { TRAINING_ENGINE_CONFIG } from './config';
import { isConservativeAgeMode } from './coreMath';
import { normalizeMuscleKeyPure } from './muscles';

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
