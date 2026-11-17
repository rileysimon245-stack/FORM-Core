import {
  WorkoutProgram,
  ProgramWorkoutDay,
  ProgramExerciseTemplate,
  MuscleGroup,
} from '../types/workout';
import { StorageService } from './storage';
import { checkAddExerciseSafety, getCurrentSafetyContext } from './safetyContext';
import { FullExerciseItem } from '../data/exerciseTypes';
import { formatLocalIsoDate } from '../training-core/dateUtils';
import {
  ExerciseSafetyCandidate,
  ExerciseSafetyDecision,
  evaluateExerciseSafety,
  SafetyUserContext,
} from '../training-core/safetyGuard';
import {
  UnifiedExerciseEntry,
  getUnifiedCatalog,
  resolveExerciseInUnifiedCatalog,
} from '../training-core/catalog';
import {
  CANONICAL_MUSCLE_KEYS,
  normalizeMuscleKeyPure,
  normalizeMuscleListPure,
} from '../training-core/muscles';

export interface GeneratorParams {
  goal: string;
  daysPerWeek: number;
  duration: number;
  experience: string;
  preferredDays: string[];
  notes?: string;
  age?: number;
  excludedExercises?: string[];
  healthRestrictions?: string[];
}

export interface ProposedProgramExercise {
  exerciseId?: string | null;
  name?: string | null;
  targetMuscle?: string | null;
  sets?: unknown;
  reps?: unknown;
  restSeconds?: unknown;
}

export interface UnifiedValidationContext {
  params: GeneratorParams;
  customExercises: FullExerciseItem[];
  availableEquipmentSet: ReadonlySet<string>;
  safetyContextOverride?: SafetyUserContext;
  usedExerciseIds?: ReadonlySet<string>;
  usedExerciseNames?: ReadonlySet<string>;
}

export type ExerciseValidationRejectionReason =
  | 'missing_identifier'
  | 'not_in_catalog'
  | 'id_name_mismatch'
  | 'invalid_catalog_fields'
  | 'duplicate_in_day'
  | 'equipment_unavailable'
  | 'safety_guard_veto'
  | 'invalid_output_fields';

export interface ExerciseValidationResult {
  valid: boolean;
  exercise: ProgramExerciseTemplate | null;
  catalogEntry: UnifiedExerciseEntry | null;
  reason?: ExerciseValidationRejectionReason;
}

function normalizeNameForSet(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, 'е');
}

function buildAvailableEquipmentSet(equipmentIds: readonly string[]): Set<string> {
  const result = new Set<string>();
  for (const raw of equipmentIds) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().toLowerCase();
    if (clean) {
      result.add(clean);
    }
  }
  return result;
}

export function isEquipmentAvailable(
  requiredEquipment: unknown,
  availableEquipmentSet: ReadonlySet<string>
): boolean {
  if (typeof requiredEquipment !== 'string' || availableEquipmentSet.size === 0) {
    return false;
  }
  const clean = requiredEquipment.trim().toLowerCase();
  if (!clean) {
    return false;
  }

  switch (clean) {
    case 'bodyweight':
      return availableEquipmentSet.has('bodyweight');
    case 'barbell':
      return availableEquipmentSet.has('barbell');
    case 'dumbbells_adjustable':
    case 'dumbbells_fixed':
      return (
        availableEquipmentSet.has('dumbbells_adjustable') ||
        availableEquipmentSet.has('dumbbells_fixed')
      );
    case 'pullup_bar':
      return availableEquipmentSet.has('pullup_bar');
    case 'dip_bars':
      return availableEquipmentSet.has('dip_bars');
    case 'bench':
      return availableEquipmentSet.has('bench');
    case 'gym_machines':
      return availableEquipmentSet.has('gym_machines');
    case 'crossover':
      return (
        availableEquipmentSet.has('crossover') ||
        availableEquipmentSet.has('gym_machines')
      );
    case 'kettlebells':
      return availableEquipmentSet.has('kettlebells');
    case 'resistance_bands':
      return availableEquipmentSet.has('resistance_bands');
    case 'jump_rope':
      return availableEquipmentSet.has('jump_rope');
    case 'other':
      return availableEquipmentSet.has('other');
    default:
      return false;
  }
}

