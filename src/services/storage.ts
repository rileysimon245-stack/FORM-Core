import {
  UserProfile,
  WorkoutProgram,
  WorkoutSession,
  ActivityDay,
  MuscleGroup,
  MuscleLoadStats,
  PersonalRecordInfo,
  MUSCLE_DEFINITIONS,
  ExerciseSet,
  EquipmentItem,
  UserFitnessParameters,
  EquipmentCategory,
  SportType,
  SportSession,
  WeeklyScheduleDay,
  DayActivityItem,
  SPORT_DEFINITIONS,
  AppSettings,
  DEFAULT_APP_SETTINGS,
  MuscleLoadHistoryItem,
  EXERCISE_CATALOG,
  MusclePeriod,
  ExerciseProgressPoint,
} from '../types/workout';
import { FullExerciseItem } from '../data/exerciseTypes';
import { COMPREHENSIVE_FULL_CATALOG } from '../data/fullExerciseCatalog';

const STORAGE_KEYS = {
  APP_INITIALIZED: 'form_app_initialized_v10',
  CLEAN_PURGE: 'form_clean_purge_v10',
  PROFILE: 'form_user_profile',
  PROGRAMS: 'form_workout_programs',
  WORKOUTS: 'form_workout_sessions',
  SPORTS_SESSIONS: 'form_sports_sessions_v1',
  WEEKLY_SCHEDULE: 'form_weekly_schedule_v1',
  CUSTOM_ACTIVITY: 'form_activity_days',
  ACTIVE_DRAFT: 'form_active_workout_draft_v2',
  EQUIPMENT: 'form_user_equipment_v1',
  FITNESS_PARAMS: 'form_fitness_parameters_v1',
  FAVORITES: 'form_favorite_exercises_v1',
  CUSTOM_EXERCISES: 'form_custom_exercises_v1',
  SETTINGS: 'form_app_settings_v1',
};

// Clean empty profile with zero fake parameters
const DEFAULT_PROFILE: UserProfile = {
  name: '',
  age: 0,
  heightCm: 0,
  weightKg: 0,
  fitnessGoal: '',
  experienceLevel: '',
  streakDays: 0,
};

// Catalog presets available for user to optionally import (not pre-injected into personal list)
export const CATALOG_PRESET_PROGRAMS: WorkoutProgram[] = [
  {
    id: 'prog_push_pull_legs',
    name: 'Push / Pull / Legs (Сила + Масса)',
    description: 'Классический трехдневный сплит с акцентом на базовые многосуставные движения и гипертрофию.',
    goal: 'Набор массы',
    daysPerWeek: 3,
    isCustom: false,
    createdAt: '2026-01-10',
    workouts: [
      {
        id: 'w_push',
        dayName: 'День 1: Push (Грудь, Плечи, Трицепс)',
        targetMuscleGroups: ['chest', 'shoulders', 'triceps'],
        estimatedDuration: 55,
        exercises: [
          { name: 'Жим штанги лежа', targetMuscle: 'chest', isBodyweight: false, sets: 4, reps: 8, targetWeight: 85, restSeconds: 90, notes: 'Лопатки сведены, пауза в нижней точке' },
          { name: 'Жим гантелей на наклонной', targetMuscle: 'chest', isBodyweight: false, sets: 3, reps: 10, targetWeight: 28, restSeconds: 75 },
          { name: 'Армейский жим стоя', targetMuscle: 'shoulders', isBodyweight: false, sets: 3, reps: 8, targetWeight: 50, restSeconds: 90 },
          { name: 'Махи гантелями в стороны', targetMuscle: 'shoulders', isBodyweight: false, sets: 4, reps: 12, targetWeight: 14, restSeconds: 60 },
          { name: 'Французский жим со штангой', targetMuscle: 'triceps', isBodyweight: false, sets: 3, reps: 10, targetWeight: 35, restSeconds: 60 },
          { name: 'Отжимания на брусьях', targetMuscle: 'triceps', isBodyweight: true, sets: 3, reps: 12, targetWeight: 0, restSeconds: 75 },
        ],
      },
      {
        id: 'w_pull',
        dayName: 'День 2: Pull (Спина, Задние дельты, Бицепс)',
        targetMuscleGroups: ['lats', 'rearDelts', 'biceps', 'traps'],
        estimatedDuration: 60,
        exercises: [
          { name: 'Подтягивания широким хватом', targetMuscle: 'lats', isBodyweight: true, sets: 4, reps: 10, targetWeight: 0, restSeconds: 90 },
          { name: 'Тяга штанги в наклоне', targetMuscle: 'lats', isBodyweight: false, sets: 4, reps: 8, targetWeight: 75, restSeconds: 90 },
          { name: 'Тяга верхнего блока к груди', targetMuscle: 'lats', isBodyweight: false, sets: 3, reps: 10, targetWeight: 65, restSeconds: 75 },
          { name: 'Махи на заднюю дельту в наклоне', targetMuscle: 'rearDelts', isBodyweight: false, sets: 4, reps: 12, targetWeight: 12, restSeconds: 60 },
          { name: 'Подъем штанги на бицепс', targetMuscle: 'biceps', isBodyweight: false, sets: 3, reps: 10, targetWeight: 35, restSeconds: 60 },
          { name: 'Молотковые сгибания', targetMuscle: 'biceps', isBodyweight: false, sets: 3, reps: 12, targetWeight: 16, restSeconds: 60 },
        ],
      },
      {
        id: 'w_legs',
        dayName: 'День 3: Legs & Core (Ноги, Пресс)',
        targetMuscleGroups: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'],
        estimatedDuration: 65,
        exercises: [
          { name: 'Приседания со штангой', targetMuscle: 'quads', isBodyweight: false, sets: 4, reps: 8, targetWeight: 110, restSeconds: 120, notes: 'Глубокий сед ниже параллели' },
          { name: 'Румынская тяга с гантелями', targetMuscle: 'hamstrings', isBodyweight: false, sets: 3, reps: 10, targetWeight: 32, restSeconds: 90 },
          { name: 'Жим ногами в тренажере', targetMuscle: 'quads', isBodyweight: false, sets: 3, reps: 12, targetWeight: 180, restSeconds: 90 },
          { name: 'Подъемы на носки стоя (икры)', targetMuscle: 'calves', isBodyweight: false, sets: 4, reps: 15, targetWeight: 60, restSeconds: 60 },
          { name: 'Подъем ног в висе', targetMuscle: 'abs', isBodyweight: true, sets: 3, reps: 15, targetWeight: 0, restSeconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'prog_upper_lower',
    name: 'Upper / Lower (Верх и Низ 4 дня)',
    description: 'Оптимальный сплит для высокой частоты проработки каждой мышечной группы дважды в неделю.',
    goal: 'Сила и баланс',
    daysPerWeek: 4,
    isCustom: false,
    createdAt: '2026-02-01',
    workouts: [
      {
        id: 'w_upper_a',
        dayName: 'Верх А: Силовой акцент (Грудь и Спина)',
        targetMuscleGroups: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'],
        estimatedDuration: 55,
        exercises: [
          { name: 'Жим штанги лежа', targetMuscle: 'chest', isBodyweight: false, sets: 4, reps: 6, targetWeight: 90, restSeconds: 120 },
          { name: 'Тяга штанги в наклоне', targetMuscle: 'lats', isBodyweight: false, sets: 4, reps: 6, targetWeight: 80, restSeconds: 120 },
          { name: 'Армейский жим стоя', targetMuscle: 'shoulders', isBodyweight: false, sets: 3, reps: 8, targetWeight: 50, restSeconds: 90 },
          { name: 'Подтягивания широким хватом', targetMuscle: 'lats', isBodyweight: true, sets: 3, reps: 8, targetWeight: 0, restSeconds: 90 },
        ],
      },
      {
        id: 'w_lower_a',
        dayName: 'Низ А: Квадрицепсы и Икры',
        targetMuscleGroups: ['quads', 'calves', 'abs'],
        estimatedDuration: 50,
        exercises: [
          { name: 'Приседания со штангой', targetMuscle: 'quads', isBodyweight: false, sets: 4, reps: 8, targetWeight: 100, restSeconds: 120 },
          { name: 'Выпады с гантелями', targetMuscle: 'quads', isBodyweight: false, sets: 3, reps: 10, targetWeight: 20, restSeconds: 75 },
          { name: 'Подъемы на носки стоя (икры)', targetMuscle: 'calves', isBodyweight: false, sets: 4, reps: 15, targetWeight: 50, restSeconds: 60 },
          { name: 'Скручивания на скамье', targetMuscle: 'abs', isBodyweight: true, sets: 3, reps: 20, targetWeight: 0, restSeconds: 45 },
        ],
      },
    ],
  },
];

// Clean initial activity map (starts empty)
function generateInitial2026Activity(): Record<string, 'completed' | 'skipped' | 'none'> {
  return {};
}

// Clean initial workout sessions (starts empty)
function generateInitialSessions(): WorkoutSession[] {
  return [];
}

export const DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleDay[] = [
  { dayOfWeek: 0, dayName: 'Пн', fullDayName: 'Понедельник', activities: [] },
  { dayOfWeek: 1, dayName: 'Вт', fullDayName: 'Вторник', activities: [] },
  { dayOfWeek: 2, dayName: 'Ср', fullDayName: 'Среда', activities: [] },
  { dayOfWeek: 3, dayName: 'Чт', fullDayName: 'Четверг', activities: [] },
  { dayOfWeek: 4, dayName: 'Пт', fullDayName: 'Пятница', activities: [] },
  { dayOfWeek: 5, dayName: 'Сб', fullDayName: 'Суббота', activities: [] },
  { dayOfWeek: 6, dayName: 'Вс', fullDayName: 'Воскресенье', activities: [] },
];

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Listener callback error:', e);
    }
  });
}

