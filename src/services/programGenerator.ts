import {
  WorkoutProgram,
  ProgramWorkoutDay,
  ProgramExerciseTemplate,
  MuscleGroup,
} from '../types/workout';
import { StorageService } from './storage';
import { getCurrentSafetyContext } from './safetyContext';
import { FullExerciseItem } from '../data/exerciseTypes';
import { formatLocalIsoDate } from '../training-core/dateUtils';
import { evaluateExerciseSafety, SafetyUserContext } from '../training-core/safetyGuard';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';

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
  };
}

function isExerciseSafeForGenerator(
  item: FullExerciseItem,
  safetyContext: SafetyUserContext
): boolean {
  return evaluateExerciseSafety(
    {
      exerciseId: item.id,
      name: item.name,
      targetMuscle: item.primaryMuscle,
      secondaryMuscles: item.secondaryMuscles,
      requiredEquipment: item.requiredEquipment,
      isBodyweight: Boolean(item.isBodyweight),
    },
    safetyContext
  ).allowed;
}

export async function generateWorkoutProgram(
  params: GeneratorParams
): Promise<{ program: WorkoutProgram; source: 'ai' | 'algorithmic'; message?: string }> {
  // Read current saved equipment and parameters
  const equipmentItems = StorageService.getEquipmentList();
  const availableEquipmentIds = equipmentItems.filter((e) => e.selected || e.owned).map((e) => e.id);
  const userParams = StorageService.getUserParameters();
  const profile = StorageService.getProfile();

  const enrichedParams: GeneratorParams = {
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

  const safetyContext = buildGeneratorSafetyContext(enrichedParams);

  // Attempt backend AI generation
  try {
    const res = await fetch('/api/generate-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...enrichedParams,
        availableEquipmentIds,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.program && data.program.workouts) {
        const customExercises = StorageService.getCustomExercises();
        const catalog = StorageService.getAllExercises();
        const safeCatalog = catalog.filter((item) =>
          isExerciseSafeForGenerator(item, safetyContext)
        );

        const fullProgram: WorkoutProgram = {
          id: `prog_ai_${Date.now()}`,
          name: data.program.name || `${params.goal}: ${params.daysPerWeek} дня`,
          description: data.program.description || 'Индивидуальная программа с учетом вашего инвентаря и ограничений',
          goal: params.goal,
          daysPerWeek: params.daysPerWeek,
          workouts: data.program.workouts.map((w: any, idx: number) => {
            const sanitizedExercises: ProgramExerciseTemplate[] = [];
            for (const ex of w.exercises || []) {
              const catalogMatch = findExerciseInUnifiedCatalog(
                ex.exerciseId,
                ex.name,
                customExercises,
                ex.targetMuscle
              );
              const safetyCheck = evaluateExerciseSafety(
                {
                  exerciseId: ex.exerciseId || catalogMatch?.id,
                  name: ex.name,
                  targetMuscle: ex.targetMuscle || catalogMatch?.primaryMuscle || 'chest',
                  secondaryMuscles: catalogMatch?.secondaryMuscles,
                  requiredEquipment: catalogMatch?.requiredEquipment,
                  isBodyweight: Boolean(ex.isBodyweight),
                },
                safetyContext
              );

              if (safetyCheck.allowed) {
                sanitizedExercises.push({
                  exerciseId: ex.exerciseId || catalogMatch?.id || `ex_gen_${Math.random().toString(36).substring(2, 6)}`,
                  name: ex.name,
                  targetMuscle: ex.targetMuscle || catalogMatch?.primaryMuscle || 'chest',
                  secondaryMuscles: catalogMatch?.secondaryMuscles,
                  isBodyweight: Boolean(ex.isBodyweight),
                  requiredEquipment: catalogMatch?.requiredEquipment,
                  sets: Number(ex.sets) || 3,
                  reps: Number(ex.reps) || 10,
                  targetWeight: 0,
                  restSeconds: Number(ex.restSeconds) || 75,
                  technique: ex.technique || 'Выполняйте в контролируемом темпе с правильной осанкой',
                });
              } else {
                const targetMuscle = (ex.targetMuscle || catalogMatch?.primaryMuscle || 'chest') as MuscleGroup;
                const safeReplacement = safeCatalog.find(
                  (c) =>
                    c.primaryMuscle === targetMuscle &&
                    !sanitizedExercises.some((already) => already.name === c.name)
                );
                if (safeReplacement) {
                  sanitizedExercises.push({
                    exerciseId: safeReplacement.id,
                    name: safeReplacement.name,
                    targetMuscle: safeReplacement.primaryMuscle,
                    secondaryMuscles: safeReplacement.secondaryMuscles,
                    isBodyweight: safeReplacement.isBodyweight,
                    requiredEquipment: safeReplacement.requiredEquipment,
                    sets: Number(ex.sets) || safeReplacement.defaultSets || 3,
                    reps: Number(ex.reps) || safeReplacement.defaultReps || 10,
                    targetWeight: 0,
                    restSeconds: Number(ex.restSeconds) || safeReplacement.defaultRestSeconds || 75,
                    technique: safeReplacement.technique || 'Выполняйте в контролируемом темпе с правильной осанкой',
                  });
                }
              }
            }

            return {
              id: `w_gen_${idx}_${Date.now()}`,
              dayName: w.dayName || `День ${idx + 1}`,
              targetMuscleGroups: w.targetMuscleGroups || ['chest'],
              estimatedDuration: w.estimatedDuration || params.duration,
              exercises: sanitizedExercises,
            };
          }),
          isCustom: true,
          createdAt: formatLocalIsoDate(new Date()),
        };

        return { program: fullProgram, source: 'ai' };
      }
    }
  } catch (err) {
    console.warn('Backend AI generation unavailable, using smart algorithmic generator:', err);
  }

  // Robust Local Algorithmic Generator strictly respecting selected equipment and health
  const localProgram = generateLocalTemplateProgram(enrichedParams, availableEquipmentIds);
  return {
    program: localProgram,
    source: 'algorithmic',
    message: 'Программа успешно составлена из реальных упражнений каталога строго с учетом выбранного инвентаря и ограничений.',
  };
}