function hasSafetyOverrides(params: GeneratorParams): boolean {
  return (
    params.age !== undefined ||
    params.excludedExercises !== undefined ||
    params.healthRestrictions !== undefined
  );
}

function buildGeneratorSafetyContext(params: GeneratorParams): SafetyUserContext {
  const liveCtx = getCurrentSafetyContext();
  return {
    age: params.age !== undefined ? params.age : liveCtx.age,
    excludedExercises:
      params.excludedExercises !== undefined ? params.excludedExercises : liveCtx.excludedExercises,
    healthRestrictions:
      params.healthRestrictions !== undefined
        ? params.healthRestrictions
        : liveCtx.healthRestrictions,
    generalPainLevel: liveCtx.generalPainLevel,
    painByMuscle: liveCtx.painByMuscle,
    daysSinceLastSession: liveCtx.daysSinceLastSession,
    hadRepDropRecently: liveCtx.hadRepDropRecently,
  };
}

function evaluateGeneratorExerciseSafety(
  candidate: ExerciseSafetyCandidate,
  params: GeneratorParams,
  safetyContextOverride?: SafetyUserContext
): ExerciseSafetyDecision {
  if (!hasSafetyOverrides(params) && !safetyContextOverride) {
    return checkAddExerciseSafety(candidate);
  }
  const ctx = safetyContextOverride || buildGeneratorSafetyContext(params);
  return evaluateExerciseSafety(candidate, ctx);
}

function parsePositiveIntInRange(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function isValidCatalogEntryFields(entry: UnifiedExerciseEntry): boolean {
  if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) return false;
  if (typeof entry.name !== 'string' || !entry.name.trim()) return false;
  if (!CANONICAL_MUSCLE_KEYS.has(entry.primaryMuscle)) return false;
  if (typeof entry.isBodyweight !== 'boolean') return false;
  if (typeof entry.requiredEquipment !== 'string' || !entry.requiredEquipment.trim()) return false;
  if (!Number.isFinite(entry.defaultSets) || entry.defaultSets < 1) return false;
  if (!Number.isFinite(entry.defaultReps) || entry.defaultReps < 1) return false;
  if (!Number.isFinite(entry.defaultRestSeconds) || entry.defaultRestSeconds < 0) return false;
  return true;
}

function isValidTemplateFields(template: ProgramExerciseTemplate): boolean {
  if (!template.exerciseId || !template.exerciseId.trim()) return false;
  if (!template.name || !template.name.trim()) return false;
  if (!CANONICAL_MUSCLE_KEYS.has(template.targetMuscle)) return false;
  if (typeof template.isBodyweight !== 'boolean') return false;
  if (typeof template.requiredEquipment !== 'string' || !template.requiredEquipment.trim()) {
    return false;
  }
  if (!Number.isFinite(template.sets) || template.sets < 1) return false;
  if (!Number.isFinite(template.reps) || template.reps < 1) return false;
  if (!Number.isFinite(template.targetWeight) || template.targetWeight < 0) return false;
  if (!Number.isFinite(template.restSeconds) || template.restSeconds < 0) return false;
  if (typeof template.technique !== 'string' || !template.technique.trim()) return false;
  return true;
}

/**
 * Единый конвейер проверки кандидата упражнения для AI-пути, локальной генерации и резервного подбора:
 * 1) Подтверждённый поиск в каталоге (exact ID или однозначное имя)
 * 2) Проверка целостности полей каталога
 * 3) Проверка доступности оборудования пользователя (requiredEquipment)
 * 4) Проверка Safety Guard (checkAddExerciseSafety / evaluateExerciseSafety)
 * 5) Формирование и проверка валидности полей итогового упражнения
 */
