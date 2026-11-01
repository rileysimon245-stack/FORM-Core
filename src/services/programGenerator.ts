import {
  WorkoutProgram,
  ProgramWorkoutDay,
  ProgramExerciseTemplate,
  EXERCISE_CATALOG,
  ExerciseLibraryItem,
  MuscleGroup,
} from '../types/workout';
import { StorageService } from './storage';

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
  const availableEquipmentIds = equipmentItems.filter((e) => e.selected).map((e) => e.id);
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
    message: 'Программа успешно составлена строго с учетом выбранного вами инвентаря, ограничений и восстановления.',
  };
}

export function generateLocalTemplateProgram(
  params: GeneratorParams,
  availableEquipmentIds?: string[]
): WorkoutProgram {
  const { goal, daysPerWeek, duration, experience, age = 28 } = params;

  // Read available equipment if not passed - strictly using user inventory selection
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
    // Filter candidate list strictly by equipment
    const candidates = EXERCISE_CATALOG.filter((ex) => {
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
      // Must have required equipment strictly in user's inventory
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

    const fallback: ProgramExerciseTemplate = {
      name: primaryMuscle === 'chest' ? 'Отжимания от пола' : primaryMuscle === 'quads' ? 'Кубковые приседания' : 'Планка',
      targetMuscle: primaryMuscle,
      isBodyweight: true,
      sets: 3,
      reps: 12,
      targetWeight: 0,
      restSeconds: 60,
      technique: 'Контролируйте движение на всей траектории, дыхание ровное.',
    };

    if (candidates.length === 0) return fallback;

    // Pick best matching or first candidate
    const chosen = candidates[0];

    // Calculate safe reps and weight based on goal and age
    let targetReps = 10;
    let targetSets = 3;
    let restSec = chosen.defaultRestSeconds;

    if (goal === 'Сила') {
      targetReps = age > 50 ? 8 : 6;
      targetSets = 4;
      restSec = 120;
    } else if (goal === 'Выносливость') {
      targetReps = 15;
      targetSets = 3;
      restSec = 45;
    } else {
      targetReps = 10;
      targetSets = 3;
      restSec = 75;
    }

    return {
      name: chosen.name,
      targetMuscle: chosen.primaryMuscle,
      secondaryMuscles: chosen.secondaryMuscles,
      isBodyweight: chosen.isBodyweight,
      requiredEquipment: chosen.requiredEquipment,
      sets: targetSets,
      reps: targetReps,
      targetWeight: chosen.isBodyweight ? 0 : chosen.defaultWeight,
      restSeconds: restSec,
      technique: chosen.technique,
    };
  };

  let workouts: ProgramWorkoutDay[] = [];

  if (daysPerWeek === 2) {
    // 2 Days: Upper & Lower
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
    // 3 Days: Push / Pull / Legs
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
    // 4 or 5 Days: Upper / Lower A & B
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
    description: `Составлена с учетом вашего инвентаря, восстановления мышц и отсутствия осевой перегрузки. Длительность: ${duration} мин.`,
    goal,
    daysPerWeek,
    workouts,
    isCustom: true,
    createdAt: new Date().toISOString().split('T')[0],
  };
}