export const StorageService = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  checkAndPurgeLegacyData(): void {
    try {
      const purged = localStorage.getItem(STORAGE_KEYS.CLEAN_PURGE);
      if (purged !== 'v10') {
        // Complete purge of any legacy mock artifacts
        localStorage.removeItem(STORAGE_KEYS.WORKOUTS);
        localStorage.removeItem(STORAGE_KEYS.PROGRAMS);
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_ACTIVITY);
        localStorage.removeItem(STORAGE_KEYS.SPORTS_SESSIONS);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);

        // Reset profile if mock name 'Алексей' or empty
        const prof = localStorage.getItem(STORAGE_KEYS.PROFILE);
        if (prof) {
          try {
            const parsed = JSON.parse(prof);
            if (parsed.name === 'Алексей' || !parsed.name) {
              localStorage.removeItem(STORAGE_KEYS.PROFILE);
            }
          } catch {
            localStorage.removeItem(STORAGE_KEYS.PROFILE);
          }
        }

        // Reset equipment and fitness parameters to clean unselected defaults
        localStorage.removeItem(STORAGE_KEYS.EQUIPMENT);
        localStorage.removeItem(STORAGE_KEYS.FITNESS_PARAMS);

        localStorage.setItem(STORAGE_KEYS.CLEAN_PURGE, 'v10');
      }
    } catch {}
  },

  getProfile(): UserProfile {
    try {
      this.checkAndPurgeLegacyData();
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
      return data ? JSON.parse(data) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  },

  updateProfile(profile: Partial<UserProfile>): UserProfile {
    const current = this.getProfile();
    const updated = { ...current, ...profile };
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
    notifyListeners();
    return updated;
  },

  getPrograms(): WorkoutProgram[] {
    try {
      this.checkAndPurgeLegacyData();
      const data = localStorage.getItem(STORAGE_KEYS.PROGRAMS);
      if (data !== null) {
        return JSON.parse(data);
      }
      return [];
    } catch {
      return [];
    }
  },

  saveProgram(program: WorkoutProgram): void {
    const list = this.getPrograms();
    const index = list.findIndex((p) => p.id === program.id);
    if (index >= 0) {
      list[index] = program;
    } else {
      list.unshift(program);
    }
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
  },

  duplicateProgram(programId: string): WorkoutProgram | null {
    const list = this.getPrograms();
    const target = list.find((p) => p.id === programId);
    if (!target) return null;

    const copy: WorkoutProgram = {
      ...target,
      id: `prog_copy_${Date.now()}`,
      name: `${target.name} (Копия)`,
      isCustom: true,
      createdAt: new Date().toISOString().split('T')[0],
      workouts: target.workouts.map((w, idx) => ({
        ...w,
        id: `w_copy_${idx}_${Date.now()}`,
      })),
    };

    list.unshift(copy);
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return copy;
  },

  deleteProgram(programId: string): void {
    const list = this.getPrograms().filter((p) => p.id !== programId);
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
  },

  getWorkoutSessions(): WorkoutSession[] {
    try {
      this.checkAndPurgeLegacyData();
      const data = localStorage.getItem(STORAGE_KEYS.WORKOUTS);
      if (data !== null) {
        return JSON.parse(data);
      }
      return [];
    } catch {
      return [];
    }
  },

  // MULTI-SPORT SESSIONS (Boxing, Basketball, Running, Cycling, Swimming, etc.)
  getSportSessions(): SportSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SPORTS_SESSIONS);
      if (data !== null) {
        return JSON.parse(data);
      }
      return [];
    } catch {
      return [];
    }
  },

  saveSportSession(session: SportSession): void {
    const list = this.getSportSessions();
    const duration = session.actualDurationMinutes || session.plannedDurationMinutes || 45;
    const intensityMult = session.intensity === 'high' ? 2.2 : session.intensity === 'medium' ? 1.5 : 1.0;
    const spDef = SPORT_DEFINITIONS[session.sportType] || SPORT_DEFINITIONS.other_sport;
    const loadScore = Math.round(duration * intensityMult * (spDef.loadMultiplier / 1.5));

    const prepared: SportSession = {
      ...session,
      loadScore,
    };

    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }
    localStorage.setItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(list));

    if (prepared.status === 'completed') {
      this.setDayStatus(prepared.date, 'completed', prepared.title);
    } else if (prepared.status === 'skipped') {
      this.setDayStatus(prepared.date, 'skipped', prepared.title);
    }
    notifyListeners();
  },

  deleteSportSession(sessionId: string): void {
    const list = this.getSportSessions();
    const target = list.find((s) => s.id === sessionId);
    const filtered = list.filter((s) => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(filtered));

    if (target) {
      const remainingSports = filtered.filter((s) => s.date === target.date);
      const remainingWorkouts = this.getWorkoutSessions().filter((s) => s.date === target.date);
      if (remainingSports.length === 0 && remainingWorkouts.length === 0) {
        this.setDayStatus(target.date, 'none');
      }
    }
    notifyListeners();
  },

  // WEEKLY SCHEDULE CONSTRUCTOR
  getWeeklySchedule(): WeeklyScheduleDay[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WEEKLY_SCHEDULE);
      if (data !== null) {
        return JSON.parse(data);
      }
      return DEFAULT_WEEKLY_SCHEDULE;
    } catch {
      return DEFAULT_WEEKLY_SCHEDULE;
    }
  },

  saveWeeklySchedule(schedule: WeeklyScheduleDay[]): void {
    localStorage.setItem(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify(schedule));
    notifyListeners();
  },

  // Retrieve previous results of an exercise from real user history
  getPreviousExerciseResults(exerciseName: string): { summary: string; sets: ExerciseSet[] } | null {
    const sessions = this.getWorkoutSessions();
    const cleanName = exerciseName.trim().toLowerCase();

    for (const session of sessions) {
      const found = session.exercises?.find(
        (ex) => ex.name.trim().toLowerCase() === cleanName
      );
      if (found && found.sets && found.sets.length > 0) {
        const completedSets = found.sets.filter((s) => s.completed);
        const targetSets = completedSets.length > 0 ? completedSets : found.sets;
        const summary = targetSets
          .map((s) => (found.isBodyweight ? `${s.reps} повт` : `${s.weightKg} кг × ${s.reps}`))
          .join(', ');

        return {
          summary: `В прошлый раз (${session.date}): ${summary}`,
          sets: targetSets.map((s) => ({
            setNumber: s.setNumber,
            weightKg: s.weightKg,
            reps: s.reps,
            completed: false,
            previousWeightKg: s.weightKg,
            previousReps: s.reps,
          })),
        };
      }
    }
    return null;
  },

  // Calculate Personal Record (PR) for exercise strictly across completed workouts
  getPersonalRecord(exerciseName: string): { maxWeight: number; maxRepsAtMax: number; date: string } | null {
    if (!exerciseName) return null;
    const sessions = this.getWorkoutSessions();
    const targetNorm = exerciseName.trim().toLowerCase().replace(/ё/g, 'е');
    let record: { maxWeight: number; maxRepsAtMax: number; date: string } | null = null;

    sessions.forEach((s) => {
      // ONLY consider completed sessions - exclude in_progress / skipped drafts
      if (s.status !== 'completed' || !s.exercises) return;

      s.exercises.forEach((ex) => {
        if (!ex.name || ex.skipped || !ex.sets) return;
        const exNorm = ex.name.trim().toLowerCase().replace(/ё/g, 'е');
        const isMatch = exNorm === targetNorm || (targetNorm.length >= 6 && (exNorm.includes(targetNorm) || targetNorm.includes(exNorm)));
        if (isMatch) {
          ex.sets.forEach((st) => {
            if (st.completed) {
              const weight = st.weightKg || 0;
              const reps = st.reps || 0;
              if (weight > 0 || (ex.isBodyweight && reps > 0)) {
                const isBetterWeight = !record || weight > record.maxWeight;
                const isSameWeightBetterReps =
                  record && weight === record.maxWeight && reps > record.maxRepsAtMax;

                if (isBetterWeight || isSameWeightBetterReps) {
                  record = {
                    maxWeight: weight,
                    maxRepsAtMax: reps,
                    date: s.date,
                  };
                }
              }
            }
          });
        }
      });
    });

    return record;
  },

  // Get all active verified personal records across all exercises
  getAllPersonalRecords(): Record<string, { maxWeight: number; maxRepsAtMax: number; date: string }> {
    const sessions = this.getWorkoutSessions();
    const records: Record<string, { maxWeight: number; maxRepsAtMax: number; date: string }> = {};

    sessions.forEach((s) => {
      if (s.status !== 'completed' || !s.exercises) return;

      s.exercises.forEach((ex) => {
        if (!ex.name || ex.skipped || !ex.sets) return;
        const key = ex.name.trim();
        let cur = records[key];

        ex.sets.forEach((st) => {
          if (!st.completed) return;
          const weight = st.weightKg || 0;
          const reps = st.reps || 0;
          if (weight > 0 || (ex.isBodyweight && reps > 0)) {
            const isBetterWeight = !cur || weight > cur.maxWeight;
            const isSameWeightBetterReps =
              cur && weight === cur.maxWeight && reps > cur.maxRepsAtMax;

            if (isBetterWeight || isSameWeightBetterReps) {
              records[key] = {
                maxWeight: weight,
                maxRepsAtMax: reps,
                date: s.date,
              };
              cur = records[key];
            }
          }
        });
      });
    });

    return records;
  },

  // Recalculates personalRecords array across all sessions chronologically with zero duplicates
  recalculatePersonalRecordsForAllSessions(sessions: WorkoutSession[]): WorkoutSession[] {
    const list = sessions.map((s) => ({
      ...s,
      exercises: s.exercises
        ? s.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets ? ex.sets.map((st) => ({ ...st })) : [],
          }))
        : [],
    }));

    // Sort chronologically: oldest first
    const indexed = list.map((s, idx) => ({ s, originalIdx: idx }));
    indexed.sort((a, b) => {
      const dateA = a.s.date || '';
      const dateB = b.s.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.s.startTime || '00:00';
      const timeB = b.s.startTime || '00:00';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return a.originalIdx - b.originalIdx;
    });

    // Running best records: key is normalized exercise name
    const runningBest = new Map<string, { maxWeight: number; maxRepsAtMax: number; date: string }>();

    for (const item of indexed) {
      const session = item.s;
      // Incomplete or skipped sessions do not generate PRs
      if (session.status !== 'completed' || !session.exercises) {
        session.personalRecords = [];
        continue;
      }

      const sessionPRs: PersonalRecordInfo[] = [];

      for (const ex of session.exercises) {
        if (ex.skipped || !ex.name || !ex.sets) continue;
        const cleanName = ex.name.trim().toLowerCase();

        // Find the single best completed set for this exercise in this session
        let bestSet: { weightKg: number; reps: number } | null = null;
        for (const st of ex.sets) {
          if (!st.completed) continue;
          const w = st.weightKg || 0;
          const r = st.reps || 0;
          if (w === 0 && r === 0) continue;

          if (
            !bestSet ||
            w > bestSet.weightKg ||
            (w === bestSet.weightKg && r > bestSet.reps)
          ) {
            bestSet = { weightKg: w, reps: r };
          }
        }

        if (bestSet) {
          const prev = runningBest.get(cleanName);
          const isBetterWeight = !prev || bestSet.weightKg > prev.maxWeight;
          const isSameWeightBetterReps =
            prev && bestSet.weightKg === prev.maxWeight && bestSet.reps > prev.maxRepsAtMax;

          // Only count as PR if it strictly beats previous record (and weight > 0 or bodyweight reps > 0)
          if (isBetterWeight || isSameWeightBetterReps) {
            if (bestSet.weightKg > 0 || (ex.isBodyweight && bestSet.reps > 0)) {
              sessionPRs.push({
                exerciseName: ex.name,
                weightKg: bestSet.weightKg,
                reps: bestSet.reps,
                date: session.date,
                isNew: true,
              });
              runningBest.set(cleanName, {
                maxWeight: bestSet.weightKg,
                maxRepsAtMax: bestSet.reps,
                date: session.date,
              });
            }
          }
        }
      }

      session.personalRecords = sessionPRs;
    }

    return list;
  },

  // Detailed exercise history for progress charts (strictly completed workouts in chronological order)
  getExerciseDetailedHistory(exerciseName: string): ExerciseProgressPoint[] {
    if (!exerciseName) return [];
    const sessions = this.getWorkoutSessions();
    const targetNorm = exerciseName.trim().toLowerCase().replace(/ё/g, 'е');

    // Filter strictly for completed sessions that have exercises
    const completedSessions = sessions.filter(
      (s) => s.status === 'completed' && Boolean(s.exercises) && s.exercises.length > 0
    );

    // Sort chronologically ascending: oldest first
    completedSessions.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeA.localeCompare(timeB);
    });

    const points: ExerciseProgressPoint[] = [];

    completedSessions.forEach((s) => {
      if (!s.exercises) return;

      s.exercises.forEach((ex) => {
        if (!ex.name || ex.skipped || !ex.sets) return;
        const exNorm = ex.name.trim().toLowerCase().replace(/ё/g, 'е');
        const isMatch =
          exNorm === targetNorm ||
          (targetNorm.length >= 6 && (exNorm.includes(targetNorm) || targetNorm.includes(exNorm)));
        if (!isMatch) return;

        let maxW = 0;
        let maxR = 0;
        let totalR = 0;
        let vol = 0;
        const setsDetails: { setNumber: number; weightKg: number; reps: number }[] = [];

        ex.sets.forEach((st, idx) => {
          if (!st.completed) return;
          const w = typeof st.weightKg === 'number' ? st.weightKg : Number(st.weightKg) || 0;
          const r = typeof st.reps === 'number' ? st.reps : Number(st.reps) || 0;

          if (w > maxW) maxW = w;
          if (r > maxR) maxR = r;
          totalR += r;
          vol += w * r;

          setsDetails.push({
            setNumber: st.setNumber || idx + 1,
            weightKg: w,
            reps: r,
          });
        });

        // Only include if at least 1 completed set was recorded
        if (setsDetails.length > 0) {
          // Format short date (DD.MM)
          const parts = (s.date || '').split('-');
          const displayDate = parts.length === 3 ? `${parts[2]}.${parts[1]}` : (s.date || '');

          points.push({
            date: displayDate,
            fullDate: s.date || '',
            maxWeight: maxW,
            maxReps: maxR,
            totalReps: totalR,
            volume: Math.round(vol),
            setsCount: setsDetails.length,
            setsDetails,
            sessionName: s.name || 'Тренировка',
          });
        }
      });
    });

    return points;
  },

  // Exercise history for progress charts (strictly completed workouts)
  getExerciseHistory(exerciseName: string): ExerciseProgressPoint[] {
    return this.getExerciseDetailedHistory(exerciseName);
  },

  // Save completed workout session with full chronological PR recalculation (zero duplicates)
  saveWorkoutSession(session: WorkoutSession): void {
    const list = this.getWorkoutSessions();

    const existingIndex = list.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      list[existingIndex] = session;
    } else {
      list.unshift(session);
    }

    // Recalculate personal records across all sessions to preserve chronological integrity and avoid duplicates
    const updatedList = this.recalculatePersonalRecordsForAllSessions(list);
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(updatedList));

    // Update activity map for that day
    this.setDayStatus(session.date, 'completed', session.name, session.totalVolumeKg);

    // Clear active draft if saved
    this.clearActiveDraft();

    notifyListeners();
  },

  updateSession(session: WorkoutSession): void {
    const list = this.getWorkoutSessions();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = session;
      const updatedList = this.recalculatePersonalRecordsForAllSessions(list);
      localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(updatedList));
      notifyListeners();
    }
  },

  deleteWorkoutSession(sessionId: string): void {
    const list = this.getWorkoutSessions();
    const session = list.find((s) => s.id === sessionId);
    const filtered = list.filter((s) => s.id !== sessionId);

    // Recalculate personal records for all remaining completed sessions
    const updatedList = this.recalculatePersonalRecordsForAllSessions(filtered);
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(updatedList));

    if (session) {
      const others = updatedList.filter((s) => s.date === session.date);
      if (others.length === 0) {
        this.setDayStatus(session.date, 'none');
      }
    }
    notifyListeners();
  },

  // Persistent in-progress draft (so user never loses active workout if closed)
  saveActiveDraft(session: WorkoutSession): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DRAFT, JSON.stringify(session));
    } catch {
      // quota or local storage error
    }
  },

  getActiveDraft(): WorkoutSession | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_DRAFT);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  clearActiveDraft(): void {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
  },

  getActivityMap(year: number = 2026): Record<string, 'completed' | 'skipped' | 'none'> {
    try {
      this.checkAndPurgeLegacyData();
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_ACTIVITY);
      if (data) {
        return JSON.parse(data);
      }
      return {};
    } catch {
      return {};
    }
  },

  setDayStatus(date: string, status: 'completed' | 'skipped' | 'none', title?: string, volumeKg?: number): void {
    const map = this.getActivityMap();
    map[date] = status;
    localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, JSON.stringify(map));
    notifyListeners();
  },

  getYearStats(year: number = 2026) {
    const map = this.getActivityMap(year);
    let completed = 0;
    let skipped = 0;

    Object.entries(map).forEach(([dateStr, status]) => {
      if (dateStr.startsWith(String(year))) {
        if (status === 'completed') completed++;
        if (status === 'skipped') skipped++;
      }
    });

    // Calculate real active streak
    let streak = 0;
    const sortedDates = Object.keys(map)
      .filter((d) => map[d] === 'completed')
      .sort()
      .reverse();

    if (sortedDates.length > 0) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      let checkDate = new Date(today);
      // Check if trained today or yesterday
      if (!map[todayStr]) {
        checkDate.setDate(checkDate.getDate() - 1);
      }
      
      while (true) {
        const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (map[key] === 'completed') {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    const total = completed + skipped;
    return {
      total,
      completed,
      skipped,
      streakDays: Math.max(streak, completed > 0 ? 1 : 0),
    };
  },

  // COMPREHENSIVE OVERALL ACTIVITY STATS (Strength + Boxing, Basketball, Running, etc.)
  getTotalActivityStats(year: number = 2026) {
    const workouts = this.getWorkoutSessions();
    const sports = this.getSportSessions();

    const completedWorkouts = workouts.filter((s) => s.status === 'completed');
    const completedSports = sports.filter((s) => s.status === 'completed' && s.sportType !== 'rest');

    const totalStrengthMinutes = completedWorkouts.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    const totalSportMinutes = completedSports.reduce(
      (acc, s) => acc + (s.actualDurationMinutes || s.plannedDurationMinutes || 0),
      0
    );
    const totalActiveMinutes = totalStrengthMinutes + totalSportMinutes;

    // Strength load: 100 kg = 1 load point; Sports load: calculated loadScore
    const strengthLoadPoints = completedWorkouts.reduce(
      (acc, s) => acc + Math.round((s.totalVolumeKg || 0) / 100),
      0
    );
    const sportLoadPoints = completedSports.reduce((acc, s) => acc + (s.loadScore || 0), 0);
    const totalLoadScore = strengthLoadPoints + sportLoadPoints;

    const sportCounts: Record<SportType, number> = {
      strength: completedWorkouts.length,
      boxing: completedSports.filter((s) => s.sportType === 'boxing').length,
      basketball: completedSports.filter((s) => s.sportType === 'basketball').length,
      running: completedSports.filter((s) => s.sportType === 'running').length,
      cycling: completedSports.filter((s) => s.sportType === 'cycling').length,
      swimming: completedSports.filter((s) => s.sportType === 'swimming').length,
      other_sport: completedSports.filter((s) => s.sportType === 'other_sport').length,
      rest: sports.filter((s) => s.sportType === 'rest').length,
    };

    return {
      completedWorkoutsCount: completedWorkouts.length,
      completedSportsCount: completedSports.length,
      totalSessionsCount: completedWorkouts.length + completedSports.length,
      totalActiveMinutes,
      totalLoadScore,
      sportCounts,
    };
  },

  // REAL MUSCLE IMPACT: Combines Strength sets + Multi-sport sessions
  getMuscleStats(period: MusclePeriod = '7d'): Record<MuscleGroup, MuscleLoadStats> {
    const allSessions = this.getWorkoutSessions();
    const allSportSessions = this.getSportSessions();

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const resetTime = Number(localStorage.getItem('form_anatomy_reset_time') || '0');

    const isAfterReset = (itemDate: string) => {
      if (!resetTime) return true;
      const itemTs = new Date(`${itemDate}T12:00:00`).getTime();
      return itemTs >= resetTime;
    };

    const filterByPeriod = (itemDate: string) => {
      if (period === 'session') {
        return itemDate === todayIso;
      }
      if (period === 'all') {
        return true;
      }
      if (itemDate === todayIso) {
        return true;
      }
      const [iy, im, id] = itemDate.split('-').map(Number);
      const sessionDate = new Date(iy, (im || 1) - 1, id || 1);
      const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const daysDiff = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));

      if (period === '7d') {
        return daysDiff >= 0 && daysDiff <= 7;
      }
      if (period === '30d') {
        return daysDiff >= 0 && daysDiff <= 30;
      }
      if (period === '90d') {
        return daysDiff >= 0 && daysDiff <= 90;
      }
      return true;
    };

    const completedSessions = allSessions.filter(
      (s) => s.status === 'completed' && filterByPeriod(s.date) && isAfterReset(s.date)
    );
    const completedSportSessions = allSportSessions.filter(
      (sp) => sp.status === 'completed' && filterByPeriod(sp.date) && isAfterReset(sp.date)
    );
    const stats: Partial<Record<MuscleGroup, MuscleLoadStats>> = {};

    (Object.keys(MUSCLE_DEFINITIONS) as MuscleGroup[]).forEach((m) => {
      const def = MUSCLE_DEFINITIONS[m];

      // 1. Strength sessions load: strictly completed sessions and completed sets
      let strengthVolume = 0;
      let strengthHits = 0;
      let totalSets = 0;
      const distinctExercises = new Set<string>();
      const history: MuscleLoadHistoryItem[] = [];

      completedSessions.forEach((s) => {
        let sessionMuscleVol = 0;
        let sessionMuscleSets = 0;

        s.exercises?.forEach((ex) => {
          const catalogItem = EXERCISE_CATALOG.find((cat) => cat.name.toLowerCase() === ex.name.toLowerCase());
          const secondaryMuscles = ex.secondaryMuscles || catalogItem?.secondaryMuscles;
          const exTarget = ex.targetMuscle || catalogItem?.primaryMuscle;
          
          let isPrimary = exTarget === m;
          let isSecondary = secondaryMuscles?.includes(m) || false;

          // Smart muscle hierarchy mapping for detailed muscle heads
          if (!isPrimary && !isSecondary) {
            const exNameLow = ex.name.toLowerCase();
            // Aliases
            if (m === 'rear_delts' && (exTarget === 'rearDelts' || secondaryMuscles?.includes('rearDelts'))) {
              isPrimary = exTarget === 'rearDelts';
              isSecondary = !isPrimary;
            } else if (m === 'rearDelts' && (exTarget === 'rear_delts' || secondaryMuscles?.includes('rear_delts'))) {
              isPrimary = exTarget === 'rear_delts';
              isSecondary = !isPrimary;
            }
            // Chest sub-heads
            else if (m === 'chest_upper' && (exTarget === 'chest' || secondaryMuscles?.includes('chest'))) {
              if (exNameLow.includes('наклон') || exNameLow.includes('вверх') || exNameLow.includes('incline')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            } else if (m === 'chest_mid' && (exTarget === 'chest' || secondaryMuscles?.includes('chest'))) {
              if (exNameLow.includes('лежа') || exNameLow.includes('отжимания от пола') || exNameLow.includes('кроссовер')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            } else if (m === 'chest_lower' && (exTarget === 'chest' || secondaryMuscles?.includes('chest'))) {
              if (exNameLow.includes('брусь') || exNameLow.includes('dips') || exNameLow.includes('вниз') || exNameLow.includes('decline')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            }
            // Shoulders sub-heads
            else if (m === 'front_delts' && (exTarget === 'shoulders' || secondaryMuscles?.includes('shoulders'))) {
              if (exNameLow.includes('армей') || exNameLow.includes('вверх') || exNameLow.includes('передн') || exNameLow.includes('overhead')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            } else if (m === 'side_delts' && (exTarget === 'shoulders' || secondaryMuscles?.includes('shoulders'))) {
              if (exNameLow.includes('мах') || exNameLow.includes('разводк') || exNameLow.includes('боков') || exNameLow.includes('lateral')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            } else if (m === 'rear_delts' && (exTarget === 'shoulders' || secondaryMuscles?.includes('shoulders'))) {
              if (exNameLow.includes('задн') || exNameLow.includes('face pull')) {
                isPrimary = true;
              }
            }
            // Arms: Brachialis
            else if (m === 'brachialis' && (exTarget === 'biceps' || secondaryMuscles?.includes('biceps'))) {
              if (exNameLow.includes('молот') || exNameLow.includes('нейтральн') || exNameLow.includes('обратн') || exNameLow.includes('hammer')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            }
            // Back: Traps sub-heads & Rhomboids
            else if (m === 'traps_upper' && (exTarget === 'traps' || secondaryMuscles?.includes('traps'))) {
              isPrimary = true;
            } else if (m === 'traps_mid' && (exTarget === 'traps' || secondaryMuscles?.includes('traps') || exTarget === 'lats')) {
              isSecondary = true;
            } else if (m === 'traps_lower' && (exTarget === 'traps' || exTarget === 'lats' || secondaryMuscles?.includes('lats'))) {
              isSecondary = true;
            } else if (m === 'rhomboids' && (exTarget === 'traps' || exTarget === 'lats' || secondaryMuscles?.includes('lats'))) {
              isSecondary = true;
            }
            // Quads sub-heads
            else if (m === 'quads_rectus' && (exTarget === 'quads' || secondaryMuscles?.includes('quads'))) {
              if (exNameLow.includes('разгибан') || exNameLow.includes('выпад')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            } else if (m === 'quads_lateralis' && (exTarget === 'quads' || secondaryMuscles?.includes('quads'))) {
              if (exNameLow.includes('присед') || exNameLow.includes('жим ногами')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            } else if (m === 'quads_medialis' && (exTarget === 'quads' || secondaryMuscles?.includes('quads'))) {
              if (exNameLow.includes('присед') || exNameLow.includes('разгибан') || exNameLow.includes('гакк')) {
                isPrimary = true;
              } else {
                isSecondary = true;
              }
            }
          }

          if (isPrimary || isSecondary) {
            distinctExercises.add(ex.name);
            // Primary muscle receives 100% volume; secondary receives 45% volume
            const multiplier = isPrimary ? 1.0 : 0.45;

            ex.sets?.forEach((st) => {
              if (st.completed) {
                totalSets++;
                sessionMuscleSets++;
                const setWeight = st.weightKg > 0 ? st.weightKg : (ex.isBodyweight ? 75 : 50);
                const vol = setWeight * st.reps * multiplier;
                strengthVolume += vol;
                sessionMuscleVol += vol;
              }
            });
          }
        });

        if (sessionMuscleSets > 0) {
          strengthHits++;
          history.push({
            date: s.date,
            volumeKg: Math.round(sessionMuscleVol),
            sets: sessionMuscleSets,
            exerciseName: s.name,
          });
        }
      });

      // 2. Multi-sport sessions load (Boxing, Basketball, Running, etc.)
      let sportLoadPoints = 0;
      let sportHits = 0;
      completedSportSessions.forEach((sp) => {
        const spDef = SPORT_DEFINITIONS[sp.sportType];
        if (spDef) {
          const isPrimary = spDef.primaryMuscles.includes(m);
          const isSecondary = spDef.secondaryMuscles.includes(m);
          if (isPrimary || isSecondary) {
            sportHits++;
            const duration = sp.actualDurationMinutes || sp.plannedDurationMinutes || 45;
            const intensityMult = sp.intensity === 'high' ? 2.2 : sp.intensity === 'medium' ? 1.5 : 1.0;
            const weight = isPrimary ? 1.0 : 0.5;
            const points = duration * intensityMult * weight;
            sportLoadPoints += points;
            history.push({
              date: sp.date,
              volumeKg: Math.round(points * 20),
              sets: 1,
              exerciseName: sp.title || spDef.nameRu,
            });
          }
        }
      });

      const totalHits = strengthHits + sportHits;
      // 1 sport load point ~ 20 kg volume equivalent
      const totalEffectiveKg = Math.round(strengthVolume + sportLoadPoints * 20);
      const hasRealData = totalHits > 0 && (totalSets > 0 || sportHits > 0);

      // Sort history chronologically descending (newest first)
      history.sort((a, b) => b.date.localeCompare(a.date));

      let effectivePercent = 0;
      let recoveryDays: number | null = null;
      let recoveryTime: string | null = null;
      let status: 'fatigued' | 'recovering' | 'recovered' = 'recovered';
      let finalTonnage = 0;
      let finalHits = 0;

      if (hasRealData) {
        effectivePercent = Math.max(10, Math.round((totalEffectiveKg / 8000) * 75));
        finalTonnage = totalEffectiveKg;
        finalHits = totalHits;

        // Base recovery physiological hours (e.g. 48 for chest/shoulders, 72 for hamstrings, 36 for biceps, 24 for calves)
        const baseHours = def.recoveryHours || 48;
        const volumeMultiplier = totalEffectiveKg > 6000 ? 1.25 : totalEffectiveKg > 3000 ? 1.1 : totalEffectiveKg < 1200 ? 0.75 : 1.0;
        const totalNeededHours = Math.round(baseHours * volumeMultiplier);

        // Calculate hours elapsed since the latest completed workout
        const latestDateStr = history[0]?.date;
        let elapsedHours = 0;
        if (latestDateStr) {
          const workoutDate = new Date(`${latestDateStr}T12:00:00`);
          const now = new Date();
          const diffMs = now.getTime() - workoutDate.getTime();
          elapsedHours = Math.max(0, diffMs / (1000 * 60 * 60));
        }

        const remainingHours = Math.max(0, totalNeededHours - elapsedHours);

        if (remainingHours <= 0) {
          recoveryTime = 'Восстановлена';
          recoveryDays = 0;
          status = 'recovered';
        } else if (remainingHours < 24) {
          recoveryTime = `~${Math.max(1, Math.round(remainingHours))} ч.`;
          recoveryDays = 1;
          status = remainingHours > (totalNeededHours * 0.5) ? 'fatigued' : 'recovering';
        } else {
          const days = Math.ceil(remainingHours / 24);
          recoveryTime = `~${days} дн.`;
          recoveryDays = days;
          status = remainingHours > (totalNeededHours * 0.5) ? 'fatigued' : 'recovering';
        }
      } else {
        // Strictly no load: no timer, no invented recovery time
        effectivePercent = 0;
        finalTonnage = 0;
        finalHits = 0;
        recoveryDays = null;
        recoveryTime = null;
        status = 'recovered';
      }

      stats[m] = {
        muscle: m,
        nameRu: def.nameRu,
        percent: effectivePercent,
        weeklyTonnageKg: finalTonnage,
        recentWorkoutsCount: finalHits,
        exerciseCount: hasRealData ? distinctExercises.size : 0,
        setsCount: hasRealData ? totalSets : 0,
        recoveryDays,
        recoveryTime,
        status,
        history,
        hasData: hasRealData,
      };
    });

    return stats as Record<MuscleGroup, MuscleLoadStats>;
  },

  // COMPREHENSIVE WORKOUT ANALYTICS (Real completed workouts only)
  getWorkoutAnalytics(musclePeriod: MusclePeriod = '30d') {
    const allSessions = this.getWorkoutSessions();
    const completed = allSessions.filter((s) => s.status === 'completed');

    // 1. Overall stats
    const totalCompletedWorkouts = completed.length;
    let totalCompletedSets = 0;
    let totalVolumeKg = 0;
    let totalDurationMinutes = 0;

    completed.forEach((s) => {
      totalVolumeKg += s.totalVolumeKg || 0;
      totalDurationMinutes += s.durationMinutes || 0;
      if (s.completedSets) {
        totalCompletedSets += s.completedSets;
      } else if (s.exercises) {
        s.exercises.forEach((ex) => {
          ex.sets?.forEach((st) => {
            if (st.completed) totalCompletedSets++;
          });
        });
      }
    });

    const avgDurationMinutes =
      totalCompletedWorkouts > 0 ? Math.round(totalDurationMinutes / totalCompletedWorkouts) : 0;

    const now = new Date();
    // Monday as start of current week (ISO week)
    const currentDayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endOfPrevWeek = new Date(startOfWeek.getTime() - 1);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(startOfMonth.getTime() - 1);

    let weekWorkoutsCount = 0;
    let prevWeekWorkoutsCount = 0;
    let weekVolumeKg = 0;
    let prevWeekVolumeKg = 0;

    let monthWorkoutsCount = 0;
    let prevMonthWorkoutsCount = 0;
    let monthVolumeKg = 0;
    let prevMonthVolumeKg = 0;

    completed.forEach((s) => {
      const [y, m, d] = s.date.split('-').map(Number);
      const sessionDate = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);

      // Current week vs Previous week
      if (sessionDate >= startOfWeek) {
        weekWorkoutsCount++;
        weekVolumeKg += s.totalVolumeKg || 0;
      } else if (sessionDate >= startOfPrevWeek && sessionDate <= endOfPrevWeek) {
        prevWeekWorkoutsCount++;
        prevWeekVolumeKg += s.totalVolumeKg || 0;
      }

      // Current month vs Previous month
      if (sessionDate >= startOfMonth) {
        monthWorkoutsCount++;
        monthVolumeKg += s.totalVolumeKg || 0;
      } else if (sessionDate >= startOfPrevMonth && sessionDate <= endOfPrevMonth) {
        prevMonthWorkoutsCount++;
        prevMonthVolumeKg += s.totalVolumeKg || 0;
      }
    });

    // 2. Weekly Dynamics (last 8 weeks, chronologically ordered)
    const weeklyDynamics: {
      weekIndex: number;
      label: string;
      rangeLabel: string;
      count: number;
      volumeKg: number;
      isCurrentWeek: boolean;
    }[] = [];

    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(startOfWeek.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const wEnd = new Date(wStart.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 3600000 + 59 * 60000);

      const weekSessions = completed.filter((s) => {
        const [y, m, d] = s.date.split('-').map(Number);
        const sDate = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
        return sDate >= wStart && sDate <= wEnd;
      });

      const count = weekSessions.length;
      const volumeKg = weekSessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 0);

      const startDayStr = `${wStart.getDate()}.${String(wStart.getMonth() + 1).padStart(2, '0')}`;
      const endDayStr = `${wEnd.getDate()}.${String(wEnd.getMonth() + 1).padStart(2, '0')}`;

      weeklyDynamics.push({
        weekIndex: 7 - i,
        label: i === 0 ? 'Тек.' : startDayStr,
        rangeLabel: `${startDayStr}–${endDayStr}`,
        count,
        volumeKg,
        isCurrentWeek: i === 0,
      });
    }

    // 3. Monthly Dynamics (last 6 months, chronologically ordered)
    const monthlyDynamics: {
      label: string;
      yearMonth: string;
      count: number;
      volumeKg: number;
      isCurrentMonth: boolean;
    }[] = [];

    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    for (let i = 5; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = mDate.getFullYear();
      const monthIndex = mDate.getMonth();
      const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

      const monthSessions = completed.filter((s) => s.date.startsWith(monthPrefix));
      const count = monthSessions.length;
      const volumeKg = monthSessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 0);

      monthlyDynamics.push({
        label: monthNames[monthIndex],
        yearMonth: monthPrefix,
        count,
        volumeKg,
        isCurrentMonth: i === 0,
      });
    }

    // 4. Muscle Stats for the requested period
    const rawMuscleStats = this.getMuscleStats(musclePeriod);

    return {
      totalCompletedWorkouts,
      totalCompletedSets,
      totalVolumeKg,
      avgDurationMinutes,
      weekWorkoutsCount,
      prevWeekWorkoutsCount,
      weekVolumeKg,
      prevWeekVolumeKg,
      monthWorkoutsCount,
      prevMonthWorkoutsCount,
      monthVolumeKg,
      prevMonthVolumeKg,
      weeklyDynamics,
      monthlyDynamics,
      rawMuscleStats,
    };
  },

  // Calculate detailed daily activity data for a given date
  getDayActivityData(dateStr: string) {
    const workouts = this.getWorkoutSessions().filter((s) => s.date === dateStr);
    const sports = this.getSportSessions().filter((s) => s.date === dateStr);

    const totalWorkouts = workouts.length + sports.length;
    let totalDuration = 0;
    let totalVolume = 0;

    const sessionSummaries = [
      ...workouts.map((w) => {
        totalDuration += w.durationMinutes || 45;
        totalVolume += w.totalVolumeKg || 0;
        return {
          id: w.id,
          type: 'strength' as const,
          name: w.name,
          durationMinutes: w.durationMinutes || 45,
          volumeKg: w.totalVolumeKg || 0,
          completedSets: w.completedSets || 0,
          exercises: (w.exercises || []).map((ex) => ({
            name: ex.name,
            setsCount: ex.sets?.filter((s) => s.completed).length || ex.sets?.length || 0,
            summary: ex.sets?.filter((s) => s.completed).map((s) => `${s.weightKg}кг×${s.reps}`).join(', ') || '',
          })),
        };
      }),
      ...sports.map((sp) => {
        const dur = sp.actualDurationMinutes || sp.plannedDurationMinutes || 45;
        totalDuration += dur;
        return {
          id: sp.id,
          type: 'sport' as const,
          name: sp.title || 'Спортивная тренировка',
          durationMinutes: dur,
          volumeKg: Math.round((sp.loadScore || 50) * 20),
          completedSets: 1,
          exercises: [],
        };
      }),
    ];

    // Determine visual intensity level: 0 (none), 1 (light), 2 (medium), 3 (high)
    let intensityLevel: 0 | 1 | 2 | 3 = 0;
    if (totalWorkouts > 0) {
      if (totalVolume >= 7000 || totalDuration >= 65) {
        intensityLevel = 3;
      } else if (totalVolume >= 3000 || totalDuration >= 40) {
        intensityLevel = 2;
      } else {
        intensityLevel = 1;
      }
    }

    return {
      date: dateStr,
      workoutsCount: totalWorkouts,
      totalDurationMinutes: totalDuration,
      totalVolumeKg: totalVolume,
      sessions: sessionSummaries,
      intensityLevel,
    };
  },

  // APP SETTINGS
  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) {
        return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(data) };
      }
      return DEFAULT_APP_SETTINGS;
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  },

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    notifyListeners();
    return updated;
  },

  // EQUIPMENT MANAGEMENT
  getEquipmentList(): EquipmentItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EQUIPMENT);
      if (data) return JSON.parse(data);
    } catch {}
    return DEFAULT_EQUIPMENT;
  },

  saveEquipmentList(items: EquipmentItem[]): void {
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(items));
    notifyListeners();
  },

  applyEquipmentPreset(preset: 'bodyweight_only' | 'home_minimal' | 'home_dumbbells' | 'full_gym' | 'custom'): EquipmentItem[] {
    const current = this.getEquipmentList();
    const updated = current.map((item) => {
      let isSel = false;
      if (preset === 'bodyweight_only') {
        isSel = item.id === 'bodyweight';
      } else if (preset === 'home_minimal') {
        isSel = ['bodyweight', 'pullup_bar', 'resistance_bands', 'jump_rope'].includes(item.id);
      } else if (preset === 'home_dumbbells') {
        isSel = ['bodyweight', 'pullup_bar', 'dip_bars', 'dumbbells_adjustable', 'bench', 'resistance_bands'].includes(item.id);
      } else if (preset === 'full_gym') {
        isSel = true;
      } else {
        isSel = item.selected;
      }
      return { ...item, selected: isSel };
    });
    this.saveEquipmentList(updated);
    return updated;
  },

  // USER FITNESS PARAMETERS
  getUserParameters(): UserFitnessParameters {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FITNESS_PARAMS);
      if (data) return JSON.parse(data);
    } catch {}
    return DEFAULT_USER_PARAMETERS;
  },

  saveUserParameters(params: UserFitnessParameters): void {
    localStorage.setItem(STORAGE_KEYS.FITNESS_PARAMS, JSON.stringify(params));
    notifyListeners();
  },

  // FAVORITES
  getFavoriteExerciseIds(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (data) return JSON.parse(data);
    } catch {}
    return [];
  },

  toggleFavoriteExercise(exerciseId: string): boolean {
    const current = this.getFavoriteExerciseIds();
    let updated: string[];
    let isFav = false;
    if (current.includes(exerciseId)) {
      updated = current.filter((id) => id !== exerciseId);
    } else {
      updated = [...current, exerciseId];
      isFav = true;
    }
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
    notifyListeners();
    return isFav;
  },

  // CUSTOM EXERCISES
  getCustomExercises(): FullExerciseItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_EXERCISES);
      if (data) return JSON.parse(data);
    } catch {}
    return [];
  },

  saveCustomExercise(exercise: FullExerciseItem): void {
    const list = this.getCustomExercises();
    const idx = list.findIndex(e => e.id === exercise.id);
    if (idx >= 0) {
      list[idx] = { ...exercise, isCustom: true };
    } else {
      list.push({ ...exercise, isCustom: true });
    }
    localStorage.setItem(STORAGE_KEYS.CUSTOM_EXERCISES, JSON.stringify(list));
    notifyListeners();
  },

  deleteCustomExercise(exerciseId: string): void {
    const list = this.getCustomExercises().filter(e => e.id !== exerciseId);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_EXERCISES, JSON.stringify(list));
    // Also remove from favorites if present
    const favs = this.getFavoriteExerciseIds().filter(id => id !== exerciseId);
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
    notifyListeners();
  },

  // Returns all exercises: 181 built-in exercises + any user-created custom exercises
  getAllExercises(): FullExerciseItem[] {
    const custom = this.getCustomExercises();
    return [...COMPREHENSIVE_FULL_CATALOG, ...custom];
  },

  resetAllData(): void {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.PROGRAMS);
    localStorage.removeItem(STORAGE_KEYS.WORKOUTS);
    localStorage.removeItem(STORAGE_KEYS.SPORTS_SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.WEEKLY_SCHEDULE);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_ACTIVITY);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
    localStorage.removeItem(STORAGE_KEYS.EQUIPMENT);
    localStorage.removeItem(STORAGE_KEYS.FITNESS_PARAMS);
    localStorage.removeItem(STORAGE_KEYS.FAVORITES);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_EXERCISES);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    notifyListeners();
  },

  exportBackupJson(): string {
    const data = {
      profile: this.getProfile(),
      programs: this.getPrograms(),
      workouts: this.getWorkoutSessions(),
      sports: this.getSportSessions(),
      weeklySchedule: this.getWeeklySchedule(),
      activity: this.getActivityMap(),
      equipment: this.getEquipmentList(),
      fitnessParameters: this.getUserParameters(),
      favoriteExerciseIds: this.getFavoriteExerciseIds(),
      exportedAt: new Date().toISOString(),
      version: 4,
    };
    return JSON.stringify(data, null, 2);
  },

  importBackupJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.profile) localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(parsed.profile));
      if (parsed.programs) localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(parsed.programs));
      if (parsed.workouts) localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(parsed.workouts));
      if (parsed.sports) localStorage.setItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(parsed.sports));
      if (parsed.weeklySchedule) localStorage.setItem(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify(parsed.weeklySchedule));
      if (parsed.activity) localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, JSON.stringify(parsed.activity));
      if (parsed.equipment) localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(parsed.equipment));
      if (parsed.fitnessParameters) localStorage.setItem(STORAGE_KEYS.FITNESS_PARAMS, JSON.stringify(parsed.fitnessParameters));
      if (parsed.favoriteExerciseIds) localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(parsed.favoriteExerciseIds));
      notifyListeners();
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },
};