export function validateProgramExerciseCandidate(
  proposed: ProposedProgramExercise,
  ctx: UnifiedValidationContext
): ExerciseValidationResult {
  const rawId = typeof proposed.exerciseId === 'string' ? proposed.exerciseId.trim() : '';
  const rawName = typeof proposed.name === 'string' ? proposed.name.trim() : '';
  if (!rawId && !rawName) {
    return { valid: false, exercise: null, catalogEntry: null, reason: 'missing_identifier' };
  }

  const lookup = resolveExerciseInUnifiedCatalog(
    rawId || null,
    rawName || null,
    ctx.customExercises,
    proposed.targetMuscle
  );
  if (!lookup.entry) {
    return { valid: false, exercise: null, catalogEntry: null, reason: 'not_in_catalog' };
  }

  const entry = lookup.entry;

  // Если переданы и ID, и имя, и имя однозначно указывает на другое упражнение — не принимаем конфликтную пару
  if (lookup.status === 'exact_id' && rawName) {
    const nameLookup = resolveExerciseInUnifiedCatalog(
      null,
      rawName,
      ctx.customExercises,
      proposed.targetMuscle
    );
    if (nameLookup.entry && nameLookup.entry.id !== entry.id) {
      return { valid: false, exercise: null, catalogEntry: null, reason: 'id_name_mismatch' };
    }
  }

  if (!isValidCatalogEntryFields(entry)) {
    return {
      valid: false,
      exercise: null,
      catalogEntry: entry,
      reason: 'invalid_catalog_fields',
    };
  }

  const normalizedEntryName = normalizeNameForSet(entry.name);
  if (ctx.usedExerciseIds?.has(entry.id) || ctx.usedExerciseNames?.has(normalizedEntryName)) {
    return { valid: false, exercise: null, catalogEntry: entry, reason: 'duplicate_in_day' };
  }

  if (!isEquipmentAvailable(entry.requiredEquipment, ctx.availableEquipmentSet)) {
    return {
      valid: false,
      exercise: null,
      catalogEntry: entry,
      reason: 'equipment_unavailable',
    };
  }

  const safetyDecision = evaluateGeneratorExerciseSafety(
    {
      exerciseId: entry.id,
      name: entry.name,
      targetMuscle: entry.primaryMuscle,
      secondaryMuscles: entry.secondaryMuscles,
      requiredEquipment: entry.requiredEquipment,
      isBodyweight: entry.isBodyweight,
    },
    ctx.params,
    ctx.safetyContextOverride
  );
  if (!safetyDecision.allowed) {
    return {
      valid: false,
      exercise: null,
      catalogEntry: entry,
      reason: 'safety_guard_veto',
    };
  }

  const sets = parsePositiveIntInRange(proposed.sets, 1, 20) ?? Math.round(entry.defaultSets);
  const reps = parsePositiveIntInRange(proposed.reps, 1, 200) ?? Math.round(entry.defaultReps);
  const restSeconds =
    parsePositiveIntInRange(proposed.restSeconds, 0, 600) ?? Math.round(entry.defaultRestSeconds);
  const technique =
    typeof entry.technique === 'string' && entry.technique.trim()
      ? entry.technique.trim()
      : 'Выполняйте в контролируемом темпе с правильной осанкой.';

  const template: ProgramExerciseTemplate = {
    exerciseId: entry.id,
    name: entry.name,
    targetMuscle: entry.primaryMuscle,
    secondaryMuscles: entry.secondaryMuscles,
    isBodyweight: entry.isBodyweight,
    requiredEquipment: entry.requiredEquipment,
    sets,
    reps,
    targetWeight: 0,
    restSeconds,
    technique,
  };

  if (!isValidTemplateFields(template)) {
    return {
      valid: false,
      exercise: null,
      catalogEntry: entry,
      reason: 'invalid_output_fields',
    };
  }

  return {
    valid: true,
    exercise: template,
    catalogEntry: entry,
  };
}

const MUSCLE_FAMILY_EXPANSION: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  chest: ['chest', 'chest_upper', 'chest_mid', 'chest_lower'],
  shoulders: ['shoulders', 'front_delts', 'side_delts'],
  quads: ['quads', 'quads_rectus', 'quads_lateralis', 'quads_medialis'],
  traps: ['traps', 'traps_upper', 'traps_mid', 'traps_lower'],
};

