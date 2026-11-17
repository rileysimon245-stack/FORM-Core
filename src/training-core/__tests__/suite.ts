/**
 * ============================================================================
 * FORM Core — Набор автотестов ядра (работает и в CLI через tsx, и в браузере)
 * ============================================================================
 */

import {
  classifySet,
  estimateEpley1RM,
  isConservativeAgeMode,
  calculateSportLoad,
  mapLegacySportIntensityToRpe,
  getBodyweightEquivalentKg,
  calculateSetLoad,
  calculateExerciseVolumeKg,
  calculateWorkoutMetrics,
} from '../coreMath';
import {
  evaluateSafetyGuard,
  evaluateExerciseSafety,
  evaluateWorkoutLaunchSafety,
  resolveWellbeingPainStatePure,
  buildSafetyContextFromData,
  HEALTH_RESTRICTION_PRESETS,
} from '../safetyGuard';
import {
  formatLocalIsoDate,
  parseIsoDateLocal,
  getStartOfIsoWeekLocal,
  isIsoDateInCurrentWeek,
  getCalendarDaysAgo,
} from '../dateUtils';
import { normalizeMuscleKeyPure, normalizeMuscleListPure } from '../muscles';
import {
  UNIFIED_BUILTIN_CATALOG,
  getUnifiedCatalog,
  findExerciseInUnifiedCatalog,
  resolveExerciseInUnifiedCatalog,
} from '../catalog';
import {
  validateAndMigrateBackup,
  safeGetJson,
  safeGetRaw,
  safeSetItem,
  safeRemoveItem,
  clearCorruptedLock,
  isKeyLockedByCorruption,
  getCorruptedKeys,
  isLocksIndexCorrupted,
  getLastWriteError,
  clearLastWriteError,
  captureStorageKeysSnapshot,
  restoreStorageKeysSnapshot,
  restoreStorageKeysSnapshotDetailed,
  hasPendingRollbackRecovery,
  getPendingRollbackKeys,
  retryPendingRollbackRecovery,
  getRollbackRecoveryState,
  resolveStartupRecoveryState,
  exportAllStorageRawSnapshot,
  resetRecoveryStateOnly,
  runSafeMigrations,
  resetMigrationSessionFlagForTests,
  executeProtectedStorageTransaction,
  CORRUPTED_RAW_PREFIX,
  CORRUPTED_LOCKS_INDEX_KEY,
  PENDING_ROLLBACK_KEY,
  ROLLBACK_SNAPSHOT_KEY,
  ROLLBACK_SNAPSHOT_STAGING_KEY,
  type SafeWriteResult,
} from '../../services/migrations';
import {
  StorageService,
  resolveInitialExerciseSets,
  resolveSessionBodyWeightKg,
} from '../../services/storage';
import {
  checkWorkoutLaunchSafety,
  checkAddExerciseSafety,
  checkWeightIncreaseSafety,
} from '../../services/safetyContext';
import {
  generateLocalTemplateProgram,
  isEquipmentAvailable,
  validateProgramExerciseCandidate,
} from '../../services/programGenerator';
import { STRENGTH_PROGRAMS, MOBILITY_PROGRAMS } from '../../data/directionsCatalog';
import { FullExerciseItem } from '../../data/exerciseTypes';
import { ActivityIntensity } from '../../types/workout';