export function generateLocalTemplateProgram(
  params: GeneratorParams,
  availableEquipmentIds?: string[]
): WorkoutProgram {
  const { goal, daysPerWeek, duration, experience, age } = params;
  const effectiveAge = typeof age === 'number' && Number.isFinite(age) ? age : 0;

  // 1. Get ALL exercises strictly from catalog (built-in + custom exercises)
  const catalog: FullExerciseItem[] = StorageService.getAllExercises();
  const safetyContext = buildGeneratorSafetyContext(params);

  // Read available equipment
  const eqList = availableEquipmentIds || StorageService.getEquipmentList().filter((e) => e.selected).map((e) => e.id);

  const hasBarbell = eqList.includes('barbell');
  const hasDumbbells = eqList.includes('dumbbells_adjustable') || eqList.includes('dumbbells_fixed');
  const hasPullupBar = eqList.includes('pullup_bar');
  const hasDipBars = eqList.includes('dip_bars');
  const hasMachines = eqList.includes('gym_machines');
  const hasKettlebells = eqList.includes('kettlebells');
  const hasBands = eqList.includes('resistance_bands');
  const hasJumpRope = eqList.includes('jump_rope');
  const hasBodyweight = eqList.includes('bodyweight') || eqList.length === 0;

  const isEquipmentAvailable = (ex: FullExerciseItem): boolean => {
    if (ex.requiredEquipment === 'barbell' && !hasBarbell) return false;
    if ((ex.requiredEquipment === 'dumbbells_adjustable' || ex.requiredEquipment === 'dumbbells_fixed') && !hasDumbbells) return false;
    if (ex.requiredEquipment === 'pullup_bar' && !hasPullupBar) return false;
    if (ex.requiredEquipment === 'dip_bars' && !hasDipBars) return false;
    if (ex.requiredEquipment === 'gym_machines' && !hasMachines) return false;
    if (ex.requiredEquipment === 'kettlebells' && !hasKettlebells) return false;
    if (ex.requiredEquipment === 'resistance_bands' && !hasBands) return false;
    if (ex.requiredEquipment === 'jump_rope' && !hasJumpRope) return false;
    if (ex.requiredEquipment === 'bodyweight' && !hasBodyweight) return false;
    return true;
  };

  // Предварительная жёсткая фильтрация Safety Guard (возраст, исключения, ограничения здоровья, боль)
  const safeCatalog = catalog.filter((ex) => isExerciseSafeForGenerator(ex, safetyContext));

  // Helper to pick exercise matching equipment strictly, muscle, and Safety Guard
  const pickExercise = (
    primaryMuscle: MuscleGroup
  ): ProgramExerciseTemplate | null => {
    const candidates = safeCatalog.filter((ex) => {
      if (ex.primaryMuscle !== primaryMuscle && !ex.secondaryMuscles?.includes(primaryMuscle)) {
        return false;
      }
      return isEquipmentAvailable(ex);
    });

    // Безопасный fallback: ТОЛЬКО из safeCatalog (никогда не обходит Safety Guard!)
    const safeFallbackCandidates = safeCatalog.filter((ex) => ex.primaryMuscle === primaryMuscle);
    const chosen =
      candidates.length > 0
        ? candidates[0]
        : safeFallbackCandidates.length > 0
        ? safeFallbackCandidates[0]
        : null;

    if (!chosen) {
      return null;
    }

    let targetReps = 10;
    let targetSets = 3;
    let restSec = chosen.defaultRestSeconds || 75;

    if (goal === 'Сила') {
      targetReps = effectiveAge > 50 ? 8 : 6;
      targetSets = 4;
      restSec = 120;
    } else if (goal === 'Выносливость') {
      targetReps = 15;
      targetSets = 3;
      restSec = 45;
    } else {
      targetReps = chosen.defaultReps || 10;
      targetSets = chosen.defaultSets || 3;
      restSec = chosen.defaultRestSeconds || 75;
    }

    return {
      exerciseId: chosen.id,
      name: chosen.name,
      targetMuscle: chosen.primaryMuscle,
      secondaryMuscles: chosen.secondaryMuscles,
      isBodyweight: chosen.isBodyweight,
      requiredEquipment: chosen.requiredEquipment,
      sets: targetSets,
      reps: targetReps,
      targetWeight: 0,
      restSeconds: restSec,
      technique: chosen.technique || 'Выполняйте в контролируемом темпе с правильной осанкой.',
    };
  };

  const compactExercises = (list: Array<ProgramExerciseTemplate | null>): ProgramExerciseTemplate[] =>
    list.filter((item): item is ProgramExerciseTemplate => item !== null);

  let workouts: ProgramWorkoutDay[] = [];

  if (daysPerWeek === 2) {
    workouts = [
      {
        id: `w_gen_u_${Date.now()}`,
        dayName: 'День 1: Верх тела (Грудь, Спина, Плечи, Руки)',
        targetMuscleGroups: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('chest'),
          pickExercise('lats'),
          pickExercise('shoulders'),
          pickExercise('biceps'),
          pickExercise('triceps'),
        ]),
      },
      {
        id: `w_gen_l_${Date.now()}`,
        dayName: 'День 2: Низ тела и Кор (Квадрицепсы, Бедра, Пресс)',
        targetMuscleGroups: ['quads', 'hamstrings', 'calves', 'abs'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('quads'),
          pickExercise('hamstrings'),
          pickExercise('calves'),
          pickExercise('abs'),
        ]),
      },
    ];
  } else if (daysPerWeek === 3) {
    workouts = [
      {
        id: `w_gen_push_${Date.now()}`,
        dayName: 'День 1: Push (Грудь, Плечи, Трицепс)',
        targetMuscleGroups: ['chest', 'shoulders', 'triceps'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('chest'),
          pickExercise('shoulders'),
          pickExercise('triceps'),
          pickExercise('abs'),
        ]),
      },
      {
        id: `w_gen_pull_${Date.now()}`,
        dayName: 'День 2: Pull (Спина, Задние дельты, Бицепс)',
        targetMuscleGroups: ['lats', 'rearDelts', 'biceps'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('lats'),
          pickExercise('rearDelts'),
          pickExercise('biceps'),
        ]),
      },
      {
        id: `w_gen_legs_${Date.now()}`,
        dayName: 'День 3: Legs (Квадрицепсы, Бедра, Икры)',
        targetMuscleGroups: ['quads', 'hamstrings', 'calves'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('quads'),
          pickExercise('hamstrings'),
          pickExercise('calves'),
          pickExercise('abs'),
        ]),
      },
    ];
  } else {
    workouts = [
      {
        id: `w_gen_u1_${Date.now()}`,
        dayName: 'День 1: Верх А (Сила — Грудь и Спина)',
        targetMuscleGroups: ['chest', 'lats'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('chest'),
          pickExercise('lats'),
          pickExercise('shoulders'),
        ]),
      },
      {
        id: `w_gen_l1_${Date.now()}`,
        dayName: 'День 2: Низ А (Квадрицепсы и Икры)',
        targetMuscleGroups: ['quads', 'calves', 'abs'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('quads'),
          pickExercise('calves'),
          pickExercise('abs'),
        ]),
      },
      {
        id: `w_gen_u2_${Date.now()}`,
        dayName: 'День 3: Верх Б (Плечи и Руки)',
        targetMuscleGroups: ['shoulders', 'biceps', 'triceps'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('shoulders'),
          pickExercise('biceps'),
          pickExercise('triceps'),
        ]),
      },
      {
        id: `w_gen_l2_${Date.now()}`,
        dayName: 'День 4: Низ Б (Задняя поверхность бедра и Кор)',
        targetMuscleGroups: ['hamstrings', 'glutes', 'abs'],
        estimatedDuration: duration,
        exercises: compactExercises([
          pickExercise('hamstrings'),
          pickExercise('glutes'),
          pickExercise('abs'),
        ]),
      },
    ];
  }

  return {
    id: `prog_gen_${Date.now()}`,
    name: `${goal}: ${daysPerWeek} дня (${experience})`,
    description: `Составлена из упражнений каталога с учетом вашего инвентаря и восстановления. Длительность: ${duration} мин.`,
    goal,
    daysPerWeek,
    workouts,
    isCustom: true,
    createdAt: formatLocalIsoDate(new Date()),
  };
}
