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
} from '../coreMath';
import { evaluateSafetyGuard } from '../safetyGuard';
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
  CORRUPTED_RAW_PREFIX,
  CORRUPTED_LOCKS_INDEX_KEY,
  PENDING_ROLLBACK_KEY,
  ROLLBACK_SNAPSHOT_KEY,
  ROLLBACK_SNAPSHOT_STAGING_KEY,
  type SafeWriteResult,
} from '../../services/migrations';
import { StorageService } from '../../services/storage';
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

    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear() {
        stats.clearCalls += 1;
        store.clear();
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(k: string) {
        stats.removeCalls += 1;
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
        stats.setCalls += 1;
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

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