export interface TestCaseResult {
  name: string;
  group: string;
  passed: boolean;
  details: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runTrainingCoreTestSuite(): TestSuiteSummary {
  const results: TestCaseResult[] = [];

  const test = (group: string, name: string, fn: () => string | void) => {
    try {
      const info = fn();
      results.push({
        group,
        name,
        passed: true,
        details: info || 'OK',
      });
    } catch (err: any) {
      results.push({
        group,
        name,
        passed: false,
        details: err?.message || String(err),
      });
    }
  };

  // 1. Зачётные подходы (RIR 0..3 рабочий)
  test('Подходы и RIR', 'Зачётный рабочий подход с RIR 1..3', () => {
    const r2 = classifySet({ completed: true, setType: 'working', rir: 2, weightKg: 60, reps: 8 });
    assert(r2.isCounted === true && r2.status === 'counted', 'RIR=2 должен засчитываться');
    assert(r2.isFailure === false, 'RIR=2 не является отказом');
    return 'RIR=2 засчитан как рабочий подход';
  });

  test('Подходы и RIR', 'Подход до отказа (RIR=0) засчитывается, но помечается isFailure', () => {
    const r0 = classifySet({ completed: true, setType: 'working', rir: 0, weightKg: 60, reps: 8 });
    assert(r0.isCounted === true && r0.isFailure === true, 'RIR=0 должен иметь isCounted и isFailure');
    return 'RIR=0 засчитан с предупреждением';
  });

  test('Подходы и RIR', 'Разминочный и лёгкий подход (RIR 4+) не входят в зачётный объём', () => {
    const warmup = classifySet({ completed: true, setType: 'warmup', rir: 2 });
    const easy = classifySet({ completed: true, setType: 'working', rir: 4 });
    assert(!warmup.isCounted && warmup.status === 'warmup', 'Разминка не должна засчитываться');
    assert(!easy.isCounted && easy.status === 'too_easy_working', 'RIR 4+ не должен засчитываться');
    return 'Разминка и RIR 4+ исключены';
  });

  test('Подходы и RIR', 'Старые подходы без RIR помечаются unrated_legacy («без оценки»)', () => {
    const legacy = classifySet({ completed: true, weightKg: 50, reps: 10 });
    assert(!legacy.isCounted && legacy.status === 'unrated_legacy', 'Без RIR нельзя засчитать стимул');
    return 'Подход без RIR не придумывает оценку';
  });

  // 2. Формула Эпли 1ПМ
  test('Оценка 1ПМ (Эпли)', 'Считается для 1..10 повторений с пометкой оценки', () => {
    const est5 = estimateEpley1RM(100, 5);
    assert(est5.status === 'estimated' && est5.isEstimate === true, 'Должна быть оценка');
    assert(est5.valueKg === 116.7, `Ожидалось 116.7, получено ${est5.valueKg}`);

    const est1 = estimateEpley1RM(100, 1);
    assert(est1.status === 'estimated' && est1.valueKg === 100, '1 повторение = рабочий вес');
    return `100×5 -> ~${est5.valueKg} кг (оценка)`;
  });

  test('Оценка 1ПМ (Эпли)', 'Не применяется при >10 повторений или нулевом весе', () => {
    const over10 = estimateEpley1RM(60, 11);
    assert(over10.status === 'out_of_epley_range' && over10.valueKg === null, '>10 не должно считать Эпли');

    const bw = estimateEpley1RM(0, 15);
    assert(bw.status === 'insufficient_data' && bw.valueKg === null, '0 кг не должно считать Эпли');
    return 'Для >10 повторений и 0 кг формула отключена';
  });

  // 3. Возрастной консервативный режим и Safety Guard
  test('Safety Guard', 'Консервативный режим включается при возрасте < 18 или не указанном возрасте', () => {
    assert(isConservativeAgeMode(0) === true, 'Возраст 0 -> консервативный режим');
    assert(isConservativeAgeMode(null) === true, 'Возраст null -> консервативный режим');
    assert(isConservativeAgeMode(16) === true, 'Возраст 16 -> консервативный режим');
    assert(isConservativeAgeMode(18) === false, 'Возраст 18 -> обычный режим');
    return 'Порог 18 лет соблюдён';
  });

  test('Safety Guard', 'Вето при боли, перерыве >14 дней и падении повторений', () => {
    const painRes = evaluateSafetyGuard({ age: 25, targetMuscle: 'chest', painByMuscle: { chest: 2 } });
    assert(painRes.allowWeightIncrease === false && painRes.allowFailureSets === false, 'Боль должна блокировать рост веса');

    const breakRes = evaluateSafetyGuard({ age: 25, daysSinceLastSession: 15 });
    assert(breakRes.allowWeightIncrease === false, 'Перерыв 15 дн. должен блокировать рост веса');

    const dropRes = evaluateSafetyGuard({ age: 25, hadRepDropRecently: true });
    assert(dropRes.allowWeightIncrease === false, 'Падение повторов должно блокировать рост веса');

    return 'Все 3 условия вето сработали';
  });

  test('Safety Guard', 'Аномальный скачок веса требует подтверждения пользователя', () => {
    const jump = evaluateSafetyGuard({
      age: 25,
      previousBestWeightKg: 100,
      proposedWeightKg: 140,
    });
    assert(jump.requiresUserConfirmation === true && jump.allowWeightIncrease === false, '100->140 требует подтверждения');

    const safeStep = evaluateSafetyGuard({
      age: 25,
      previousBestWeightKg: 100,
      proposedWeightKg: 105,
    });
    assert(safeStep.allowWeightIncrease === true && safeStep.requiresUserConfirmation === false, '100->105 разрешено');
    return 'Защита от случайного ввода (+40%) активна';
  });

  // 4. Календарные даты и границы недели без смещения часового пояса
  test('Календарь и неделя', 'Понедельник 2026-11-09 попадает в текущую неделю при расчёте 2026-11-12', () => {
    const refNow = new Date(2026, 10, 12, 10, 0, 0); // Чт 12 ноября 2026 (локальное время)
    const mondayInWeek = isIsoDateInCurrentWeek('2026-11-09', refNow);
    const sundayPrevWeek = isIsoDateInCurrentWeek('2026-11-08', refNow);
    const startMon = formatLocalIsoDate(getStartOfIsoWeekLocal(refNow));

    assert(startMon === '2026-11-09', `Начало недели должно быть 2026-11-09, получено ${startMon}`);
    assert(mondayInWeek === true, 'Понедельник 2026-11-09 обязан попадать в неделю');
    assert(sundayPrevWeek === false, 'Воскресенье 2026-11-08 не должно попадать в текущую неделю');
    assert(parseIsoDateLocal('2026-02-31') === null, 'Несуществующая дата 31 фев должна отклоняться');
    assert(getCalendarDaysAgo('2026-11-09', refNow) === 3, 'Разница 12.11 - 09.11 = 3 дня');
    return 'Граница Пн 2026-11-09 корректна независимо от TZ';
  });

  // 5. Нормализация мышц и единый каталог
  test('Каталог и мышцы', 'Устранены старые псевдонимы мышц (rearDelts, core, abductors, upper_back)', () => {
    assert(normalizeMuscleKeyPure('rearDelts') === 'rear_delts', 'rearDelts -> rear_delts');
    assert(normalizeMuscleKeyPure('core') === 'abs', 'core -> abs');
    assert(normalizeMuscleKeyPure('upper_back') === 'traps_mid', 'upper_back -> traps_mid');
    assert(normalizeMuscleKeyPure('abductors') === 'glutes', 'abductors -> glutes');
    assert(normalizeMuscleKeyPure('adductors') === 'quads_medialis', 'adductors -> quads_medialis');
    assert(normalizeMuscleKeyPure('rotator_cuff') === 'rear_delts', 'rotator_cuff -> rear_delts');
    const dedup = normalizeMuscleListPure(['rearDelts', 'rear_delts', 'triceps']);
    assert(dedup.length === 2 && dedup[0] === 'rear_delts', 'Дубликаты должны убираться');
    return 'Все 6 несовпадавших ключей сопоставлены';
  });

  test('Каталог и мышцы', 'Единый каталог сохраняет вторичные мышцы всех 181+ упражнений', () => {
    assert(UNIFIED_BUILTIN_CATALOG.length >= 181, `Каталог должен содержать >=181 упр., сейчас ${UNIFIED_BUILTIN_CATALOG.length}`);
    const pushupsClassic = findExerciseInUnifiedCatalog('pushups_classic', 'Отжимания классические');
    assert(pushupsClassic !== null, 'Отжимания классические должны находиться по ID/имени');
    assert(
      pushupsClassic!.secondaryMuscles.includes('triceps') &&
        pushupsClassic!.secondaryMuscles.includes('shoulders'),
      'Вторичные мышцы из полного каталога не должны теряться'
    );
    return `Единый каталог: ${UNIFIED_BUILTIN_CATALOG.length} упражнений без потери мышц`;
  });

  // 6. Нагрузка спорта и валидация резервной копии
  test('Спорт и миграции', 'Спортивная нагрузка считается как длительность × RPE без умножения на 20 кг', () => {
    const box = calculateSportLoad({ durationMinutes: 60, rpe: 8 });
    assert(box.loadUnits === 480 && !box.isLegacyMapping, '60 мин × RPE 8 = 480 у.е.');
    const legacy = calculateSportLoad({ durationMinutes: 40, legacyIntensity: 'medium' });
    assert(legacy.loadUnits === 240 && legacy.isLegacyMapping === true, 'Старый формат должен помечаться');
    return `Бокс 60 мин × RPE 8 = ${box.loadUnits} у.е.`;
  });

  test('Спорт и миграции', 'Валидатор импорта отклоняет битый JSON и мигрирует rearDelts', () => {
    const bad = validateAndMigrateBackup('{broken json');
    assert(bad.valid === false, 'Битый JSON должен быть отклонён');

    const ok = validateAndMigrateBackup(
      JSON.stringify({
        workouts: [
          {
            id: 's1',
            date: '2026-11-10',
            name: 'Спина',
            status: 'completed',
            exercises: [
              {
                id: 'e1',
                exerciseId: 'ex_0',
                name: 'Отжимания классические',
                targetMuscle: 'chest',
                secondaryMuscles: ['rearDelts'],
                isBodyweight: true,
                sets: [],
                restSeconds: 60,
              },
            ],
          },
        ],
      })
    );
    assert(ok.valid === true, 'Корректный backup должен приниматься');
    const migratedEx = ok.normalized?.workouts?.[0]?.exercises?.[0];
    assert(
      Boolean(
        migratedEx?.exerciseId === 'pushups_classic' &&
          migratedEx?.secondaryMuscles?.includes('rear_delts')
      ),
      'Миграция должна восстановить ID каталога и заменить rearDelts -> rear_delts'
    );
    return 'Валидация и неразрушающая миграция работают корректно';
  });

  // === ДОПОЛНИТЕЛЬНЫЕ ТЕСТЫ ШАГА 1.1 ===

  // 7. Граничные и некорректные значения RIR
  test('Подходы и RIR (Шаг 1.1)', 'Отрицательный, дробный, NaN, Infinity и строковый RIR отклоняются без засчёта отказа', () => {
    const invalidInputs: unknown[] = [-1, -Infinity, Infinity, Number.NaN, 0.4, 3.4, 3.6, '2'];
    for (const badRir of invalidInputs) {
      const res = classifySet({ completed: true, setType: 'working', rir: badRir as any, weightKg: 60, reps: 8 });
      assert(
        res.status === 'invalid_rir' && res.isCounted === false && res.isFailure === false,
        `RIR=${String(badRir)} должен отклоняться как invalid_rir, получено status=${res.status}, isCounted=${res.isCounted}, isFailure=${res.isFailure}`
      );
    }
    return `Все ${invalidInputs.length} некорректных значений RIR безопасно отклонены`;
  });

  // 8. Строгая валидация calculateSportLoad
  test('Спорт и нагрузка (Шаг 1.1)', 'Невалидный RPE (0, -5, 15, NaN) не откатывается к legacy, Infinity/отрицание длительности отклоняется', () => {
    const rpe0 = calculateSportLoad({ durationMinutes: 60, rpe: 0, legacyIntensity: 'high' });
    assert(!rpe0.isValid && rpe0.loadUnits === 0 && !rpe0.isLegacyMapping, 'RPE=0 не должен откатываться к legacy');

    const rpeNeg = calculateSportLoad({ durationMinutes: 60, rpe: -5, legacyIntensity: 'high' });
    assert(!rpeNeg.isValid && rpeNeg.loadUnits === 0, 'RPE=-5 должен отклоняться');

    const rpe15 = calculateSportLoad({ durationMinutes: 60, rpe: 15, legacyIntensity: 'low' });
    assert(!rpe15.isValid && rpe15.loadUnits === 0, 'RPE=15 должен отклоняться');

    const rpeNaN = calculateSportLoad({ durationMinutes: 60, rpe: Number.NaN, legacyIntensity: 'medium' });
    assert(!rpeNaN.isValid && rpeNaN.loadUnits === 0, 'RPE=NaN должен отклоняться');

    const durInf = calculateSportLoad({ durationMinutes: Infinity, rpe: 7 });
    assert(!durInf.isValid && Number.isFinite(durInf.loadUnits) && durInf.loadUnits === 0, 'Infinity duration не должен давать Infinity');

    const durNeg = calculateSportLoad({ durationMinutes: -20, rpe: 7 });
    assert(!durNeg.isValid && durNeg.loadUnits === 0, 'Отрицательная длительность должна отклоняться');

    assert(mapLegacySportIntensityToRpe('high') === 8 && mapLegacySportIntensityToRpe('low') === 4, 'Legacy helper работает для старых записей');
    return 'calculateSportLoad защищён от невалидных RPE/duration и Infinity';
  });

  // 9. Safety Guard: боль без targetMuscle, нормализация ключей, NaN, шаг > 5% и консервативный режим
  test('Safety Guard (Шаг 1.1)', 'Боль без targetMuscle, старый ключ rearDelts и неизвестная зона блокируют рост веса', () => {
    const noTarget = evaluateSafetyGuard({ age: 25, painByMuscle: { chest: 2 } });
    assert(noTarget.allowWeightIncrease === false, 'Боль в painByMuscle без targetMuscle должна блокировать рост');

    const legacyPain = evaluateSafetyGuard({
      age: 25,
      targetMuscle: 'rear_delts',
      painByMuscle: { rearDelts: 3 },
    });
    assert(legacyPain.allowWeightIncrease === false, 'painByMuscle["rearDelts"] должен нормализоваться к rear_delts');

    const unknownZone = evaluateSafetyGuard({
      age: 25,
      targetMuscle: 'chest',
      painByMuscle: { unknown_zone: 2 },
    });
    assert(unknownZone.allowWeightIncrease === false, 'Боль в неизвестной зоне должна блокировать рост');

    return 'Проверка боли работает с нормализацией и без targetMuscle';
  });

  test('Safety Guard (Шаг 1.1)', 'NaN/неполные числа блокируют, шаг >5% (+20%) блокируется в обычном и консервативном режимах', () => {
    const nanAge = evaluateSafetyGuard({ age: Number.NaN, previousBestWeightKg: 100, proposedWeightKg: 105 });
    assert(nanAge.allowWeightIncrease === false, 'NaN age не должен обходить блокировку');

    const nanDays = evaluateSafetyGuard({ age: 25, daysSinceLastSession: Number.NaN });
    assert(nanDays.allowWeightIncrease === false, 'NaN daysSinceLastSession должен блокироваться');

    const nanWeight = evaluateSafetyGuard({ age: 25, previousBestWeightKg: 100, proposedWeightKg: Number.NaN });
    assert(nanWeight.allowWeightIncrease === false, 'NaN weight должен блокироваться');

    const step20Adult = evaluateSafetyGuard({ age: 25, previousBestWeightKg: 100, proposedWeightKg: 120 });
    assert(
      step20Adult.allowWeightIncrease === false && step20Adult.requiresUserConfirmation === false,
      '+20% (100->120) должно блокировать allowWeightIncrease'
    );

    const step35Adult = evaluateSafetyGuard({ age: 25, previousBestWeightKg: 100, proposedWeightKg: 135 });
    assert(
      step35Adult.allowWeightIncrease === false && step35Adult.requiresUserConfirmation === true,
      '+35% (100->135) должно требовать подтверждения'
    );

    const minorStep20 = evaluateSafetyGuard({ age: 16, previousBestWeightKg: 100, proposedWeightKg: 120 });
    assert(
      minorStep20.conservativeMode === true && minorStep20.allowWeightIncrease === false,
      'В консервативном режиме (16 лет) +20% должно блокироваться'
    );

    const missingAgeStep10 = evaluateSafetyGuard({ previousBestWeightKg: 100, proposedWeightKg: 110 });
    assert(
      missingAgeStep10.conservativeMode === true && missingAgeStep10.allowWeightIncrease === false,
      'При отсутствии возраста +10% должно блокироваться'
    );

    const multi = evaluateSafetyGuard({
      age: 25,
      targetMuscle: 'chest',
      painByMuscle: { chest: 2 },
      daysSinceLastSession: 20,
      hadRepDropRecently: true,
      previousBestWeightKg: 100,
      proposedWeightKg: 120,
    });
    assert(multi.vetoReasons.length >= 4, `Ожидались все независимые причины вето, получено ${multi.vetoReasons.length}`);

    return 'Шаг >5%, NaN и все независимые вето работают корректно';
  });

  // 10. Каталог: одноимённые упражнения и 198 позиций
  test('Каталог и мышцы (Шаг 1.1)', '4 пары одноимённых упражнений не затирают друг друга и корректно разрешаются', () => {
    assert(UNIFIED_BUILTIN_CATALOG.length >= 198, `Ожидалось >= 198 упражнений, сейчас ${UNIFIED_BUILTIN_CATALOG.length}`);
    const uniqueIds = new Set(UNIFIED_BUILTIN_CATALOG.map((e) => e.id));
    assert(uniqueIds.size === UNIFIED_BUILTIN_CATALOG.length, 'Найдены дубликаты ID в каталоге');

    // По точному ID обе версии доступны
    assert(findExerciseInUnifiedCatalog('dumbbell_pullover')?.primaryMuscle === 'chest', 'dumbbell_pullover -> chest');
    assert(findExerciseInUnifiedCatalog('dumbbell_pullover_back')?.primaryMuscle === 'lats', 'dumbbell_pullover_back -> lats');
    assert(findExerciseInUnifiedCatalog('hammer_curls')?.primaryMuscle === 'biceps', 'hammer_curls -> biceps');
    assert(findExerciseInUnifiedCatalog('hammer_curls_forearms')?.primaryMuscle === 'forearms', 'hammer_curls_forearms -> forearms');
    assert(findExerciseInUnifiedCatalog('reverse_lunges_quads')?.primaryMuscle === 'quads', 'reverse_lunges_quads -> quads');
    assert(findExerciseInUnifiedCatalog('reverse_lunges_glutes')?.primaryMuscle === 'glutes', 'reverse_lunges_glutes -> glutes');
    assert(findExerciseInUnifiedCatalog('step_ups_box')?.id === 'step_ups_box', 'step_ups_box найден по ID');
    assert(findExerciseInUnifiedCatalog('step_ups_functional')?.id === 'step_ups_functional', 'step_ups_functional найден по ID');

    // По неоднозначному имени без ID и уточнения -> явная неоднозначность (null)
    const ambPullover = resolveExerciseInUnifiedCatalog(undefined, 'Пуловер с гантелью');
    assert(ambPullover.status === 'ambiguous_name' && ambPullover.entry === null && ambPullover.matches.length === 2, 'Голое имя Пуловер с гантелью должно быть неоднозначным');

    // Уточнение по целевой мышце разрешает неоднозначность
    const latsPullover = findExerciseInUnifiedCatalog(undefined, 'Пуловер с гантелью', [], 'lats');
    assert(latsPullover?.id === 'dumbbell_pullover_back', 'С targetMuscle=lats выбирается dumbbell_pullover_back');

    return `198+ уникальных ID, 4 пары дубликатов имён безопасно разделены`;
  });

  // 11. Календарные даты при смене дня/DST и локальном времени
  test('Календарь и неделя (Шаг 1.1)', 'Парсинг и форматирование локальных дат устойчивы к DST и позднему вечеру', () => {
    const dstDate = parseIsoDateLocal('2026-11-01', 12);
    assert(dstDate !== null && formatLocalIsoDate(dstDate!) === '2026-11-01', 'Дата DST 2026-11-01 не должна сдвигаться');

    // Поздний вечер воскресенья 2026-11-15 23:30 локального времени (в UTC это уже пн 16-го в отрицательных TZ)
    const lateSunday = new Date(2026, 10, 15, 23, 30, 0);
    assert(formatLocalIsoDate(lateSunday) === '2026-11-15', 'Локальное воскресенье 23:30 не должно сдвигаться на следующий день');
    assert(formatLocalIsoDate(getStartOfIsoWeekLocal(lateSunday)) === '2026-11-09', 'Для воскресенья 2026-11-15 23:30 начало недели = 2026-11-09');
    assert(isIsoDateInCurrentWeek('2026-11-15', lateSunday) === true, 'Воскресенье 2026-11-15 входит в свою неделю');
    assert(isIsoDateInCurrentWeek('2026-11-16', lateSunday) === false, 'Понедельник 2026-11-16 не входит в прошлую неделю');
    return 'DST и поздний вечер воскресенья считаются точно в локальном календаре';
  });

  // 12. Резервные копии: customExercises, settings, частичный импорт, валидация типов
  test('Спорт и миграции (Шаг 1.1)', 'validateAndMigrateBackup проверяет customExercises, settings и старые копии', () => {
    const invalidCustom = validateAndMigrateBackup(
      JSON.stringify({ customExercises: [{ id: '', name: 'Bad', primaryMuscle: 'chest' }] })
    );
    assert(invalidCustom.valid === false, 'Пустой id customExercise должен отклоняться');

    const invalidSettings = validateAndMigrateBackup(
      JSON.stringify({ settings: { weightUnit: 'stones' } })
    );
    assert(invalidSettings.valid === false, 'Некорректный enum в settings должен отклоняться');

    const validFull = validateAndMigrateBackup(
      JSON.stringify({
        customExercises: [
          {
            id: 'custom_1',
            name: 'Моя тяга',
            primaryMuscle: 'upper_back',
            secondaryMuscles: ['rearDelts'],
            isBodyweight: false,
            requiredEquipment: 'dumbbells_adjustable',
            difficulty: 'Средний',
            type: 'Изоляция',
            homeFriendly: true,
            defaultSets: 3,
            defaultReps: 12,
            defaultWeight: 14,
            defaultRestSeconds: 60,
            technique: 'Техника',
            alternatives: [],
          },
        ],
        settings: { weightUnit: 'lbs', autoRestTimer: false },
      })
    );
    assert(validFull.valid === true, 'Корректные customExercises и settings должны приниматься');
    assert(validFull.normalized?.customExercises?.[0]?.primaryMuscle === 'traps_mid', 'Мышца customExercise нормализуется');
    assert(validFull.normalized?.settings?.weightUnit === 'lbs' && validFull.normalized?.settings?.autoRestTimer === false, 'Настройки сохраняются');
    return 'Валидация customExercises и settings работает';
  });

  // 13. Защита от перезаписи повреждённого JSON + полный цикл StorageService в изолированном хранилище
  test('Защита данных и карантин (Шаг 1.1)', 'Повреждённый ключ блокирует обычную перезапись; экспорт/импорт/миграция не теряют данные', () => {
    // 13a. Тест блокировки перезаписи повреждённого ключа (безопасно через изолированный временный ключ)
    const testKey = '__form_test_corrupt_lock__';
    clearCorruptedLock(testKey);
    safeRemoveItem(testKey);

    // Запись валидна до повреждения, затем симулируем битый JSON на testKey (если localStorage доступен)
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(testKey, '{broken_json');
        const readBack = safeGetJson<any[]>(testKey, [], { expectArray: true });
        assert(Array.isArray(readBack) && readBack.length === 0, 'При битом JSON возвращается fallback []');
        assert(isKeyLockedByCorruption(testKey) === true, 'Повреждённый ключ должен быть заблокирован');
        assert(safeGetRaw(`${CORRUPTED_RAW_PREFIX}${testKey}`) === '{broken_json', 'Сырой JSON должен лежать в карантине');

        const blockedWrite = safeSetItem(testKey, JSON.stringify([{ id: 'new' }]));
        assert(blockedWrite.ok === false, 'Обычная запись поверх повреждённого ключа обязана быть заблокирована');
        assert(safeGetRaw(testKey) === '{broken_json', 'Исходный повреждённый ключ НЕ должен перезаписываться');

        const forcedRestore = safeSetItem(testKey, JSON.stringify([{ id: 'restored' }]), { allowOverwriteCorrupted: true });
        assert(forcedRestore.ok === true && isKeyLockedByCorruption(testKey) === false, 'Явное восстановление снимает блокировку');
      } finally {
        clearCorruptedLock(testKey);
        safeRemoveItem(testKey);
      }
    }

    // 13b. В Node/CLI (где globalThis.localStorage отсутствует) прогоняем полный e2e цикл StorageService на mock localStorage
    const hadNativeStorage = typeof globalThis !== 'undefined' && 'localStorage' in globalThis;
    if (!hadNativeStorage) {
      const store = new Map<string, string>();
      const mockStorage: Storage = {
        get length() {
          return store.size;
        },
        clear() {
          store.clear();
        },
        getItem(k: string) {
          return store.has(k) ? store.get(k)! : null;
        },
        key(index: number) {
          return Array.from(store.keys())[index] ?? null;
        },
        removeItem(k: string) {
          store.delete(k);
        },
        setItem(k: string, v: string) {
          store.set(k, String(v));
        },
      };
      (globalThis as any).localStorage = mockStorage;
      resetMigrationSessionFlagForTests();
      try {
        // Симулируем битые workouts и проверяем что saveWorkoutSession НЕ затрёт их
        mockStorage.setItem('form_schema_version_v1', '11');
        mockStorage.setItem('form_workout_sessions', '{corrupt_workouts');
        const sessions = StorageService.getWorkoutSessions();
        assert(sessions.length === 0, 'Битый JSON тренировок даёт []');
        StorageService.saveWorkoutSession({
          id: 'w_new',
          name: 'Тест',
          date: '2026-11-12',
          startTime: '10:00',
          status: 'completed',
          durationMinutes: 30,
          totalVolumeKg: 500,
          completedSets: 3,
          exercises: [],
        });
        assert(
          mockStorage.getItem('form_workout_sessions') === '{corrupt_workouts',
          'saveWorkoutSession НЕ должен затирать повреждённый ключ form_workout_sessions!'
        );

        // Полный экспорт/импорт customExercises + settings + частичный импорт
        mockStorage.clear();
        resetMigrationSessionFlagForTests();
        mockStorage.setItem('form_schema_version_v1', '11');
        StorageService.updateProfile({ name: 'Антон', age: 25 });
        StorageService.updateSettings({ weightUnit: 'lbs', autoRestTimer: false });
        StorageService.saveCustomExercise({
          id: 'c_ex_1',
          name: 'Моё упражнение',
          nameEn: 'Custom Ex',
          categoryKey: 'chest',
          categoryNameRu: 'Грудь',
          subCategory: 'Моё',
          primaryMuscle: 'chest',
          secondaryMuscles: ['triceps'],
          isBodyweight: false,
          requiredEquipment: 'dumbbells_adjustable',
          equipmentNameRu: 'Гантели',
          location: 'both',
          difficulty: 'Средний',
          type: 'Базовое (многосуставное)',
          homeFriendly: true,
          defaultSets: 3,
          defaultReps: 10,
          defaultWeight: 20,
          defaultRestSeconds: 90,
          technique: 'Плавно',
          alternatives: [],
          isCustom: true,
        });

        const exported = StorageService.exportBackupJson();
        StorageService.resetAllData();
        assert(StorageService.getCustomExercises().length === 0, 'После resetAllData упражнения очищены');
        assert(StorageService.importBackupJson(exported) === true, 'Импорт полной копии должен пройти');
        assert(StorageService.getCustomExercises().length === 1 && StorageService.getCustomExercises()[0].id === 'c_ex_1', 'customExercises восстановились');
        assert(StorageService.getSettings().weightUnit === 'lbs' && StorageService.getSettings().autoRestTimer === false, 'settings восстановились');

        // Частичный импорт не должен стирать отсутствующие разделы
        const partialOk = StorageService.importBackupJson(JSON.stringify({ profile: { name: 'Борис', age: 30 } }));
        assert(partialOk === true, 'Частичный импорт валиден');
        assert(StorageService.getProfile().name === 'Борис', 'Профиль обновился');
        assert(StorageService.getCustomExercises().length === 1, 'Незатронутые customExercises сохранились после частичного импорта');
        assert(StorageService.getSettings().weightUnit === 'lbs', 'Незатронутые settings сохранились после частичного импорта');

        // Идемпотентность повторной миграции старой схемы + совместимость со старой резервной копией
        mockStorage.clear();
        resetMigrationSessionFlagForTests();
        mockStorage.setItem(
          'form_workout_sessions',
          JSON.stringify([
            {
              id: 'legacy_s1',
              date: '2026-10-01',
              name: 'Старая тренировка',
              status: 'completed',
              exercises: [
                {
                  id: 'e_old',
                  exerciseId: 'ex_1',
                  name: 'Отжимания классические',
                  targetMuscle: 'rearDelts',
                  secondaryMuscles: ['core'],
                  isBodyweight: true,
                  sets: [{ setNumber: 1, weightKg: 0, reps: 15, completed: true }],
                  restSeconds: 60,
                },
              ],
            },
          ])
        );
        const keysForMig = {
          PROFILE: 'form_user_profile',
          PROGRAMS: 'form_workout_programs',
          WORKOUTS: 'form_workout_sessions',
          SPORTS_SESSIONS: 'form_sports_sessions_v1',
          WEEKLY_SCHEDULE: 'form_weekly_schedule_v1',
          CUSTOM_ACTIVITY: 'form_activity_days',
          EQUIPMENT: 'form_user_equipment_v1',
          FITNESS_PARAMS: 'form_fitness_parameters_v1',
        };
        runSafeMigrations(keysForMig);
        const afterFirst = mockStorage.getItem('form_workout_sessions');
        resetMigrationSessionFlagForTests();
        runSafeMigrations(keysForMig);
        const afterSecond = mockStorage.getItem('form_workout_sessions');
        assert(afterFirst === afterSecond, 'Повторный прогон миграции должен быть идемпотентным');
        const parsedMig = JSON.parse(afterSecond!);
        assert(parsedMig[0].exercises[0].targetMuscle === 'rear_delts', 'Миграция перевела rearDelts -> rear_delts');
        assert(mockStorage.getItem('form_backup_pre_v11') !== null, 'Создан снимок pre-v11 перед миграцией');
      } finally {
        resetMigrationSessionFlagForTests();
        delete (globalThis as any).localStorage;
      }
    }

    return 'Блокировка перезаписи, экспорт/импорт, частичный импорт и идемпотентная миграция подтверждены';
  });

  // === ДОПОЛНИТЕЛЬНЫЕ ТЕСТЫ ШАГА 1.2 (Надёжность и интеграция) ===

  const withIsolatedMockStorage = (
    fn: (
      store: Map<string, string>,
      setFailRule: (rule: ((key: string, val: string) => boolean) | null) => void,
      setRemoveFailRule: (rule: ((key: string) => boolean) | null) => void
    ) => void
  ): boolean => {
    const hadNativeStorage = typeof globalThis !== 'undefined' && 'localStorage' in globalThis;
    if (hadNativeStorage) {
      return false;
    }
    const store = new Map<string, string>();
    let failRule: ((key: string, val: string) => boolean) | null = null;
    let removeFailRule: ((key: string) => boolean) | null = null;
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(k: string) {
        if (removeFailRule && removeFailRule(k)) {
          const err: any = new Error(`Simulated removeItem failure on ${k}`);
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        }
        store.delete(k);
      },
      setItem(k: string, v: string) {
        const strVal = String(v);
        if (failRule && failRule(k, strVal)) {
          const err: any = new Error('Simulated QuotaExceededError');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        }
        store.set(k, strVal);
      },
    };
    (globalThis as any).localStorage = mockStorage;
    resetMigrationSessionFlagForTests();
    try {
      fn(
        store,
        (rule) => {
          failRule = rule;
        },
        (rule) => {
          removeFailRule = rule;
        }
      );
    } finally {
      resetMigrationSessionFlagForTests();
      delete (globalThis as any).localStorage;
    }
    return true;
  };

  // 14. Карантин не записался из-за QuotaExceededError + симуляция полного перезапуска
  test('Надёжность хранения (Шаг 1.2)', 'Блокировка повреждённого ключа сохраняется после перезапуска, даже если карантин не записался', () => {
    const ranMock = withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      store.set('form_workout_sessions', '{broken_workouts_payload');
      // Запрещаем запись сырой карантинной копии (QuotaExceededError), но индекс блокировки разрешаем
      setFailRule((k) => k.startsWith(CORRUPTED_RAW_PREFIX));

      const readRes = StorageService.getWorkoutSessions();
      assert(Array.isArray(readRes) && readRes.length === 0, 'Битый JSON должен вернуть []');
      assert(
        store.get(`${CORRUPTED_RAW_PREFIX}form_workout_sessions`) === undefined,
        'Карантинная копия по условию теста не должна была записаться'
      );
      assert(
        store.get(CORRUPTED_LOCKS_INDEX_KEY)?.includes('form_workout_sessions') === true,
        'Индекс блокировок form_corrupted_locks_v1 обязан сохранить ключ'
      );
      assert(
        (getLastWriteError() || '').includes('карантин'),
        'Ошибка записи карантина должна фиксироваться в getLastWriteError, а не проглатываться'
      );

      // Симулируем полный перезапуск приложения (очистка модульного кэша без очистки localStorage)
      setFailRule(null);
      resetMigrationSessionFlagForTests();

      assert(
        isKeyLockedByCorruption('form_workout_sessions') === true,
        'После перезапуска ключ обязан оставаться заблокированным через form_corrupted_locks_v1'
      );
      assert(
        getCorruptedKeys().includes('form_workout_sessions'),
        'getCorruptedKeys() должен видеть заблокированный ключ после перезапуска'
      );

      const writeRes = StorageService.saveWorkoutSession({
        id: 'w_blocked',
        name: 'Не должен затереть',
        date: '2026-11-12',
        startTime: '12:00',
        status: 'completed',
        durationMinutes: 40,
        totalVolumeKg: 1000,
        completedSets: 4,
        exercises: [],
      });
      assert(writeRes.ok === false && Boolean(writeRes.error), 'Обычная запись поверх заблокированного ключа должна вернуть { ok: false, error }');
      assert(
        store.get('form_workout_sessions') === '{broken_workouts_payload',
        'Повреждённые исходные данные обязаны остаться нетронутыми'
      );
    });

    if (!ranMock && typeof localStorage !== 'undefined') {
      const testKey = '__form_test_persist_lock__';
      clearCorruptedLock(testKey);
      safeRemoveItem(testKey);
      try {
        localStorage.setItem(testKey, '{broken_idx');
        safeGetJson(testKey, [], { expectArray: true });
        localStorage.removeItem(`${CORRUPTED_RAW_PREFIX}${testKey}`);
        assert(
          (localStorage.getItem(CORRUPTED_LOCKS_INDEX_KEY) || '').includes(testKey),
          'Персистентный индекс должен хранить блокировку без карантинной копии'
        );
        assert(isKeyLockedByCorruption(testKey) === true, 'Ключ должен оставаться заблокированным');
      } finally {
        clearCorruptedLock(testKey);
        safeRemoveItem(testKey);
      }
    }

    return 'Защита ключа при сбое карантина сохраняется после перезапуска';
  });

  // 15. Атомарный импорт резервной копии и полный откат при ошибке одного из ключей
  test('Надёжность хранения (Шаг 1.2)', 'importBackupJsonWithResult откатывает все ключи при частичной ошибке записи', () => {
    const ranMock = withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Исходный Игрок', age: 28 });
      StorageService.saveProgram({
        id: 'orig_prog',
        name: 'Исходная программа',
        description: 'Base',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: false,
        createdAt: '2026-11-12T10:00:00.000Z',
      });
      StorageService.saveWorkoutSession({
        id: 'orig_w1',
        name: 'Исходная тренировка',
        date: '2026-11-10',
        startTime: '18:00',
        status: 'completed',
        durationMinutes: 50,
        totalVolumeKg: 2400,
        completedSets: 8,
        exercises: [],
      });

      const origProfileRaw = store.get('form_user_profile');
      const origProgramsRaw = store.get('form_workout_programs');
      const origWorkoutsRaw = store.get('form_workout_sessions');

      const newBackup = JSON.stringify({
        profile: { name: 'Новый Игрок', age: 31 },
        programs: [{ id: 'new_prog', name: 'Новая программа', description: '', goal: 'Сила', daysPerWeek: 2, workouts: [] }],
        workouts: [{ id: 'new_w1', name: 'Новая тренировка', date: '2026-11-12', startTime: '19:00', status: 'completed', durationMinutes: 30, totalVolumeKg: 500, completedSets: 3, exercises: [] }],
      });

      // Ломаем запись второго ключа (programs) после успешной записи первого (profile)
      setFailRule((k) => k === 'form_workout_programs');

      const importRes = StorageService.importBackupJsonWithResult(newBackup);
      setFailRule(null);

      assert(importRes.ok === false && Boolean(importRes.error), 'Импорт при ошибке одного ключа обязан вернуть ok: false');
      assert(StorageService.getLastWriteError() !== null, 'Ошибка импорта должна быть доступна через getLastWriteError');
      assert(store.get('form_user_profile') === origProfileRaw, 'Первый перезаписанный ключ profile должен быть откачен');
      assert(store.get('form_workout_programs') === origProgramsRaw, 'Неудачный ключ programs должен остаться исходным');
      assert(store.get('form_workout_sessions') === origWorkoutsRaw, 'Третий ключ workouts должен остаться исходным');
    });

    if (!ranMock) {
      const badJsonRes = StorageService.importBackupJsonWithResult('{invalid');
      assert(badJsonRes.ok === false && Boolean(badJsonRes.error), 'Невалидный JSON в браузере должен отклоняться');
    }

    return 'Атомарный откат при сбое импорта сохраняет целостность всех разделов';
  });

  // 16. Согласованность спортивной нагрузки: превью vs StorageService.saveSportSession
  test('Единые расчёты и каталог (Шаг 1.2)', 'Превью SportSessionModal и сохранение saveSportSession используют идентичную формулу', () => {
    const cases: Array<{ duration: number; rpe?: number; intensity: ActivityIntensity }> = [
      { duration: 60, rpe: 8, intensity: 'high' },
      { duration: 45, rpe: 5, intensity: 'medium' },
      { duration: 90, intensity: 'high' },
      { duration: 30, rpe: 3, intensity: 'low' },
    ];

    for (const c of cases) {
      const usedRpe = c.rpe ?? mapLegacySportIntensityToRpe(c.intensity);
      const preview = calculateSportLoad({
        durationMinutes: c.duration,
        rpe: usedRpe,
        legacyIntensity: c.intensity,
      });
      assert(preview.isValid, 'Тестовый кейс должен быть валидным');

      withIsolatedMockStorage((store) => {
        store.set('form_schema_version_v1', '11');
        const res = StorageService.saveSportSession({
          id: `sp_${c.duration}_${usedRpe}`,
          sportType: 'boxing',
          title: 'Бокс',
          date: '2026-11-12',
          startTime: '19:00',
          plannedDurationMinutes: c.duration,
          actualDurationMinutes: c.duration,
          intensity: c.intensity,
          rpe: usedRpe,
          status: 'completed',
        });
        assert(res.ok === true, 'Валидная спортивная сессия должна сохраняться');
        const saved = StorageService.getSportSessions()[0];
        assert(
          saved.loadScore === preview.loadUnits,
          `Расхождение превью (${preview.loadUnits}) и сохранённого loadScore (${saved.loadScore})`
        );
      });
    }

    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const invalidSave = StorageService.saveSportSession({
        id: 'sp_invalid',
        sportType: 'running',
        title: 'Битый бег',
        date: '2026-11-12',
        startTime: '10:00',
        plannedDurationMinutes: -10,
        actualDurationMinutes: -10,
        intensity: 'medium',
        rpe: 15,
        status: 'completed',
      });
      assert(invalidSave.ok === false, 'Невалидный RPE/duration обязан возвращать { ok: false }');
      assert(StorageService.getSportSessions().length === 0, 'Невалидная сессия не должна записываться');
    });

    return 'Превью и сохранённый loadScore совпадают на 100%, невалидный ввод отклонён';
  });

  // 17. Пользовательские упражнения в едином каталоге
  test('Единые расчёты и каталог (Шаг 1.2)', 'Пользовательские упражнения (customExercises) находятся через единый каталог по ID и имени', () => {
    const customItem: FullExerciseItem = {
      id: 'custom_landmine_press',
      name: 'Жим в тренажёре Смита в наклоне (свой)',
      nameEn: 'Custom Landmine Press',
      categoryKey: 'chest',
      categoryNameRu: 'Грудь',
      subCategory: 'Моё упражнение',
      primaryMuscle: 'chest_upper',
      secondaryMuscles: ['shoulders_front', 'triceps'],
      isBodyweight: false,
      requiredEquipment: 'barbell',
      equipmentNameRu: 'Штанга',
      location: 'gym',
      difficulty: 'Сложный',
      type: 'Базовое (многосуставное)',
      homeFriendly: false,
      defaultSets: 4,
      defaultReps: 10,
      defaultWeight: 40,
      defaultRestSeconds: 90,
      technique: 'Плавный жим вверх',
      alternatives: [],
      isCustom: true,
    };

    const unified = getUnifiedCatalog([customItem]);
    assert(
      unified.some((u) => u.id === customItem.id && u.isCustom),
      'getUnifiedCatalog обязан включать пользовательские упражнения'
    );

    const byId = findExerciseInUnifiedCatalog(customItem.id, customItem.name, [customItem]);
    assert(byId !== null && byId.primaryMuscle === 'chest_upper' && byId.difficulty === 'Сложный', 'Поиск по ID возвращает customExercise');

    const byName = findExerciseInUnifiedCatalog(undefined, customItem.name, [customItem]);
    assert(byName !== null && byName.id === customItem.id && byName.secondaryMuscles.includes('triceps'), 'Поиск по имени возвращает customExercise и все его мышцы');

    return 'Пользовательские упражнения без потерь резолвятся в едином каталоге';
  });

  // 18. Отказ записи saveWorkoutSession сохраняет черновик и не красит день в completed
  test('Надёжность хранения (Шаг 1.2)', 'Сбой saveWorkoutSession возвращает ошибку, сохраняет черновик и не отмечает день как выполненный', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      const draftRes = StorageService.saveActiveDraft({
        id: 'draft_1',
        name: 'Незавершённая тренировка',
        date: '2026-11-13',
        startTime: '18:00',
        durationMinutes: 25,
        totalVolumeKg: 0,
        completedSets: 2,
        status: 'in_progress',
        exercises: [],
      });
      assert(draftRes.ok === true, 'Черновик должен сохраниться до сбоя');

      // Имитируем переполнение памяти при записи завершённой тренировки
      setFailRule((k) => k === 'form_workout_sessions');
      const saveRes = StorageService.saveWorkoutSession({
        id: 'draft_1',
        name: 'Незавершённая тренировка',
        date: '2026-11-13',
        startTime: '18:00',
        durationMinutes: 25,
        totalVolumeKg: 1200,
        completedSets: 4,
        status: 'completed',
        exercises: [],
      });
      setFailRule(null);

      assert(saveRes.ok === false && Boolean(saveRes.error), 'saveWorkoutSession должен вернуть { ok: false, error }');
      assert(StorageService.getActiveDraft() !== null, 'Черновик НЕ должен удаляться при неудачном сохранении');
      assert(
        StorageService.getActivityMap()['2026-11-13'] !== 'completed',
        'День НЕ должен отмечаться completed при ошибке записи тренировки'
      );
      assert(StorageService.getLastWriteError() !== null, 'Ошибка сохранения должна отражаться в getLastWriteError');
    });

    return 'При ошибке записи черновик цел, а день не отмечен зелёным';
  });

  // 19. Управление данными и диагностика (export / health / corrupted / import / reset)
  test('Надёжность хранения (Шаг 1.2)', 'Экспорт, диагностика getStorageHealth, импорт и resetAllData работают согласованно', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Тест Диагностики', age: 27 });
      StorageService.saveProgram({
        id: 'p_diag',
        name: 'Программа Д',
        description: '',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: false,
        createdAt: '2026-11-12T10:00:00.000Z',
      });

      const exported = StorageService.exportBackupJson();
      assert(exported.includes('Программа Д'), 'Экспорт должен содержать созданную программу');

      // Имитируем повреждение программ и проверяем диагностику
      store.set('form_workout_programs', '{corrupted_prog');
      const healthBefore = StorageService.getStorageHealth();
      assert(
        healthBefore.corruptedKeys.includes('form_workout_programs'),
        'getStorageHealth должен показывать повреждённый ключ'
      );
      assert(healthBefore.programsCount === 0, 'При повреждении программ возвращается 0 без падения');

      // Отклонение некорректного импорта не сбрасывает ошибку и не снимает блокировку
      const badImp = StorageService.importBackupJsonWithResult('{not_json');
      assert(badImp.ok === false, 'Битый JSON не должен импортироваться');
      assert(StorageService.getStorageHealth().lastWriteError !== null, 'lastWriteError должен отражать отказ импорта');

      // Восстановление из валидного экспорта
      const goodImp = StorageService.importBackupJsonWithResult(exported);
      assert(goodImp.ok === true, 'Валидный импорт должен восстановиться и снять карантин');

      const healthAfter = StorageService.getStorageHealth();
      assert(healthAfter.corruptedKeys.length === 0, 'После валидного импорта карантин должен очиститься');
      assert(healthAfter.programsCount === 1, 'Программа должна восстановиться (count=1)');
      assert(healthAfter.lastWriteError === null && healthAfter.quotaOk === true, 'Ошибка записи должна очиститься');

      // Полный сброс
      const resetRes = StorageService.resetAllData();
      assert(resetRes.ok === true, 'resetAllData должен вернуть ok: true');
      clearLastWriteError();
      assert(StorageService.getPrograms().length === 0 && StorageService.getCorruptedKeys().length === 0, 'После resetAllData программы и блокировки очищены');
    });

    return 'Диагностика, восстановление карантина через импорт и полный сброс работают корректно';
  });

  // === ДОПОЛНИТЕЛЬНЫЕ ТЕСТЫ ШАГА 1.2.1 (Критическая сохранность данных и rollback) ===

  // 20. Ошибка удаления ключа при rollback (новый ключ не удаляется -> частичный откат не скрыт)
  test('Надёжность хранения (Шаг 1.2.1)', '1. Ошибка удаления нового ключа при rollback не скрывается и сохраняет данные для довосстановления', () => {
    withIsolatedMockStorage((store, setFailRule, setRemoveFailRule) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Исходный Профиль', age: 29 });
      const origProfileRaw = store.get('form_user_profile')!;
      assert(store.get('form_workout_programs') === undefined, 'Ключ programs изначально отсутствует');

      const backupJson = JSON.stringify({
        profile: { name: 'Новый', age: 30 },
        programs: [{ id: 'tmp_p', name: 'Временная программа', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [] }],
        workouts: [{ id: 'tmp_w', name: 'Сбойная тренировка', date: '2026-11-12', startTime: '10:00', status: 'completed', durationMinutes: 30, totalVolumeKg: 500, completedSets: 3, exercises: [] }],
      });

      // Ломаем запись 3-го ключа (workouts) и удаление нового ключа programs при откате
      setFailRule((k) => k === 'form_workout_sessions');
      setRemoveFailRule((k) => k === 'form_workout_programs');

      const res = StorageService.importBackupJsonWithResult(backupJson);
      setFailRule(null);
      setRemoveFailRule(null);

      assert(res.ok === false, 'Импорт должен завершиться ошибкой');
      assert(
        (res.error || '').includes('Частичный откат') && (res.error || '').includes('remove_new_key'),
        `Частичный откат удаления не должен скрываться, получено: ${res.error}`
      );
      assert(store.get('form_user_profile') === origProfileRaw, 'Исходный profile обязан восстановиться даже при ошибке удаления другого ключа');
      assert(StorageService.hasPendingRecovery() === true, 'Состояние отложенного восстановления должно сохраниться');

      const retryRes = StorageService.retryPendingRecovery();
      assert(retryRes.ok === true, 'Повторное восстановление должно успешно удалить временный ключ programs');
      assert(store.get('form_workout_programs') === undefined, 'После повторного восстановления лишний ключ programs удалён');
      assert(StorageService.hasPendingRecovery() === false, 'Флаг незавершённого отката должен очиститься');
    });

    return 'Ошибка удаления при rollback честно фиксируется и доочищается при повторном восстановлении';
  });

  // 21. Ошибка записи исходного значения при rollback (данные не теряются безвозвратно)
  test('Надёжность хранения (Шаг 1.2.1)', '2. Ошибка записи исходного значения при rollback не скрывается и позволяет восстановиться позже', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Ценный Профиль', age: 33 });
      StorageService.saveWorkoutSession({
        id: 'orig_w_sec',
        name: 'Базовая',
        date: '2026-11-10',
        startTime: '18:00',
        status: 'completed',
        durationMinutes: 45,
        totalVolumeKg: 1500,
        completedSets: 5,
        exercises: [],
      });

      const origProfileRaw = store.get('form_user_profile')!;
      const origWorkoutsRaw = store.get('form_workout_sessions')!;

      const backupJson = JSON.stringify({
        profile: { name: 'Перезаписанный', age: 99 },
        workouts: [{ id: 'new_w', name: 'Не влезла', date: '2026-11-13', startTime: '12:00', status: 'completed', durationMinutes: 20, totalVolumeKg: 200, completedSets: 1, exercises: [] }],
      });

      // Ломаем workouts при импорте И ломаем обратную запись origProfileRaw при rollback
      setFailRule(
        (k, val) =>
          k === 'form_workout_sessions' ||
          (k === 'form_user_profile' && val === origProfileRaw)
      );

      const res = StorageService.importBackupJsonWithResult(backupJson);
      assert(res.ok === false, 'Импорт с отказом отката должен вернуть ok: false');
      assert(
        (res.error || '').includes('Частичный откат') && (res.error || '').includes('restore_value'),
        `Ошибка восстановления исходного значения не должна скрываться: ${res.error}`
      );
      assert(store.get('form_workout_sessions') === origWorkoutsRaw, 'Ключ workouts остался нетронутым');
      assert(hasPendingRollbackRecovery() === true, 'Снимок исходного profile обязан сохраниться для повторного восстановления');
      assert(getPendingRollbackKeys().includes('form_user_profile'), 'Список ожидающих ключей должен содержать form_user_profile');

      setFailRule(null);
      const retry = retryPendingRollbackRecovery();
      assert(retry.ok === true, 'retryPendingRollbackRecovery должен вернуть ok: true');
      assert(store.get('form_user_profile') === origProfileRaw, 'Исходный profile должен полностью восстановиться');
      assert(hasPendingRollbackRecovery() === false, 'После успеха pending recovery очищается');
    });

    return 'Сбой восстановления исходного значения не скрывается и довосстанавливается через retry';
  });

  // 22. Ошибка восстановления карантинной копии (corruptedKeysSet и индекс всё равно восстанавливаются)
  test('Надёжность хранения (Шаг 1.2.1)', '3. Ошибка восстановления карантинной копии не мешает восстановить corruptedKeysSet и индекс блокировок', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      store.set('form_workout_programs', '{corrupted_programs_raw');
      StorageService.updateProfile({ name: 'Старый Профиль', age: 25 });
      const origProfileRaw = store.get('form_user_profile')!;

      // Обнаруживаем повреждение и переводим ключ в карантин
      StorageService.getPrograms();
      assert(isKeyLockedByCorruption('form_workout_programs') === true, 'Программы должны быть в карантине');

      const snapshots = captureStorageKeysSnapshot(['form_workout_programs', 'form_user_profile']);
      // Симулируем частичное расхождение (удаление карантина/индекса и изменение profile) + сбой памяти в сессии
      store.delete(`${CORRUPTED_RAW_PREFIX}form_workout_programs`);
      store.delete(CORRUPTED_LOCKS_INDEX_KEY);
      store.set('form_user_profile', JSON.stringify({ name: 'Изменённый', age: 40 }));
      resetMigrationSessionFlagForTests();

      // Запрещаем запись карантинной копии при rollback
      setFailRule((k) => k === `${CORRUPTED_RAW_PREFIX}form_workout_programs`);
      const rb = restoreStorageKeysSnapshotDetailed(snapshots);
      setFailRule(null);

      assert(rb.ok === false, 'restoreStorageKeysSnapshotDetailed обязан вернуть ok: false при сбое карантина');
      assert(
        rb.failedDetails.some((d) => d.key === 'form_workout_programs' && d.stage === 'restore_quarantine'),
        'Ошибка restore_quarantine должна быть зафиксирована'
      );
      assert(store.get('form_user_profile') === origProfileRaw, 'Profile должен откатиться');
      assert(store.get('form_workout_programs') === '{corrupted_programs_raw', 'Сырой битый ключ сохранён');
      assert(isKeyLockedByCorruption('form_workout_programs') === true, 'corruptedKeysSet в памяти должен восстановиться независимо от карантина');
      assert(
        (store.get(CORRUPTED_LOCKS_INDEX_KEY) || '').includes('form_workout_programs'),
        'Индекс блокировок должен восстановиться даже при ошибке записи карантина'
      );

      // После повторного запуска блокировка сохраняется через индекс
      resetMigrationSessionFlagForTests();
      assert(isKeyLockedByCorruption('form_workout_programs') === true, 'Блокировка сохранена после перезапуска');
    });

    return 'При сбое карантина corruptedKeysSet, исходный ключ и индекс блокировок восстановлены';
  });

  // 23. Ошибка persistCorruptedLock при rollback
  test('Надёжность хранения (Шаг 1.2.1)', '4. Ошибка persistCorruptedLock при rollback возвращает allRestored = false и сохраняет блокировку в памяти', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      store.set('form_workout_sessions', '{broken_sessions_payload');
      StorageService.getWorkoutSessions();
      assert(isKeyLockedByCorruption('form_workout_sessions') === true, 'Ключ заблокирован до снимка');

      const snapshots = captureStorageKeysSnapshot(['form_workout_sessions']);
      // Сбрасываем индекс и RAM-кэш, затем ломаем запись CORRUPTED_LOCKS_INDEX_KEY при откате
      store.delete(CORRUPTED_LOCKS_INDEX_KEY);
      resetMigrationSessionFlagForTests();

      setFailRule((k) => k === CORRUPTED_LOCKS_INDEX_KEY);
      const allRestored = restoreStorageKeysSnapshot(snapshots);
      setFailRule(null);

      assert(allRestored === false, 'restoreStorageKeysSnapshot не имеет права возвращать true при сбое persistCorruptedLock');
      assert(isKeyLockedByCorruption('form_workout_sessions') === true, 'Память corruptedKeysSet обязана удержать блокировку');
      assert(hasPendingRollbackRecovery() === true, 'Должен сохраниться pending recovery для довосстановления индекса');

      const retry = retryPendingRollbackRecovery();
      assert(retry.ok === true, 'Повторное восстановление должно дописать индекс блокировок');
      assert(
        (store.get(CORRUPTED_LOCKS_INDEX_KEY) || '').includes('form_workout_sessions'),
        'Индекс блокировок восстановлен после устранения сбоя'
      );
    });

    return 'Ошибка persistCorruptedLock честно делает allRestored = false с возможностью retry';
  });

  // 24. Одновременная невозможность записи карантина и индекса
  test('Надёжность хранения (Шаг 1.2.1)', '5. Одновременный отказ записи карантина и индекса блокирует перезапись в текущей сессии и фиксирует обе ошибки', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      store.set('form_workout_sessions', '{double_failure_payload');

      // Блокируем одновременно и карантин, и индекс блокировок
      setFailRule((k) => k.startsWith(CORRUPTED_RAW_PREFIX) || k === CORRUPTED_LOCKS_INDEX_KEY);
      const readRes = StorageService.getWorkoutSessions();
      setFailRule(null);

      assert(Array.isArray(readRes) && readRes.length === 0, 'Повреждённый JSON должен безопасно вернуть []');
      assert(store.get(`${CORRUPTED_RAW_PREFIX}form_workout_sessions`) === undefined, 'Карантин не записан по условию теста');
      assert(store.get(CORRUPTED_LOCKS_INDEX_KEY) === undefined, 'Индекс блокировок не записан по условию теста');
      assert(isKeyLockedByCorruption('form_workout_sessions') === true, 'В памяти ключ обязан быть заблокирован');
      const err = getLastWriteError() || '';
      assert(err.includes('карантин') && err.includes('индекс'), `getLastWriteError должен сообщать об обеих проблемах: ${err}`);

      const writeRes = StorageService.saveWorkoutSession({
        id: 'w_df',
        name: 'Не пройдёт',
        date: '2026-11-12',
        startTime: '14:00',
        status: 'completed',
        durationMinutes: 20,
        totalVolumeKg: 400,
        completedSets: 2,
        exercises: [],
      });
      assert(writeRes.ok === false, 'Запись поверх ключа обязана быть отклонена');
      assert(store.get('form_workout_sessions') === '{double_failure_payload', 'Исходные данные не затёрты');
    });

    return 'Двойной сбой карантина и индекса удерживает защиту и отражается в диагностике';
  });

  // 25. Перезапуск после двойного сбоя и попытка записи
  test('Надёжность хранения (Шаг 1.2.1)', '6. Перезапуск после двойного сбоя: попытка записи без предварительного чтения НЕ затирает повреждённый ключ', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      store.set('form_weekly_schedule_v1', '{broken_schedule_double_fail');

      // 1-2-3. Чтение с одновременным отказом карантина и индекса
      setFailRule((k) => k.startsWith(CORRUPTED_RAW_PREFIX) || k === CORRUPTED_LOCKS_INDEX_KEY);
      StorageService.getWeeklySchedule();
      setFailRule(null);

      assert(store.get(`${CORRUPTED_RAW_PREFIX}form_weekly_schedule_v1`) === undefined, 'На диске нет карантина');
      assert(store.get(CORRUPTED_LOCKS_INDEX_KEY) === undefined, 'На диске нет индекса блокировок');

      // 4. Полный перезапуск приложения (очистка RAM кэша без потери localStorage)
      resetMigrationSessionFlagForTests();
      assert(getCorruptedKeys().length === 0, 'До чтения/записи RAM-кэш и пустой индекс ещё чисты');

      // 5. Приложение пытается записать новое расписание БЕЗ предварительного вызова getWeeklySchedule()
      const writeRes = StorageService.saveWeeklySchedule([
        { dayOfWeek: 0, dayName: 'Пн', fullDayName: 'Понедельник', activities: [] },
      ]);
      assert(writeRes.ok === false && Boolean(writeRes.error), 'Запись поверх битого ключа после перезапуска обязана вернуть ошибку');
      assert(
        store.get('form_weekly_schedule_v1') === '{broken_schedule_double_fail',
        'Повреждённые данные расписания обязаны остаться на диске нетронутыми'
      );
      assert(isKeyLockedByCorruption('form_weekly_schedule_v1') === true, 'Ключ должен автоматически взяться под блокировку');
    });

    return 'После перезапуска вслед за двойным сбоем слепая запись блокируется без потери данных';
  });

  // 26. Попытка записи повреждённого ключа без предварительного чтения across blind-write methods
  test('Надёжность хранения (Шаг 1.2.1)', '7. Все методы записи без предварительного чтения защищают повреждённые ключи от перезаписи и удаления', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      store.set('form_weekly_schedule_v1', '{bad_sched');
      store.set('form_user_equipment_v1', '{"not":"an_array"}');
      store.set('form_fitness_parameters_v1', '["not_an_object"]');
      store.set('form_active_workout_draft_v2', '{bad_draft');
      store.set('form_anatomy_reset_time', 'not_a_number');
      store.set('form_active_direction_v1', '{bad_direction');

      // Ни одного get* не вызывали; RAM-флаги пустые. Проверяем слепые записи и слепые удаления:
      const schedRes = StorageService.saveWeeklySchedule([]);
      const eqRes = StorageService.saveEquipmentList([]);
      const paramsRes = StorageService.saveUserParameters({
        goal: 'Сила' as any,
        level: 'Средний' as any,
        location: 'Зал' as any,
        daysPerWeek: 3,
        durationMinutes: 60,
        availableDays: [],
        preferredMuscles: [],
        excludedExercises: [],
        healthRestrictions: [],
        notes: '',
      });
      const draftRes = StorageService.saveActiveDraft({
        id: 'd_new',
        name: 'Новый черновик',
        date: '2026-11-12',
        startTime: '12:00',
        durationMinutes: 10,
        totalVolumeKg: 0,
        completedSets: 0,
        status: 'in_progress',
        exercises: [],
      });
      const clearDraftRes = StorageService.clearActiveDraft();
      const resetMuscleRes = StorageService.resetMuscleStats();
      const dirRes = StorageService.setActiveDirection('programs');

      assert(schedRes.ok === false && store.get('form_weekly_schedule_v1') === '{bad_sched', 'saveWeeklySchedule не должен перезаписывать битый ключ');
      assert(eqRes.ok === false && store.get('form_user_equipment_v1') === '{"not":"an_array"}', 'saveEquipmentList не должен перезаписывать не-массив');
      assert(paramsRes.ok === false && store.get('form_fitness_parameters_v1') === '["not_an_object"]', 'saveUserParameters не должен перезаписывать не-объект');
      assert(draftRes.ok === false && clearDraftRes.ok === false && store.get('form_active_workout_draft_v2') === '{bad_draft', 'draft нельзя перезаписать или удалить при повреждении');
      assert(resetMuscleRes.ok === false && store.get('form_anatomy_reset_time') === 'not_a_number', 'resetMuscleStats не должен перезаписывать битый timestamp');
      assert(dirRes.ok === false && store.get('form_active_direction_v1') === '{bad_direction', 'setActiveDirection не должен перезаписывать повреждённое значение');
    });

    return 'Все 6 ключей слепой записи и удаления защищены до первого чтения';
  });

  // 27. Повреждение самого индекса блокировок form_corrupted_locks_v1
  test('Надёжность хранения (Шаг 1.2.1)', '8. Повреждение индекса form_corrupted_locks_v1 не считается пустым, не затирается и блокирует запись', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      store.set(CORRUPTED_LOCKS_INDEX_KEY, '{broken_locks_index_json');
      store.set('form_workout_sessions', '{broken_ws');
      store.set('form_weekly_schedule_v1', '[]');

      assert(isLocksIndexCorrupted() === true, 'isLocksIndexCorrupted обязан распознать повреждение индекса');
      assert(getCorruptedKeys().includes(CORRUPTED_LOCKS_INDEX_KEY), 'getCorruptedKeys должен показывать повреждение самого индекса');
      assert(Boolean(getLastWriteError()), 'Повреждение индекса должно отражаться в getLastWriteError');

      // Чтение другого битого ключа НЕ должно молча перезаписывать повреждённый form_corrupted_locks_v1 новым массивом ["form_workout_sessions"]
      StorageService.getWorkoutSessions();
      assert(
        store.get(CORRUPTED_LOCKS_INDEX_KEY) === '{broken_locks_index_json',
        'Повреждённый form_corrupted_locks_v1 НЕ должен молча перезаписываться'
      );

      // Запись даже в внешне валидный ключ (form_weekly_schedule_v1) блокируется, т.к. мы не можем доверять повреждённому списку замков
      const blindWrite = StorageService.saveWeeklySchedule([]);
      assert(blindWrite.ok === false, 'При повреждённом индексе блокировок обычная запись должна быть заблокирована');

      // Частичный импорт (только profile) не должен удалять повреждённый индекс, пока на диске есть битый form_workout_sessions
      const partialImp = StorageService.importBackupJsonWithResult(JSON.stringify({ profile: { name: 'Иван', age: 28 } }));
      assert(partialImp.ok === false, 'При наличии других невосстановленных ключей индекс блокировок не должен сниматься молча');
      assert(store.get(CORRUPTED_LOCKS_INDEX_KEY) === '{broken_locks_index_json', 'Индекс сохранён до полного восстановления всех повреждённых ключей');

      // Полное восстановление обоих разделов подтверждает чистоту хранилища и безопасно снимает повреждённый индекс
      const fullRecovery = StorageService.importBackupJsonWithResult(
        JSON.stringify({ profile: { name: 'Иван', age: 28 }, workouts: [] })
      );
      assert(fullRecovery.ok === true, 'Полный валидный импорт всех повреждённых разделов должен успешно очистить индекс');
      assert(isLocksIndexCorrupted() === false && store.get(CORRUPTED_LOCKS_INDEX_KEY) === undefined, 'После полного восстановления повреждённый индекс очищен');
    });

    return 'Повреждённый индекс блокировок корректно защищён и снимается только после полной очистки';
  });

  // 28. Импорт с новыми ключами и последующим отказом записи
  test('Надёжность хранения (Шаг 1.2.1)', '9. Импорт с созданием новых ключей и сбоем последующего ключа удаляет новые и сохраняет исходные', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Оригинал', age: 22 });
      const origProfileRaw = store.get('form_user_profile')!;

      const backup = JSON.stringify({
        profile: { name: 'Обновлённый', age: 23 },
        programs: [{ id: 'new_p1', name: 'Новая П', description: '', goal: 'Масса', daysPerWeek: 3, workouts: [] }],
        workouts: [{ id: 'new_w1', name: 'Новая Т', date: '2026-11-12', startTime: '11:00', status: 'completed', durationMinutes: 40, totalVolumeKg: 1000, completedSets: 4, exercises: [] }],
        sports: [{ id: 'fail_s1', sportType: 'running', title: 'Бег', date: '2026-11-12', startTime: '08:00', plannedDurationMinutes: 30, actualDurationMinutes: 30, intensity: 'medium', rpe: 6, status: 'completed' }],
      });

      // Первые 3 ключа (profile, programs[новый], workouts[новый]) пишутся, 4-й (sports) падает
      setFailRule((k) => k === 'form_sports_sessions_v1');
      const res = StorageService.importBackupJsonWithResult(backup);
      setFailRule(null);

      assert(res.ok === false, 'Импорт должен отказать');
      assert(store.get('form_user_profile') === origProfileRaw, 'Исходный profile обязан восстановиться');
      assert(store.get('form_workout_programs') === undefined, 'Новый ключ programs обязан удалиться при откате');
      assert(store.get('form_workout_sessions') === undefined, 'Новый ключ workouts обязан удалиться при откате');
      assert(store.get('form_sports_sessions_v1') === undefined, 'Сбойный ключ sports не должен записаться');
    });

    return 'Новые ключи чисто удаляются при сбое, а старые возвращаются к исходному состоянию';
  });

  // 29. Повторное восстановление после частичного rollback (включая перезапуск через PENDING_ROLLBACK_KEY)
  test('Надёжность хранения (Шаг 1.2.1)', '10. Повторное восстановление после частичного rollback работает даже после перезапуска приложения', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'До Импорта', age: 30 });
      StorageService.saveProgram({
        id: 'p_keep',
        name: 'Моя Программа',
        description: '',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: true,
        createdAt: '2026-11-10T10:00:00.000Z',
      });
      const origProfileRaw = store.get('form_user_profile')!;
      const origProgramsRaw = store.get('form_workout_programs')!;

      const backup = JSON.stringify({
        profile: { name: 'Сбойный Импорт', age: 40 },
        programs: [{ id: 'p_new', name: 'Недозаписанная', description: '', goal: 'Сила', daysPerWeek: 2, workouts: [] }],
      });

      // Ломаем programs на импорте И ломаем откат profile на первом проходе rollback (но даём записаться PENDING_ROLLBACK_KEY)
      setFailRule(
        (k, val) =>
          k === 'form_workout_programs' ||
          (k === 'form_user_profile' && val === origProfileRaw)
      );
      const res = StorageService.importBackupJsonWithResult(backup);
      setFailRule(null);

      assert(res.ok === false, 'Импорт с частичным откатом должен вернуть ошибку');
      assert(store.get(PENDING_ROLLBACK_KEY) !== undefined, 'Должен записаться персистентный ключ ожидания отката');
      assert(store.get('form_workout_programs') === origProgramsRaw, 'Исходные программы не затёрты');

      // Симулируем полный перезапуск приложения (очистка RAM, сохранение store)
      resetMigrationSessionFlagForTests();
      assert(StorageService.hasPendingRecovery() === true, 'После перезапуска hasPendingRecovery() должен видеть незавершённый откат');

      const retryRes = StorageService.retryPendingRecovery();
      assert(retryRes.ok === true, 'Повторное восстановление после перезапуска обязано завершиться успехом');
      assert(store.get('form_user_profile') === origProfileRaw, 'Исходный profile восстановлен после перезапуска');
      assert(store.get(PENDING_ROLLBACK_KEY) === undefined, 'После полного восстановления form_pending_rollback_v1 удалён');
      assert(StorageService.hasPendingRecovery() === false, 'hasPendingRecovery() === false');
    });

    return 'Повторное восстановление после частичного rollback успешно завершается даже после рестарта';
  });

  // 30. Защита незавершённого rollback от повторного импорта
  test('Надёжность хранения (Шаг 1.2.1)', '11. Повторный импорт отклонён при незавершённом rollback и не затирает снимок восстановления', () => {
    withIsolatedMockStorage((store, setFailRule) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Исходный Пользователь', age: 27 });
      StorageService.saveProgram({
        id: 'p_orig',
        name: 'Исходная Программа',
        description: '',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: true,
        createdAt: '2026-11-10T10:00:00.000Z',
      });
      const origProfileRaw = store.get('form_user_profile')!;
      const origProgramsRaw = store.get('form_workout_programs')!;

      // 1. Создаём ситуацию: первый импорт падает на programs, а rollback падает на восстановлении profile
      const firstFailedBackup = JSON.stringify({
        profile: { name: 'Сбойный Первый', age: 41 },
        programs: [{ id: 'p_fail', name: 'Несохранённая', description: '', goal: 'Сила', daysPerWeek: 2, workouts: [] }],
      });

      setFailRule(
        (k, val) =>
          k === 'form_workout_programs' ||
          (k === 'form_user_profile' && val === origProfileRaw)
      );
      const firstRes = StorageService.importBackupJsonWithResult(firstFailedBackup);
      setFailRule(null);

      assert(firstRes.ok === false, 'Первый импорт с частичным откатом должен вернуть ошибку');

      // 2-3. Убеждаемся, что form_pending_rollback_v1 существует, и сохраняем его точное содержимое и состояние ключей
      const pendingSnapshotRaw = store.get(PENDING_ROLLBACK_KEY);
      assert(typeof pendingSnapshotRaw === 'string' && pendingSnapshotRaw.length > 0, 'Ключ form_pending_rollback_v1 должен существовать');
      assert(hasPendingRollbackRecovery() === true, 'hasPendingRollbackRecovery() должен быть true');

      const profileBeforeSecondImport = store.get('form_user_profile');
      const programsBeforeSecondImport = store.get('form_workout_programs');
      const workoutsBeforeSecondImport = store.get('form_workout_sessions');

      // 4. Пытаемся выполнить второй, полностью корректный импорт до завершения первого восстановления
      const secondValidBackup = JSON.stringify({
        profile: { name: 'Второй Импорт', age: 35 },
        programs: [{ id: 'p_second', name: 'Новая Программа 2', description: '', goal: 'Масса', daysPerWeek: 4, workouts: [] }],
        workouts: [
          {
            id: 'w_second',
            name: 'Новая тренировка 2',
            date: '2026-11-13',
            startTime: '18:00',
            status: 'completed',
            durationMinutes: 45,
            totalVolumeKg: 1200,
            completedSets: 4,
            exercises: [],
          },
        ],
      });

      const secondRes = StorageService.importBackupJsonWithResult(secondValidBackup);

      // 5. Второй импорт обязан быть отклонён с понятным сообщением
      assert(secondRes.ok === false, 'Второй импорт до завершения восстановления обязан быть отклонён');
      assert(
        Boolean(secondRes.error && secondRes.error.includes('восстановление')),
        `Сообщение об ошибке должно требовать завершить восстановление: ${secondRes.error}`
      );

      // 6-8. Снимок form_pending_rollback_v1, пользовательские данные и флаг hasPendingRollbackRecovery() неизменны
      assert(
        store.get(PENDING_ROLLBACK_KEY) === pendingSnapshotRaw,
        'Содержимое form_pending_rollback_v1 обязано остаться абсолютно неизменным'
      );
      assert(
        store.get('form_user_profile') === profileBeforeSecondImport &&
          store.get('form_workout_programs') === programsBeforeSecondImport &&
          store.get('form_workout_sessions') === workoutsBeforeSecondImport,
        'Пользовательские данные не должны измениться из-за отклонённого второго импорта'
      );
      assert(hasPendingRollbackRecovery() === true, 'hasPendingRollbackRecovery() по-прежнему возвращает true');

      // Проверяем также после имитации перезапуска приложения
      resetMigrationSessionFlagForTests();
      const secondResAfterRestart = StorageService.importBackupJsonWithResult(secondValidBackup);
      assert(secondResAfterRestart.ok === false, 'После перезапуска повторный импорт до восстановления также отклонён');
      assert(
        store.get(PENDING_ROLLBACK_KEY) === pendingSnapshotRaw,
        'После перезапуска снимок form_pending_rollback_v1 также нетронут'
      );
      assert(hasPendingRollbackRecovery() === true, 'После перезапуска hasPendingRollbackRecovery() === true');

      // 9-10. Выполняем штатное повторное восстановление и проверяем возврат исходных данных
      const retryRes = StorageService.retryPendingRecovery();
      assert(retryRes.ok === true, 'Штатное повторное восстановление должно завершиться успехом');
      assert(store.get('form_user_profile') === origProfileRaw, 'Первоначальный профиль полностью восстановлен');
      assert(store.get('form_workout_programs') === origProgramsRaw, 'Первоначальные программы полностью восстановлены');
      assert(store.get('form_workout_sessions') === undefined, 'Данные из отклонённого второго импорта отсутствуют');
      assert(store.get(PENDING_ROLLBACK_KEY) === undefined, 'После успешного восстановления form_pending_rollback_v1 очищен');
      assert(hasPendingRollbackRecovery() === false, 'После успешного восстановления hasPendingRollbackRecovery() === false');
    });

    return 'Повторный импорт заблокирован до завершения rollback; снимок и исходные данные сохранены';
  });

  // === ДОПОЛНИТЕЛЬНЫЕ ТЕСТЫ НАДЁЖНОСТИ (ЭТАПЫ 1–5) ===

  interface FaultStorageControllers {
    store: Map<string, string>;
    stats: { setCalls: number; removeCalls: number; clearCalls: number };
    setSetIntercept: (
      fn:
        | ((
            key: string,
            val: string,
            callIndex: number
          ) =>
            | { action: 'throw'; quota?: boolean; message?: string }
            | { action: 'drop' }
            | { action: 'corrupt'; storedValue: string }
            | { action: 'allow' })
        | null
    ) => void;
    setRemoveIntercept: (
      fn:
        | ((
            key: string,
            callIndex: number
          ) =>
            | { action: 'throw'; quota?: boolean; message?: string }
            | { action: 'drop' }
            | { action: 'allow' })
        | null
    ) => void;
    setGetIntercept: (
      fn:
        | ((
            key: string
          ) =>
            | { action: 'throw'; message?: string }
            | { action: 'allow' })
        | null
    ) => void;
    resetCounters: () => void;
  }

  const withFaultInjectingMockStorage = (fn: (ctrl: FaultStorageControllers) => void): boolean => {
    const hadNativeStorage = typeof globalThis !== 'undefined' && 'localStorage' in globalThis;
    if (hadNativeStorage) {
      return false;
    }
    const store = new Map<string, string>();
    const stats = { setCalls: 0, removeCalls: 0, clearCalls: 0 };
    let setIntercept: Parameters<FaultStorageControllers['setSetIntercept']>[0] = null;
    let removeIntercept: Parameters<FaultStorageControllers['setRemoveIntercept']>[0] = null;
    let getIntercept: Parameters<FaultStorageControllers['setGetIntercept']>[0] = null;

    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear() {
        stats.clearCalls += 1;
        store.clear();
      },
      getItem(k: string) {
        if (getIntercept) {
          const decision = getIntercept(k);
          if (decision.action === 'throw') {
            throw new Error(decision.message || `Simulated getItem error on ${k}`);
          }
        }
        return store.has(k) ? store.get(k)! : null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(k: string) {
        if (k !== 'form_storage_lease_v1') {
          stats.removeCalls += 1;
        }
        if (removeIntercept) {
          const decision = removeIntercept(k, stats.removeCalls);
          if (decision.action === 'throw') {
            const err: any = new Error(decision.message || `Simulated removeItem error on ${k}`);
            if (decision.quota) {
              err.name = 'QuotaExceededError';
              err.code = 22;
            }
            throw err;
          }
          if (decision.action === 'drop') {
            return;
          }
        }
        store.delete(k);
      },
      setItem(k: string, v: string) {
        if (k !== 'form_storage_lease_v1') {
          stats.setCalls += 1;
        }
        const strVal = String(v);
        if (setIntercept) {
          const decision = setIntercept(k, strVal, stats.setCalls);
          if (decision.action === 'throw') {
            const err: any = new Error(decision.message || `Simulated setItem error on ${k}`);
            if (decision.quota) {
              err.name = 'QuotaExceededError';
              err.code = 22;
            }
            throw err;
          }
          if (decision.action === 'drop') {
            return;
          }
          if (decision.action === 'corrupt') {
            store.set(k, decision.storedValue);
            return;
          }
        }
        store.set(k, strVal);
      },
    };

    (globalThis as any).localStorage = mockStorage;
    resetMigrationSessionFlagForTests();
    try {
      fn({
        store,
        stats,
        setSetIntercept: (cb) => {
          setIntercept = cb;
        },
        setRemoveIntercept: (cb) => {
          removeIntercept = cb;
        },
        setGetIntercept: (cb) => {
          getIntercept = cb;
        },
        resetCounters: () => {
          stats.setCalls = 0;
          stats.removeCalls = 0;
          stats.clearCalls = 0;
        },
      });
    } finally {
      resetMigrationSessionFlagForTests();
      delete (globalThis as any).localStorage;
    }
    return true;
  };

  // 31. Сбой или тихая потеря записи staging-снимок / pending-маркера до старта операции + сохранность ROLLBACK_SNAPSHOT_KEY
  test('Надёжность хранения (Этап 2)', 'Сбой записи или тихое искажение снимка/маркера прерывает операцию до изменения данных и бережёт прошлый снимок', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Базовый Атлет', age: 25 });
      const initImport = StorageService.importBackupJsonWithResult(
        JSON.stringify({ profile: { name: 'Подтверждённый Атлет', age: 26 } })
      );
      assert(initImport.ok === true, 'Начальный импорт должен подтвердить снимок ROLLBACK_SNAPSHOT_KEY');
      const confirmedSnapshotBefore = ctrl.store.get(ROLLBACK_SNAPSHOT_KEY);
      const profileBefore = ctrl.store.get('form_user_profile');
      assert(typeof confirmedSnapshotBefore === 'string' && confirmedSnapshotBefore.length > 0, 'ROLLBACK_SNAPSHOT_KEY должен существовать');

      // 31a. QuotaExceededError на записи staging-снимка
      ctrl.setSetIntercept((k) =>
        k === ROLLBACK_SNAPSHOT_STAGING_KEY
          ? { action: 'throw', quota: true, message: 'Quota staging fail' }
          : { action: 'allow' }
      );
      const resQuotaStage = StorageService.importBackupJsonWithResult(
        JSON.stringify({ profile: { name: 'Не должен записаться', age: 99 } })
      );
      ctrl.setSetIntercept(null);
      assert(resQuotaStage.ok === false, 'При ошибке записи staging-снимка импорт должен отмениться');
      assert(ctrl.store.get('form_user_profile') === profileBefore, 'Профиль не должен измениться');
      assert(ctrl.store.get(ROLLBACK_SNAPSHOT_KEY) === confirmedSnapshotBefore, 'Прошлый ROLLBACK_SNAPSHOT_KEY обязан остаться нетронутым');

      // 31b. Тихая потеря / несовпадение содержимого при записи staging-снимка (без исключения)
      ctrl.setSetIntercept((k) =>
        k === ROLLBACK_SNAPSHOT_STAGING_KEY
          ? { action: 'corrupt', storedValue: '{"truncated":true}' }
          : { action: 'allow' }
      );
      const resSilentMismatch = StorageService.importBackupJsonWithResult(
        JSON.stringify({ profile: { name: 'Искажённый снимок', age: 99 } })
      );
      ctrl.setSetIntercept(null);
      assert(resSilentMismatch.ok === false, 'Несовпадение при перечитывании staging-снимка должно прерывать операцию');
      assert(ctrl.store.get('form_user_profile') === profileBefore, 'Профиль не должен тронуться после mismatch снимка');
      assert(ctrl.store.get(ROLLBACK_SNAPSHOT_KEY) === confirmedSnapshotBefore, 'Прошлый подтверждённый снимок сохранён');
      assert(getRollbackRecoveryState().status === 'none', 'Очищенный неудачный staging не должен блокировать приложение');

      // 31c. Тихая потеря записи PENDING_ROLLBACK_KEY после успешного staging-снимка
      ctrl.setSetIntercept((k) =>
        k === PENDING_ROLLBACK_KEY ? { action: 'drop' } : { action: 'allow' }
      );
      const resDropMarker = StorageService.importBackupJsonWithResult(
        JSON.stringify({ profile: { name: 'Маркер потерялся', age: 99 } })
      );
      ctrl.setSetIntercept(null);
      assert(resDropMarker.ok === false, 'Тихая потеря записи PENDING_ROLLBACK_KEY должна отменять операцию');
      assert(ctrl.store.get('form_user_profile') === profileBefore, 'Данные пользователя не изменялись');
      assert(ctrl.store.get(ROLLBACK_SNAPSHOT_KEY) === confirmedSnapshotBefore, 'Прошлый подтверждённый снимок сохранён');
      assert(getRollbackRecoveryState().status === 'none', 'Неудачный пре-флайт не оставляет ложного pending');

      // 31d. Сбой на N-й записи при миграции схемы (включая запись снимка перед миграцией)
      ctrl.store.set('form_schema_version_v1', '1');
      ctrl.store.set('form_workout_sessions', JSON.stringify([
        {
          id: 'mig_fail_1',
          date: '2026-11-10',
          name: 'М',
          status: 'completed',
          exercises: [{ id: 'e1', exerciseId: 'ex_1', name: 'Отжимания классические', targetMuscle: 'rearDelts', secondaryMuscles: [], isBodyweight: true, sets: [], restSeconds: 60 }],
        },
      ]));
      const sessionsBeforeMig = ctrl.store.get('form_workout_sessions');
      resetMigrationSessionFlagForTests();
      ctrl.setSetIntercept((k) =>
        k === ROLLBACK_SNAPSHOT_STAGING_KEY ? { action: 'drop' } : { action: 'allow' }
      );
      runSafeMigrations({
        PROFILE: 'form_user_profile',
        PROGRAMS: 'form_workout_programs',
        WORKOUTS: 'form_workout_sessions',
        SPORTS_SESSIONS: 'form_sports_sessions_v1',
        WEEKLY_SCHEDULE: 'form_weekly_schedule_v1',
        CUSTOM_ACTIVITY: 'form_activity_days',
        EQUIPMENT: 'form_user_equipment_v1',
        FITNESS_PARAMS: 'form_fitness_parameters_v1',
      });
      ctrl.setSetIntercept(null);
      assert(ctrl.store.get('form_workout_sessions') === sessionsBeforeMig, 'Миграция не должна менять данные при сбое записи снимка');
      assert(ctrl.store.get('form_schema_version_v1') === '1', 'Версия схемы не должна повыситься при отменённой миграции');
    });

    return 'Ошибки и тихие искажения при записи снимка/маркера надёжно отменяют операцию и берегут предыдущий снимок';
  });

  // 32. Повреждённый PENDING_ROLLBACK_KEY и ROLLBACK_SNAPSHOT_KEY -> состояние unknown, отказ без удаления, тотальная блокировка
  test('Надёжность хранения (Этап 1)', 'Повреждённый JSON, структура или checksum снимка/маркера дают unknown и никогда не удаляются автоматически', () => {
    const cases: Array<{ key: string; raw: string; label: string }> = [
      { key: PENDING_ROLLBACK_KEY, raw: '{corrupted_pending_json', label: 'битый JSON pending' },
      { key: PENDING_ROLLBACK_KEY, raw: JSON.stringify({ version: 1, snapshots: [{ key: '', rawValue: null }] }), label: 'битая структура pending' },
      {
        key: PENDING_ROLLBACK_KEY,
        raw: JSON.stringify({
          version: 1,
          status: 'in_progress',
          checksum: 'v1:0:deadbeef:deadbeef',
          snapshots: [{ key: 'form_user_profile', rawValue: null, quarantineRawValue: null, wasLockedInMemory: false, wasLockedInIndex: false }],
        }),
        label: 'подделанная checksum pending',
      },
      { key: ROLLBACK_SNAPSHOT_KEY, raw: '{corrupted_snapshot_json', label: 'битый JSON snapshot' },
      { key: ROLLBACK_SNAPSHOT_KEY, raw: JSON.stringify({ version: 1, operationId: 'op1', checksum: 'bad', snapshots: [] }), label: 'пустой/битый snapshot' },
    ];

    for (const c of cases) {
      withFaultInjectingMockStorage((ctrl) => {
        ctrl.store.set('form_schema_version_v1', '11');
        ctrl.store.set('form_user_profile', JSON.stringify({ name: 'Анна', age: 24 }));
        const origProfile = ctrl.store.get('form_user_profile');
        ctrl.store.set(c.key, c.raw);
        resetMigrationSessionFlagForTests();

        const rec = getRollbackRecoveryState();
        assert(rec.status === 'unknown', `[${c.label}] ожидался status=unknown, получен ${rec.status}`);
        assert(hasPendingRollbackRecovery() === true, `[${c.label}] hasPendingRollbackRecovery() обязан быть true`);
        assert(Boolean(rec.error), `[${c.label}] должна присутствовать ошибка диагностики`);

        ctrl.resetCounters();
        const retryRes = StorageService.retryPendingRecovery();
        assert(retryRes.ok === false, `[${c.label}] retryPendingRecovery обязан вернуть ok: false`);
        assert(ctrl.store.get(c.key) === c.raw, `[${c.label}] повреждённая строка не должна удаляться или перезаписываться!`);
        assert(ctrl.store.get('form_user_profile') === origProfile, `[${c.label}] пользовательские данные не должны затираться`);

        const setRes = safeSetItem('form_user_profile', JSON.stringify({ name: 'Хак', age: 99 }));
        const rmRes = safeRemoveItem('form_user_profile');
        const updProfile = StorageService.updateProfile({ name: 'Хак', age: 99 });
        const updErr = StorageService.getLastWriteError();
        const impRes = StorageService.importBackupJsonWithResult(JSON.stringify({ profile: { name: 'Имп', age: 50 } }));
        const resetRes = StorageService.resetAllData();

        assert(!setRes.ok && !rmRes.ok && updProfile.name === 'Анна' && Boolean(updErr) && !impRes.ok && !resetRes.ok, `[${c.label}] все записи, импорт и сброс обязаны быть заблокированы`);
        assert(
          ctrl.stats.setCalls === 0 && ctrl.stats.removeCalls === 0 && ctrl.stats.clearCalls === 0,
          `[${c.label}] при unknown не должно быть ни одной мутации localStorage (set=${ctrl.stats.setCalls}, rm=${ctrl.stats.removeCalls}, clear=${ctrl.stats.clearCalls})`
        );
        assert(ctrl.store.get(c.key) === c.raw, `[${c.label}] повреждённый ключ по-прежнему сохраняется целиком`);
      });
    }

    return 'Все варианты повреждения снимка/маркера (JSON, структура, checksum) переводят в unknown без удаления данных';
  });

  // 33. Тотальная блокировка всех обычных операций записи/удаления/миграции/сброса в состоянии pending
  test('Надёжность хранения (Этап 3)', 'В состоянии pending заблокированы safeSetItem, safeRemoveItem, все методы StorageService, миграция и resetAllData с 0 мутациями', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Оригинал', age: 29 });
      const origProfile = ctrl.store.get('form_user_profile')!;

      // Искусственно вызываем частичный сбой rollback, чтобы оказаться в реальном persisted pending
      ctrl.setSetIntercept((k, val) =>
        k === 'form_workout_programs' || (k === 'form_user_profile' && val === origProfile)
          ? { action: 'throw', quota: true }
          : { action: 'allow' }
      );
      const failImport = StorageService.importBackupJsonWithResult(
        JSON.stringify({
          profile: { name: 'Промежуточный', age: 30 },
          programs: [{ id: 'p1', name: 'П', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [] }],
        })
      );
      ctrl.setSetIntercept(null);
      assert(failImport.ok === false, 'Импорт должен создать состояние pending');

      // Перезапуск приложения в состоянии pending
      resetMigrationSessionFlagForTests();
      ctrl.store.set('form_schema_version_v1', '1');
      assert(getRollbackRecoveryState().status === 'pending', 'После рестарта статус обязан быть pending');

      const snapshotMapBefore = new Map(ctrl.store);
      ctrl.resetCounters();

      const results: SafeWriteResult[] = [];
      results.push(safeSetItem('form_custom_key', 'abc'));
      results.push(safeRemoveItem('form_user_profile'));

      const blockedProfile = StorageService.updateProfile({ name: 'Новый', age: 31 });
      assert(blockedProfile.name === 'Промежуточный' && Boolean(StorageService.getLastWriteError()), 'updateProfile обязан быть заблокирован в pending');

      const blockedSettings = StorageService.updateSettings({ weightUnit: 'lbs' });
      assert(blockedSettings.weightUnit === 'kg' && Boolean(StorageService.getLastWriteError()), 'updateSettings обязан быть заблокирован в pending');

      const blockedFav = StorageService.toggleFavoriteExercise('pushups_classic');
      assert(blockedFav === false && Boolean(StorageService.getLastWriteError()), 'toggleFavoriteExercise обязан быть заблокирован в pending');

      results.push(StorageService.saveProgram({ id: 'px', name: 'X', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [], isCustom: true, createdAt: '2026-11-12T10:00:00Z' }));
      results.push(StorageService.saveWorkoutSession({ id: 'wx', name: 'W', date: '2026-11-12', startTime: '10:00', status: 'completed', durationMinutes: 30, totalVolumeKg: 500, completedSets: 3, exercises: [] }));
      results.push(StorageService.saveSportSession({ id: 'sx', sportType: 'running', title: 'R', date: '2026-11-12', startTime: '09:00', plannedDurationMinutes: 30, actualDurationMinutes: 30, intensity: 'medium', rpe: 6, status: 'completed' }));
      results.push(StorageService.saveWeeklySchedule([]));
      results.push(StorageService.setDayStatus('2026-11-12', 'completed'));
      results.push(StorageService.saveActiveDraft({ id: 'dx', name: 'D', date: '2026-11-12', startTime: '10:00', durationMinutes: 10, totalVolumeKg: 0, completedSets: 0, status: 'in_progress', exercises: [] }));
      results.push(StorageService.clearActiveDraft());
      results.push(StorageService.saveEquipmentList([]));
      results.push(StorageService.saveUserParameters({ goal: 'Сила' as any, level: 'Средний' as any, location: 'Зал' as any, daysPerWeek: 3, durationMinutes: 60, availableDays: [], preferredMuscles: [], excludedExercises: [], healthRestrictions: [], notes: '' }));
      results.push(StorageService.deleteCustomExercise('nonexistent'));
      results.push(StorageService.saveWellbeingCheckin({ id: 'wb1', date: '2026-11-12', sleepHours: 8, fatigue: 3, soreness: 2, jointPain: 0, createdAt: 1700000000000 }));
      results.push(StorageService.saveBodyMeasurement({ id: 'bm1', date: '2026-11-12', weightKg: 75, createdAt: 1700000000000 }));
      results.push(StorageService.resetMuscleStats());
      results.push(StorageService.clearAnatomyReset());
      results.push(StorageService.importBackupJsonWithResult(JSON.stringify({ profile: { name: 'И', age: 20 } })));
      results.push(StorageService.resetAllData());

      runSafeMigrations({
        PROFILE: 'form_user_profile',
        PROGRAMS: 'form_workout_programs',
        WORKOUTS: 'form_workout_sessions',
        SPORTS_SESSIONS: 'form_sports_sessions_v1',
        WEEKLY_SCHEDULE: 'form_weekly_schedule_v1',
        CUSTOM_ACTIVITY: 'form_activity_days',
        EQUIPMENT: 'form_user_equipment_v1',
        FITNESS_PARAMS: 'form_fitness_parameters_v1',
      });

      assert(results.every((r) => r.ok === false && Boolean(r.error)), 'Каждая обычная операция записи/удаления/импорта/сброса в pending обязана вернуть ok: false с ошибкой');
      assert(
        ctrl.stats.setCalls === 0 && ctrl.stats.removeCalls === 0 && ctrl.stats.clearCalls === 0,
        `В состоянии pending ни одна обычная операция не смеет вызывать setItem/removeItem/clear (set=${ctrl.stats.setCalls}, rm=${ctrl.stats.removeCalls}, clear=${ctrl.stats.clearCalls})`
      );
      assert(ctrl.store.size === snapshotMapBefore.size, 'Количество ключей в localStorage не изменилось');

      // При этом само восстановление не заблокировано собственной защитой!
      const recoveryRes = retryPendingRollbackRecovery();
      assert(recoveryRes.ok === true, 'retryPendingRollbackRecovery должен выполняться в состоянии pending');
      assert(ctrl.store.get('form_user_profile') === origProfile, 'После recovery исходный профиль полностью восстановлен');
      assert(getRollbackRecoveryState().status === 'none', 'После recovery статус возвращается в none');
    });

    return 'Все 21+ операций записи/удаления/миграции/сброса полностью заблокированы в pending с 0 мутациями; recovery работает';
  });

  // 34. Отказ удаления PENDING_ROLLBACK_KEY, тихая потеря при rollback, и идемпотентный повторный retry после рестарта
  test('Надёжность хранения (Этапы 4–5)', 'Тихая потеря записи rollback и ошибка удаления маркера сохраняют pending, а повторный retry идемпотентен', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Ценный Профиль', age: 27 });
      StorageService.saveProgram({
        id: 'p_safe',
        name: 'Ценная Программа',
        description: '',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: true,
        createdAt: '2026-11-12T10:00:00Z',
      });
      const origProfile = ctrl.store.get('form_user_profile')!;
      const origPrograms = ctrl.store.get('form_workout_programs')!;

      // Падаем на записи programs (2-й ключ) и откат profile тоже прерываем тихой потерей (corrupt без throw)
      let failImportCount = 0;
      ctrl.setSetIntercept((k, val) => {
        if (k === 'form_workout_programs' && failImportCount === 0) {
          failImportCount += 1;
          return { action: 'throw', quota: true };
        }
        if (k === 'form_user_profile' && val === origProfile) {
          return { action: 'corrupt', storedValue: '{"silently":"corrupted"}' };
        }
        return { action: 'allow' };
      });

      const failRes = StorageService.importBackupJsonWithResult(
        JSON.stringify({
          profile: { name: 'Новый', age: 40 },
          programs: [{ id: 'p_new', name: 'Новая', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [] }],
        })
      );
      ctrl.setSetIntercept(null);

      assert(failRes.ok === false, 'Импорт должен отказать');
      assert(getRollbackRecoveryState().status === 'pending', 'Тихая порча во время отката должна перехватиться проверкой перечитывания и оставить pending');

      // Имитация перезапуска + отказ removeItem на PENDING_ROLLBACK_KEY при первом retry
      resetMigrationSessionFlagForTests();
      ctrl.setRemoveIntercept((k) =>
        k === PENDING_ROLLBACK_KEY ? { action: 'throw', quota: true } : { action: 'allow' }
      );
      const retryMarkerFail = StorageService.retryPendingRecovery();
      ctrl.setRemoveIntercept(null);

      assert(retryMarkerFail.ok === false, 'Если не удалился PENDING_ROLLBACK_KEY, recovery не имеет права вернуть ok: true');
      assert(ctrl.store.get('form_user_profile') === origProfile, 'Данные при этом уже восстановлены на диск');
      assert(ctrl.store.get('form_workout_programs') === origPrograms, 'Программы целы');
      assert(getRollbackRecoveryState().status === 'pending', 'Состояние остаётся pending пока маркер не удалён');

      // Имитация повторного запуска и тихого игнорирования removeItem для маркера
      resetMigrationSessionFlagForTests();
      ctrl.setRemoveIntercept((k) =>
        k === PENDING_ROLLBACK_KEY ? { action: 'drop' } : { action: 'allow' }
      );
      const retrySilentRemove = StorageService.retryPendingRecovery();
      ctrl.setRemoveIntercept(null);
      assert(retrySilentRemove.ok === false, 'Тихая неудаляемость маркера тоже не считается успехом');
      assert(getRollbackRecoveryState().status === 'pending', 'Статус остаётся pending');

      // Идемпотентный повторный retry без ошибок хранилища
      resetMigrationSessionFlagForTests();
      const finalRetry = StorageService.retryPendingRecovery();
      assert(finalRetry.ok === true, 'Повторный retry должен завершиться успешно и идемпотентно');
      assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === undefined, 'PENDING_ROLLBACK_KEY удалён после подтверждения');
      assert(getRollbackRecoveryState().status === 'none', 'После завершения статус = none');
      assert(ctrl.store.get('form_user_profile') === origProfile && ctrl.store.get('form_workout_programs') === origPrograms, 'Итоговые данные на 100% совпадают со снимком');

      // Повторная запись после recovery снова работает штатно
      const afterRecoverySave = StorageService.saveEquipmentList([]);
      assert(afterRecoverySave.ok === true, 'После успешного recovery обычная запись снова разрешена');
      const updatedProf = StorageService.updateProfile({ name: 'После Восстановления', age: 28 });
      assert(updatedProf.name === 'После Восстановления', 'После recovery updateProfile снова работает');
    });

    return 'Тихая потеря отката, ошибка удаления маркера и идемпотентный повтор после рестарта подтверждены';
  });

  // 35. Реальная тихая потеря при обычной записи safeSetItem / safeRemoveItem без throw
  test('Надёжность хранения (Этап 2)', 'Тихий отказ или искажение в localStorage.setItem/removeItem перехватываются проверкой перечитывания', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Старт', age: 20 });

      ctrl.setSetIntercept((k) =>
        k === 'form_user_profile' ? { action: 'drop' } : { action: 'allow' }
      );
      const dropped = safeSetItem('form_user_profile', JSON.stringify({ name: 'Потеряно', age: 21 }));
      assert(dropped.ok === false && Boolean(dropped.error), 'Тихая потеря setItem должна вернуть ok: false');
      const droppedProf = StorageService.updateProfile({ name: 'Потеряно', age: 21 });
      assert(droppedProf.name === 'Старт' && Boolean(StorageService.getLastWriteError()), 'При тихой потере updateProfile возвращает прежний профиль и ошибку');

      ctrl.setSetIntercept((k) =>
        k === 'form_user_profile'
          ? { action: 'corrupt', storedValue: '{"name":"Испорчено"}' }
          : { action: 'allow' }
      );
      const corrupted = safeSetItem('form_user_profile', JSON.stringify({ name: 'Проверка', age: 22 }));
      assert(corrupted.ok === false && (corrupted.error || '').includes('не совпадает'), 'Несовпадение при перечитывании должно вернуть ошибку');
      ctrl.setSetIntercept(null);

      ctrl.setRemoveIntercept((k) =>
        k === 'form_active_workout_draft_v2' ? { action: 'drop' } : { action: 'allow' }
      );
      ctrl.store.set('form_active_workout_draft_v2', JSON.stringify({ id: 'd1' }));
      const rmDrop = safeRemoveItem('form_active_workout_draft_v2');
      assert(rmDrop.ok === false && Boolean(rmDrop.error), 'Тихая неудаляемость при removeItem должна вернуть ok: false');
      ctrl.setRemoveIntercept(null);
    });

    return 'Шлюз перехватывает любые тихие потери и искажения при setItem и removeItem';
  });

  // 36. Ошибка записи ровно на N-м вызове setItem при импорте и при rollback
  test('Надёжность хранения (Этап 5)', 'Ошибка на N-м вызове setItem при импорте и на N-м вызове rollback надёжно защищает данные', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Атлет N', age: 30 });
      StorageService.saveProgram({
        id: 'pn_1',
        name: 'План N',
        description: '',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: true,
        createdAt: '2026-11-12T10:00:00Z',
      });
      const origProfile = ctrl.store.get('form_user_profile')!;
      const origPrograms = ctrl.store.get('form_workout_programs')!;

      const backup = JSON.stringify({
        profile: { name: 'Новый N', age: 31 },
        programs: [{ id: 'pn_2', name: 'Новый план N', description: '', goal: 'Масса', daysPerWeek: 4, workouts: [] }],
        workouts: [{ id: 'wn_2', name: 'Т N', date: '2026-11-12', startTime: '18:00', status: 'completed', durationMinutes: 40, totalVolumeKg: 1000, completedSets: 4, exercises: [] }],
      });

      // Считаем вызовы:
      // 1 = staging snapshot, 2 = pending marker, 3 = profile, 4 = programs -> падаем на 4-м вызове (programs)!
      // Затем 5-й вызов = попытка rollback profile -> тоже падаем на 5-м вызове (rollback N-й вызов)!
      ctrl.resetCounters();
      ctrl.setSetIntercept((_key, _val, callIndex) => {
        if (callIndex === 4 || callIndex === 5) {
          return { action: 'throw', quota: true, message: `Fail on N-th call #${callIndex}` };
        }
        return { action: 'allow' };
      });

      const res = StorageService.importBackupJsonWithResult(backup);
      ctrl.setSetIntercept(null);

      assert(res.ok === false, 'Сбой на 4-м вызове setItem должен отказать импорт');
      assert(getRollbackRecoveryState().status === 'pending', 'Сбой на 5-м вызове (во время rollback) должен оставить статус pending');
      assert(ctrl.store.get('form_workout_programs') === origPrograms, 'programs не повреждены');
      assert(ctrl.store.get('form_workout_sessions') === undefined, 'workouts не создавались');

      resetMigrationSessionFlagForTests();
      const retry = StorageService.retryPendingRecovery();
      assert(retry.ok === true, 'Повторное восстановление должно вернуть всё на место');
      assert(ctrl.store.get('form_user_profile') === origProfile, 'Исходный profile полностью восстановлен');
      assert(ctrl.store.get('form_workout_programs') === origPrograms, 'Исходные programs полностью восстановлены');
      assert(getRollbackRecoveryState().status === 'none', 'Состояние восстановления очищено');
    });

    return 'Отказы на N-х вызовах setItem во время импорта и rollback полностью контролируются';
  });

  // 37. Стартовое автовосстановление: успех / повторный сбой в pending / отказ без удаления в unknown
  test('Восстановление в UI (Шаг 1)', 'resolveStartupRecoveryState: pending восстанавливается 1 раз; при сбое или unknown данные защищены и запись заблокирована', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'До Сбоя', age: 25 });
      const origProfile = ctrl.store.get('form_user_profile')!;

      ctrl.setSetIntercept((k, val) =>
        k === 'form_workout_programs' || (k === 'form_user_profile' && val === origProfile)
          ? { action: 'throw', quota: true }
          : { action: 'allow' }
      );
      const failImport = StorageService.importBackupJsonWithResult(
        JSON.stringify({
          profile: { name: 'Незавершённый', age: 99 },
          programs: [{ id: 'p_x', name: 'X', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [] }],
        })
      );
      ctrl.setSetIntercept(null);
      assert(failImport.ok === false, 'Должен сформироваться pending');

      // 37a. Успешное автовосстановление при старте
      resetMigrationSessionFlagForTests();
      const bootOk = resolveStartupRecoveryState();
      assert(bootOk.autoAttempted === true && bootOk.state.status === 'none' && bootOk.autoError === null, 'pending при старте должен восстановиться в none');
      assert(ctrl.store.get('form_user_profile') === origProfile, 'Профиль восстановлен до исходного');
      assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === undefined, 'Служебный маркер удалён');

      // 37b. Неудачное автовосстановление при старте: выполняется 1 раз, запись остаётся заблокированной
      ctrl.setSetIntercept((k, val) =>
        k === 'form_workout_programs' || (k === 'form_user_profile' && val === origProfile)
          ? { action: 'throw', quota: true }
          : { action: 'allow' }
      );
      StorageService.importBackupJsonWithResult(
        JSON.stringify({
          profile: { name: 'Сбой Стартовый', age: 99 },
          programs: [{ id: 'p_x2', name: 'X2', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [] }],
        })
      );
      ctrl.setSetIntercept(null);

      resetMigrationSessionFlagForTests();
      ctrl.setSetIntercept((k) =>
        k === 'form_user_profile' ? { action: 'throw', quota: true, message: 'Disk full at startup' } : { action: 'allow' }
      );
      ctrl.resetCounters();
      const bootFail1 = resolveStartupRecoveryState();
      const callsAfterFirst = ctrl.stats.setCalls;
      // Повторный вызов в той же сессии старта не должен бесконечно дёргать retry
      const bootFail2 = resolveStartupRecoveryState();
      assert(ctrl.stats.setCalls === callsAfterFirst, 'Повторный resolveStartupRecoveryState в той же сессии не должен перезапускать retry');
      ctrl.setSetIntercept(null);

      assert(bootFail1.autoAttempted === true && bootFail1.state.status === 'pending' && Boolean(bootFail1.autoError), 'При сбое автовосстановления остаётся pending и ошибка');
      assert(bootFail2.state.status === 'pending', 'Состояние остаётся pending');
      assert(safeSetItem('form_user_profile', '{"name":"Overwrite"}').ok === false, 'После неудачного автовосстановления обычная запись заблокирована');

      // Очищаем pending для проверки unknown
      assert(StorageService.retryPendingRecovery().ok === true, 'Штатное восстановление должно очистить pending');

      // 37c. Состояние unknown: автовосстановление не вызывается, повреждённый маркер не удаляется, запись заблокирована
      const brokenMarker = '{corrupted_marker_verbatim';
      ctrl.store.set(PENDING_ROLLBACK_KEY, brokenMarker);
      resetMigrationSessionFlagForTests();
      ctrl.resetCounters();
      const bootUnknown = resolveStartupRecoveryState();
      assert(bootUnknown.state.status === 'unknown' && bootUnknown.autoAttempted === false && Boolean(bootUnknown.autoError), 'При unknown должен вернуться статус unknown без retry');
      assert(ctrl.stats.setCalls === 0 && ctrl.stats.removeCalls === 0, 'При unknown старта мутации localStorage запрещены');
      assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === brokenMarker, 'Повреждённый маркер обязан остаться нетронутым');
    });

    return 'Стартовое автовосстановление корректно отрабатывает успех, сбой и unknown';
  });

  // 38. Сырой аварийный экспорт и защищённый сброс только служебных ключей
  test('Восстановление в UI (Шаг 2)', 'Сырой экспорт сохраняет все данные дословно, а resetRecoveryStateOnly удаляет ТОЛЬКО служебные ключи после подтверждений', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      const rawUserProfile = JSON.stringify({ name: 'Ценный Профиль', age: 33 });
      const rawCorruptedWorkouts = '{broken_workouts_json';
      const rawPendingBroken = '{broken_pending_marker';
      const rawSnapshotPrev = '{"prev":"snapshot"}';
      const rawStaging = '{"staging":"snap"}';
      const rawQuarantine = '{broken_workouts_json';

      ctrl.store.set('form_user_profile', rawUserProfile);
      ctrl.store.set('form_workout_sessions', rawCorruptedWorkouts);
      ctrl.store.set(`${CORRUPTED_RAW_PREFIX}form_workout_sessions`, rawQuarantine);
      ctrl.store.set(PENDING_ROLLBACK_KEY, rawPendingBroken);
      ctrl.store.set(ROLLBACK_SNAPSHOT_KEY, rawSnapshotPrev);
      ctrl.store.set(ROLLBACK_SNAPSHOT_STAGING_KEY, rawStaging);
      resetMigrationSessionFlagForTests();

      // 38a. Проверяем сырой экспорт (дословно все ключи, включая битые и служебные)
      const rawSnap = exportAllStorageRawSnapshot();
      const rawExportJson = StorageService.exportEmergencyRawBackupJson();
      const parsedExport = JSON.parse(rawExportJson);

      assert(rawSnap.rawKeys['form_user_profile'] === rawUserProfile, 'Сырой экспорт должен содержать профиль дословно');
      assert(rawSnap.rawKeys['form_workout_sessions'] === rawCorruptedWorkouts, 'Сырой экспорт должен содержать повреждённые ключи дословно');
      assert(rawSnap.rawKeys[PENDING_ROLLBACK_KEY] === rawPendingBroken, 'Сырой экспорт должен содержать повреждённый маркер восстановления');
      assert(rawSnap.rawKeys[ROLLBACK_SNAPSHOT_KEY] === rawSnapshotPrev, 'Сырой экспорт должен содержать ROLLBACK_SNAPSHOT_KEY');
      assert(parsedExport.rawKeys[PENDING_ROLLBACK_KEY] === rawPendingBroken, 'JSON-дамп должен включать все rawKeys без потерь');

      // 38b. Сброс запрещён без сохранения копии и без явного подтверждения
      assert(safeSetItem('form_user_profile', '{"name":"Blocked"}').ok === false, 'До сброса обычная запись заблокирована');
      const noBackup = resetRecoveryStateOnly({ backupConfirmed: false, userConfirmed: true });
      const noUser = resetRecoveryStateOnly({ backupConfirmed: true, userConfirmed: false });
      assert(!noBackup.ok && !noUser.ok, 'Сброс без обоих подтверждений обязан отказать');
      assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === rawPendingBroken, 'После отказа служебные ключи не удаляются');
      assert(safeSetItem('form_user_profile', '{"name":"StillBlocked"}').ok === false, 'Запись остаётся заблокированной после отклонённого сброса');

      // 38c. Подтверждённый сброс удаляет ТОЛЬКО служебные ключи восстановления
      const resetOk = StorageService.resetRecoveryStateOnly({
        backupConfirmed: true,
        userConfirmed: true,
      });
      assert(resetOk.ok === true, 'Подтверждённый сброс должен завершиться успешно');
      assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === undefined, 'PENDING_ROLLBACK_KEY должен быть удалён');
      assert(ctrl.store.get(ROLLBACK_SNAPSHOT_KEY) === undefined, 'ROLLBACK_SNAPSHOT_KEY должен быть удалён');
      assert(ctrl.store.get(ROLLBACK_SNAPSHOT_STAGING_KEY) === undefined, 'ROLLBACK_SNAPSHOT_STAGING_KEY должен быть удалён');

      // Пользовательские ключи и карантин обязаны остаться побайтово идентичными
      assert(ctrl.store.get('form_user_profile') === rawUserProfile, 'Профиль пользователя не должен изменяться при сбросе восстановления');
      assert(ctrl.store.get('form_workout_sessions') === rawCorruptedWorkouts, 'Повреждённый пользовательский ключ не должен удаляться');
      assert(ctrl.store.get(`${CORRUPTED_RAW_PREFIX}form_workout_sessions`) === rawQuarantine, 'Карантинная копия не должна удаляться');
      assert(getRollbackRecoveryState().status === 'none', 'После сброса статус восстановления = none');

      // После сброса обычная запись в незаблокированный ключ снова работает
      const writeAfterReset = safeSetItem('form_app_settings_v1', JSON.stringify({ weightUnit: 'kg' }));
      assert(writeAfterReset.ok === true, 'После сброса восстановления обычная запись должна снова работать');
    });

    return 'Сырой экспорт сохраняет все ключи дословно; сброс удаляет только служебные ключи после двойного подтверждения';
  });

  // 39. Ошибка чтения при создании snapshot прерывает транзакцию без изменения данных
  test('Надёжность хранения (Ревью 1)', 'Ошибка чтения при создании snapshot прерывает транзакцию ДО любых изменений', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Атлет Снапшот', age: 30 });
      const origProfile = ctrl.store.get('form_user_profile')!;

      ctrl.setGetIntercept((key) => {
        if (key === 'form_user_profile') {
          return { action: 'throw', message: 'Disk read failure on profile' };
        }
        return { action: 'allow' };
      });

      const res = executeProtectedStorageTransaction(['form_user_profile'], 'test_read_error', (tx) => {
        return tx.setItem('form_user_profile', JSON.stringify({ name: 'Изменено', age: 31 }));
      });
      ctrl.setGetIntercept(null);

      assert(res.ok === false, 'Транзакция должна завершиться ошибкой при сбое чтения snapshot');
      assert(ctrl.store.get('form_user_profile') === origProfile, 'Данные профиля не изменились');
      assert(ctrl.store.get(ROLLBACK_SNAPSHOT_STAGING_KEY) === undefined, 'Снимок staging не записан');
      assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === undefined, 'Маркер pending не записан');
    });

    return 'Ошибка чтения при создании snapshot прерывает транзакцию без изменений данных';
  });

  // 40. Межвкладлочная блокировка (Lease) предотвращает параллельные конфликты
  test('Надёжность хранения (Ревью 2)', 'Межвкладлочная блокировка через lease корректно защищает хранилище', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Атлет Блокировка', age: 28 });

      // Имитируем занятый lease другой вкладкой
      ctrl.store.set('form_storage_lease_v1', JSON.stringify({ owner: 'other_tab_xyz', expiresAt: Date.now() + 10000 }));

      const res = executeProtectedStorageTransaction(['form_user_profile'], 'locked_tx', (tx) => {
        return tx.setItem('form_user_profile', JSON.stringify({ name: 'Должно упасть', age: 29 }));
      });

      assert(res.ok === false, 'Транзакция должна быть отклонена при занятом lease');
      assert(Boolean(res.error && res.error.includes('заблокировано другой вкладкой')), 'Сообщение об ошибке должно упоминать блокировку');
    });

    return 'Межвкладлочная блокировка корректно отклоняет операции при занятом lease';
  });

  // 41. Подтверждение резервной копии и проверка хеша экспорта при сбросе
  test('Надёжность хранения (Ревью 3)', 'Сброс невозможен без экспорта, с устаревшим экспортом и требует совпадения хеша', () => {
    withFaultInjectingMockStorage((ctrl) => {
      ctrl.store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ name: 'Атлет Экспорт', age: 35 });
      ctrl.store.set(PENDING_ROLLBACK_KEY, '{"pending":"data"}');

      // 41a. Сброс без экспорта
      const noExport = resetRecoveryStateOnly({ backupConfirmed: true, userConfirmed: true });
      assert(noExport.ok === false, 'Сброс без экспорта должен быть заблокирован');

      // 41b. Экспорт сделан, но затем хранилище изменилось (устаревший экспорт)
      exportAllStorageRawSnapshot();
      ctrl.store.set('form_user_profile', JSON.stringify({ name: 'Изменено после экспорта', age: 36 }));

      const outdatedExport = resetRecoveryStateOnly({ backupConfirmed: true, userConfirmed: true });
      assert(outdatedExport.ok === false, 'Сброс с устаревшим экспортом должен быть заблокирован');
      assert(Boolean(outdatedExport.error && outdatedExport.error.includes('устарела')), 'Ошибка должна указывать на устаревание резервной копии');

      // 41c. Свежий экспорт -> сброс успешен
      exportAllStorageRawSnapshot();
      const freshExport = resetRecoveryStateOnly({ backupConfirmed: true, userConfirmed: true });
      assert(freshExport.ok === true, 'Сброс со свежим актуальным экспортом должен пройти успешно');
    });

    return 'Сброс требует актуального экспорта данных без изменения хранилища';
  });

  // 42. Очистка служебных ключей и перепроверка удаления всех трёх ключей
  test('Надёжность хранения (Ревью 4)', 'Сбой removeItem на каждом из трёх служебных ключей возвращает ошибку и не ломает повтор', () => {
    const keysToCheck = [PENDING_ROLLBACK_KEY, ROLLBACK_SNAPSHOT_KEY, ROLLBACK_SNAPSHOT_STAGING_KEY];

    for (const failKey of keysToCheck) {
      withFaultInjectingMockStorage((ctrl) => {
        ctrl.store.set('form_schema_version_v1', '11');
        ctrl.store.set(PENDING_ROLLBACK_KEY, '{"pending":1}');
        ctrl.store.set(ROLLBACK_SNAPSHOT_KEY, '{"snap":1}');
        ctrl.store.set(ROLLBACK_SNAPSHOT_STAGING_KEY, '{"stage":1}');
        exportAllStorageRawSnapshot();

        ctrl.setRemoveIntercept((k) =>
          k === failKey ? { action: 'throw', message: `Fail removing ${failKey}` } : { action: 'allow' }
        );

        const res = resetRecoveryStateOnly({ backupConfirmed: true, userConfirmed: true });
        ctrl.setRemoveIntercept(null);

        assert(res.ok === false, `Сбой удаления ключевого элемента ${failKey} должен возвращать ошибку`);

        // Повторный вызов без сбоя должен успешно завершиться
        exportAllStorageRawSnapshot();
        const retryRes = resetRecoveryStateOnly({ backupConfirmed: true, userConfirmed: true });
        assert(retryRes.ok === true, 'Повторный сброс после устранения сбоя должен проходить успешно');
        assert(ctrl.store.get(PENDING_ROLLBACK_KEY) === undefined, 'Все служебные ключи очищены');
      });
    }

    return 'Сбой удаления любого из трёх служебных ключей корректно отрабатывается с возможностью повтора';
  });

  // === ТЕСТЫ СИСТЕМЫ РАБОЧИХ ВЕСОВ И ИСТОРИИ УПРАЖНЕНИЙ ===

  // 43. Новое упражнение без истории получает 0 кг; готовые программы не содержат ненулевых весов
  test('Рабочие веса и история', 'Новое упражнение без истории получает 0 кг; готовые программы не содержат предустановленных весов', () => {
    const allCatalogPrograms = [...STRENGTH_PROGRAMS, ...MOBILITY_PROGRAMS];
    assert(allCatalogPrograms.length > 0, 'Каталог программ должен содержать программы');
    for (const prog of allCatalogPrograms) {
      for (const workout of prog.workouts || []) {
        for (const ex of workout.exercises || []) {
          assert(
            ex.targetWeight === undefined || ex.targetWeight === 0,
            `Упражнение "${ex.name}" в программе "${prog.name}" имеет предустановленный targetWeight=${ex.targetWeight}`
          );
        }
      }
    }

    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');

      const prev = StorageService.getPreviousExerciseResults('Жим штанги лёжа', {
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest_mid',
      });
      assert(prev === null, 'При отсутствии завершённых тренировок история должна быть null');

      const initSets = resolveInitialExerciseSets({
        exerciseName: 'Жим штанги лёжа',
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest_mid',
        setsCount: 3,
        defaultReps: 10,
        explicitTargetWeight: 0,
        isBodyweight: false,
      });
      assert(initSets.length === 3, 'Должно быть сформировано 3 подхода');
      assert(
        initSets.every((s) => s.weightKg === 0 && s.reps === 10 && s.completed === false),
        'Все подходы нового упражнения без истории должны начинаться с 0 кг'
      );
    });

    return 'Готовые программы без чужих весов; новое упражнение стартует с 0 кг';
  });

  // 44. Упражнение с историей получает последний сохранённый вес
  test('Рабочие веса и история', 'Упражнение с историей получает последний сохранённый вес (старт программы и добавление из каталога)', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      StorageService.saveWorkoutSession({
        id: 'w_hist_1',
        name: 'Грудь и трицепс',
        date: '2026-11-10',
        startTime: '18:00',
        durationMinutes: 45,
        totalVolumeKg: 1500,
        completedSets: 3,
        status: 'completed',
        exercises: [
          {
            id: 'ex_local_1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest_mid',
            isBodyweight: false,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 60, reps: 10, completed: true },
              { setNumber: 2, weightKg: 65, reps: 8, completed: true },
              { setNumber: 3, weightKg: 67.5, reps: 6, completed: true },
            ],
          },
        ],
      });

      const prev = StorageService.getPreviousExerciseResults('Жим штанги лёжа', {
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest_mid',
      });
      assert(prev !== null, 'История для упражнения должна быть найдена');
      assert(prev!.lastWeightKg === 67.5, `Ожидался последний вес 67.5 кг, получено ${prev!.lastWeightKg}`);
      assert(prev!.sets.length === 3, 'Должны вернуться все 3 выполненных подхода');

      // Запуск по программе без ручного targetWeight (targetWeight=0, 4 подхода)
      const progSets = resolveInitialExerciseSets({
        exerciseName: 'Жим штанги лёжа',
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest_mid',
        setsCount: 4,
        defaultReps: 8,
        explicitTargetWeight: 0,
        isBodyweight: false,
      });
      assert(
        progSets.map((s) => s.weightKg).join(',') === '60,65,67.5,67.5',
        `Ожидались веса 60,65,67.5,67.5, получено ${progSets.map((s) => s.weightKg).join(',')}`
      );

      // Добавление из каталога в активную тренировку (explicitTargetWeight=null)
      const catalogSets = resolveInitialExerciseSets({
        exerciseName: 'Жим штанги лёжа',
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest_mid',
        setsCount: 3,
        defaultReps: 10,
        explicitTargetWeight: null,
        isBodyweight: false,
      });
      assert(
        catalogSets.map((s) => s.weightKg).join(',') === '60,65,67.5',
        'Добавление из каталога должно подтягивать последние сохранённые веса по подходам'
      );
    });

    return 'Последний сохранённый вес корректно подставляется при старте программы и добавлении из каталога';
  });

  // 45. При нескольких тренировках выбирается самая новая по дате и времени, независимо от порядка в массиве
  test('Рабочие веса и история', 'При нескольких тренировках выбирается самая новая по дате, startTime и completedAt, а не по индексу массива', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');

      // Записываем массив в «перепутанном» порядке: старая дата первой, самая новая — в конце
      store.set(
        'form_workout_sessions',
        JSON.stringify([
          {
            id: 'w_old',
            name: 'Старая',
            date: '2026-11-01',
            startTime: '20:00',
            completedAt: 1000,
            durationMinutes: 40,
            totalVolumeKg: 800,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e1',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }],
              },
            ],
          },
          {
            id: 'w_same_day_morning',
            name: 'Утренняя',
            date: '2026-11-12',
            startTime: '9:05',
            completedAt: 2000,
            durationMinutes: 40,
            totalVolumeKg: 700,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e2',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 70, reps: 10, completed: true }],
              },
            ],
          },
          {
            id: 'w_same_day_evening',
            name: 'Вечерняя самая новая',
            date: '2026-11-12',
            startTime: '19:15',
            completedAt: 3000,
            durationMinutes: 40,
            totalVolumeKg: 750,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e3',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 75, reps: 10, completed: true }],
              },
            ],
          },
        ])
      );

      const res = StorageService.getPreviousExerciseResults('Жим штанги лёжа', {
        exerciseId: 'barbell_bench_press_flat',
      });
      assert(res !== null && res.sessionId === 'w_same_day_evening', `Должна быть выбрана w_same_day_evening, выбрана ${res?.sessionId}`);
      assert(res!.lastWeightKg === 75, `Ожидалось 75 кг, получено ${res!.lastWeightKg}`);

      // Также проверяем выбор по completedAt при одинаковых date и startTime (даже если более новая ниже в массиве)
      store.set(
        'form_workout_sessions',
        JSON.stringify([
          {
            id: 'w_t1',
            name: 'Первая',
            date: '2026-11-12',
            startTime: '18:00',
            completedAt: 10000,
            durationMinutes: 30,
            totalVolumeKg: 500,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e_t1',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 62.5, reps: 8, completed: true }],
              },
            ],
          },
          {
            id: 'w_t2',
            name: 'Вторая позднее по completedAt',
            date: '2026-11-12',
            startTime: '18:00',
            completedAt: 20000,
            durationMinutes: 30,
            totalVolumeKg: 600,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e_t2',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 68, reps: 8, completed: true }],
              },
            ],
          },
        ])
      );

      const resByComp = StorageService.getPreviousExerciseResults('Жим штанги лёжа', {
        exerciseId: 'barbell_bench_press_flat',
      });
      assert(resByComp !== null && resByComp.sessionId === 'w_t2' && resByComp.lastWeightKg === 68, 'При равных дате и времени должна побеждать более поздняя по completedAt');
    });

    return 'Хронологический выбор всегда берёт самую свежую завершённую тренировку';
  });

  // 46. Незавершённая тренировка и невыполненные/пропущенные подходы не влияют на историю
  test('Рабочие веса и история', 'Незавершённые (in_progress/skipped) тренировки и пропущенные подходы не влияют на историю', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      store.set(
        'form_workout_sessions',
        JSON.stringify([
          {
            id: 'w_done_older',
            name: 'Завершённая',
            date: '2026-11-08',
            startTime: '18:00',
            completedAt: 1000,
            durationMinutes: 40,
            totalVolumeKg: 625,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e1',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 62.5, reps: 10, completed: true }],
              },
            ],
          },
          {
            id: 'w_in_progress_newer',
            name: 'Незавершённая',
            date: '2026-11-14',
            startTime: '18:00',
            completedAt: 2000,
            durationMinutes: 15,
            totalVolumeKg: 950,
            completedSets: 1,
            status: 'in_progress',
            exercises: [
              {
                id: 'e2',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 95, reps: 10, completed: true }],
              },
            ],
          },
          {
            id: 'w_skipped_newer',
            name: 'Пропущенная',
            date: '2026-11-15',
            startTime: '18:00',
            completedAt: 3000,
            durationMinutes: 0,
            totalVolumeKg: 0,
            completedSets: 0,
            status: 'skipped',
            exercises: [
              {
                id: 'e3',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 100, reps: 10, completed: true }],
              },
            ],
          },
          {
            id: 'w_done_uncompleted_sets',
            name: 'Завершена без подходов упражнения',
            date: '2026-11-16',
            startTime: '18:00',
            completedAt: 4000,
            durationMinutes: 35,
            totalVolumeKg: 0,
            completedSets: 0,
            status: 'completed',
            exercises: [
              {
                id: 'e4',
                exerciseId: 'barbell_bench_press_flat',
                name: 'Жим штанги лёжа',
                sets: [{ setNumber: 1, weightKg: 110, reps: 8, completed: false }],
              },
            ],
          },
        ])
      );

      const res = StorageService.getPreviousExerciseResults('Жим штанги лёжа', {
        exerciseId: 'barbell_bench_press_flat',
      });
      assert(res !== null && res.sessionId === 'w_done_older', `Ожидалась w_done_older, получена ${res?.sessionId}`);
      assert(res!.lastWeightKg === 62.5, `Вес из незавершённых/невыполненных сессий не должен попадать в историю: получено ${res!.lastWeightKg}`);
    });

    return 'Черновики, skipped и невыполненные подходы полностью игнорируются';
  });

  // 47. 0 кг обрабатывается корректно как валидный вес и не считается отсутствующим
  test('Рабочие веса и история', 'Вес 0 кг в более новой завершённой тренировке сохраняется как история и не откатывается к старому весу', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      store.set(
        'form_workout_sessions',
        JSON.stringify([
          {
            id: 'w_old_80',
            name: 'Старая 80 кг',
            date: '2026-11-01',
            startTime: '18:00',
            completedAt: 1000,
            durationMinutes: 40,
            totalVolumeKg: 800,
            completedSets: 1,
            status: 'completed',
            exercises: [
              {
                id: 'e1',
                exerciseId: 'pullups_classic',
                name: 'Подтягивания',
                isBodyweight: true,
                sets: [{ setNumber: 1, weightKg: 80, reps: 8, completed: true }],
              },
            ],
          },
          {
            id: 'w_new_zero',
            name: 'Новая без отягощения (0 кг)',
            date: '2026-11-12',
            startTime: '18:00',
            completedAt: 2000,
            durationMinutes: 40,
            totalVolumeKg: 0,
            completedSets: 2,
            status: 'completed',
            exercises: [
              {
                id: 'e2',
                exerciseId: 'pullups_classic',
                name: 'Подтягивания',
                isBodyweight: true,
                sets: [
                  { setNumber: 1, weightKg: 0, reps: 10, completed: true },
                  { setNumber: 2, weightKg: 0, reps: 9, completed: true },
                ],
              },
            ],
          },
        ])
      );

      const res = StorageService.getPreviousExerciseResults('Подтягивания', {
        exerciseId: 'pullups_classic',
      });
      assert(res !== null && res.sessionId === 'w_new_zero', 'Должна выбираться более новая тренировка с 0 кг');
      assert(res!.lastWeightKg === 0, `0 кг должен возвращаться как валидный вес, получено ${res!.lastWeightKg}`);
      assert(res!.sets.every((s) => s.weightKg === 0), 'Все подходы должны иметь weightKg === 0');

      const resolved = resolveInitialExerciseSets({
        exerciseName: 'Подтягивания',
        exerciseId: 'pullups_classic',
        setsCount: 3,
        defaultReps: 10,
        explicitTargetWeight: 0,
        isBodyweight: true,
      });
      assert(
        resolved.every((s) => s.weightKg === 0 && s.previousWeightKg === 0),
        'resolveInitialExerciseSets обязан сохранять 0 кг из последней истории'
      );
    });

    return 'Вес 0 кг не считается отсутствующим и перекрывает более старые ненулевые значения';
  });

  // 48. Отсутствие истории, похожие названия, позиционные ID и одноимённые упражнения
  test('Рабочие веса и история', 'Отсутствие истории не даёт ошибок; похожие названия, позиционные ex_0 и разные мышцы не смешиваются', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');

      // Пустое имя / пустые сессии не вызывают исключений
      assert(StorageService.getPreviousExerciseResults('') === null, 'Пустое имя возвращает null');
      assert(StorageService.getPreviousExerciseResults('Несуществующее упражнение') === null, 'Отсутствующая история возвращает null');

      // Два кастомных упражнения с одинаковым названием, но для разных мышечных групп
      store.set(
        'form_custom_exercises_v1',
        JSON.stringify([
          {
            id: 'custom_same_chest',
            name: 'Тяга блока',
            primaryMuscle: 'chest_mid',
            secondaryMuscles: [],
            isCustom: true,
          },
          {
            id: 'custom_same_back',
            name: 'Тяга блока',
            primaryMuscle: 'back_lats',
            secondaryMuscles: [],
            isCustom: true,
          },
        ])
      );

      store.set(
        'form_workout_sessions',
        JSON.stringify([
          {
            id: 'w_isolation',
            name: 'Проверка изоляции',
            date: '2026-11-11',
            startTime: '18:00',
            completedAt: 1000,
            durationMinutes: 45,
            totalVolumeKg: 2000,
            completedSets: 3,
            status: 'completed',
            exercises: [
              {
                id: 'e_close',
                name: 'Жим штанги лёжа узким хватом',
                sets: [{ setNumber: 1, weightKg: 90, reps: 6, completed: true }],
              },
              {
                id: 'e_squat_pos',
                exerciseId: 'ex_0',
                name: 'Приседания со штангой',
                sets: [{ setNumber: 1, weightKg: 110, reps: 5, completed: true }],
              },
              {
                id: 'e_back_block',
                exerciseId: 'custom_same_back',
                name: 'Тяга блока',
                targetMuscle: 'back_lats',
                sets: [{ setNumber: 1, weightKg: 55, reps: 12, completed: true }],
              },
            ],
          },
        ])
      );

      // Похожее название ("Жим штанги лёжа" vs "Жим штанги лёжа узким хватом") НЕ должно совпадать
      // И позиционный exerciseId: 'ex_0' НЕ должен матчить Приседания со штангой!
      const similarRes = StorageService.getPreviousExerciseResults('Жим штанги лёжа', {
        exerciseId: 'ex_0',
        targetMuscle: 'chest_mid',
      });
      assert(similarRes === null, 'Похожее название и позиционный id ex_0 не должны подтягивать вес чужого упражнения');

      // Одноимённые упражнения на разные целевые мышцы не смешиваются
      const chestBlock = StorageService.getPreviousExerciseResults('Тяга блока', {
        targetMuscle: 'chest_mid',
      });
      assert(chestBlock === null, 'Тяга блока для груди не должна брать вес от Тяги блока для спины');

      const backBlock = StorageService.getPreviousExerciseResults('Тяга блока', {
        targetMuscle: 'back_lats',
      });
      assert(backBlock !== null && backBlock.lastWeightKg === 55, 'Тяга блока для спины должна найти свои 55 кг');
    });

    return 'Похожие названия, позиционные ex_0 и разные целевые мышцы строго изолированы';
  });

  // 49. Вес, заданный пользователем в редакторе программы (в рамках Safety Guard), не перезаписывается историей
  test('Рабочие веса и история', 'Вес, явно заданный пользователем в редакторе программы, не перезаписывается историей', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ age: 28, weightKg: 80 });
      StorageService.saveWorkoutSession({
        id: 'w_prev_bench',
        name: 'Прошлая тренировка',
        date: formatLocalIsoDate(new Date()),
        startTime: '18:00',
        durationMinutes: 40,
        totalVolumeKg: 600,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest_mid',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 60, reps: 10, completed: true }],
          },
        ],
      });

      const resolved = resolveInitialExerciseSets({
        exerciseName: 'Жим штанги лёжа',
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest_mid',
        setsCount: 3,
        defaultReps: 8,
        explicitTargetWeight: 62.5,
        isBodyweight: false,
      });

      assert(resolved.length === 3, 'Должно быть 3 подхода');
      assert(
        resolved.every((s) => s.weightKg === 62.5),
        `Явно заданный в программе безопасный вес 62.5 кг не должен перезаписываться историей (60 кг): получено ${resolved.map((s) => s.weightKg).join(',')}`
      );
    });

    return 'Пользовательский targetWeight > 0 из редактора программы имеет приоритет над историей';
  });

  // ============================================================================
  // ЭТАП 2: ЕДИНЫЙ РАСЧЁТ ТРЕНИРОВОЧНОЙ НАГРУЗКИ (ТОННАЖА)
  // ============================================================================

  // 50. Чистые функции calculateSetLoad и getBodyweightEquivalentKg
  test('Единый расчёт нагрузки', 'calculateSetLoad: обычные (0 и 20 кг), собственный вес (0 и +15 кг), неизвестный вес и битые значения', () => {
    // Обычное упражнение с 0 кг -> строго 0 (даже при весе пользователя 80 кг)
    const regZero = calculateSetLoad({
      isBodyweight: false,
      weightKg: 0,
      reps: 10,
      userBodyWeightKg: 80,
    });
    assert(regZero.effectiveWeightKg === 0 && regZero.volumeKg === 0, 'Обычное с 0 кг должно давать 0 тоннажа');

    // Обычное упражнение с 20 кг -> 200 кг
    const reg20 = calculateSetLoad({
      isBodyweight: false,
      weightKg: 20,
      reps: 10,
      userBodyWeightKg: 80,
    });
    assert(reg20.effectiveWeightKg === 20 && reg20.volumeKg === 200, 'Обычное 20 кг × 10 должно давать 200 кг');

    // Собственный вес (профиль 80 кг -> эквивалент 40 кг), без доп. веса -> 400 кг
    assert(getBodyweightEquivalentKg(80) === 40, 'Эквивалент собственного веса для 80 кг должен быть 40 кг');
    const bwOnly = calculateSetLoad({
      isBodyweight: true,
      weightKg: 0,
      reps: 10,
      userBodyWeightKg: 80,
    });
    assert(
      bwOnly.bodyweightEquivalentKg === 40 &&
        bwOnly.additionalWeightKg === 0 &&
        bwOnly.effectiveWeightKg === 40 &&
        bwOnly.volumeKg === 400,
      `Собственный вес 80 кг (50%=40) × 10 должен давать 400, получено ${bwOnly.volumeKg}`
    );

    // Собственный вес + 15 кг отягощения -> (40 + 15) × 10 = 550 кг
    const bwPlus15 = calculateSetLoad({
      isBodyweight: true,
      weightKg: 15,
      reps: 10,
      userBodyWeightKg: 80,
    });
    assert(
      bwPlus15.effectiveWeightKg === 55 && bwPlus15.volumeKg === 550,
      `Собственный вес 40 + 15 × 10 должен давать 550, получено ${bwPlus15.volumeKg}`
    );

    // Явный additionalWeightKg не должен складываться дважды с weightKg
    const bwExplicitAdditional = calculateSetLoad({
      isBodyweight: true,
      weightKg: 15,
      additionalWeightKg: 15,
      reps: 10,
      userBodyWeightKg: 80,
    });
    assert(
      bwExplicitAdditional.effectiveWeightKg === 55 && bwExplicitAdditional.volumeKg === 550,
      'additionalWeightKg не должен давать двойной учёт'
    );

    // Неизвестный вес пользователя (0, null, undefined, -10, NaN) -> эквивалент 0 (без выдуманных 25 кг)
    assert(getBodyweightEquivalentKg(0) === 0, 'При 0 кг профиля эквивалент должен быть 0');
    assert(getBodyweightEquivalentKg(null) === 0, 'При null профиля эквивалент должен быть 0');
    assert(getBodyweightEquivalentKg(undefined) === 0, 'При undefined профиля эквивалент должен быть 0');
    assert(getBodyweightEquivalentKg(-70) === 0, 'При отрицательном весе профиля эквивалент должен быть 0');
    assert(getBodyweightEquivalentKg(Number.NaN) === 0, 'При NaN весе профиля эквивалент должен быть 0');

    const bwUnknownProfileNoExtra = calculateSetLoad({
      isBodyweight: true,
      weightKg: 0,
      reps: 10,
      userBodyWeightKg: 0,
    });
    assert(bwUnknownProfileNoExtra.volumeKg === 0, 'При неизвестном весе тела и 0 доп. веса тоннаж должен быть 0');

    const bwUnknownProfileWith15 = calculateSetLoad({
      isBodyweight: true,
      weightKg: 15,
      reps: 10,
      userBodyWeightKg: undefined,
    });
    assert(
      bwUnknownProfileWith15.effectiveWeightKg === 15 && bwUnknownProfileWith15.volumeKg === 150,
      'При неизвестном весе тела, но +15 кг доп. веса тоннаж должен быть 150'
    );

    // Битые / отрицательные / NaN / Infinity значения
    const malformed = calculateSetLoad({
      isBodyweight: false,
      weightKg: Number.NaN,
      reps: -5,
      userBodyWeightKg: Number.POSITIVE_INFINITY,
    });
    assert(
      malformed.effectiveWeightKg === 0 && malformed.reps === 0 && malformed.volumeKg === 0,
      'NaN и отрицательные значения должны безопасно санитизироваться в 0'
    );

    const negWeight = calculateSetLoad({
      isBodyweight: true,
      weightKg: -10,
      reps: Number.POSITIVE_INFINITY,
      userBodyWeightKg: 80,
    });
    assert(
      negWeight.additionalWeightKg === 0 && negWeight.reps === 0 && negWeight.volumeKg === 0,
      'Отрицательный weightKg и Infinity reps должны давать 0'
    );

    return 'calculateSetLoad и getBodyweightEquivalentKg корректны для всех сценариев и краевых значений';
  });

  // 51. calculateWorkoutMetrics и calculateExerciseVolumeKg (много подходов, skipped, незавершённые)
  test('Единый расчёт нагрузки', 'calculateWorkoutMetrics: учитывает только completed и непропущенные упражнения', () => {
    const exercises = [
      {
        isBodyweight: false,
        skipped: false,
        sets: [
          { setNumber: 1, weightKg: 0, reps: 10, completed: true },
          { setNumber: 2, weightKg: 20, reps: 10, completed: true },
          { setNumber: 3, weightKg: 100, reps: 10, completed: false }, // не выполнен
        ],
      },
      {
        isBodyweight: true,
        skipped: false,
        sets: [
          { setNumber: 1, weightKg: 0, reps: 10, completed: true }, // 40 * 10 = 400
          { setNumber: 2, weightKg: 15, reps: 10, completed: true }, // 55 * 10 = 550
        ],
      },
      {
        isBodyweight: false,
        skipped: true, // пропущено целиком
        sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }],
      },
    ];

    assert(calculateExerciseVolumeKg(exercises[0], 80) === 200, 'Обычное упражнение: 0 + 200 = 200');
    assert(calculateExerciseVolumeKg(exercises[1], 80) === 950, 'Собственный вес: 400 + 550 = 950');
    assert(calculateExerciseVolumeKg(exercises[2], 80) === 0, 'Пропущенное упражнение должно давать 0');

    const metrics = calculateWorkoutMetrics(exercises, 80);
    assert(
      metrics.totalVolumeKg === 1150 && metrics.completedSets === 4 && metrics.totalReps === 40,
      `Ожидались 1150 кг / 4 подхода / 40 повторов, получено ${metrics.totalVolumeKg}/${metrics.completedSets}/${metrics.totalReps}`
    );

    return 'Многоподходный расчёт, фильтр completed и skipped работают единообразно';
  });

  // 52. Согласованность объёма между calculateWorkoutMetrics, getSessionVolumeKg, getWorkoutAnalytics, getDayActivityData и calculateProgramStats
  test('Единый расчёт нагрузки', 'Одинаковые данные дают идентичный объём в coreMath, аналитике, активности и статистике программы', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({
        name: 'Тест',
        age: 30,
        heightCm: 180,
        weightKg: 80,
        fitnessGoal: 'Сила',
        experienceLevel: 'Средний',
      });

      StorageService.saveProgram({
        id: 'prog_unified_1',
        name: 'Смешанная программа',
        description: 'Тест',
        goal: 'Сила',
        daysPerWeek: 3,
        workouts: [],
        isCustom: true,
        createdAt: todayIso,
      });

      const session = {
        id: 'w_unified_consistency',
        programId: 'prog_unified_1',
        programName: 'Смешанная программа',
        name: 'Смешанная тренировка',
        date: todayIso,
        startTime: '18:00',
        durationMinutes: 45,
        totalVolumeKg: 99999, // Намеренно устаревшее/неверное сохранённое значение
        completedSets: 4,
        totalReps: 40,
        status: 'completed' as const,
        exercises: [
          {
            id: 'e_reg',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest_mid' as const,
            secondaryMuscles: [],
            isBodyweight: false,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 0, reps: 10, completed: true },
              { setNumber: 2, weightKg: 20, reps: 10, completed: true },
            ],
          },
          {
            id: 'e_bw',
            exerciseId: 'pull_ups',
            name: 'Подтягивания',
            targetMuscle: 'lats' as const,
            secondaryMuscles: [],
            isBodyweight: true,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 0, reps: 10, completed: true },
              { setNumber: 2, weightKg: 15, reps: 10, completed: true },
            ],
          },
        ],
      };

      StorageService.saveWorkoutSession(session);

      const coreTotal = calculateWorkoutMetrics(session.exercises, 80).totalVolumeKg;
      const storedList = StorageService.getWorkoutSessions();
      const dynamicTotal = StorageService.getSessionVolumeKg(storedList[0]);
      const analytics = StorageService.getWorkoutAnalytics('30d');
      const dayActivity = StorageService.getDayActivityData(todayIso);
      const programStats = StorageService.calculateProgramStats('prog_unified_1');

      assert(coreTotal === 1150, `coreMath ожидал 1150, получено ${coreTotal}`);
      assert(dynamicTotal === 1150, `getSessionVolumeKg ожидал 1150, получено ${dynamicTotal}`);
      assert(analytics.totalVolumeKg === 1150, `getWorkoutAnalytics ожидал 1150, получено ${analytics.totalVolumeKg}`);
      assert(dayActivity.totalVolumeKg === 1150, `getDayActivityData ожидал 1150, получено ${dayActivity.totalVolumeKg}`);
      assert(programStats.totalVolumeKg === 1150, `calculateProgramStats ожидал 1150, получено ${programStats.totalVolumeKg}`);
    });

    return 'Объём 1150 кг идентичен во всех расчётных модулях';
  });

  // 53. Обычное упражнение с 0 кг НЕ получает fallbackWeight (25 кг или 50% массы тела) в статистике и диагностике мышц
  test('Единый расчёт нагрузки', 'Обычное упражнение с 0 кг не получает fallbackWeight (25 кг / 50% веса) в статистике и диагностике мышц', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({
        name: 'Тест',
        age: 28,
        heightCm: 178,
        weightKg: 80,
        fitnessGoal: 'Сила',
        experienceLevel: 'Новичок',
      });

      StorageService.saveWorkoutSession({
        id: 'w_zero_reg',
        name: 'Жим с нулевым весом',
        date: todayIso,
        startTime: '12:00',
        durationMinutes: 25,
        totalVolumeKg: 0,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest_mid',
            secondaryMuscles: ['triceps'],
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 0, reps: 12, completed: true }],
          },
        ],
      });

      const stats = StorageService.getMuscleStats('7d');
      const diag = StorageService.getDetailedMuscleDiagnostics('chest_mid', '7d');

      assert(stats.chest_mid.weeklyTonnageKg === 0, `Ожидался 0 кг в stats.chest_mid, получено ${stats.chest_mid.weeklyTonnageKg}`);
      assert(stats.chest_mid.percent === 0, `Ожидался 0% в stats.chest_mid при нулевом тоннаже, получено ${stats.chest_mid.percent}`);
      assert(diag.totalEffectiveTonnage === 0, `Ожидался 0 кг в диагностике, получено ${diag.totalEffectiveTonnage}`);
      assert(diag.effectivePercent === 0, `Ожидался 0% в диагностике при 0 кг, получено ${diag.effectivePercent}`);
      assert(diag.setsDetails.length === 1 && diag.setsDetails[0].usedWeightKg === 0, 'usedWeightKg должен быть 0');
      assert(diag.setsDetails[0].isBodyweightFallback === false, 'isBodyweightFallback должен быть false для обычного упражнения');
    });

    return 'Обычное упражнение с 0 кг даёт 0 кг и 0% нагрузки без fallbackWeight';
  });

  // 54. Упражнения с собственным весом: без отягощения, с +15 кг и при неизвестном весе тела
  test('Единый расчёт нагрузки', 'getMuscleStats и getDetailedMuscleDiagnostics: собственный вес + доп. отягощение и неизвестный вес тела', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());

      // Сценарий А: вес тела 80 кг (эквивалент 40 кг)
      StorageService.updateProfile({
        name: 'Атлет',
        age: 29,
        heightCm: 180,
        weightKg: 80,
        fitnessGoal: 'Мышцы',
        experienceLevel: 'Средний',
      });

      StorageService.saveWorkoutSession({
        id: 'w_bw_cases',
        name: 'Турник',
        date: todayIso,
        startTime: '17:00',
        durationMinutes: 30,
        totalVolumeKg: 950,
        completedSets: 2,
        status: 'completed',
        exercises: [
          {
            id: 'e_pullups',
            exerciseId: 'pull_ups',
            name: 'Подтягивания',
            targetMuscle: 'lats',
            secondaryMuscles: ['biceps'],
            isBodyweight: true,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 0, reps: 10, completed: true }, // 40 * 10 = 400
              { setNumber: 2, weightKg: 15, reps: 10, completed: true }, // (40 + 15) * 10 = 550
            ],
          },
        ],
      });

      const statsKnown = StorageService.getMuscleStats('7d');
      const diagKnown = StorageService.getDetailedMuscleDiagnostics('lats', '7d');
      assert(statsKnown.lats.weeklyTonnageKg === 950, `Ожидалось 950 кг для lats, получено ${statsKnown.lats.weeklyTonnageKg}`);
      assert(diagKnown.totalEffectiveTonnage === 950, `Диагностика должна вернуть 950 кг, получено ${diagKnown.totalEffectiveTonnage}`);
      assert(diagKnown.setsDetails[0].usedWeightKg === 40 && diagKnown.setsDetails[1].usedWeightKg === 55, 'Подходы должны использовать 40 и 55 кг');

      // Сценарий Б: новая тренировка при неизвестной массе тела (0 кг) -> 0 * 10 + 15 * 10 = 150 кг (без выдуманных 25 кг)
      StorageService.deleteWorkoutSession('w_bw_cases');
      StorageService.updateProfile({
        name: 'Атлет',
        age: 29,
        heightCm: 180,
        weightKg: 0,
        fitnessGoal: 'Мышцы',
        experienceLevel: 'Средний',
      });
      StorageService.saveWorkoutSession({
        id: 'w_bw_cases_unknown',
        name: 'Турник (неизвестный вес тела)',
        date: todayIso,
        startTime: '18:00',
        durationMinutes: 30,
        totalVolumeKg: 150,
        completedSets: 2,
        status: 'completed',
        exercises: [
          {
            id: 'e_pullups_2',
            exerciseId: 'pull_ups',
            name: 'Подтягивания',
            targetMuscle: 'lats',
            secondaryMuscles: ['biceps'],
            isBodyweight: true,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 0, reps: 10, completed: true },
              { setNumber: 2, weightKg: 15, reps: 10, completed: true },
            ],
          },
        ],
      });

      const statsUnknown = StorageService.getMuscleStats('7d');
      const diagUnknown = StorageService.getDetailedMuscleDiagnostics('lats', '7d');
      assert(statsUnknown.lats.weeklyTonnageKg === 150, `При неизвестном весе тела ожидалось 150 кг, получено ${statsUnknown.lats.weeklyTonnageKg}`);
      assert(diagUnknown.totalEffectiveTonnage === 150, `Диагностика при 0 кг профиля должна вернуть 150 кг, получено ${diagUnknown.totalEffectiveTonnage}`);
      assert(diagUnknown.setsDetails[0].isBodyweightFallback === false, 'При 0 кг профиля isBodyweightFallback должен быть false');
    });

    return 'Собственный вес + дополнительное отягощение и неизвестный вес тела считаются одинаково в stats и diagnostics';
  });

  // 55. Согласованность skipped, вторичных мышц (0.45) и алиасов между getMuscleStats и getDetailedMuscleDiagnostics
  test('Единый расчёт нагрузки', 'getMuscleStats и getDetailedMuscleDiagnostics одинаково фильтруют skipped и считают вторичные мышцы (0.45)', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.saveWorkoutSession({
        id: 'w_diag_parity',
        name: 'Жим + пропущенное',
        date: todayIso,
        startTime: '19:00',
        durationMinutes: 40,
        totalVolumeKg: 1000,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest_mid',
            secondaryMuscles: ['triceps', 'front_delts'],
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 100, reps: 10, completed: true }],
          },
          {
            id: 'e2_skipped',
            exerciseId: 'dips',
            name: 'Отжимания на брусьях',
            targetMuscle: 'triceps',
            secondaryMuscles: ['chest_mid'],
            isBodyweight: false,
            skipped: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 50, reps: 10, completed: true }],
          },
        ],
      });

      const stats = StorageService.getMuscleStats('7d');
      const diagMid = StorageService.getDetailedMuscleDiagnostics('chest_mid', '7d');
      const diagTriceps = StorageService.getDetailedMuscleDiagnostics('triceps', '7d');
      const diagChestRollup = StorageService.getDetailedMuscleDiagnostics('chest', '7d');

      assert(stats.chest_mid.weeklyTonnageKg === 1000 && diagMid.totalEffectiveTonnage === 1000, 'chest_mid: 1000 кг в обоих методах');
      assert(stats.triceps.weeklyTonnageKg === 450 && diagTriceps.totalEffectiveTonnage === 450, `triceps (0.45, без skipped): ожидалось 450, stats=${stats.triceps.weeklyTonnageKg}, diag=${diagTriceps.totalEffectiveTonnage}`);
      assert(stats.chest.weeklyTonnageKg === 1000 && diagChestRollup.totalEffectiveTonnage === 1000, `chest rollup (primary head): ожидалось 1000, stats=${stats.chest.weeklyTonnageKg}, diag=${diagChestRollup.totalEffectiveTonnage}`);
    });

    return 'stats и diagnostics полностью совпадают по skipped, 0.45 и rollup-мышцам';
  });

  // 56. Изменение массы тела пользователя НЕ меняет историю завершённой тренировки и не мутирует веса подходов
  test('Единый расчёт нагрузки', 'Изменение массы тела в профиле не пересчитывает завершённую тренировку и не мутирует подходы', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());

      StorageService.updateProfile({
        name: 'Пользователь',
        age: 30,
        heightCm: 175,
        weightKg: 70,
        fitnessGoal: 'Сила',
        experienceLevel: 'Средний',
      });

      StorageService.saveWorkoutSession({
        id: 'w_bodyweight_dynamic',
        name: 'Брусья +10 кг',
        date: todayIso,
        startTime: '14:00',
        durationMinutes: 20,
        totalVolumeKg: 450,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_dips',
            exerciseId: 'parallel_bar_dips',
            name: 'Отжимания на брусьях',
            targetMuscle: 'chest_mid',
            secondaryMuscles: ['triceps'],
            isBodyweight: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 10, reps: 10, completed: true }],
          },
        ],
      });

      assert(StorageService.getWorkoutAnalytics('30d').totalVolumeKg === 450, 'При 70 кг профиля (35+10)×10 = 450 кг');

      // Меняем вес профиля на 90 кг — завершённая тренировка должна сохранить снимок 70 кг и 450 кг тоннажа
      StorageService.updateProfile({
        name: 'Пользователь',
        age: 30,
        heightCm: 175,
        weightKg: 90,
        fitnessGoal: 'Сила',
        experienceLevel: 'Средний',
      });

      const savedSessions = StorageService.getWorkoutSessions();
      assert(savedSessions[0].bodyWeightKgAtWorkout === 70, 'Снимок массы тела 70 кг должен сохраниться на тренировке');
      assert(savedSessions[0].exercises[0].sets[0].weightKg === 10, 'Исходный вес +10 кг в localStorage не должен мутироваться');
      assert(StorageService.getSessionVolumeKg(savedSessions[0]) === 450, 'getSessionVolumeKg должен сохранять исторические 450 кг');
      assert(StorageService.getWorkoutAnalytics('30d').totalVolumeKg === 450, 'Аналитика должна сохранять исторические 450 кг');
      assert(StorageService.getMuscleStats('7d').chest_mid.weeklyTonnageKg === 450, 'getMuscleStats должен сохранять исторические 450 кг');
      assert(StorageService.getDetailedMuscleDiagnostics('chest_mid', '7d').totalEffectiveTonnage === 450, 'Диагностика должна сохранять исторические 450 кг');
      assert(StorageService.getExerciseDetailedHistory('Отжимания на брусьях')[0].volume === 450, 'История упражнения должна сохранять исторические 450 кг');
    });

    return 'Завершённая тренировка сохраняет исторический вес тела и не меняется при редактировании профиля';
  });

  // 57. getExerciseDetailedHistory и Personal Records: собственный вес vs рабочий вес
  test('Единый расчёт нагрузки', 'getExerciseDetailedHistory использует единую формулу объёма и сохраняет корректный maxWeight/PR', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({
        name: 'Тест',
        age: 26,
        heightCm: 177,
        weightKg: 80,
        fitnessGoal: 'Сила',
        experienceLevel: 'Средний',
      });

      StorageService.saveWorkoutSession({
        id: 'w_hist_pr',
        name: 'Силовая + Подтягивания',
        date: todayIso,
        startTime: '16:00',
        durationMinutes: 40,
        totalVolumeKg: 1350,
        completedSets: 3,
        status: 'completed',
        exercises: [
          {
            id: 'e_bench',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest_mid',
            isBodyweight: false,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 0, reps: 10, completed: true },
              { setNumber: 2, weightKg: 80, reps: 10, completed: true },
            ],
          },
          {
            id: 'e_pullups',
            exerciseId: 'pull_ups',
            name: 'Подтягивания',
            targetMuscle: 'lats',
            isBodyweight: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 15, reps: 10, completed: true }],
          },
        ],
      });

      const benchHist = StorageService.getExerciseDetailedHistory('Жим штанги лёжа');
      assert(benchHist.length === 1 && benchHist[0].volume === 800, 'Жим: 0*10 + 80*10 = 800');
      assert(benchHist[0].maxWeight === 80, 'maxWeight жима должен быть 80');
      const pr = StorageService.getPersonalRecord('Жим штанги лёжа');
      assert(pr !== null && pr.maxWeight === 80 && pr.maxRepsAtMax === 10, 'PR расчёт для жима не нарушен');

      const pullHist = StorageService.getExerciseDetailedHistory('Подтягивания');
      assert(pullHist.length === 1 && pullHist[0].volume === 550, 'Подтягивания: (40 + 15) * 10 = 550');
      assert(pullHist[0].maxWeight === 15, 'maxWeight для подтягиваний должен оставаться введённым внешним весом 15 кг');
    });

    return 'История упражнения и PR работают корректно без подмены рабочих весов';
  });

  // ============================================================================
  // ЭТАП 3: ИСТОРИЧЕСКАЯ МАССА ТЕЛА ПОЛЬЗОВАТЕЛЯ В ТРЕНИРОВКЕ
  // ============================================================================

  // 58. Новая тренировка сохраняет массу тела пользователя
  test('Историческая масса тела', 'Новая завершённая тренировка фиксирует текущую массу тела пользователя (bodyWeightKgAtWorkout)', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({
        name: 'Атлет',
        age: 28,
        heightCm: 180,
        weightKg: 82.5,
        fitnessGoal: 'Сила',
        experienceLevel: 'Средний',
      });

      const res = StorageService.saveWorkoutSession({
        id: 'w_snapshot_1',
        name: 'Турник',
        date: todayIso,
        startTime: '18:00',
        durationMinutes: 35,
        totalVolumeKg: 410,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_pull',
            exerciseId: 'pull_ups',
            name: 'Подтягивания',
            targetMuscle: 'lats',
            isBodyweight: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 0, reps: 10, completed: true }],
          },
        ],
      });

      assert(res.ok, 'Сохранение тренировки должно пройти успешно');
      const saved = StorageService.getWorkoutSessions();
      assert(saved.length === 1, 'Должна быть 1 сохранённая тренировка');
      assert(
        saved[0].bodyWeightKgAtWorkout === 82.5,
        `Ожидался снимок bodyWeightKgAtWorkout === 82.5, получено ${saved[0].bodyWeightKgAtWorkout}`
      );
      assert(StorageService.getSessionVolumeKg(saved[0]) === 410, 'round(82.5*0.5)=41, 41×10=410 кг');
    });

    return 'Новая завершённая тренировка фиксирует bodyWeightKgAtWorkout из профиля';
  });

  // 59. Изменение текущей массы тела не меняет объём завершённой тренировки
  test('Историческая масса тела', 'Изменение текущей массы тела в профиле не меняет объём уже завершённой тренировки', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({ weightKg: 70 });

      StorageService.saveWorkoutSession({
        id: 'w_hist_locked',
        name: 'Брусья',
        date: todayIso,
        startTime: '17:00',
        durationMinutes: 25,
        totalVolumeKg: 350,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_dips',
            exerciseId: 'parallel_bar_dips',
            name: 'Отжимания на брусьях',
            targetMuscle: 'chest_mid',
            isBodyweight: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 0, reps: 10, completed: true }],
          },
        ],
      });

      const beforeAnalytics = StorageService.getWorkoutAnalytics('30d').totalVolumeKg;
      assert(beforeAnalytics === 350, `До смены профиля ожидалось 350 кг, получено ${beforeAnalytics}`);

      // Пользователь поправился или похудел до 96 кг — старая тренировка остаётся с 350 кг
      StorageService.updateProfile({ weightKg: 96 });

      const sessions = StorageService.getWorkoutSessions();
      assert(sessions[0].bodyWeightKgAtWorkout === 70, 'Исторический вес 70 кг не должен перезаписываться');
      assert(StorageService.getSessionVolumeKg(sessions[0]) === 350, 'Объём сессии должен остаться 350 кг');
      assert(StorageService.getWorkoutAnalytics('30d').totalVolumeKg === 350, 'Аналитика должна остаться 350 кг');
      assert(StorageService.getMuscleStats('7d').chest_mid.weeklyTonnageKg === 350, 'Статистика мышц должна остаться 350 кг');
      assert(StorageService.getDetailedMuscleDiagnostics('chest_mid', '7d').totalEffectiveTonnage === 350, 'Диагностика должна остаться 350 кг');
      assert(StorageService.getExerciseDetailedHistory('Отжимания на брусьях')[0].volume === 350, 'История упражнения должна остаться 350 кг');
      assert(StorageService.getDayActivityData(todayIso).totalVolumeKg === 350, 'Дневная активность должна остаться 350 кг');
    });

    return 'Завершённая тренировка полностью защищена от заднечислового пересчёта при смене веса профиля';
  });

  // 60. Две тренировки с разной массой тела рассчитываются независимо
  test('Историческая масса тела', 'Две тренировки с разной массой тела в прошлом рассчитываются независимо', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const now = new Date();
      const d1 = formatLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));
      const d2 = formatLocalIsoDate(now);

      // Тренировка 1 при массе тела 70 кг -> эквивалент 35 кг, +10 кг = 45 кг × 10 = 450 кг
      StorageService.updateProfile({ weightKg: 70 });
      StorageService.saveWorkoutSession({
        id: 'w_diff_1',
        name: 'Брусья №1',
        date: d1,
        startTime: '18:00',
        durationMinutes: 30,
        totalVolumeKg: 450,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'parallel_bar_dips',
            name: 'Отжимания на брусьях',
            targetMuscle: 'chest_mid',
            isBodyweight: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 10, reps: 10, completed: true }],
          },
        ],
      });

      // Тренировка 2 при массе тела 90 кг -> эквивалент 45 кг, +10 кг = 55 кг × 10 = 550 кг
      StorageService.updateProfile({ weightKg: 90 });
      StorageService.saveWorkoutSession({
        id: 'w_diff_2',
        name: 'Брусья №2',
        date: d2,
        startTime: '18:00',
        durationMinutes: 30,
        totalVolumeKg: 550,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e2',
            exerciseId: 'parallel_bar_dips',
            name: 'Отжимания на брусьях',
            targetMuscle: 'chest_mid',
            isBodyweight: true,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 10, reps: 10, completed: true }],
          },
        ],
      });

      // Позже профиль стал 110 кг — обе прошлые тренировки всё равно считаются по своим снимкам (450 и 550)
      StorageService.updateProfile({ weightKg: 110 });

      const sessions = StorageService.getWorkoutSessions();
      const s1 = sessions.find((s) => s.id === 'w_diff_1')!;
      const s2 = sessions.find((s) => s.id === 'w_diff_2')!;
      assert(s1.bodyWeightKgAtWorkout === 70 && StorageService.getSessionVolumeKg(s1) === 450, 'Первая тренировка: 70 кг -> 450 кг');
      assert(s2.bodyWeightKgAtWorkout === 90 && StorageService.getSessionVolumeKg(s2) === 550, 'Вторая тренировка: 90 кг -> 550 кг');
      assert(StorageService.getWorkoutAnalytics('30d').totalVolumeKg === 1000, 'Суммарная аналитика: 450 + 550 = 1000 кг');
      assert(StorageService.getMuscleStats('7d').chest_mid.weeklyTonnageKg === 1000, 'Статистика мышц: 1000 кг');
      assert(StorageService.getDetailedMuscleDiagnostics('chest_mid', '7d').totalEffectiveTonnage === 1000, 'Диагностика: 1000 кг');

      const history = StorageService.getExerciseDetailedHistory('Отжимания на брусьях');
      assert(history.length === 2 && history[0].volume === 450 && history[1].volume === 550, 'История: точки 450 и 550 кг');
    });

    return 'Разные тренировки используют собственные исторические снимки массы тела независимо от текущего профиля';
  });

  // 61. Неизвестная масса тела не подменяется случайным значением
  test('Историческая масса тела', 'Неизвестная масса тела при завершении фиксируется как null и не подменяется при заполнении профиля позже', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({ weightKg: 0 });

      StorageService.saveWorkoutSession({
        id: 'w_unknown_bw',
        name: 'Подтягивания без веса профиля',
        date: todayIso,
        startTime: '12:00',
        durationMinutes: 25,
        totalVolumeKg: 150,
        completedSets: 2,
        status: 'completed',
        exercises: [
          {
            id: 'e_pull',
            exerciseId: 'pull_ups',
            name: 'Подтягивания',
            targetMuscle: 'lats',
            isBodyweight: true,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 0, reps: 10, completed: true },  // 0 * 10 = 0 (без 25 кг)
              { setNumber: 2, weightKg: 15, reps: 10, completed: true }, // 15 * 10 = 150
            ],
          },
        ],
      });

      const saved = StorageService.getWorkoutSessions()[0];
      assert(saved.bodyWeightKgAtWorkout === null, `При weightKg=0 должен сохраниться null, получено ${saved.bodyWeightKgAtWorkout}`);
      assert(StorageService.getSessionVolumeKg(saved) === 150, 'Объём должен быть 150 кг (только доп. вес)');

      // Позже пользователь указал в профиле 84 кг — старая тренировка с null НЕ пересчитывается задним числом
      StorageService.updateProfile({ weightKg: 84 });
      const reloaded = StorageService.getWorkoutSessions()[0];
      assert(reloaded.bodyWeightKgAtWorkout === null, 'Снимок null не должен перезаписываться');
      assert(StorageService.getSessionVolumeKg(reloaded) === 150, 'Объём старой тренировки с неизвестным весом остаётся 150 кг');
      assert(StorageService.getMuscleStats('7d').lats.weeklyTonnageKg === 150, 'Статистика мышц остаётся 150 кг');
    });

    return 'Неизвестный вес тела сохраняется как null и не заменяется ни 25 кг, ни будущим весом профиля';
  });

  // 62. Старые записи без поля bodyWeightKgAtWorkout продолжают корректно обрабатываться без подмены истории
  test('Историческая масса тела', 'Старые записи без bodyWeightKgAtWorkout не заполняются задним числом и не меняются от профиля', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());

      // Имитируем старую запись в localStorage до появления поля bodyWeightKgAtWorkout
      const legacySessions = [
        {
          id: 'legacy_no_bw_field',
          name: 'Архивная тренировка',
          date: todayIso,
          startTime: '19:00',
          durationMinutes: 45,
          totalVolumeKg: 800,
          completedSets: 3,
          status: 'completed',
          exercises: [
            {
              id: 'e_bench',
              exerciseId: 'barbell_bench_press_flat',
              name: 'Жим штанги лёжа',
              targetMuscle: 'chest_mid',
              isBodyweight: false,
              restSeconds: 90,
              sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }], // 800 кг
            },
            {
              id: 'e_pull_bw',
              exerciseId: 'pull_ups',
              name: 'Подтягивания',
              targetMuscle: 'lats',
              isBodyweight: true,
              restSeconds: 90,
              sets: [
                { setNumber: 1, weightKg: 0, reps: 10, completed: true },  // вес тела неизвестен -> 0
                { setNumber: 2, weightKg: 15, reps: 10, completed: true }, // внешний вес -> 150
              ],
            },
          ],
        },
        {
          id: 'legacy_summary_only',
          name: 'Очень старая сводная запись',
          date: todayIso,
          startTime: '09:00',
          durationMinutes: 30,
          totalVolumeKg: 1200,
          completedSets: 5,
          status: 'completed',
          exercises: [],
        },
      ];
      store.set('form_workout_sessions', JSON.stringify(legacySessions));
      StorageService.updateProfile({ weightKg: 80 });

      // Запуск миграций и чтение не должны молча дописывать текущий вес профиля (80 кг) в старые записи
      resetMigrationSessionFlagForTests();
      runSafeMigrations({
        PROFILE: 'form_user_profile',
        PROGRAMS: 'form_workout_programs',
        WORKOUTS: 'form_workout_sessions',
        SPORTS_SESSIONS: 'form_sports_sessions_v1',
        WEEKLY_SCHEDULE: 'form_weekly_schedule_v1',
        CUSTOM_ACTIVITY: 'form_activity_days',
        EQUIPMENT: 'form_user_equipment_v1',
        FITNESS_PARAMS: 'form_fitness_parameters_v1',
      });

      const loaded = StorageService.getWorkoutSessions();
      const legacy1 = loaded.find((s) => s.id === 'legacy_no_bw_field')!;
      const legacy2 = loaded.find((s) => s.id === 'legacy_summary_only')!;

      assert(
        !Object.prototype.hasOwnProperty.call(legacy1, 'bodyWeightKgAtWorkout'),
        'Старая запись не должна автоматически заполняться текущим весом профиля при миграции/чтении'
      );
      assert(resolveSessionBodyWeightKg(legacy1, 80) === null, 'Неопределённость старой завершённой записи сохраняется');
      assert(StorageService.getSessionVolumeKg(legacy1) === 950, `Старая запись: 800 (жим) + 150 (доп. вес) = 950 кг, получено ${StorageService.getSessionVolumeKg(legacy1)}`);
      assert(StorageService.getSessionVolumeKg(legacy2) === 1200, 'Сводная старая запись без exercises сохраняет 1200 кг');

      // Изменение профиля не влияет на старую запись
      StorageService.updateProfile({ weightKg: 105 });
      assert(StorageService.getSessionVolumeKg(legacy1) === 950, 'Смена профиля не должна менять расчёт старой записи');
      assert(StorageService.getMuscleStats('7d').chest_mid.weeklyTonnageKg === 800, 'Обычные упражнения старой записи сохраняют 800 кг');
      assert(StorageService.getMuscleStats('7d').lats.weeklyTonnageKg === 150, 'Собственный вес с доп. отягощением старой записи даёт 150 кг без выдуманного веса тела');
    });

    return 'Старые записи без bodyWeightKgAtWorkout корректны и не подменяются текущим весом профиля';
  });

  // 63. Повторное открытие приложения не теряет сохранённую массу тела тренировки
  test('Историческая масса тела', 'Перезапуск приложения и экспорт/импорт сохраняют bodyWeightKgAtWorkout без потерь', () => {
    withIsolatedMockStorage((store) => {
      store.set('form_schema_version_v1', '11');
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({ weightKg: 76 });

      StorageService.saveWorkoutSession({
        id: 'w_persist_reopen',
        name: 'Отжимания',
        date: todayIso,
        startTime: '20:00',
        durationMinutes: 20,
        totalVolumeKg: 380,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_push',
            exerciseId: 'push_ups',
            name: 'Отжимания от пола',
            targetMuscle: 'chest_mid',
            isBodyweight: true,
            restSeconds: 60,
            sets: [{ setNumber: 1, weightKg: 0, reps: 10, completed: true }],
          },
        ],
      });

      // Имитация смены профиля + повторного открытия приложения (новая инициализация миграций и перечитывание JSON)
      StorageService.updateProfile({ weightKg: 94 });
      const backupJson = StorageService.exportBackupJson();
      resetMigrationSessionFlagForTests();
      runSafeMigrations({
        PROFILE: 'form_user_profile',
        PROGRAMS: 'form_workout_programs',
        WORKOUTS: 'form_workout_sessions',
        SPORTS_SESSIONS: 'form_sports_sessions_v1',
        WEEKLY_SCHEDULE: 'form_weekly_schedule_v1',
        CUSTOM_ACTIVITY: 'form_activity_days',
        EQUIPMENT: 'form_user_equipment_v1',
        FITNESS_PARAMS: 'form_fitness_parameters_v1',
      });

      const afterReopen = StorageService.getWorkoutSessions();
      assert(
        afterReopen[0]?.bodyWeightKgAtWorkout === 76,
        `После перезапуска ожидалось bodyWeightKgAtWorkout === 76, получено ${afterReopen[0]?.bodyWeightKgAtWorkout}`
      );
      assert(StorageService.getSessionVolumeKg(afterReopen[0]) === 380, 'После перезапуска объём остаётся 380 кг (38 × 10)');

      // Имитация импорта резервной копии на новом устройстве с другим весом профиля
      store.clear();
      store.set('form_schema_version_v1', '11');
      StorageService.updateProfile({ weightKg: 102 });
      const importOk = StorageService.importBackupJson(backupJson);
      assert(importOk, 'Импорт резервной копии должен пройти успешно');
      const validated = validateAndMigrateBackup(backupJson);
      assert(validated.normalized?.workouts?.[0]?.bodyWeightKgAtWorkout === 76, 'Бэкап сохраняет bodyWeightKgAtWorkout === 76');
      assert(StorageService.getWorkoutSessions()[0]?.bodyWeightKgAtWorkout === 76, 'После импорта bodyWeightKgAtWorkout === 76');
    });

    return 'Сохранённая масса тела переживает перезапуск, миграции и экспорт/импорт бэкапа';
  });

  // ============================================================================
  // QA-040: Интеграция Safety Guard в реальные тренировочные сценарии
  // ============================================================================

  // 64. Обычный старт тренировки и отсутствие ложных блокировок
  test('Safety Guard (QA-040)', 'Обычный старт взрослого пользователя без ограничений разрешён без ложных блокировок', () => {
    withIsolatedMockStorage(() => {
      StorageService.updateProfile({ age: 27, weightKg: 78 });
      StorageService.saveUserParameters({
        goal: 'Развитие мышц',
        level: 'Средний',
        location: 'В зале',
        daysPerWeek: 3,
        durationMinutes: 60,
        availableDays: ['Пн', 'Ср', 'Пт'],
        preferredMuscles: ['chest', 'lats'],
        excludedExercises: [],
        healthRestrictions: [],
        notes: '',
      });

      const launchCheck = checkWorkoutLaunchSafety([
        { exerciseId: 'barbell_bench_press_flat', name: 'Жим штанги лёжа', targetMuscle: 'chest', requiredEquipment: 'barbell' },
        { exerciseId: 'lat_pulldown_wide', name: 'Тяга верхнего блока', targetMuscle: 'lats', requiredEquipment: 'crossover' },
      ]);

      assert(launchCheck.allowed === true, 'Обычный старт тренировки должен быть разрешён');
      assert(launchCheck.blockedExercises.length === 0, 'Не должно быть заблокированных упражнений');
      assert(launchCheck.conservativeMode === false, 'При возрасте 27 лет консервативный режим выключен');

      // Проверка отсутствия ложных срабатываний на похожих названиях
      StorageService.saveUserParameters({
        ...StorageService.getUserParameters(),
        healthRestrictions: [
          HEALTH_RESTRICTION_PRESETS.NO_DEEP_BENDS_OR_ARCHES,
          HEALTH_RESTRICTION_PRESETS.AVOID_SHARP_JUMPS,
        ],
      });
      const inclinePress = checkAddExerciseSafety({
        exerciseId: 'dumbbell_bench_press_incline',
        name: 'Жим гантелей на наклонной скамье',
        targetMuscle: 'chest_upper',
        requiredEquipment: 'dumbbells_adjustable',
      });
      assert(inclinePress.allowed === true, 'Жим на наклонной скамье не должен ложно блокироваться ограничением наклонов корпуса');

      const burpeeNoJump = checkAddExerciseSafety({
        exerciseId: 'burpee_no_jump',
        name: 'Бёрпи без прыжка',
        targetMuscle: 'abs',
        requiredEquipment: 'bodyweight',
        isBodyweight: true,
      });
      assert(burpeeNoJump.allowed === true, 'Бёрпи без прыжка не должен ложно блокироваться запретом прыжков');
    });

    return 'Обычный старт разрешён; ложных срабатываний на наклонной скамье и бёрпи без прыжка нет';
  });

  // 65. Старт и добавление с исключённым упражнением (включая ё↔е и регистр)
  test('Safety Guard (QA-040)', 'Исключённые упражнения реально блокируются при старте, продолжении черновика и добавлении в тренировку', () => {
    withIsolatedMockStorage(() => {
      StorageService.updateProfile({ age: 30, weightKg: 80 });
      StorageService.saveUserParameters({
        goal: 'Сила',
        level: 'Средний',
        location: 'В зале',
        daysPerWeek: 3,
        durationMinutes: 60,
        availableDays: ['Пн', 'Ср', 'Пт'],
        preferredMuscles: ['chest', 'quads'],
        excludedExercises: ['Жим штанги лёжа', 'Приседания со штангой'],
        healthRestrictions: [],
        notes: '',
      });

      const launchCheck = checkWorkoutLaunchSafety([
        { exerciseId: 'barbell_bench_press_flat', name: 'Жим штанги лежа', targetMuscle: 'chest', requiredEquipment: 'barbell' },
        { exerciseId: 'pushups_classic', name: 'Отжимания классические', targetMuscle: 'chest', requiredEquipment: 'bodyweight', isBodyweight: true },
      ]);

      assert(launchCheck.allowed === false, 'Тренировка с исключённым упражнением обязана блокироваться (с нормализацией ё/е)');
      assert(launchCheck.blockedExercises.length === 1 && launchCheck.blockedExercises[0].decision.blockedByExclusion === true, 'Должна быть зафиксирована причина blockedByExclusion');
      assert(launchCheck.safeExercises.length === 1 && launchCheck.safeExercises[0].name === 'Отжимания классические', 'Безопасные упражнения должны отделяться корректно');

      const addBlocked = checkAddExerciseSafety({
        exerciseId: 'barbell_back_squats',
        name: 'Приседания со штангой',
        targetMuscle: 'quads',
        requiredEquipment: 'barbell',
      });
      assert(addBlocked.allowed === false && addBlocked.blockedByExclusion === true, 'Добавление исключённого упражнения во время тренировки должно блокироваться');

      const addSafe = checkAddExerciseSafety({
        exerciseId: 'glute_bridge_bodyweight',
        name: 'Ягодичный мост',
        targetMuscle: 'glutes',
        requiredEquipment: 'bodyweight',
        isBodyweight: true,
      });
      assert(addSafe.allowed === true, 'Добавление неисключённого безопасного упражнения должно быть разрешено');
    });

    return 'Исключённые упражнения заблокированы во всех сценариях старта и добавления';
  });

  // 66. Все 5 ограничений по здоровью, несовершеннолетний/некорректный возраст и боль
  test('Safety Guard (QA-040)', 'Ограничения по здоровью, возраст (<18 и невалидный) и боль реально блокируют опасные действия', () => {
    withIsolatedMockStorage(() => {
      // 1) Все 5 ограничений здоровья
      const spineBlock = evaluateExerciseSafety(
        { exerciseId: 'romanian_deadlift_barbell', name: 'Румынская тяга со штангой', targetMuscle: 'hamstrings', requiredEquipment: 'barbell' },
        { age: 25, healthRestrictions: [HEALTH_RESTRICTION_PRESETS.NO_AXIAL_SPINE_LOAD] }
      );
      assert(!spineBlock.allowed && spineBlock.blockedByHealthRestriction, 'Осевая нагрузка: румынская тяга со штангой должна блокироваться');

      const kneeBlock = evaluateExerciseSafety(
        { exerciseId: 'forward_lunges', name: 'Выпады вперёд', targetMuscle: 'quads', requiredEquipment: 'dumbbells_adjustable' },
        { age: 25, healthRestrictions: [HEALTH_RESTRICTION_PRESETS.PROTECT_KNEES] }
      );
      assert(!kneeBlock.allowed && kneeBlock.blockedByHealthRestriction, 'Колени: выпады должны блокироваться');

      const shoulderBlock = evaluateExerciseSafety(
        { exerciseId: 'barbell_overhead_press_standing', name: 'Жим штанги стоя', targetMuscle: 'front_delts', requiredEquipment: 'barbell' },
        { age: 25, healthRestrictions: [HEALTH_RESTRICTION_PRESETS.PROTECT_SHOULDERS] }
      );
      assert(!shoulderBlock.allowed && shoulderBlock.blockedByHealthRestriction, 'Плечи: жим штанги стоя должен блокироваться');

      const bendBlock = evaluateExerciseSafety(
        { exerciseId: 'hyperextension_classic', name: 'Гиперэкстензия', targetMuscle: 'lowerback', requiredEquipment: 'gym_machines' },
        { age: 25, healthRestrictions: [HEALTH_RESTRICTION_PRESETS.NO_DEEP_BENDS_OR_ARCHES] }
      );
      assert(!bendBlock.allowed && bendBlock.blockedByHealthRestriction, 'Наклоны/прогибы: гиперэкстензия должна блокироваться');

      const jumpBlock = evaluateExerciseSafety(
        { exerciseId: 'jump_rope_classic', name: 'Прыжки на скакалке', targetMuscle: 'calves', requiredEquipment: 'jump_rope' },
        { age: 25, healthRestrictions: [HEALTH_RESTRICTION_PRESETS.AVOID_SHARP_JUMPS] }
      );
      assert(!jumpBlock.allowed && jumpBlock.blockedByHealthRestriction, 'Прыжки: скакалка должна блокироваться');

      // 2) Некорректный возраст полностью блокирует старт
      StorageService.updateProfile({ age: -3, weightKg: 70 });
      const invalidAgeLaunch = checkWorkoutLaunchSafety([]);
      assert(invalidAgeLaunch.allowed === false, 'Отрицательный возраст обязан блокировать даже свободную тренировку');

      // 3) Возраст < 18 включает консервативный режим и блокирует резкое повышение веса
      const todayIso = formatLocalIsoDate(new Date());
      StorageService.updateProfile({ age: 16, weightKg: 65 });
      StorageService.saveWorkoutSession({
        id: 'w_minor_prev',
        name: 'Жим',
        date: todayIso,
        startTime: '12:00',
        durationMinutes: 30,
        totalVolumeKg: 400,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 50, reps: 8, completed: true }],
          },
        ],
      });

      const minorOkStep = checkWeightIncreaseSafety(
        { exerciseId: 'barbell_bench_press_flat', name: 'Жим штанги лёжа', targetMuscle: 'chest' },
        52.5,
        50
      );
      assert(minorOkStep.conservativeMode === true && minorOkStep.allowed === true, 'В 16 лет шаг +5% (50->52.5) допустим');

      const minorFastJump = checkWeightIncreaseSafety(
        { exerciseId: 'barbell_bench_press_flat', name: 'Жим штанги лёжа', targetMuscle: 'chest' },
        60,
        50
      );
      assert(minorFastJump.conservativeMode === true && minorFastJump.allowed === false && !minorFastJump.canOverrideWithConfirmation, 'В 16 лет шаг +20% (50->60) обязан жёстко блокироваться');

      // 4) Активная боль в мышце блокирует тренировку этой зоны и повышение веса
      StorageService.updateProfile({ age: 25, weightKg: 80 });
      StorageService.saveWellbeingCheckin({
        id: 'wb_pain',
        date: todayIso,
        jointPain: 0,
        painByMuscle: { chest: 3 },
        createdAt: Date.now(),
      });
      const painAdd = checkAddExerciseSafety({
        exerciseId: 'barbell_bench_press_flat',
        name: 'Жим штанги лёжа',
        targetMuscle: 'chest',
        requiredEquipment: 'barbell',
      });
      assert(painAdd.allowed === false && painAdd.blockedByPain === true, 'Боль 3/10 в груди должна блокировать добавление жима');
    });

    return 'Все 5 ограничений здоровья, возраст <18 / невалидный и боль корректно блокируются';
  });

  // 67. Обходные пути: генератор программ (fallback), черновик, повышение веса при боли / паузе >14д / ≥35%
  test('Safety Guard (QA-040)', 'Генератор программ, обход через fallback и обход подтверждением скачка при боли не проходят', () => {
    withIsolatedMockStorage(() => {
      const now = new Date(2026, 10, 16, 12, 0, 0);
      const todayIso = formatLocalIsoDate(now);
      StorageService.updateProfile({ age: 28, weightKg: 82 });
      StorageService.saveUserParameters({
        goal: 'Сила',
        level: 'Средний',
        location: 'В зале',
        daysPerWeek: 3,
        durationMinutes: 60,
        availableDays: ['Пн', 'Ср', 'Пт'],
        preferredMuscles: ['chest', 'quads'],
        excludedExercises: ['Отжимания классические', 'Приседания со штангой'],
        healthRestrictions: [
          HEALTH_RESTRICTION_PRESETS.PROTECT_KNEES,
          HEALTH_RESTRICTION_PRESETS.PROTECT_SHOULDERS,
          HEALTH_RESTRICTION_PRESETS.AVOID_SHARP_JUMPS,
        ],
        notes: '',
      });

      // Даже при пустом инвентаре (вынуждающем fallbackCandidates) генератор НЕ смеет вставить запрещённое упражнение
      const generated = generateLocalTemplateProgram(
        {
          goal: 'Сила',
          daysPerWeek: 3,
          duration: 45,
          experience: 'Средний',
          preferredDays: ['Пн', 'Ср', 'Пт'],
        },
        ['bodyweight']
      );
      const allGenNames = generated.workouts.flatMap((w) => w.exercises.map((e) => e.name));
      assert(!allGenNames.includes('Отжимания классические'), 'Генератор не смеет возвращать исключённое упражнение даже через fallback');
      assert(!allGenNames.includes('Приседания со штангой'), 'Генератор не смеет возвращать запрещённые приседания');
      const genLaunchCheck = checkWorkoutLaunchSafety(generated.workouts.flatMap((w) => w.exercises), now);
      assert(genLaunchCheck.allowed === true, `Вся сгенерированная программа должна проходить Safety Guard, причины: ${genLaunchCheck.vetoReasons.join('; ')}`);

      // Сценарий: завершённая тренировка была > 14 дней назад + отмечена лёгкая боль (1/10)
      const oldDate = '2026-10-20';
      StorageService.saveWorkoutSession({
        id: 'w_old_break',
        name: 'Жим',
        date: oldDate,
        startTime: '10:00',
        durationMinutes: 40,
        totalVolumeKg: 800,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_b',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }],
          },
        ],
      });
      StorageService.saveWellbeingCheckin({
        id: 'wb_mild',
        date: todayIso,
        jointPain: 1,
        createdAt: now.getTime(),
      });

      // При боли 1/10 и перерыве >14 дней даже скачок ≥35% НЕ должен давать ручной override!
      const hugeJumpWithVeto = checkWeightIncreaseSafety(
        { exerciseId: 'barbell_bench_press_flat', name: 'Жим штанги лёжа', targetMuscle: 'chest' },
        120,
        80,
        now
      );
      assert(hugeJumpWithVeto.allowed === false, 'Повышение веса 80->120 при перерыве >14д и боли должно блокироваться');
      assert(hugeJumpWithVeto.canOverrideWithConfirmation === false, 'Подтверждение скачка не должно позволять обходить боль и перерыв >14 дней');

      // Если убрать боль и поставить свежую тренировку (вчера), чистый аномальный скачок ≥35% требует ручного подтверждения
      StorageService.saveWellbeingCheckin({
        id: 'wb_mild',
        date: todayIso,
        jointPain: 0,
        createdAt: now.getTime() + 1000,
      });
      StorageService.saveWorkoutSession({
        id: 'w_recent',
        name: 'Жим',
        date: formatLocalIsoDate(new Date(2026, 10, 15, 12, 0, 0)),
        startTime: '10:00',
        durationMinutes: 40,
        totalVolumeKg: 800,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_b2',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }],
          },
        ],
      });
      const pureAnomaly = checkWeightIncreaseSafety(
        { exerciseId: 'barbell_bench_press_flat', name: 'Жим штанги лёжа', targetMuscle: 'chest' },
        120,
        80,
        now
      );
      assert(pureAnomaly.allowed === false && pureAnomaly.canOverrideWithConfirmation === true, 'Чистый аномальный скачок 80->120 (+50%) должен требовать подтверждения');

      // Черновик, сохранённый до включения ограничений, блокируется при попытке возобновления
      StorageService.saveActiveDraft({
        id: 'draft_bypass',
        name: 'Черновик',
        date: todayIso,
        startTime: '18:00',
        durationMinutes: 10,
        totalVolumeKg: 0,
        completedSets: 0,
        status: 'in_progress',
        exercises: [
          {
            id: 'ex_0',
            exerciseId: 'jump_squats_plyo',
            name: 'Приседания с выпрыгиванием',
            targetMuscle: 'quads',
            isBodyweight: true,
            restSeconds: 60,
            sets: [{ setNumber: 1, weightKg: 0, reps: 15, completed: false }],
          },
        ],
      });
      const loadedDraft = StorageService.getActiveDraft()!;
      const draftCheck = checkWorkoutLaunchSafety(loadedDraft.exercises, now);
      assert(draftCheck.allowed === false, 'Возобновление черновика с выпрыгиваниями при запрете прыжков обязано блокироваться');
    });

    return 'Генератор (включая fallback), черновик и weight-veto полностью защищены от обхода';
  });

  // 68. CR-002: Вес без завершённой истории + перерыв > 14 дней по другим упражнениям
  test('Safety Guard (QA-040 / CR-002)', 'Первое задание веса нового упражнения разрешено после перерыва >14д по другим упражнениям, но скачок в текущей сессии и невалидные веса блокируются', () => {
    withIsolatedMockStorage(() => {
      const now = new Date(2026, 10, 16, 12, 0, 0);
      const oldOtherDate = '2026-10-15'; // 32 дня назад (> 14 дн.)
      StorageService.updateProfile({ age: 29, weightKg: 80 });
      StorageService.saveWorkoutSession({
        id: 'w_other_old',
        name: 'День ног',
        date: oldOtherDate,
        startTime: '18:00',
        durationMinutes: 45,
        totalVolumeKg: 1000,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_leg',
            exerciseId: 'leg_extensions_machine',
            name: 'Разгибание ног сидя в тренажёре',
            targetMuscle: 'quads',
            isBodyweight: false,
            restSeconds: 75,
            sets: [{ setNumber: 1, weightKg: 45, reps: 12, completed: true }],
          },
        ],
      });

      const newExercise = {
        exerciseId: 'barbell_bench_press_flat',
        name: 'Жим штанги лёжа',
        targetMuscle: 'chest',
        requiredEquipment: 'barbell',
      };

      // 1) Первое задание рабочего веса для нового упражнения (нет завершённой истории и current=0) — должно быть РАЗРЕШЕНО, несмотря на перерыв 32 дн. по ногам
      const firstWeight = checkWeightIncreaseSafety(newExercise, 30, 0, now);
      assert(
        firstWeight.allowed === true && firstWeight.baselineBestWeightKg === 0,
        `Первый рабочий вес нового упражнения после перерыва по другим упражнениям обязан разрешаться, причины: ${firstWeight.vetoReasons.join('; ')}`
      );

      // 2) Но при боли 1/10 даже первый рабочий вес нового упражнения блокируется без права override
      StorageService.saveWellbeingCheckin({
        id: 'wb_new_pain',
        date: formatLocalIsoDate(now),
        jointPain: 1,
        createdAt: now.getTime(),
      });
      const firstWeightPain = checkWeightIncreaseSafety(newExercise, 30, 0, now);
      assert(
        firstWeightPain.allowed === false && !firstWeightPain.canOverrideWithConfirmation,
        'При боли >= 1 даже первый рабочий вес нового упражнения должен блокироваться без override'
      );

      // Убираем боль
      StorageService.saveWellbeingCheckin({
        id: 'wb_new_pain',
        date: formatLocalIsoDate(now),
        jointPain: 0,
        createdAt: now.getTime() + 100,
      });

      // 3) Невалидные значения (-10, NaN) блокируются даже при отсутствии истории
      assert(
        checkWeightIncreaseSafety(newExercise, -10, 0, now).allowed === false,
        'Отрицательный вес обязан блокироваться'
      );
      assert(
        checkWeightIncreaseSafety(newExercise, Number.NaN, 0, now).allowed === false,
        'NaN-вес обязан блокироваться'
      );

      // 4) Повышение УЖЕ установленного веса в текущей/незавершённой сессии (20 -> 200 и 20 -> 25) обязано проверяться!
      const inSessionHugeJump = checkWeightIncreaseSafety(newExercise, 200, 20, now);
      assert(
        inSessionHugeJump.allowed === false &&
          inSessionHugeJump.requiresUserConfirmation === true &&
          inSessionHugeJump.canOverrideWithConfirmation === true,
        'Скачок 20 -> 200 кг в текущей сессии без завершённой истории обязан требовать подтверждения'
      );

      const inSessionBadStep = checkWeightIncreaseSafety(newExercise, 25, 20, now);
      assert(
        inSessionBadStep.allowed === false && inSessionBadStep.canOverrideWithConfirmation === false,
        'Шаг 20 -> 25 кг (+25%) в текущей сессии без истории должен блокироваться правилом шага'
      );

      // 5) То же через активный черновик (когда в подходе 1 уже стоит 20 кг, а подход 2 с 0 поднимается до 200 кг)
      StorageService.saveActiveDraft({
        id: 'draft_current_20',
        name: 'Грудь',
        date: formatLocalIsoDate(now),
        startTime: '18:00',
        durationMinutes: 10,
        totalVolumeKg: 0,
        completedSets: 0,
        status: 'in_progress',
        exercises: [
          {
            id: 'ex_1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [
              { setNumber: 1, weightKg: 20, reps: 10, completed: false },
              { setNumber: 2, weightKg: 0, reps: 10, completed: false },
            ],
          },
        ],
      });
      const draftSecondSetJump = checkWeightIncreaseSafety(newExercise, 200, 0, now);
      assert(
        draftSecondSetJump.allowed === false && draftSecondSetJump.requiresUserConfirmation === true,
        'Увеличение подхода 2 с 0 до 200 кг при уже заданных 20 кг в черновике обязано перехватываться'
      );

      // А выравнивание подхода 2 до 20 кг (текущего рабочего веса) разрешено
      const draftSecondSetMatch = checkWeightIncreaseSafety(newExercise, 20, 0, now);
      assert(
        draftSecondSetMatch.allowed === true,
        'Установка 20 кг во 2-м подходе при 20 кг в 1-м подходе должна быть разрешена'
      );

      // 6) Тем временем по старому упражнению ног (32 дня перерыва) рост 45 -> 50 по-прежнему заблокирован!
      const oldLegIncrease = checkWeightIncreaseSafety(
        {
          exerciseId: 'leg_extensions_machine',
          name: 'Разгибание ног сидя в тренажёре',
          targetMuscle: 'quads',
        },
        50,
        45,
        now
      );
      assert(
        oldLegIncrease.allowed === false && !oldLegIncrease.canOverrideWithConfirmation,
        'Перерыв >14д по самому упражнению (ноги) должен по-прежнему блокировать увеличение веса'
      );
    });

    return 'CR-002 исправлен: первый вес после паузы в других упражнениях разрешён, а скачки и невалидные веса при baselineBest===0 перехватываются';
  });

  // 69. CR-003: Защита targetWeight при сохранении, запуске и в resolveInitialExerciseSets
  test('Safety Guard (QA-040 / CR-003)', 'Обход ограничений через targetWeight заблокирован на сохранении, запуске и в resolveInitialExerciseSets', () => {
    withIsolatedMockStorage(() => {
      const now = new Date();
      const todayIso = formatLocalIsoDate(now);
      StorageService.updateProfile({ age: 26, weightKg: 78 });
      StorageService.saveWorkoutSession({
        id: 'w_recent_cr003',
        name: 'Грудь',
        date: todayIso,
        startTime: '17:00',
        durationMinutes: 40,
        totalVolumeKg: 600,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e_bp',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 60, reps: 10, completed: true }],
          },
        ],
      });

      // 1) Чрезмерный targetWeight (60 -> 110) блокируется единой проверкой запуска/сохранения программы
      const unsafeSaveEval = checkWorkoutLaunchSafety(
        [
          {
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            requiredEquipment: 'barbell',
            isBodyweight: false,
            targetWeight: 110,
          },
        ],
        now
      );
      assert(
        unsafeSaveEval.allowed === false &&
          unsafeSaveEval.blockedExercises.length === 1 &&
          unsafeSaveEval.blockedExercises[0].decision.blockedByWeight === true,
        'Чрезмерный targetWeight 110 кг (после 60 кг) обязан блокироваться проверкой программы/запуска'
      );

      // 2) Отрицательный targetWeight тоже блокируется
      const negSaveEval = checkWorkoutLaunchSafety(
        [
          {
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            requiredEquipment: 'barbell',
            isBodyweight: false,
            targetWeight: -15,
          },
        ],
        now
      );
      assert(negSaveEval.allowed === false, 'Отрицательный targetWeight обязан блокироваться');

      // 3) Безопасный targetWeight 62.5 (+4.2%) разрешён
      const safeSaveEval = checkWorkoutLaunchSafety(
        [
          {
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            requiredEquipment: 'barbell',
            isBodyweight: false,
            targetWeight: 62.5,
          },
        ],
        now
      );
      assert(
        safeSaveEval.allowed === true,
        `Безопасный targetWeight 62.5 кг обязан разрешаться: ${safeSaveEval.vetoReasons.join('; ')}`
      );

      // 4) Прямой вызов resolveInitialExerciseSets НЕ позволяет пропихнуть 110 кг в обход Safety Guard
      const directBypassSets = resolveInitialExerciseSets({
        exerciseName: 'Жим штанги лёжа',
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest',
        requiredEquipment: 'barbell',
        setsCount: 3,
        defaultReps: 8,
        explicitTargetWeight: 110,
        isBodyweight: false,
      });
      assert(
        directBypassSets.every((s) => s.weightKg === 60),
        `resolveInitialExerciseSets обязан отклонить 110 кг и откатиться к безопасному весу 60 кг, получено: ${directBypassSets.map((s) => s.weightKg).join(',')}`
      );

      // 5) Устаревшая сохранённая программа: ранее 62.5 было безопасно, но сегодня появилась боль 1/10 -> запуск и resolveInitialExerciseSets блокируют 62.5
      StorageService.saveWellbeingCheckin({
        id: 'wb_stale_prog',
        date: todayIso,
        jointPain: 1,
        createdAt: now.getTime(),
      });
      const staleLaunchEval = checkWorkoutLaunchSafety(
        [
          {
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            requiredEquipment: 'barbell',
            isBodyweight: false,
            targetWeight: 62.5,
          },
        ],
        now
      );
      assert(
        staleLaunchEval.allowed === false,
        'Запуск ранее сохранённой программы с targetWeight 62.5 при новой боли 1/10 обязан блокироваться'
      );
      const staleResolvedSets = resolveInitialExerciseSets({
        exerciseName: 'Жим штанги лёжа',
        exerciseId: 'barbell_bench_press_flat',
        targetMuscle: 'chest',
        requiredEquipment: 'barbell',
        setsCount: 3,
        defaultReps: 8,
        explicitTargetWeight: 62.5,
        isBodyweight: false,
      });
      assert(
        staleResolvedSets.every((s) => s.weightKg === 60),
        'resolveInitialExerciseSets обязан отклонить устаревший targetWeight 62.5 при активной боли'
      );
    });

    return 'targetWeight проверяется при сохранении, запуске, устаревании данных и внутри resolveInitialExerciseSets';
  });

  // 70. Попытка подтвердить скачок веса при активном жёстком запрете (боль / падение повторов / ограничение / исключение)
  test('Safety Guard (QA-040 / Hard Veto)', 'Подтверждение скачка веса невозможно при боли, падении повторов, перерыве >14д, исключении или ограничении здоровья', () => {
    withIsolatedMockStorage(() => {
      const now = new Date(2026, 10, 16, 12, 0, 0);
      const todayIso = formatLocalIsoDate(now);
      const yesterdayIso = formatLocalIsoDate(new Date(2026, 10, 15, 12, 0, 0));
      StorageService.updateProfile({ age: 30, weightKg: 82 });

      // Две свежие сессии с падением повторений (10 -> 6 при 80 кг)
      StorageService.saveWorkoutSession({
        id: 'w_rep_1',
        name: 'Жим 1',
        date: formatLocalIsoDate(new Date(2026, 10, 13, 12, 0, 0)),
        startTime: '12:00',
        durationMinutes: 30,
        totalVolumeKg: 800,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }],
          },
        ],
      });
      StorageService.saveWorkoutSession({
        id: 'w_rep_2',
        name: 'Жим 2',
        date: yesterdayIso,
        startTime: '12:00',
        durationMinutes: 30,
        totalVolumeKg: 480,
        completedSets: 1,
        status: 'completed',
        exercises: [
          {
            id: 'e2',
            exerciseId: 'barbell_bench_press_flat',
            name: 'Жим штанги лёжа',
            targetMuscle: 'chest',
            isBodyweight: false,
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 80, reps: 6, completed: true }],
          },
        ],
      });

      const ex = {
        exerciseId: 'barbell_bench_press_flat',
        name: 'Жим штанги лёжа',
        targetMuscle: 'chest',
        requiredEquipment: 'barbell',
      };

      // Падение повторений -> +50% (80 -> 120) НЕ может быть обойдено подтверждением
      const repDropJump = checkWeightIncreaseSafety(ex, 120, 80, now);
      assert(
        repDropJump.allowed === false && repDropJump.canOverrideWithConfirmation === false,
        'При падении повторений аномальный скачок 80->120 не должен разрешать подтверждение'
      );

      // Боль в груди 2/10 -> даже +50% и даже снижение/сохранение веса с блокированным упражнением запрещены
      StorageService.saveWellbeingCheckin({
        id: 'wb_hard_pain',
        date: todayIso,
        jointPain: 0,
        painByMuscle: { chest: 2 },
        createdAt: now.getTime(),
      });
      const painJump = checkWeightIncreaseSafety(ex, 120, 80, now);
      assert(
        painJump.allowed === false && painJump.canOverrideWithConfirmation === false,
        'При локальной боли 2/10 подтверждение скачка обязано быть отключено'
      );

      // Исключение упражнения -> подтверждение невозможно
      StorageService.saveWellbeingCheckin({
        id: 'wb_hard_pain',
        date: todayIso,
        jointPain: 0,
        painByMuscle: {},
        createdAt: now.getTime() + 100,
      });
      StorageService.saveUserParameters({
        ...StorageService.getUserParameters(),
        excludedExercises: ['Жим штанги лёжа'],
      });
      const excludedJump = checkWeightIncreaseSafety(ex, 120, 80, now);
      assert(
        excludedJump.allowed === false && excludedJump.canOverrideWithConfirmation === false,
        'Для исключённого упражнения подтверждение скачка обязано быть отключено'
      );
    });

    return 'Жёсткие запреты (падение повторов, боль, исключение) никогда не обходятся подтверждением скачка';
  });

  // 71. Локальный генератор: корректный подбор с учётом оборудования, каталога и Safety Guard
  test('Program Generator', 'Локальный путь подбирает только подтверждённые упражнения каталога под оборудование и Safety Guard', () => {
    withIsolatedMockStorage(() => {
      StorageService.updateProfile({ age: 30, weightKg: 78 });
      StorageService.saveUserParameters({
        goal: 'Развитие мышц',
        level: 'Средний',
        location: 'Дома',
        daysPerWeek: 3,
        durationMinutes: 60,
        availableDays: ['Пн', 'Ср', 'Пт'],
        preferredMuscles: ['chest', 'lats', 'quads'],
        excludedExercises: [],
        healthRestrictions: [],
        notes: '',
      });

      const program = generateLocalTemplateProgram(
        {
          goal: 'Развитие мышц',
          daysPerWeek: 3,
          duration: 60,
          experience: 'Средний',
          preferredDays: ['Пн', 'Ср', 'Пт'],
        },
        ['dumbbells_adjustable']
      );

      assert(program.workouts.length === 3, 'Ожидалось 3 тренировочных дня');
      const allExercises = program.workouts.flatMap((d) => d.exercises);
      assert(allExercises.length >= 6, 'Программа должна содержать подобранные упражнения');

      const catalogIds = new Set(getUnifiedCatalog([]).map((e) => e.id));
      for (const ex of allExercises) {
        assert(Boolean(ex.exerciseId && catalogIds.has(ex.exerciseId)), `Упражнение ${ex.name} (${ex.exerciseId}) отсутствует в каталоге`);
        assert(
          ex.requiredEquipment === 'dumbbells_adjustable',
          `Ожидалось оборудование dumbbells_adjustable, получено ${ex.requiredEquipment} (${ex.name})`
        );
        assert(ex.sets >= 1 && ex.reps >= 1 && ex.targetWeight === 0, 'Некорректные числовые поля шаблона');
        const safety = checkAddExerciseSafety(ex);
        assert(safety.allowed, `Упражнение ${ex.name} должно проходить Safety Guard`);
      }
    });
    return 'Локальный подбор: каталог, оборудование и Safety Guard соблюдены';
  });

  // 72. Локальный fallback (safeFallbackCandidates): не обходит проверку оборудования
  test('Program Generator', 'Резервный подбор safeFallbackCandidates не подставляет отсутствующее оборудование', () => {
    withIsolatedMockStorage(() => {
      StorageService.updateProfile({ age: 29, weightKg: 74 });
      StorageService.saveUserParameters({
        goal: 'Общая физическая подготовка',
        level: 'Начинающий',
        location: 'Дома',
        daysPerWeek: 3,
        durationMinutes: 45,
        availableDays: ['Пн', 'Ср', 'Пт'],
        preferredMuscles: [],
        excludedExercises: [],
        healthRestrictions: [],
        notes: '',
      });

      // Только bodyweight: для lats/biceps нет primary bodyweight, rear_delts уходит в safeFallbackCandidates ('Лодочка')
      const bwProgram = generateLocalTemplateProgram(
        {
          goal: 'Общая физическая подготовка',
          daysPerWeek: 3,
          duration: 45,
          experience: 'Начинающий',
          preferredDays: ['Пн', 'Ср', 'Пт'],
        },
        ['bodyweight']
      );
      const bwExercises = bwProgram.workouts.flatMap((d) => d.exercises);
      assert(bwExercises.length > 0, 'Для bodyweight должны подбираться упражнения');
      for (const ex of bwExercises) {
        assert(
          ex.requiredEquipment === 'bodyweight',
          `Fallback пропустил запрещённый инвентарь: ${ex.name} требует ${ex.requiredEquipment}`
        );
      }

      // Только barbell: для calves нет barbell, safeFallbackCandidates не смеет подтянуть тренажёры
      const bbProgram = generateLocalTemplateProgram(
        {
          goal: 'Сила',
          daysPerWeek: 3,
          duration: 60,
          experience: 'Средний',
          preferredDays: ['Пн', 'Ср', 'Пт'],
        },
        ['barbell']
      );
      const bbExercises = bbProgram.workouts.flatMap((d) => d.exercises);
      assert(bbExercises.length > 0, 'Для barbell должны подбираться упражнения со штангой');
      for (const ex of bbExercises) {
        assert(
          ex.requiredEquipment === 'barbell',
          `Fallback пропустил нештанговое упражнение: ${ex.name} (${ex.requiredEquipment})`
        );
      }
    });
    return 'safeFallbackCandidates строго соблюдает оборудование пользователя';
  });

  // 73. Пустой список оборудования не включает bodyweight по умолчанию
  test('Program Generator', 'Пустой список оборудования не считает bodyweight доступным и отклоняет генерацию', () => {
    withIsolatedMockStorage(() => {
      assert(
        isEquipmentAvailable('bodyweight', new Set()) === false,
        'При пустом наборе оборудования bodyweight должен возвращать false'
      );

      let threwExplicitEmpty = false;
      try {
        generateLocalTemplateProgram(
          {
            goal: 'Сила',
            daysPerWeek: 3,
            duration: 60,
            experience: 'Средний',
            preferredDays: ['Пн', 'Ср', 'Пт'],
          },
          []
        );
      } catch (err: any) {
        threwExplicitEmpty = String(err?.message || '').includes('инвентар');
      }
      assert(threwExplicitEmpty, 'Явно пустой список оборудования [] должен возвращать корректную ошибку');

      // Хранилище с инвентарём по умолчанию (все selected: false) тоже не включает bodyweight автоматически
      let threwStorageEmpty = false;
      try {
        generateLocalTemplateProgram({
          goal: 'Сила',
          daysPerWeek: 3,
          duration: 60,
          experience: 'Средний',
          preferredDays: ['Пн', 'Ср', 'Пт'],
        });
      } catch (err: any) {
        threwStorageEmpty = String(err?.message || '').includes('инвентар');
      }
      assert(threwStorageEmpty, 'Неуказанный инвентарь в Storage не должен подменять bodyweight по умолчанию');
    });
    return 'Отсутствие оборудования корректно отклоняется без подстановки bodyweight';
  });

  // 74. Неизвестное оборудование и непроверенные названия/подстроки отклоняются
  test('Program Generator', 'Неизвестное оборудование и частичные/вымышленные названия не проходят единый валидатор', () => {
    withIsolatedMockStorage(() => {
      assert(
        isEquipmentAvailable('unknown_gravity_belt', new Set(['unknown_gravity_belt', 'bodyweight'])) === false,
        'Неизвестное оборудование не должно проходить проверку даже при совпадении строки'
      );
      assert(
        isEquipmentAvailable(undefined, new Set(['bodyweight'])) === false,
        'Отсутствующее requiredEquipment должно отклоняться'
      );

      let threwUnknown = false;
      try {
        generateLocalTemplateProgram(
          {
            goal: 'Сила',
            daysPerWeek: 3,
            duration: 45,
            experience: 'Средний',
            preferredDays: ['Пн', 'Ср', 'Пт'],
          },
          ['unknown_magic_machine']
        );
      } catch {
        threwUnknown = true;
      }
      assert(threwUnknown, 'Генератор не должен создавать программу для неизвестного оборудования');

      const validationParams = {
        goal: 'Сила',
        daysPerWeek: 3,
        duration: 60,
        experience: 'Средний',
        preferredDays: ['Пн', 'Ср', 'Пт'],
      };
      const partialGuess = validateProgramExerciseCandidate(
        { name: 'Жим', targetMuscle: 'chest' },
        {
          params: validationParams,
          customExercises: [],
          availableEquipmentSet: new Set(['barbell', 'dumbbells_adjustable', 'bodyweight']),
        }
      );
      assert(!partialGuess.valid && partialGuess.reason === 'not_in_catalog', 'Частичное название «Жим» не должно угадываться');

      const fakeGuess = validateProgramExerciseCandidate(
        { name: 'Фантастический жим на орбите', targetMuscle: 'chest', sets: 4, reps: 10 },
        {
          params: validationParams,
          customExercises: [],
          availableEquipmentSet: new Set(['barbell', 'bodyweight']),
        }
      );
      assert(!fakeGuess.valid && fakeGuess.reason === 'not_in_catalog', 'Вымышленное упражнение должно отклоняться');
    });
    return 'Неизвестное оборудование и неподтверждённые названия отклонены единым валидатором';
  });

  // 75. Отсутствие безопасных альтернатив и отсутствие ложных блокировок на валидных упражнениях
  test('Program Generator', 'Нет подходящих альтернатив при вето Safety Guard и нет ложных блокировок валидных упражнений', () => {
    withIsolatedMockStorage(() => {
      StorageService.updateProfile({ age: 27, weightKg: 75 });
      StorageService.saveUserParameters({
        goal: 'Выносливость',
        level: 'Средний',
        location: 'Дома',
        daysPerWeek: 3,
        durationMinutes: 45,
        availableDays: ['Пн', 'Ср', 'Пт'],
        preferredMuscles: [],
        excludedExercises: [],
        healthRestrictions: [HEALTH_RESTRICTION_PRESETS.AVOID_SHARP_JUMPS],
        notes: '',
      });

      // У jump_rope в каталоге только прыжки на скакалке, а они запрещены AVOID_SHARP_JUMPS -> альтернатив нет
      let threwNoAlternatives = false;
      try {
        generateLocalTemplateProgram(
          {
            goal: 'Выносливость',
            daysPerWeek: 3,
            duration: 45,
            experience: 'Средний',
            preferredDays: ['Пн', 'Ср', 'Пт'],
          },
          ['jump_rope']
        );
      } catch (err: any) {
        threwNoAlternatives = String(err?.message || '').includes('не найдено подходящих упражнений');
      }
      assert(threwNoAlternatives, 'При отсутствии безопасных альтернатив программа не должна формироваться из случайных упражнений');

      // Обратная проверка: валидное упражнение без ограничений НЕ блокируется ложно
      StorageService.saveUserParameters({
        ...StorageService.getUserParameters(),
        healthRestrictions: [],
      });
      const validCheck = validateProgramExerciseCandidate(
        { name: 'Отжимания классические', sets: 3, reps: 12 },
        {
          params: {
            goal: 'Выносливость',
            daysPerWeek: 3,
            duration: 45,
            experience: 'Средний',
            preferredDays: ['Пн', 'Ср', 'Пт'],
          },
          customExercises: [],
          availableEquipmentSet: new Set(['bodyweight']),
        }
      );
      assert(
        validCheck.valid && validCheck.exercise?.exerciseId === 'pushups_classic',
        'Корректное упражнение с подходящим инвентарём не должно ложно блокироваться'
      );
    });
    return 'Отсутствие альтернатив обработано корректно, ложных блокировок нет';
  });

  // 76. Safety Guard (Wellbeing Relevance): Первый запуск, сохранение боли > 2 дн., снижение 4 -> 2 -> 1 -> 0 и удаление
  test('Safety Guard (Wellbeing)', 'Первый запуск без чекинов, сохранение боли > 2 дн. (stale), снижение 4->2->1->0 и удаление', () => {
    withIsolatedMockStorage(() => {
      const day0 = new Date(2026, 10, 1, 12, 0, 0);
      const day2 = new Date(2026, 10, 3, 12, 0, 0);
      const day5 = new Date(2026, 10, 6, 12, 0, 0);
      const day7 = new Date(2026, 10, 8, 12, 0, 0);

      StorageService.updateProfile({ age: 29, weightKg: 80 });
      const bench = {
        exerciseId: 'barbell_bench_press_flat',
        name: 'Жим штанги лёжа',
        targetMuscle: 'chest',
        requiredEquipment: 'barbell',
      };

      // 1) Первый запуск (checkins = []): никаких ограничений и никаких запросов обновления
      const emptyCtx = buildSafetyContextFromData(
        { profile: { age: 29 }, userParameters: StorageService.getUserParameters(), checkins: [] },
        day0
      );
      assert(
        emptyCtx.wellbeingFreshnessStatus === 'none' &&
          emptyCtx.requiresWellbeingUpdate === false &&
          (emptyCtx.stalePainAreas || []).length === 0,
        'При пустой истории чекинов статус должен быть none без запроса обновления'
      );
      assert(
        checkAddExerciseSafety(bench, day0).allowed === true &&
          checkWeightIncreaseSafety(bench, 82.5, 80, day0).allowed === true,
        'Первый запуск без истории обязан работать без блокировок'
      );

      // 2) День 0: боль в груди 4/10
      StorageService.saveWellbeingCheckin({
        id: 'wb_p0',
        date: formatLocalIsoDate(day0),
        painByMuscle: { chest: 4 },
        createdAt: day0.getTime(),
      });
      const day2Launch = checkWorkoutLaunchSafety([bench], day2);
      assert(
        day2Launch.allowed === false &&
          day2Launch.wellbeingFreshnessStatus === 'fresh' &&
          day2Launch.requiresWellbeingUpdate === false,
        'На 2-й день боль должна быть fresh и блокировать упражнение без запроса обновления'
      );

      // 3) День 5 (> 2 дн. без новых чекинов): боль НЕ исчезает, статус переходит в stale с запросом подтверждения
      const day5Launch = checkWorkoutLaunchSafety([bench], day5);
      const day5Weight = checkWeightIncreaseSafety(bench, 82.5, 80, day5);
      assert(
        day5Launch.allowed === false &&
          day5Launch.wellbeingFreshnessStatus === 'stale' &&
          day5Launch.requiresWellbeingUpdate === true &&
          (day5Launch.stalePainAreas || []).some(
            (a) => a.areaType === 'muscle' && a.zoneKey === 'chest' && a.level === 4 && a.daysAgo === 5
          ),
        'Через > 2 дня боль 4/10 должна остаться активной (stale) и требовать подтверждения'
      );
      assert(
        day5Weight.allowed === false && day5Weight.evaluation.requiresWellbeingUpdate === true,
        'При устаревшей боли повышение веса обязано оставаться заблокированным'
      );

      // 4) Снижение 4 -> 2 (День 5): статус fresh, жим всё ещё заблокирован (порог блока >= 2)
      StorageService.saveWellbeingCheckin({
        id: 'wb_p5',
        date: formatLocalIsoDate(day5),
        painByMuscle: { chest: 2 },
        createdAt: day5.getTime(),
      });
      const day5Reduced2 = checkWorkoutLaunchSafety([bench], day5);
      assert(
        day5Reduced2.allowed === false && day5Reduced2.wellbeingFreshnessStatus === 'fresh',
        'После снижения боли до 2/10 статус должен стать fresh, а блокировка упражнения сохраниться'
      );

      // 5) Снижение 2 -> 1 (День 6): упражнение разрешено, но повышение веса заблокировано
      const day6 = new Date(2026, 10, 7, 12, 0, 0);
      StorageService.saveWellbeingCheckin({
        id: 'wb_p6',
        date: formatLocalIsoDate(day6),
        painByMuscle: { chest: 1 },
        createdAt: day6.getTime(),
      });
      const day6Launch = checkWorkoutLaunchSafety([bench], day6);
      const day6Weight = checkWeightIncreaseSafety(bench, 82.5, 80, day6);
      assert(
        day6Launch.allowed === true &&
          day6Launch.wellbeingFreshnessStatus === 'fresh' &&
          day6Weight.allowed === false &&
          day6Weight.canOverrideWithConfirmation === false,
        'При боли 1/10 тренировка допускается с предупреждением, но повышение веса запрещено'
      );

      // 6) Полное снятие 1 -> 0 (День 7): ограничения сняты, статус none
      StorageService.saveWellbeingCheckin({
        id: 'wb_p7',
        date: formatLocalIsoDate(day7),
        painByMuscle: { chest: 0 },
        createdAt: day7.getTime(),
      });
      const day7Launch = checkWorkoutLaunchSafety([bench], day7);
      const day7Weight = checkWeightIncreaseSafety(bench, 82.5, 80, day7);
      assert(
        day7Launch.allowed === true &&
          day7Launch.wellbeingFreshnessStatus === 'none' &&
          day7Launch.requiresWellbeingUpdate === false &&
          day7Weight.allowed === true,
        'После явного подтверждения 0/10 ограничения должны быть полностью сняты'
      );

      // 7) Проверка deleteWellbeingCheckin: удаление записи сразу возвращает актуальное состояние ('none' на day7)
      const day8 = new Date(2026, 10, 9, 12, 0, 0);
      StorageService.saveWellbeingCheckin({
        id: 'wb_del',
        date: formatLocalIsoDate(day8),
        painByMuscle: { chest: 3 },
        createdAt: day8.getTime(),
      });
      assert(checkWorkoutLaunchSafety([bench], day8).allowed === false, 'Запись wb_del должна блокировать');
      StorageService.deleteWellbeingCheckin('wb_del');
      const afterDeleteCtx = resolveWellbeingPainStatePure(StorageService.getWellbeingCheckins(), day8);
      assert(
        afterDeleteCtx.painByMuscle?.chest === undefined && afterDeleteCtx.wellbeingFreshnessStatus === 'none',
        'Удаление записи чекина должно немедленно пересчитывать состояние'
      );
    });
    return 'Актуальность боли (none/fresh/stale), снижение 4->2->1->0 и удаление работают корректно';
  });

  // 77. Safety Guard (Wellbeing Relevance): Независимость зон и безопасное однодневное слияние
  test('Safety Guard (Wellbeing)', 'Нулевое значение одной зоны или несвязанные поля не снимают другие активные ограничения', () => {
    withIsolatedMockStorage(() => {
      const day0 = new Date(2026, 10, 1, 12, 0, 0);
      const day4 = new Date(2026, 10, 5, 12, 0, 0);
      const day0Iso = formatLocalIsoDate(day0);
      const day4Iso = formatLocalIsoDate(day4);

      StorageService.updateProfile({ age: 30, weightKg: 80 });
      const bench = {
        exerciseId: 'barbell_bench_press_flat',
        name: 'Жим штанги лёжа',
        targetMuscle: 'chest',
      };
      const squat = {
        exerciseId: 'barbell_back_squats',
        name: 'Приседания со штангой',
        targetMuscle: 'quads',
      };

      // День 0: общая боль 3 и локальная боль chest: 3, quads: 3
      StorageService.saveWellbeingCheckin({
        id: 'wb_multi_0',
        date: day0Iso,
        jointPain: 3,
        painByMuscle: { chest: 3, quads: 3 },
        createdAt: day0.getTime(),
      });

      // День 4: новый чекин ставит только jointPain: 0 + отличные сон/усталость/крепатуру (painByMuscle не передан)
      StorageService.saveWellbeingCheckin({
        id: 'wb_multi_4a',
        date: day4Iso,
        sleepHours: 9,
        fatigue: 0,
        soreness: 0,
        jointPain: 0,
        createdAt: day4.getTime(),
      });
      const afterJointZero = checkWorkoutLaunchSafety([bench, squat], day4);
      assert(
        afterJointZero.allowed === false &&
          afterJointZero.blockedExercises.length === 2 &&
          afterJointZero.requiresWellbeingUpdate === true,
        'jointPain: 0 и fatigue/soreness: 0 НЕ смеют сбрасывать активные chest и quads'
      );

      // День 4 (второй частичный чекин с другим id в ту же дату!): пустой painByMuscle: {} не стирает chest/quads
      StorageService.saveWellbeingCheckin({
        id: 'wb_multi_4b',
        date: day4Iso,
        painByMuscle: {},
        createdAt: day4.getTime() + 100,
      });
      assert(
        checkWorkoutLaunchSafety([bench, squat], day4).blockedExercises.length === 2,
        'Пустой painByMuscle: {} в новом чекине не должен сбрасывать предыдущую боль'
      );

      // День 4 (третий частичный чекин с другим id в ту же дату): снимаем ТОЛЬКО chest: 0
      StorageService.saveWellbeingCheckin({
        id: 'wb_multi_4c',
        date: day4Iso,
        painByMuscle: { chest: 0 },
        createdAt: day4.getTime() + 200,
      });
      const afterChestZero = checkWorkoutLaunchSafety([bench, squat], day4);
      assert(
        afterChestZero.allowed === false &&
          afterChestZero.blockedExercises.length === 1 &&
          afterChestZero.blockedExercises[0].exercise.name === 'Приседания со штангой' &&
          afterChestZero.safeExercises.some((e) => e.name === 'Жим штанги лёжа') &&
          afterChestZero.requiresWellbeingUpdate === true &&
          (afterChestZero.stalePainAreas || []).length === 1 &&
          afterChestZero.stalePainAreas![0].zoneKey === 'quads',
        'Снятие chest: 0 должно освободить грудь, но оставить quads: 3 в статусе stale'
      );

      // Проверка синонима в одном дне с разными id ('грудь' -> 'chest': 0 при сохранённых ногах)
      StorageService.saveWellbeingCheckin({
        id: 'wb_same_day_alias_1',
        date: '2026-11-06',
        jointPain: 2,
        painByMuscle: { грудь: 3, quads: 4 } as any,
        createdAt: day4.getTime() + 500,
      });
      StorageService.saveWellbeingCheckin({
        id: 'wb_same_day_alias_2',
        date: '2026-11-06',
        painByMuscle: { chest: 0 },
        createdAt: day4.getTime() + 600,
      });
      const afterAliasClear = resolveWellbeingPainStatePure(
        StorageService.getWellbeingCheckins(),
        new Date(2026, 10, 6, 12, 0, 0)
      );
      assert(
        afterAliasClear.painByMuscle?.chest === undefined &&
          afterAliasClear.painByMuscle?.quads === 4 &&
          afterAliasClear.generalPainLevel === 2,
        'Частичное однодневное слияние должно снимать синонимичную зону и сохранять jointPain и quads'
      );
    });
    return 'Изоляция зон, нулевых значений и однодневного слияния подтверждена';
  });

  // 78. Safety Guard (Audit): Неизвестные ключи raw:, сортировка (date, createdAt, origIdx), будущие даты, legacy localStorage
  test('Safety Guard (Audit)', 'Неизвестные зоны raw: fail-safe, хронологическая сортировка, будущие даты и legacy-совместимость', () => {
    const now = new Date(2026, 10, 10, 12, 0, 0);
    const bench = {
      exerciseId: 'barbell_bench_press_flat',
      name: 'Жим штанги лёжа',
      targetMuscle: 'chest',
    };

    // 1) Неизвестный ключ painByMuscle старше 2 дн. обязан сохранять fail-safe блокировку
    const unknownPainState = resolveWellbeingPainStatePure(
      [
        {
          id: 'wb_unknown',
          date: '2026-11-03', // 7 дней назад
          painByMuscle: { ['Неизвестная_связка']: 3 } as any,
          createdAt: 1000,
        },
      ],
      now
    );
    const unknownDecision = evaluateExerciseSafety(bench, {
      age: 30,
      generalPainLevel: unknownPainState.generalPainLevel,
      painByMuscle: unknownPainState.painByMuscle,
      wellbeingFreshnessStatus: unknownPainState.wellbeingFreshnessStatus,
      requiresWellbeingUpdate: unknownPainState.requiresWellbeingUpdate,
      stalePainAreas: unknownPainState.stalePainAreas,
    });
    assert(
      unknownPainState.wellbeingFreshnessStatus === 'stale' &&
        unknownPainState.stalePainAreas.length === 1 &&
        unknownPainState.stalePainAreas[0].isUnknownZone === true &&
        unknownDecision.allowed === false &&
        unknownDecision.blockedByPain === true,
      'Неизвестный ключ raw: должен оставаться fail-safe и блокировать упражнения до явного подтверждения'
    );

    // 2) Явное подтверждение неизвестного ключа (даже в другом регистре) снимает только его
    const unknownCleared = resolveWellbeingPainStatePure(
      [
        {
          id: 'wb_u1',
          date: '2026-11-03',
          painByMuscle: { ['Неизвестная_связка']: 3, chest: 2 } as any,
          createdAt: 1000,
        },
        {
          id: 'wb_u2',
          date: '2026-11-10',
          painByMuscle: { ['неизвестная_связка']: 0 } as any,
          createdAt: 2000,
        },
      ],
      now
    );
    assert(
      unknownCleared.painByMuscle?.['chest'] === 2 &&
        unknownCleared.painByMuscle?.['Неизвестная_связка'] === undefined &&
        unknownCleared.painByMuscle?.['неизвестная_связка'] === undefined,
      'Подтверждение 0 для неизвестной зоны должно снимать только её, сохраняя боль в груди'
    );

    // 3) Сортировка строго по (date, createdAt, origIdx): старая дата с большим createdAt НЕ может воскресить снятую боль
    const auditSortState = resolveWellbeingPainStatePure(
      [
        {
          id: 'wb_old_high_ts',
          date: '2026-11-01', // День 1
          painByMuscle: { chest: 4 },
          createdAt: 9999999999999, // Поздний ошибочный createdAt на старую дату
        },
        {
          id: 'wb_new_clear',
          date: '2026-11-08', // День 8
          painByMuscle: { chest: 0 },
          createdAt: 1000,
        },
      ],
      now
    );
    assert(
      auditSortState.painByMuscle === undefined && auditSortState.wellbeingFreshnessStatus === 'none',
      'Старая дата даже с большим createdAt не должна восстанавливать боль, снятую в более позднюю дату'
    );

    // Детерминизм при равных date и createdAt + игнор будущих дат + невалидных значений
    const tieAndFutureState = resolveWellbeingPainStatePure(
      [
        { id: 't1', date: '2026-11-09', jointPain: 3, createdAt: 5000 },
        { id: 't2', date: '2026-11-09', jointPain: 0, createdAt: 5000 },
        { id: 'future', date: '2026-12-01', jointPain: 5, createdAt: 9000 },
      ],
      now
    );
    assert(
      tieAndFutureState.generalPainLevel === 0 && tieAndFutureState.wellbeingFreshnessStatus === 'none',
      'Равные date/createdAt должны обрабатываться детерминированно, а будущие даты — игнорироваться'
    );

    // Legacy запись без createdAt и с ключом rearDelts
    const legacyState = resolveWellbeingPainStatePure(
      [
        {
          id: 'wb_legacy',
          date: '2026-11-02',
          painByMuscle: { rearDelts: 3 } as any,
          createdAt: undefined as any,
        },
      ],
      now
    );
    assert(
      legacyState.painByMuscle?.rear_delts === 3 &&
        legacyState.wellbeingFreshnessStatus === 'stale' &&
        legacyState.stalePainAreas[0]?.zoneKey === 'rear_delts',
      'Legacy-запись без createdAt и с ключом rearDelts должна корректно нормализоваться как stale'
    );

    // Невалидное новое значение jointPain: -1 не должно стирать активную боль в суставах
    const invalidPreservesPain = resolveWellbeingPainStatePure(
      [
        { id: 'v1', date: '2026-11-05', jointPain: 4, createdAt: 1000 },
        { id: 'v2', date: '2026-11-10', jointPain: -1, createdAt: 2000 },
      ],
      now
    );
    assert(
      invalidPreservesPain.generalPainLevel === 4 &&
        invalidPreservesPain.hasInvalidWellbeingInput === true,
      'Невалидное значение боли в новом чекине не смеет стирать активную боль'
    );

    return 'Все граничные условия аудита (raw:, сортировка, будущее, невалидные, legacy) подтверждены';
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