function computeSlotProgramming(
  entry: UnifiedExerciseEntry,
  params: GeneratorParams,
  preferredVolume?: { sets?: unknown; reps?: unknown; restSeconds?: unknown }
): { sets: number; reps: number; restSeconds: number } {
  if (
    preferredVolume &&
    (preferredVolume.sets !== undefined ||
      preferredVolume.reps !== undefined ||
      preferredVolume.restSeconds !== undefined)
  ) {
    return {
      sets: parsePositiveIntInRange(preferredVolume.sets, 1, 20) ?? entry.defaultSets,
      reps: parsePositiveIntInRange(preferredVolume.reps, 1, 200) ?? entry.defaultReps,
      restSeconds:
        parsePositiveIntInRange(preferredVolume.restSeconds, 0, 600) ?? entry.defaultRestSeconds,
    };
  }

  const effectiveAge =
    typeof params.age === 'number' && Number.isFinite(params.age) ? params.age : 0;
  if (params.goal === 'Сила') {
    return {
      sets: 4,
      reps: effectiveAge > 50 ? 8 : 6,
      restSeconds: 120,
    };
  }
  if (params.goal === 'Выносливость') {
    return {
      sets: 3,
      reps: 15,
      restSeconds: 45,
    };
  }
  return {
    sets: entry.defaultSets || 3,
    reps: entry.defaultReps || 10,
    restSeconds: entry.defaultRestSeconds || 75,
  };
}

/**
 * Единый подбор и резервный подбор (`safeFallbackCandidates`) по группе мышц:
 * 1) Основной подбор — упражнения каталога с primaryMuscle из требуемой группы/семейства.
 * 2) Резервный подбор (`safeFallbackCandidates`) — упражнения каталога с совпадением в secondaryMuscles
 *    или из списка альтернатив основных кандидатов.
 * Оба уровня ОБЯЗАТЕЛЬНО проходят единый конвейер `validateProgramExerciseCandidate`
 * (каталог + оборудование + Safety Guard + валидность полей).
 */
function pickValidatedExerciseForMuscle(
  requestedMuscle: MuscleGroup | string,
  catalog: readonly UnifiedExerciseEntry[],
  ctx: UnifiedValidationContext,
  preferredVolume?: { sets?: unknown; reps?: unknown; restSeconds?: unknown }
): ProgramExerciseTemplate | null {
  const normMuscle = normalizeMuscleKeyPure(requestedMuscle);
  if (!normMuscle) return null;

  const primaryTargets = new Set<MuscleGroup>(
    MUSCLE_FAMILY_EXPANSION[normMuscle] || [normMuscle]
  );

  // Уровень 1: основная целевая мышца
  const primaryCandidates = catalog.filter((entry) => primaryTargets.has(entry.primaryMuscle));
  for (const candidate of primaryCandidates) {
    const programming = computeSlotProgramming(candidate, ctx.params, preferredVolume);
    const res = validateProgramExerciseCandidate(
      {
        exerciseId: candidate.id,
        name: candidate.name,
        targetMuscle: candidate.primaryMuscle,
        ...programming,
      },
      ctx
    );
    if (res.valid && res.exercise) {
      return res.exercise;
    }
  }

  // Уровень 2: резервный подбор (`safeFallbackCandidates`) — строго из каталога,
  // без обхода проверки оборудования и Safety Guard
  const alternativeHints = new Set<string>();
  for (const primary of primaryCandidates) {
    for (const alt of primary.alternatives || []) {
      const cleanAlt = alt.trim();
      if (cleanAlt) alternativeHints.add(cleanAlt);
    }
  }

  const safeFallbackCandidates = catalog.filter((entry) => {
    if (primaryTargets.has(entry.primaryMuscle)) return false;
    const matchesSecondary = entry.secondaryMuscles.some((m) => primaryTargets.has(m));
    const matchesAlternative =
      alternativeHints.has(entry.id) || alternativeHints.has(entry.name);
    return matchesSecondary || matchesAlternative;
  });

  for (const fallback of safeFallbackCandidates) {
    const programming = computeSlotProgramming(fallback, ctx.params, preferredVolume);
    const res = validateProgramExerciseCandidate(
      {
        exerciseId: fallback.id,
        name: fallback.name,
        targetMuscle: fallback.primaryMuscle,
        ...programming,
      },
      ctx
    );
    if (res.valid && res.exercise) {
      return res.exercise;
    }
  }

  return null;
}