export const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  { id: 'bodyweight', name: 'Собственный вес', categoryName: 'Без оборудования', iconName: 'User', selected: false },
  { id: 'pullup_bar', name: 'Турник', categoryName: 'Перекладина для подтягиваний', iconName: 'Minus', selected: false },
  { id: 'dip_bars', name: 'Брусья', categoryName: 'Параллельные брусья', iconName: 'Equal', selected: false },
  { id: 'dumbbells_adjustable', name: 'Гантели с регулируемым весом', categoryName: 'Разборные гантели', iconName: 'Dumbbell', selected: false, minWeightKg: 2, maxWeightKg: 32, weightStepKg: 2 },
  { id: 'dumbbells_fixed', name: 'Гантели с фиксированным весом', categoryName: 'Цельные гантели', iconName: 'Dumbbell', selected: false, singleDumbbellWeightKg: 16 },
  { id: 'barbell', name: 'Штанга и блины', categoryName: 'Олимпийский или прямой гриф', iconName: 'Shield', selected: false, maxWeightKg: 140 },
  { id: 'bench', name: 'Скамья для жима', categoryName: 'Горизонтальная или наклонная скамья', iconName: 'Square', selected: false },
  { id: 'resistance_bands', name: 'Эспандеры и резиновые ленты', categoryName: 'Фитнес-резинки и жгуты', iconName: 'Activity', selected: false },
  { id: 'kettlebells', name: 'Гири', categoryName: 'Чугунные гири', iconName: 'Circle', selected: false, singleDumbbellWeightKg: 16 },
  { id: 'jump_rope', name: 'Скакалка', categoryName: 'Кардио-разминка', iconName: 'Zap', selected: false },
  { id: 'gym_machines', name: 'Тренажёры', categoryName: 'Блочные и рычажные тренажеры', iconName: 'Cpu', selected: false },
  { id: 'other', name: 'Другой инвентарь', categoryName: 'Ролики для пресса, утяжелители', iconName: 'Plus', selected: false },
];

export const DEFAULT_USER_PARAMETERS: UserFitnessParameters = {
  goal: '' as any,
  level: '' as any,
  location: '' as any,
  daysPerWeek: 0,
  durationMinutes: 0,
  availableDays: [],
  preferredMuscles: [],
  excludedExercises: [],
  healthRestrictions: [],
  notes: '',
};
