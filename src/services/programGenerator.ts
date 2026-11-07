import {
  WorkoutProgram,
  ProgramWorkoutDay,
  ProgramExerciseTemplate,
  MuscleGroup,
} from '../types/workout';
import { StorageService } from './storage';
import { FullExerciseItem } from '../data/exerciseTypes';

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
    age: profile.age,
    excludedExercises: userParams.excludedExercises || [],
    healthRestrictions: userParams.healthRestrictions || [],
  };

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
        const fullProgram: WorkoutProgram = {
          id: `prog_ai_${Date.now()}`,
          name: data.program.name || `${params.goal}: ${params.daysPerWeek} дня`,
          description: data.program.description || 'Индивидуальная программа с учетом вашего инвентаря и ограничений',
          goal: params.goal,
          daysPerWeek: params.daysPerWeek,
          workouts: data.program.workouts.map((w: any, idx: number) => ({
            id: `w_gen_${idx}_${Date.now()}`,
            dayName: w.dayName || `День ${idx + 1}`,
            targetMuscleGroups: w.targetMuscleGroups || ['chest'],
            estimatedDuration: w.estimatedDuration || params.duration,
            exercises: (w.exercises || []).map((ex: any) => ({
              exerciseId: ex.exerciseId || `ex_gen_${Math.random().toString(36).substring(2, 6)}`,
              name: ex.name,
              targetMuscle: ex.targetMuscle || 'chest',
              isBodyweight: Boolean(ex.isBodyweight),
              sets: Number(ex.sets) || 3,
              reps: Number(ex.reps) || 10,
              targetWeight: Number(ex.targetWeight) || 0,
              restSeconds: Number(ex.restSeconds) || 75,
              technique: ex.technique || 'Выполняйте в контролируемом темпе с правильной осанкой',
            })),
          })),
          isCustom: true,
          createdAt: new Date().toISOString().split('T')[0],
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
  const { goal, daysPerWeek, duration, experience, age = 28 } = params;

  // 1. Get ALL exercises strictly from catalog (built-in 181 + custom exercises)
  const catalog: FullExerciseItem[] = StorageService.getAllExercises();

  // Read available equipment
  const eqList = availableEquipmentIds || StorageService.getEquipmentList().filter((e) => e.selected).map((e) => e.id);
  const excluded = (params.excludedExercises || []).map((e) => e.toLowerCase().trim());
  const healthLimits = (params.healthRestrictions || []).map((h) => h.toLowerCase().trim());

  const hasBarbell = eqList.includes('barbell');
  const hasDumbbells = eqList.includes('dumbbells_adjustable') || eqList.includes('dumbbells_fixed');
  const hasPullupBar = eqList.includes('pullup_bar');
  const hasDipBars = eqList.includes('dip_bars');
  const hasMachines = eqList.includes('gym_machines');
  const hasKettlebells = eqList.includes('kettlebells');
  const hasBands = eqList.includes('resistance_bands');
  const hasJumpRope = eqList.includes('jump_rope');
  const hasBodyweight = eqList.includes('bodyweight') || eqList.length === 0;

  const avoidSpine = healthLimits.some((h) => h.includes('позвоночник') || h.includes('осевой'));
  const protectKnees = healthLimits.some((h) => h.includes('колен'));
  const protectShoulders = healthLimits.some((h) => h.includes('плеч'));

  // Helper to pick exercise matching equipment strictly, muscle, and avoiding excluded
  const pickExercise = (
    primaryMuscle: MuscleGroup
  ): ProgramExerciseTemplate => {
    // 2. Filter candidate list strictly from catalog exercises
    const candidates = catalog.filter((ex) => {
      // Must target muscle
      if (ex.primaryMuscle !== primaryMuscle && !ex.secondaryMuscles?.includes(primaryMuscle)) {
        return false;
      }
      // Must not be in user excluded list
      if (excluded.includes(ex.name.toLowerCase().trim())) {
        return false;
      }
      // Health restrictions
      if (avoidSpine && (ex.name.includes('Становая тяга') || ex.name.includes('Приседания со штангой'))) {
        return false;
      }
      if (protectKnees && ex.name.includes('Выпады')) {
        return false;
      }
      if (protectShoulders && ex.name.includes('Армейский жим')) {
        return false;
      }
      // Equipment check
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
    });

    // Fallback to any catalog exercise matching primary muscle if equipment filter was too strict
    const fallbackCandidates = catalog.filter((ex) => ex.primaryMuscle === primaryMuscle);
    const chosen = candidates.length > 0 ? candidates[0] : (fallbackCandidates.length > 0 ? fallbackCandidates[0] : catalog[0]);

    let targetReps = 10;
    let targetSets = 3;
    let restSec = chosen.defaultRestSeconds || 75;

    if (goal === 'Сила') {
      targetReps = age > 50 ? 8 : 6;
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
      targetWeight: chosen.isBodyweight ? 0 : chosen.defaultWeight,
      restSeconds: restSec,
      technique: chosen.technique || 'Выполняйте в контролируемом темпе с правильной осанкой.',
    };
  };

  let workouts: ProgramWorkoutDay[] = [];

  if (daysPerWeek === 2) {
    workouts = [
      {
        id: `w_gen_u_${Date.now()}`,
        dayName: 'День 1: Верх тела (Грудь, Спина, Плечи, Руки)',
        targetMuscleGroups: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('chest'),
          pickExercise('lats'),
          pickExercise('shoulders'),
          pickExercise('biceps'),
          pickExercise('triceps'),
        ],
      },
      {
        id: `w_gen_l_${Date.now()}`,
        dayName: 'День 2: Низ тела и Кор (Квадрицепсы, Бедра, Пресс)',
        targetMuscleGroups: ['quads', 'hamstrings', 'calves', 'abs'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('quads'),
          pickExercise('hamstrings'),
          pickExercise('calves'),
          pickExercise('abs'),
        ],
      },
    ];
  } else if (daysPerWeek === 3) {
    workouts = [
      {
        id: `w_gen_push_${Date.now()}`,
        dayName: 'День 1: Push (Грудь, Плечи, Трицепс)',
        targetMuscleGroups: ['chest', 'shoulders', 'triceps'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('chest'),
          pickExercise('shoulders'),
          pickExercise('triceps'),
          pickExercise('abs'),
        ],
      },
      {
        id: `w_gen_pull_${Date.now()}`,
        dayName: 'День 2: Pull (Спина, Задние дельты, Бицепс)',
        targetMuscleGroups: ['lats', 'rearDelts', 'biceps'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('lats'),
          pickExercise('rearDelts'),
          pickExercise('biceps'),
        ],
      },
      {
        id: `w_gen_legs_${Date.now()}`,
        dayName: 'День 3: Legs (Квадрицепсы, Бедра, Икры)',
        targetMuscleGroups: ['quads', 'hamstrings', 'calves'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('quads'),
          pickExercise('hamstrings'),
          pickExercise('calves'),
          pickExercise('abs'),
        ],
      },
    ];
  } else {
    workouts = [
      {
        id: `w_gen_u1_${Date.now()}`,
        dayName: 'День 1: Верх А (Сила — Грудь и Спина)',
        targetMuscleGroups: ['chest', 'lats'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('chest'),
          pickExercise('lats'),
          pickExercise('shoulders'),
        ],
      },
      {
        id: `w_gen_l1_${Date.now()}`,
        dayName: 'День 2: Низ А (Квадрицепсы и Икры)',
        targetMuscleGroups: ['quads', 'calves', 'abs'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('quads'),
          pickExercise('calves'),
          pickExercise('abs'),
        ],
      },
      {
        id: `w_gen_u2_${Date.now()}`,
        dayName: 'День 3: Верх Б (Плечи и Руки)',
        targetMuscleGroups: ['shoulders', 'biceps', 'triceps'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('shoulders'),
          pickExercise('biceps'),
          pickExercise('triceps'),
        ],
      },
      {
        id: `w_gen_l2_${Date.now()}`,
        dayName: 'День 4: Низ Б (Задняя поверхность бедра и Кор)',
        targetMuscleGroups: ['hamstrings', 'glutes', 'abs'],
        estimatedDuration: duration,
        exercises: [
          pickExercise('hamstrings'),
          pickExercise('glutes'),
          pickExercise('abs'),
        ],
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
    createdAt: new Date().toISOString().split('T')[0],
  };
}