function createNoSuitableExercisesError(
  availableEquipmentSet: ReadonlySet<string>,
  sourceLabel?: 'ai' | 'local'
): Error {
  if (availableEquipmentSet.size === 0) {
    return new Error(
      'Не удалось составить программу: не указан доступный инвентарь. Выберите хотя бы один тип оборудования в разделе «Мой инвентарь».'
    );
  }
  if (sourceLabel === 'ai') {
    return new Error(
      'Не удалось составить программу: предложенные ИИ упражнения не подтверждены в каталоге либо не подходят под текущий инвентарь и ограничения безопасности (Safety Guard).'
    );
  }
  return new Error(
    'Не удалось составить программу: для выбранного инвентаря и ограничений безопасности (Safety Guard) не найдено подходящих упражнений в каталоге.'
  );
}

export async function generateWorkoutProgram(
  params: GeneratorParams
): Promise<{ program: WorkoutProgram; source: 'ai' | 'algorithmic'; message?: string }> {
  const equipmentItems = StorageService.getEquipmentList();
  const availableEquipmentIds = equipmentItems
    .filter((e) => e.selected || e.owned)
    .map((e) => e.id);
  const availableEquipmentSet = buildAvailableEquipmentSet(availableEquipmentIds);

  const userParams = StorageService.getUserParameters();
  const profile = StorageService.getProfile();
  const customExercises = StorageService.getCustomExercises();
  const catalog = getUnifiedCatalog(customExercises);

  // Данные для запроса в AI backend (локальная проверка Safety Guard при этом использует единый конвейер)
  const requestPayloadParams: GeneratorParams = {
    ...params,
    age: params.age !== undefined ? params.age : profile.age,
    excludedExercises:
      params.excludedExercises !== undefined
        ? params.excludedExercises
        : userParams.excludedExercises || [],
    healthRestrictions:
      params.healthRestrictions !== undefined
        ? params.healthRestrictions
        : userParams.healthRestrictions || [],
  };

  const safetyContextOverride = hasSafetyOverrides(params)
    ? buildGeneratorSafetyContext(params)
    : undefined;

  let aiResponseData: any = null;
  try {
    const res = await fetch('/api/generate-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestPayloadParams,
        availableEquipmentIds,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.program && Array.isArray(data.program.workouts)) {
        aiResponseData = data.program;
      }
    }
  } catch (err) {
    console.warn('Backend AI generation unavailable, using smart algorithmic generator:', err);
  }

  if (aiResponseData) {
    const baseTimestamp = Date.now();
    const rawWorkouts: ProgramWorkoutDay[] = aiResponseData.workouts.map(
      (w: any, idx: number) => {
        const sanitizedExercises: ProgramExerciseTemplate[] = [];
        const usedIds = new Set<string>();
        const usedNames = new Set<string>();

        const validationCtx: UnifiedValidationContext = {
          params,
          customExercises,
          availableEquipmentSet,
          safetyContextOverride,
          usedExerciseIds: usedIds,
          usedExerciseNames: usedNames,
        };

        for (const ex of w?.exercises || []) {
          const check = validateProgramExerciseCandidate(
            {
              exerciseId: ex?.exerciseId,
              name: ex?.name,
              targetMuscle: ex?.targetMuscle,
              sets: ex?.sets,
              reps: ex?.reps,
              restSeconds: ex?.restSeconds,
            },
            validationCtx
          );

          if (check.valid && check.exercise) {
            if (check.exercise.exerciseId) {
              usedIds.add(check.exercise.exerciseId);
            }
            usedNames.add(normalizeNameForSet(check.exercise.name));
            sanitizedExercises.push(check.exercise);
            continue;
          }

          // Замена выполняется только если предложенное упражнение подтверждено в каталоге,
          // но отклонено из-за оборудования или Safety Guard. Вымышленные названия вне каталога не подменяются.
          if (
            check.catalogEntry &&
            (check.reason === 'equipment_unavailable' || check.reason === 'safety_guard_veto')
          ) {
            const replacement = pickValidatedExerciseForMuscle(
              check.catalogEntry.primaryMuscle,
              catalog,
              validationCtx,
              {
                sets: ex?.sets,
                reps: ex?.reps,
                restSeconds: ex?.restSeconds,
              }
            );
            if (replacement) {
              if (replacement.exerciseId) {
                usedIds.add(replacement.exerciseId);
              }
              usedNames.add(normalizeNameForSet(replacement.name));
              sanitizedExercises.push(replacement);
            }
          }
        }

        const normalizedGroups = normalizeMuscleListPure(w?.targetMuscleGroups);
        const derivedGroups = Array.from(
          new Set(sanitizedExercises.map((e) => e.targetMuscle))
        ) as MuscleGroup[];

        return {
          id: `w_gen_${idx}_${baseTimestamp}`,
          dayName: w?.dayName || `День ${idx + 1}`,
          targetMuscleGroups:
            normalizedGroups.length > 0 ? normalizedGroups : derivedGroups,
          estimatedDuration: Number(w?.estimatedDuration) || params.duration,
          exercises: sanitizedExercises,
        };
      }
    );

    const validWorkouts = rawWorkouts.filter((day) => day.exercises.length > 0);
    if (validWorkouts.length === 0) {
      throw createNoSuitableExercisesError(availableEquipmentSet, 'ai');
    }

    const fullProgram: WorkoutProgram = {
      id: `prog_ai_${baseTimestamp}`,
      name: aiResponseData.name || `${params.goal}: ${params.daysPerWeek} дня`,
      description:
        aiResponseData.description ||
        'Индивидуальная программа с учетом вашего инвентаря и ограничений',
      goal: params.goal,
      daysPerWeek: validWorkouts.length,
      workouts: validWorkouts,
      isCustom: true,
      createdAt: formatLocalIsoDate(new Date()),
    };

    return { program: fullProgram, source: 'ai' };
  }

  // Надёжный локальный алгоритмический генератор с тем же единым конвейером проверки
  const localProgram = generateLocalTemplateProgram(params, availableEquipmentIds);
  return {
    program: localProgram,
    source: 'algorithmic',
    message:
      'Программа успешно составлена из реальных упражнений каталога строго с учетом выбранного инвентаря и ограничений.',
  };
}

export function generateLocalTemplateProgram(
  params: GeneratorParams,
  availableEquipmentIds?: string[]
): WorkoutProgram {
  const { goal, daysPerWeek, duration, experience } = params;

  const customExercises = StorageService.getCustomExercises();
  const catalog = getUnifiedCatalog(customExercises);

  const rawEquipmentIds =
    availableEquipmentIds !== undefined
      ? availableEquipmentIds
      : StorageService.getEquipmentList()
          .filter((e) => e.selected || e.owned)
          .map((e) => e.id);
  const availableEquipmentSet = buildAvailableEquipmentSet(rawEquipmentIds);
  const safetyContextOverride = hasSafetyOverrides(params)
    ? buildGeneratorSafetyContext(params)
    : undefined;

  const buildDayExercises = (muscleSlots: Array<MuscleGroup | string>): ProgramExerciseTemplate[] => {
    const result: ProgramExerciseTemplate[] = [];
    const usedIds = new Set<string>();
    const usedNames = new Set<string>();
    const ctx: UnifiedValidationContext = {
      params,
      customExercises,
      availableEquipmentSet,
      safetyContextOverride,
      usedExerciseIds: usedIds,
      usedExerciseNames: usedNames,
    };

    for (const slot of muscleSlots) {
      const picked = pickValidatedExerciseForMuscle(slot, catalog, ctx);
      if (picked) {
        if (picked.exerciseId) {
          usedIds.add(picked.exerciseId);
        }
        usedNames.add(normalizeNameForSet(picked.name));
        result.push(picked);
      }
    }
    return result;
  };

  const baseTimestamp = Date.now();
  let rawWorkouts: ProgramWorkoutDay[] = [];

  if (daysPerWeek === 2) {
    rawWorkouts = [
      {
        id: `w_gen_u_${baseTimestamp}`,
        dayName: 'День 1: Верх тела (Грудь, Спина, Плечи, Руки)',
        targetMuscleGroups: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['chest', 'lats', 'shoulders', 'biceps', 'triceps']),
      },
      {
        id: `w_gen_l_${baseTimestamp}`,
        dayName: 'День 2: Низ тела и Кор (Квадрицепсы, Бедра, Пресс)',
        targetMuscleGroups: ['quads', 'hamstrings', 'calves', 'abs'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['quads', 'hamstrings', 'calves', 'abs']),
      },
    ];
  } else if (daysPerWeek === 3) {
    rawWorkouts = [
      {
        id: `w_gen_push_${baseTimestamp}`,
        dayName: 'День 1: Push (Грудь, Плечи, Трицепс)',
        targetMuscleGroups: ['chest', 'shoulders', 'triceps'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['chest', 'shoulders', 'triceps', 'abs']),
      },
      {
        id: `w_gen_pull_${baseTimestamp}`,
        dayName: 'День 2: Pull (Спина, Задние дельты, Бицепс)',
        targetMuscleGroups: ['lats', 'rear_delts', 'biceps'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['lats', 'rear_delts', 'biceps']),
      },
      {
        id: `w_gen_legs_${baseTimestamp}`,
        dayName: 'День 3: Legs (Квадрицепсы, Бедра, Икры)',
        targetMuscleGroups: ['quads', 'hamstrings', 'calves'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['quads', 'hamstrings', 'calves', 'abs']),
      },
    ];
  } else {
    rawWorkouts = [
      {
        id: `w_gen_u1_${baseTimestamp}`,
        dayName: 'День 1: Верх А (Сила — Грудь и Спина)',
        targetMuscleGroups: ['chest', 'lats'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['chest', 'lats', 'shoulders']),
      },
      {
        id: `w_gen_l1_${baseTimestamp}`,
        dayName: 'День 2: Низ А (Квадрицепсы и Икры)',
        targetMuscleGroups: ['quads', 'calves', 'abs'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['quads', 'calves', 'abs']),
      },
      {
        id: `w_gen_u2_${baseTimestamp}`,
        dayName: 'День 3: Верх Б (Плечи и Руки)',
        targetMuscleGroups: ['shoulders', 'biceps', 'triceps'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['shoulders', 'biceps', 'triceps']),
      },
      {
        id: `w_gen_l2_${baseTimestamp}`,
        dayName: 'День 4: Низ Б (Задняя поверхность бедра и Кор)',
        targetMuscleGroups: ['hamstrings', 'glutes', 'abs'],
        estimatedDuration: duration,
        exercises: buildDayExercises(['hamstrings', 'glutes', 'abs']),
      },
    ];
  }

  const workouts = rawWorkouts.filter((day) => day.exercises.length > 0);
  if (workouts.length === 0) {
    throw createNoSuitableExercisesError(availableEquipmentSet, 'local');
  }

  return {
    id: `prog_gen_${baseTimestamp}`,
    name: `${goal}: ${daysPerWeek} дня (${experience})`,
    description: `Составлена из упражнений каталога с учетом вашего инвентаря и восстановления. Длительность: ${duration} мин.`,
    goal,
    daysPerWeek: workouts.length,
    workouts,
    isCustom: true,
    createdAt: formatLocalIsoDate(new Date()),
  };
}

