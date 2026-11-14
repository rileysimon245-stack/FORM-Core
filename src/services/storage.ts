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
  ProgramStatus,
  ProgramCompletionStats,
  WellbeingCheckin,
  BodyMeasurement,
  StorageHealthReport,
} from '../types/workout';
import { FullExerciseItem } from '../data/exerciseTypes';
import { COMPREHENSIVE_FULL_CATALOG } from '../data/fullExerciseCatalog';
import { normalizeMuscleKeyPure } from '../training-core/muscles';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';
import { isSetCompletedPure, calculateSportLoad } from '../training-core/coreMath';
import {
  formatLocalIsoDate,
  parseIsoDateLocal,
  getStartOfIsoWeekLocal,
  getEndOfIsoWeekLocal,
  getCalendarDaysAgo,
} from '../training-core/dateUtils';
import {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  PRE_MIGRATION_BACKUP_KEY,
  CORRUPTED_RAW_PREFIX,
  CORRUPTED_LOCKS_INDEX_KEY,
  PENDING_ROLLBACK_KEY,
  SafeWriteResult,
  runSafeMigrations,
  safeGetJson,
  safeGetRaw,
  safeSetItem,
  safeRemoveItem,
  flagCorruptedKey,
  clearCorruptedLock,
  confirmClearedLocksAfterRecovery,
  getCorruptedKeys,
  isLocksIndexCorrupted,
  getLastWriteError,
  setLastWriteError,
  clearLastWriteError,
  captureStorageKeysSnapshot,
  restoreStorageKeysSnapshotDetailed,
  hasPendingRollbackRecovery,
  getPendingRollbackKeys,
  retryPendingRollbackRecovery,
  clearPendingRollbackState,
  validateAndMigrateBackup,
} from './migrations';

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
  ANATOMY_RESET_TIME: 'form_anatomy_reset_time',
  ACTIVE_DIRECTION: 'form_active_direction_v1',
  WELLBEING_CHECKINS: 'form_wellbeing_checkins_v1',
  BODY_MEASUREMENTS: 'form_body_measurements_v1',
};

export function isSessionAfterReset(
  session: {
    date: string;
    startTime?: string;
    endTime?: string;
    id?: string;
    completedAt?: number;
  },
  resetTime: number
): boolean {
  if (!resetTime || resetTime <= 0) return true;

  // 1. Explicit completion timestamp
  if (typeof session.completedAt === 'number' && session.completedAt > 0) {
    return session.completedAt >= resetTime;
  }

  // 2. ID with embedded timestamp (e.g. session_1731000000000 or sport_1731000000000)
  if (session.id) {
    const match = session.id.match(/(?:session|sport)[_-](\d{12,14})/);
    if (match) {
      const idTs = Number(match[1]);
      if (!isNaN(idTs) && idTs > 0) {
        return idTs >= resetTime;
      }
    }
  }

  // 3. Time string (endTime or startTime)
  const timeStr = session.endTime || session.startTime;
  if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr)) {
    const [hh, mm] = timeStr.split(':').map(Number);
    const localDt = parseIsoDateLocal(session.date, 0);
    if (localDt && Number.isFinite(hh) && Number.isFinite(mm)) {
      localDt.setHours(hh, mm, 0, 0);
      return localDt.getTime() >= resetTime;
    }
  }

  // 4. Date comparison with reset day
  const resetIso = formatLocalIsoDate(new Date(resetTime));

  if (session.date > resetIso) return true;
  if (session.date < resetIso) return false;

  // If session is on the reset day but has no post-reset timestamp,
  // it was created prior to the user hitting reset.
  return false;
}

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

// No built-in or preset programs: all programs must be created by the user
export function isBuiltinPresetProgram(program: WorkoutProgram | any): boolean {
  if (!program) return false;
  // If explicitly marked as not custom
  if (program.isCustom === false) return true;
  // Known built-in preset IDs
  const knownPresetIds = new Set([
    'prog_push_pull_legs',
    'prog_upper_lower',
    'prog_classic_split',
    'prog_full_body',
    'prog_full_body_starter',
    'prog_bro_split',
    'prog_hypertrophy',
  ]);
  if (knownPresetIds.has(program.id)) return true;
  // Known preset program names
  const knownPresetNames = new Set([
    'Push / Pull / Legs (Сила + Масса)',
    'Upper / Lower (Верх и Низ 4 дня)',
    'Классический сплит',
    'Full Body для начинающих',
  ]);
  if (knownPresetNames.has(program.name)) return true;
  return false;
}

export const CATALOG_PRESET_PROGRAMS: WorkoutProgram[] = [];

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

export function normalizeMuscleKey(rawKey?: string | null): MuscleGroup | null {
  return normalizeMuscleKeyPure(rawKey);
}

export function getBodyweightEquivalentKg(userWeightKg?: number): number {
  return userWeightKg && userWeightKg > 0 ? Math.round(userWeightKg * 0.5) : 25;
}

export function isSetCompleted(st: any): boolean {
  return isSetCompletedPure(st);
}

export const StorageService = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  checkAndPurgeLegacyData(): void {
    // Неразрушающая миграция вместо прежней очистки данных пользователя
    runSafeMigrations(STORAGE_KEYS);
  },

  getProfile(): UserProfile {
    this.checkAndPurgeLegacyData();
    const parsed = safeGetJson<Partial<UserProfile> | null>(STORAGE_KEYS.PROFILE, null, {
      expectObject: true,
    });
    return parsed ? { ...DEFAULT_PROFILE, ...parsed } : DEFAULT_PROFILE;
  },

  updateProfile(profile: Partial<UserProfile>): UserProfile {
    const current = this.getProfile();
    const updated = { ...current, ...profile };
    safeSetItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
    notifyListeners();
    return updated;
  },

  getPrograms(): WorkoutProgram[] {
    this.checkAndPurgeLegacyData();
    const parsed = safeGetJson<any[] | null>(STORAGE_KEYS.PROGRAMS, null, { expectArray: true });
    if (Array.isArray(parsed)) {
      const userOnly = parsed.filter((p) => p && !isBuiltinPresetProgram(p));
      let changed = userOnly.length !== parsed.length;
      const normalized = userOnly.map((p) => {
        if (!p.status || !p.iterationCount) {
          changed = true;
          return {
            ...p,
            status: (p.status as ProgramStatus) || 'active',
            iterationCount: p.iterationCount || 1,
          };
        }
        return p;
      });
      if (changed) {
        safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(normalized));
      }
      return normalized;
    }
    return [];
  },

  saveProgram(program: WorkoutProgram): SafeWriteResult {
    const list = this.getPrograms();
    // Ensure saved program is marked as user custom program and has status
    const sanitized: WorkoutProgram = {
      ...program,
      isCustom: true,
      status: program.status || 'active',
      iterationCount: program.iterationCount || 1,
    };
    const index = list.findIndex((p) => p.id === sanitized.id);
    if (index >= 0) {
      list[index] = sanitized;
    } else {
      list.unshift(sanitized);
    }
    const res = safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  getActiveDirection(): 'programs' | 'mobility' | null {
    const val = safeGetRaw(STORAGE_KEYS.ACTIVE_DIRECTION);
    if (val === null || val === '') return null;
    if (val === 'programs' || val === 'mobility') return val;
    flagCorruptedKey(STORAGE_KEYS.ACTIVE_DIRECTION, val);
    return null;
  },

  setActiveDirection(dir: 'programs' | 'mobility' | null): SafeWriteResult {
    const res = dir
      ? safeSetItem(STORAGE_KEYS.ACTIVE_DIRECTION, dir)
      : safeRemoveItem(STORAGE_KEYS.ACTIVE_DIRECTION);
    notifyListeners();
    return res;
  },

  addProgramFromCatalog(catalogProgram: WorkoutProgram): WorkoutProgram {
    const list = this.getPrograms();
    // Check if user already has this exact program
    const existing = list.find(
      (p) => p.name.trim().toLowerCase() === catalogProgram.name.trim().toLowerCase()
    );
    if (existing) {
      // If already added, ensure it is active
      const activated = this.updateProgramStatus(existing.id, 'active');
      if (catalogProgram.direction) {
        this.setActiveDirection(catalogProgram.direction);
      }
      return activated || existing;
    }

    const cloned: WorkoutProgram = {
      ...catalogProgram,
      id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      isCustom: true,
      status: 'active',
      iterationCount: 1,
      createdAt: formatLocalIsoDate(new Date()),
      workouts: catalogProgram.workouts.map((w, wIdx) => ({
        ...w,
        id: `w_${Date.now()}_${wIdx}`,
        exercises: w.exercises.map((e) => ({ ...e })),
      })),
    };

    this.saveProgram(cloned);
    if (cloned.direction) {
      this.setActiveDirection(cloned.direction);
    }
    return cloned;
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
      status: 'active',
      iterationCount: 1,
      createdAt: formatLocalIsoDate(new Date()),
      workouts: target.workouts.map((w, idx) => ({
        ...w,
        id: `w_copy_${idx}_${Date.now()}`,
      })),
    };

    list.unshift(copy);
    safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return copy;
  },

  deleteProgram(programId: string): SafeWriteResult {
    const list = this.getPrograms().filter((p) => p.id !== programId);
    const res = safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  calculateProgramStats(programId: string): ProgramCompletionStats {
    const list = this.getPrograms();
    const target = list.find((p) => p.id === programId);
    const sessions = this.getWorkoutSessions().filter(
      (s) =>
        s.status === 'completed' &&
        (s.programId === programId || (target && s.programName === target.name))
    );

    const totalWorkoutsCompleted = sessions.length;
    const totalVolumeKg = sessions.reduce((sum, s) => sum + (s.totalVolumeKg || 0), 0);
    const totalDurationMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

    let personalRecordsCount = 0;
    sessions.forEach((s) => {
      if (Array.isArray(s.personalRecords)) {
        personalRecordsCount += s.personalRecords.length;
      }
    });

    return {
      completedAt: new Date().toISOString(),
      totalWorkoutsCompleted,
      totalVolumeKg,
      totalDurationMinutes,
      personalRecordsCount,
    };
  },

  updateProgramStatus(
    programId: string,
    status: ProgramStatus,
    extra?: Partial<WorkoutProgram>
  ): WorkoutProgram | null {
    const list = this.getPrograms();
    const index = list.findIndex((p) => p.id === programId);
    if (index === -1) return null;

    const current = list[index];
    const nowIso = new Date().toISOString();
    const updated: WorkoutProgram = {
      ...current,
      ...extra,
      status,
      ...(status === 'paused' ? { pausedAt: nowIso } : {}),
      ...(status === 'completed' ? { completedAt: nowIso } : {}),
      ...(status === 'archived' ? { archivedAt: nowIso } : {}),
    };
    list[index] = updated;
    safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return updated;
  },

  completeProgram(programId: string, summaryNote?: string): WorkoutProgram | null {
    const stats = this.calculateProgramStats(programId);
    if (summaryNote) {
      stats.summaryNote = summaryNote;
    }
    return this.updateProgramStatus(programId, 'completed', {
      completionStats: stats,
    });
  },

  pauseProgram(programId: string): WorkoutProgram | null {
    return this.updateProgramStatus(programId, 'paused');
  },

  resumeProgram(programId: string): WorkoutProgram | null {
    return this.updateProgramStatus(programId, 'active');
  },

  archiveProgram(programId: string): WorkoutProgram | null {
    return this.updateProgramStatus(programId, 'archived');
  },

  repeatProgram(programId: string): WorkoutProgram | null {
    const list = this.getPrograms();
    const target = list.find((p) => p.id === programId);
    if (!target) return null;
    const nextIteration = (target.iterationCount || 1) + 1;
    return this.updateProgramStatus(programId, 'active', {
      iterationCount: nextIteration,
      pausedAt: undefined,
      archivedAt: undefined,
    });
  },

  updateProgramGoal(programId: string, newGoal: string): WorkoutProgram | null {
    const list = this.getPrograms();
    const index = list.findIndex((p) => p.id === programId);
    if (index === -1) return null;
    list[index] = {
      ...list[index],
      goal: newGoal,
    };
    safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return list[index];
  },

  replaceProgram(oldProgramId: string, newProgramId: string, archiveOld: boolean = true): void {
    const list = this.getPrograms();
    const oldIdx = list.findIndex((p) => p.id === oldProgramId);
    const newIdx = list.findIndex((p) => p.id === newProgramId);
    const nowIso = new Date().toISOString();
    if (oldIdx !== -1 && archiveOld) {
      list[oldIdx] = {
        ...list[oldIdx],
        status: 'archived',
        archivedAt: nowIso,
      };
    }
    if (newIdx !== -1) {
      list[newIdx] = {
        ...list[newIdx],
        status: 'active',
      };
    }
    safeSetItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
  },

  getWorkoutSessions(): WorkoutSession[] {
    this.checkAndPurgeLegacyData();
    return safeGetJson<WorkoutSession[]>(STORAGE_KEYS.WORKOUTS, [], { expectArray: true });
  },

  // MULTI-SPORT SESSIONS (Boxing, Basketball, Running, Cycling, Swimming, etc.)
  getSportSessions(): SportSession[] {
    this.checkAndPurgeLegacyData();
    return safeGetJson<SportSession[]>(STORAGE_KEYS.SPORTS_SESSIONS, [], { expectArray: true });
  },

  saveSportSession(session: SportSession): SafeWriteResult {
    const list = this.getSportSessions();
    const duration =
      session.actualDurationMinutes ?? session.plannedDurationMinutes ?? 45;
    const sportLoad = calculateSportLoad({
      durationMinutes: duration,
      rpe: session.rpe,
      legacyIntensity: session.intensity,
    });
    if (!sportLoad.isValid) {
      const errMsg = sportLoad.error || 'Некорректные параметры спортивной сессии.';
      setLastWriteError(errMsg);
      return { ok: false, error: errMsg };
    }
    const loadScore = sportLoad.loadUnits;

    const prepared: SportSession = {
      ...session,
      rpe: sportLoad.usedRpe ?? session.rpe,
      completedAt: session.completedAt || (session.status === 'completed' ? Date.now() : undefined),
      loadScore,
    };

    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }
    const res = safeSetItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(list));
    if (!res.ok) {
      notifyListeners();
      return res;
    }

    if (prepared.status === 'completed') {
      this.setDayStatus(prepared.date, 'completed', prepared.title);
    } else if (prepared.status === 'skipped') {
      this.setDayStatus(prepared.date, 'skipped', prepared.title);
    }
    notifyListeners();
    return res;
  },

  deleteSportSession(sessionId: string): SafeWriteResult {
    const list = this.getSportSessions();
    const target = list.find((s) => s.id === sessionId);
    const filtered = list.filter((s) => s.id !== sessionId);
    const res = safeSetItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(filtered));

    if (res.ok && target) {
      const remainingSports = filtered.filter((s) => s.date === target.date);
      const remainingWorkouts = this.getWorkoutSessions().filter((s) => s.date === target.date);
      if (remainingSports.length === 0 && remainingWorkouts.length === 0) {
        this.setDayStatus(target.date, 'none');
      }
    }
    notifyListeners();
    return res;
  },

  // WEEKLY SCHEDULE CONSTRUCTOR
  getWeeklySchedule(): WeeklyScheduleDay[] {
    return safeGetJson<WeeklyScheduleDay[]>(STORAGE_KEYS.WEEKLY_SCHEDULE, DEFAULT_WEEKLY_SCHEDULE, {
      expectArray: true,
    });
  },

  saveWeeklySchedule(schedule: WeeklyScheduleDay[]): SafeWriteResult {
    const res = safeSetItem(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify(schedule));
    notifyListeners();
    return res;
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
  saveWorkoutSession(session: WorkoutSession): SafeWriteResult {
    if (!session.completedAt && session.status === 'completed') {
      session.completedAt = Date.now();
    }
    const list = this.getWorkoutSessions();

    const existingIndex = list.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      list[existingIndex] = session;
    } else {
      list.unshift(session);
    }

    // Recalculate personal records across all sessions to preserve chronological integrity and avoid duplicates
    const updatedList = this.recalculatePersonalRecordsForAllSessions(list);
    const res = safeSetItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(updatedList));
    if (!res.ok) {
      notifyListeners();
      return res;
    }

    // Update activity map for that day only after confirmed workout save
    const actRes = this.setDayStatus(session.date, 'completed', session.name, session.totalVolumeKg);

    // Clear active draft only after confirmed workout save
    this.clearActiveDraft();

    notifyListeners();
    return actRes.ok ? res : { ok: true, error: null };
  },

  updateSession(session: WorkoutSession): SafeWriteResult {
    const list = this.getWorkoutSessions();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx < 0) {
      return { ok: false, error: 'Тренировка не найдена для обновления.' };
    }
    list[idx] = session;
    const updatedList = this.recalculatePersonalRecordsForAllSessions(list);
    const res = safeSetItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(updatedList));
    notifyListeners();
    return res;
  },

  deleteWorkoutSession(sessionId: string): SafeWriteResult {
    const list = this.getWorkoutSessions();
    const session = list.find((s) => s.id === sessionId);
    const filtered = list.filter((s) => s.id !== sessionId);

    // Recalculate personal records for all remaining completed sessions
    const updatedList = this.recalculatePersonalRecordsForAllSessions(filtered);
    const res = safeSetItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(updatedList));

    if (res.ok && session) {
      const others = updatedList.filter((s) => s.date === session.date);
      if (others.length === 0) {
        this.setDayStatus(session.date, 'none');
      }
    }
    notifyListeners();
    return res;
  },

  // Persistent in-progress draft (so user never loses active workout if closed)
  saveActiveDraft(session: WorkoutSession): SafeWriteResult {
    return safeSetItem(STORAGE_KEYS.ACTIVE_DRAFT, JSON.stringify(session));
  },

  getActiveDraft(): WorkoutSession | null {
    return safeGetJson<WorkoutSession | null>(STORAGE_KEYS.ACTIVE_DRAFT, null, {
      expectObject: true,
    });
  },

  clearActiveDraft(): SafeWriteResult {
    return safeRemoveItem(STORAGE_KEYS.ACTIVE_DRAFT);
  },

  getActivityMap(year: number = 2026): Record<string, 'completed' | 'skipped' | 'none'> {
    this.checkAndPurgeLegacyData();
    return safeGetJson<Record<string, 'completed' | 'skipped' | 'none'>>(
      STORAGE_KEYS.CUSTOM_ACTIVITY,
      {},
      { expectObject: true }
    );
  },

  setDayStatus(
    date: string,
    status: 'completed' | 'skipped' | 'none',
    title?: string,
    volumeKg?: number
  ): SafeWriteResult {
    const map = this.getActivityMap();
    map[date] = status;
    const res = safeSetItem(STORAGE_KEYS.CUSTOM_ACTIVITY, JSON.stringify(map));
    notifyListeners();
    return res;
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
      const todayStr = formatLocalIsoDate(today);

      let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
      // Check if trained today or yesterday
      if (!map[todayStr]) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (true) {
        const key = formatLocalIsoDate(checkDate);
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

  getDetailedMuscleDiagnostics(muscleKey: MuscleGroup, period: MusclePeriod = '7d') {
    const allSessions = this.getWorkoutSessions();
    const userProfile = this.getProfile();
    const fallbackWeight = getBodyweightEquivalentKg(userProfile.weightKg);

    const now = new Date();
    const todayIso = formatLocalIsoDate(now);
    const resetTime = this.getAnatomyResetTime();

    const completedSessionsAll = allSessions.filter((s) => s.status === 'completed');
    const latestCompletedSession = completedSessionsAll.length > 0
      ? [...completedSessionsAll].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      : null;
    const latestSessionDate = latestCompletedSession ? latestCompletedSession.date : todayIso;

    const filterByPeriod = (itemDate: string) => {
      if (period === 'session') {
        return itemDate === latestSessionDate;
      }
      if (period === 'all') return true;
      if (itemDate === todayIso) return true;
      const daysDiff = getCalendarDaysAgo(itemDate, now);
      if (daysDiff === null) return false;

      if (period === '7d') return daysDiff >= 0 && daysDiff <= 7;
      if (period === '30d') return daysDiff >= 0 && daysDiff <= 30;
      if (period === '90d') return daysDiff >= 0 && daysDiff <= 90;
      return true;
    };

    const periodSessions = allSessions.filter(
      (s) => s.status === 'completed' && filterByPeriod(s.date) && isSessionAfterReset(s, resetTime)
    );

    let totalSetsFound = 0;
    let completedSetsFound = 0;
    const setsDetails: Array<{
      sessionDate: string;
      sessionName: string;
      exerciseName: string;
      rawPrimary: string;
      normPrimary: string;
      rawSecondaries: string[];
      normSecondaries: string[];
      isPrimary: boolean;
      isSecondary: boolean;
      setNumber: number;
      weightKg: number;
      usedWeightKg: number;
      isBodyweightFallback: boolean;
      reps: number;
      isCompleted: boolean;
      tonnageContribution: number;
    }> = [];

    const customExercises = this.getCustomExercises();
    periodSessions.forEach((s) => {
      s.exercises?.forEach((ex) => {
        const catalogItem = findExerciseInUnifiedCatalog(
          ex.exerciseId,
          ex.name,
          customExercises,
          ex.targetMuscle
        );
        const rawPrimary = ex.targetMuscle || catalogItem?.primaryMuscle || '';
        const normPrimary = normalizeMuscleKey(rawPrimary);
        const normPrimaryDisplay = normPrimary || (rawPrimary ? `не распознан: ${rawPrimary}` : 'не указан');

        const rawSecondaries =
          ex.secondaryMuscles && ex.secondaryMuscles.length > 0
            ? ex.secondaryMuscles
            : catalogItem?.secondaryMuscles || [];
        const normSecondaries = rawSecondaries.map((k) => normalizeMuscleKey(k) || `не распознан: ${k}`);

        const m = muscleKey;
        let isPrimary = normPrimary === m;
        let isSecondary = normSecondaries.includes(m);

        if (!isPrimary && !isSecondary) {
          const exNameLow = ex.name.toLowerCase();
          if (m === 'chest' && (normPrimary?.startsWith('chest') || normSecondaries.some((sec) => sec.startsWith('chest')))) {
            isPrimary = true;
          } else if (normPrimary === 'chest' || normSecondaries.includes('chest')) {
            if (m === 'chest_upper' && (exNameLow.includes('наклон') || exNameLow.includes('вверх') || exNameLow.includes('incline'))) isPrimary = true;
            else if (m === 'chest_mid' && (exNameLow.includes('лежа') || exNameLow.includes('отжимания') || exNameLow.includes('кроссовер'))) isPrimary = true;
            else if (m === 'chest_lower' && (exNameLow.includes('брусь') || exNameLow.includes('dips') || exNameLow.includes('вниз'))) isPrimary = true;
            else if (m.startsWith('chest_')) isSecondary = true;
          } else if (normPrimary === 'shoulders' || normSecondaries.includes('shoulders')) {
            if (m === 'front_delts' && (exNameLow.includes('армей') || exNameLow.includes('вверх') || exNameLow.includes('передн'))) isPrimary = true;
            else if (m === 'side_delts' && (exNameLow.includes('мах') || exNameLow.includes('боков'))) isPrimary = true;
            else if (m === 'rear_delts' && (exNameLow.includes('задн') || exNameLow.includes('face pull'))) isPrimary = true;
            else if (m.endsWith('_delts')) isSecondary = true;
          } else if (m === 'shoulders' && (normPrimary?.endsWith('_delts') || normSecondaries.some((sec) => sec.endsWith('_delts')))) {
            isPrimary = true;
          } else if (normPrimary === 'quads' || normSecondaries.includes('quads')) {
            if (m.startsWith('quads_')) isSecondary = true;
          } else if (m === 'quads' && (normPrimary?.startsWith('quads_') || normSecondaries.some((sec) => sec.startsWith('quads_')))) {
            isPrimary = true;
          }
        }

        if (isPrimary || isSecondary) {
          const multiplier = isPrimary ? 1.0 : 0.45;
          (ex.sets || []).forEach((st: any, idx) => {
            totalSetsFound++;
            const completed = isSetCompleted(st);
            if (completed) {
              completedSetsFound++;
            }
            const rawW = Number(st.weightKg);
            const isBodyweightFallback = !(rawW > 0);
            const usedWeightKg = rawW > 0 ? rawW : fallbackWeight;
            const reps = Number(st.reps) || 0;
            const tonnageContribution = completed ? Math.round(usedWeightKg * reps * multiplier) : 0;

            setsDetails.push({
              sessionDate: s.date,
              sessionName: s.name,
              exerciseName: ex.name,
              rawPrimary,
              normPrimary: normPrimaryDisplay,
              rawSecondaries,
              normSecondaries,
              isPrimary,
              isSecondary,
              setNumber: st.setNumber || idx + 1,
              weightKg: rawW || 0,
              usedWeightKg,
              isBodyweightFallback,
              reps,
              isCompleted: completed,
              tonnageContribution,
            });
          });
        }
      });
    });

    const totalTonnage = setsDetails.reduce((acc, set) => acc + set.tonnageContribution, 0);
    const effectivePercent = completedSetsFound > 0 ? Math.max(10, Math.round((totalTonnage / 8000) * 75)) : 0;

    let zeroReason: string | null = null;
    if (periodSessions.length === 0) {
      if (resetTime > 0) {
        zeroReason = 'статистика сброшена кнопкой "Сбросить" (все тренировки завершены до момента сброса)';
      } else {
        zeroReason = 'подходы вне периода (нет сохранённых завершённых тренировок за выбранный период)';
      }
    } else if (setsDetails.length === 0) {
      zeroReason = 'ключ мышцы не распознан / не найден в сохранённых упражнениях';
    } else if (completedSetsFound === 0) {
      zeroReason = 'нет выполненных подходов (все подходы не помечены выполненными)';
    } else if (totalTonnage === 0) {
      zeroReason = 'вес равен 0 и повторы равны 0';
    }

    const def = MUSCLE_DEFINITIONS[muscleKey];

    return {
      muscleKey,
      muscleNameRu: def ? def.nameRu : muscleKey,
      period,
      latestSessionDate,
      totalCompletedSessionsInPeriod: periodSessions.length,
      totalSetsFound,
      completedSetsFound,
      completedFieldUsed: 'st.completed === true | 1 | "true" | st.done === true | st.isDone === true',
      setsDetails,
      totalEffectiveTonnage: totalTonnage,
      effectivePercent,
      zeroReason,
    };
  },

  // REAL MUSCLE IMPACT: Combines Strength sets + Multi-sport sessions
  getMuscleStats(period: MusclePeriod = '7d'): Record<MuscleGroup, MuscleLoadStats> {
    const allSessions = this.getWorkoutSessions();
    const allSportSessions = this.getSportSessions();
    const userProfile = this.getProfile();
    const fallbackWeight = getBodyweightEquivalentKg(userProfile.weightKg);

    const now = new Date();
    const todayIso = formatLocalIsoDate(now);

    const resetTime = this.getAnatomyResetTime();

    const completedSessionsAll = allSessions.filter((s) => s.status === 'completed');
    const latestCompletedSession = completedSessionsAll.length > 0
      ? [...completedSessionsAll].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      : null;
    const latestSessionDate = latestCompletedSession ? latestCompletedSession.date : todayIso;

    const filterByPeriod = (itemDate: string) => {
      if (period === 'session') {
        return itemDate === latestSessionDate;
      }
      if (period === 'all') {
        return true;
      }
      if (itemDate === todayIso) {
        return true;
      }
      const daysDiff = getCalendarDaysAgo(itemDate, now);
      if (daysDiff === null) return false;

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
      (s) => s.status === 'completed' && filterByPeriod(s.date) && isSessionAfterReset(s, resetTime)
    );
    const completedSportSessions = allSportSessions.filter(
      (sp) => sp.status === 'completed' && filterByPeriod(sp.date) && isSessionAfterReset(sp, resetTime)
    );
    const stats: Partial<Record<MuscleGroup, MuscleLoadStats>> = {};

    const customExercises = this.getCustomExercises();
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
          const exCleanName = (ex.name || '').trim().toLowerCase();
          const catalogItem = findExerciseInUnifiedCatalog(
            ex.exerciseId,
            ex.name,
            customExercises,
            ex.targetMuscle
          );
          const rawPrimary = ex.targetMuscle || catalogItem?.primaryMuscle;
          const normPrimary = normalizeMuscleKey(rawPrimary);

          const rawSecondaries =
            ex.secondaryMuscles && ex.secondaryMuscles.length > 0
              ? ex.secondaryMuscles
              : catalogItem?.secondaryMuscles || [];
          const normSecondaries = rawSecondaries.map((k) => normalizeMuscleKey(k)).filter(Boolean) as MuscleGroup[];

          let isPrimary = normPrimary === m || ((m === 'rear_delts' || m === 'rearDelts') && (normPrimary === 'rear_delts' || normPrimary === 'rearDelts'));
          let isSecondary = normSecondaries.includes(m) || ((m === 'rear_delts' || m === 'rearDelts') && (normSecondaries.includes('rear_delts') || normSecondaries.includes('rearDelts')));

          // Smart muscle hierarchy mapping for detailed muscle heads & rollups
          if (!isPrimary && !isSecondary) {
            const exNameLow = exCleanName;

            // Chest mapping
            if (m === 'chest' && (normPrimary?.startsWith('chest') || normSecondaries.some((sec) => sec.startsWith('chest')))) {
              if (normPrimary?.startsWith('chest')) isPrimary = true;
              else isSecondary = true;
            } else if (normPrimary === 'chest' || normSecondaries.includes('chest')) {
              const isPrim = normPrimary === 'chest';
              if (m === 'chest_upper' && (exNameLow.includes('наклон') || exNameLow.includes('вверх') || exNameLow.includes('incline'))) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              } else if (m === 'chest_mid' && (exNameLow.includes('лежа') || exNameLow.includes('отжимания') || exNameLow.includes('кроссовер'))) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              } else if (m === 'chest_lower' && (exNameLow.includes('брусь') || exNameLow.includes('dips') || exNameLow.includes('вниз'))) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              } else if (m.startsWith('chest_')) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              }
            }

            // Shoulders mapping
            else if (m === 'shoulders' && (normPrimary?.endsWith('_delts') || normPrimary === 'rearDelts' || normSecondaries.some((sec) => sec.endsWith('_delts') || sec === 'rearDelts'))) {
              if (normPrimary?.endsWith('_delts') || normPrimary === 'rearDelts') isPrimary = true;
              else isSecondary = true;
            } else if (normPrimary === 'shoulders' || normSecondaries.includes('shoulders')) {
              const isPrim = normPrimary === 'shoulders';
              if (m === 'front_delts' && (exNameLow.includes('армей') || exNameLow.includes('вверх') || exNameLow.includes('передн'))) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              } else if (m === 'side_delts' && (exNameLow.includes('мах') || exNameLow.includes('боков'))) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              } else if ((m === 'rear_delts' || m === 'rearDelts') && (exNameLow.includes('задн') || exNameLow.includes('face pull'))) {
                if (isPrim) isPrimary = true; else isSecondary = true;
              } else if (m.endsWith('_delts') || m === 'rearDelts') {
                if (isPrim) isPrimary = true; else isSecondary = true;
              }
            }

            // Traps mapping
            else if (m === 'traps' && (normPrimary?.startsWith('traps_') || normPrimary === 'rhomboids' || normSecondaries.some((sec) => sec.startsWith('traps_') || sec === 'rhomboids'))) {
              if (normPrimary?.startsWith('traps_') || normPrimary === 'rhomboids') isPrimary = true;
              else isSecondary = true;
            } else if ((normPrimary === 'traps' || normSecondaries.includes('traps')) && (m.startsWith('traps_') || m === 'rhomboids')) {
              if (normPrimary === 'traps') isPrimary = true; else isSecondary = true;
            }

            // Quads mapping
            else if (m === 'quads' && (normPrimary?.startsWith('quads_') || normSecondaries.some((sec) => sec.startsWith('quads_')))) {
              if (normPrimary?.startsWith('quads_')) isPrimary = true;
              else isSecondary = true;
            } else if ((normPrimary === 'quads' || normSecondaries.includes('quads')) && m.startsWith('quads_')) {
              if (normPrimary === 'quads') isPrimary = true; else isSecondary = true;
            }
          }

          if (isPrimary || isSecondary) {
            distinctExercises.add(ex.name);
            const multiplier = isPrimary ? 1.0 : 0.45;

            ex.sets?.forEach((st: any) => {
              if (isSetCompleted(st)) {
                totalSets++;
                sessionMuscleSets++;
                const rawW = Number(st.weightKg);
                const setWeight = rawW > 0 ? rawW : fallbackWeight;
                const setReps = Number(st.reps) || 0;
                const vol = setWeight * setReps * multiplier;
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
      const totalEffectiveKg = Math.round(strengthVolume + sportLoadPoints * 20);
      const hasRealData = totalHits > 0 && (totalSets > 0 || sportHits > 0);

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

        const baseHours = def.recoveryHours || 48;
        const volumeMultiplier = totalEffectiveKg > 6000 ? 1.25 : totalEffectiveKg > 3000 ? 1.1 : totalEffectiveKg < 1200 ? 0.75 : 1.0;
        const totalNeededHours = Math.round(baseHours * volumeMultiplier);

        const latestDateStr = history[0]?.date;
        let elapsedHours = 0;
        if (latestDateStr) {
          const workoutDate = parseIsoDateLocal(latestDateStr, 12);
          if (workoutDate) {
            const now = new Date();
            const diffMs = now.getTime() - workoutDate.getTime();
            elapsedHours = Math.max(0, diffMs / (1000 * 60 * 60));
          }
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
    // Monday as start of current week (ISO week) via local calendar utils
    const startOfWeek = getStartOfIsoWeekLocal(now);

    const startOfPrevWeek = new Date(
      startOfWeek.getFullYear(),
      startOfWeek.getMonth(),
      startOfWeek.getDate() - 7,
      0,
      0,
      0,
      0
    );
    const endOfPrevWeek = new Date(startOfWeek.getTime() - 1);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
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
      const sessionDate = parseIsoDateLocal(s.date, 12);
      if (!sessionDate) return;

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
      const wStart = new Date(
        startOfWeek.getFullYear(),
        startOfWeek.getMonth(),
        startOfWeek.getDate() - i * 7,
        0,
        0,
        0,
        0
      );
      const wEnd = getEndOfIsoWeekLocal(wStart);

      const weekSessions = completed.filter((s) => {
        const sDate = parseIsoDateLocal(s.date, 12);
        return Boolean(sDate && sDate >= wStart && sDate <= wEnd);
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
    const parsed = safeGetJson<Partial<AppSettings> | null>(STORAGE_KEYS.SETTINGS, null, {
      expectObject: true,
    });
    return parsed ? { ...DEFAULT_APP_SETTINGS, ...parsed } : DEFAULT_APP_SETTINGS;
  },

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    safeSetItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    notifyListeners();
    return updated;
  },

  // EQUIPMENT MANAGEMENT
  getEquipmentList(): EquipmentItem[] {
    return safeGetJson<EquipmentItem[]>(STORAGE_KEYS.EQUIPMENT, DEFAULT_EQUIPMENT, {
      expectArray: true,
    });
  },

  saveEquipmentList(items: EquipmentItem[]): SafeWriteResult {
    const res = safeSetItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(items));
    notifyListeners();
    return res;
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
    const parsed = safeGetJson<Partial<UserFitnessParameters> | null>(
      STORAGE_KEYS.FITNESS_PARAMS,
      null,
      { expectObject: true }
    );
    return parsed ? { ...DEFAULT_USER_PARAMETERS, ...parsed } : DEFAULT_USER_PARAMETERS;
  },

  saveUserParameters(params: UserFitnessParameters): SafeWriteResult {
    const res = safeSetItem(STORAGE_KEYS.FITNESS_PARAMS, JSON.stringify(params));
    notifyListeners();
    return res;
  },

  // FAVORITES
  getFavoriteExerciseIds(): string[] {
    return safeGetJson<string[]>(STORAGE_KEYS.FAVORITES, [], { expectArray: true });
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
    safeSetItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
    notifyListeners();
    return isFav;
  },

  // CUSTOM EXERCISES
  getCustomExercises(): FullExerciseItem[] {
    return safeGetJson<FullExerciseItem[]>(STORAGE_KEYS.CUSTOM_EXERCISES, [], {
      expectArray: true,
    });
  },

  saveCustomExercise(exercise: FullExerciseItem): SafeWriteResult {
    const list = this.getCustomExercises();
    const idx = list.findIndex((e) => e.id === exercise.id);
    if (idx >= 0) {
      list[idx] = { ...exercise, isCustom: true };
    } else {
      list.push({ ...exercise, isCustom: true });
    }
    const res = safeSetItem(STORAGE_KEYS.CUSTOM_EXERCISES, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  deleteCustomExercise(exerciseId: string): SafeWriteResult {
    const list = this.getCustomExercises().filter((e) => e.id !== exerciseId);
    const res = safeSetItem(STORAGE_KEYS.CUSTOM_EXERCISES, JSON.stringify(list));
    if (res.ok) {
      const favs = this.getFavoriteExerciseIds().filter((id) => id !== exerciseId);
      safeSetItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
    }
    notifyListeners();
    return res;
  },

  // Returns all exercises: 181 built-in exercises + any user-created custom exercises
  getAllExercises(): FullExerciseItem[] {
    const custom = this.getCustomExercises();
    return [...COMPREHENSIVE_FULL_CATALOG, ...custom];
  },

  // WELLBEING CHECKINS (сон, усталость, болезненность, боль)
  getWellbeingCheckins(): WellbeingCheckin[] {
    this.checkAndPurgeLegacyData();
    return safeGetJson<WellbeingCheckin[]>(STORAGE_KEYS.WELLBEING_CHECKINS, [], {
      expectArray: true,
    });
  },

  saveWellbeingCheckin(checkin: WellbeingCheckin): SafeWriteResult {
    const list = this.getWellbeingCheckins();
    const idx = list.findIndex((c) => c.id === checkin.id || c.date === checkin.date);
    if (idx >= 0) {
      list[idx] = checkin;
    } else {
      list.unshift(checkin);
    }
    const res = safeSetItem(STORAGE_KEYS.WELLBEING_CHECKINS, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  deleteWellbeingCheckin(id: string): SafeWriteResult {
    const list = this.getWellbeingCheckins().filter((c) => c.id !== id);
    const res = safeSetItem(STORAGE_KEYS.WELLBEING_CHECKINS, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  // BODY MEASUREMENTS (масса тела, обхваты)
  getBodyMeasurements(): BodyMeasurement[] {
    this.checkAndPurgeLegacyData();
    return safeGetJson<BodyMeasurement[]>(STORAGE_KEYS.BODY_MEASUREMENTS, [], {
      expectArray: true,
    });
  },

  saveBodyMeasurement(measurement: BodyMeasurement): SafeWriteResult {
    const list = this.getBodyMeasurements();
    const idx = list.findIndex((m) => m.id === measurement.id || m.date === measurement.date);
    if (idx >= 0) {
      list[idx] = measurement;
    } else {
      list.unshift(measurement);
    }
    const res = safeSetItem(STORAGE_KEYS.BODY_MEASUREMENTS, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  deleteBodyMeasurement(id: string): SafeWriteResult {
    const list = this.getBodyMeasurements().filter((m) => m.id !== id);
    const res = safeSetItem(STORAGE_KEYS.BODY_MEASUREMENTS, JSON.stringify(list));
    notifyListeners();
    return res;
  },

  // STORAGE HEALTH DIAGNOSTICS & ERROR HELPERS
  getLastWriteError(): string | null {
    return getLastWriteError();
  },

  clearLastWriteError(): void {
    clearLastWriteError();
    notifyListeners();
  },

  getCorruptedKeys(): string[] {
    return getCorruptedKeys();
  },

  getStorageHealth(): StorageHealthReport {
    this.checkAndPurgeLegacyData();
    const rawVer = safeGetRaw(SCHEMA_VERSION_KEY);
    const schemaVersion = rawVer ? Number(rawVer) || CURRENT_SCHEMA_VERSION : CURRENT_SCHEMA_VERSION;
    const hasPreMigrationBackup = Boolean(safeGetRaw(PRE_MIGRATION_BACKUP_KEY));

    // Проверяем последнее сообщение об ошибке ДО чтения счётчиков, чтобы read не перетёр статус
    const corruptedKeys = getCorruptedKeys();
    const sessionsCount = this.getWorkoutSessions().length;
    const programsCount = this.getPrograms().length;
    const sportSessionsCount = this.getSportSessions().length;
    const checkinsCount = this.getWellbeingCheckins().length;
    const measurementsCount = this.getBodyMeasurements().length;
    const lastWriteError = getLastWriteError();

    return {
      schemaVersion,
      hasPreMigrationBackup,
      corruptedKeys: Array.from(new Set([...corruptedKeys, ...getCorruptedKeys()])),
      lastWriteError,
      quotaOk: lastWriteError === null,
      sessionsCount,
      programsCount,
      sportSessionsCount,
      checkinsCount,
      measurementsCount,
    };
  },

  hasPendingRecovery(): boolean {
    return hasPendingRollbackRecovery();
  },

  getPendingRecoveryKeys(): string[] {
    return getPendingRollbackKeys();
  },

  retryPendingRecovery(): SafeWriteResult {
    const res = retryPendingRollbackRecovery();
    notifyListeners();
    return res;
  },

  isLocksIndexCorrupted(): boolean {
    return isLocksIndexCorrupted();
  },

  // ANATOMY STATS RESET
  getAnatomyResetTime(): number {
    const raw = safeGetRaw(STORAGE_KEYS.ANATOMY_RESET_TIME);
    if (raw === null || raw === '') return 0;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      flagCorruptedKey(STORAGE_KEYS.ANATOMY_RESET_TIME, raw);
      return 0;
    }
    return num;
  },

  resetMuscleStats(): SafeWriteResult {
    const timestamp = Date.now();
    const res = safeSetItem(STORAGE_KEYS.ANATOMY_RESET_TIME, timestamp.toString());
    notifyListeners();
    return res;
  },

  clearAnatomyReset(): SafeWriteResult {
    const res = safeRemoveItem(STORAGE_KEYS.ANATOMY_RESET_TIME);
    notifyListeners();
    return res;
  },

  resetAllData(): SafeWriteResult {
    let firstError: string | null = null;
    Object.values(STORAGE_KEYS).forEach((key) => {
      const rmRes = safeRemoveItem(key, { allowRemoveCorrupted: true });
      if (!rmRes.ok && !firstError) {
        firstError = rmRes.error;
      }
      const lockRes = clearCorruptedLock(key);
      if (!lockRes.ok && !firstError) {
        firstError = lockRes.error;
      }
    });
    const idxQuarantineRes = safeRemoveItem(`${CORRUPTED_RAW_PREFIX}${CORRUPTED_LOCKS_INDEX_KEY}`, {
      allowRemoveCorrupted: true,
    });
    if (!idxQuarantineRes.ok && !firstError) {
      firstError = idxQuarantineRes.error;
    }
    const idxRes = safeRemoveItem(CORRUPTED_LOCKS_INDEX_KEY, { allowRemoveCorrupted: true });
    if (!idxRes.ok && !firstError) {
      firstError = idxRes.error;
    }
    const pendRes = safeRemoveItem(PENDING_ROLLBACK_KEY, { allowRemoveCorrupted: true });
    if (!pendRes.ok && !firstError) {
      firstError = pendRes.error;
    }
    clearPendingRollbackState();
    if (!firstError) {
      clearLastWriteError();
    }
    notifyListeners();
    return firstError ? { ok: false, error: firstError } : { ok: true, error: null };
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
      customExercises: this.getCustomExercises(),
      settings: this.getSettings(),
      wellbeingCheckins: this.getWellbeingCheckins(),
      bodyMeasurements: this.getBodyMeasurements(),
      exportedAt: new Date().toISOString(),
      version: 6,
    };
    return JSON.stringify(data, null, 2);
  },

  importBackupJsonWithResult(jsonString: string): SafeWriteResult {
    if (hasPendingRollbackRecovery()) {
      const pendingKeys = getPendingRollbackKeys();
      const keysSuffix = pendingKeys.length > 0 ? ` (${pendingKeys.join(', ')})` : '';
      const msg = `Невозможно выполнить импорт: имеется незавершённое восстановление предыдущей операции${keysSuffix}. Сначала завершите восстановление предыдущих данных.`;
      setLastWriteError(msg);
      console.error('Import rejected due to pending rollback recovery:', msg);
      notifyListeners();
      return { ok: false, error: msg };
    }

    const res = validateAndMigrateBackup(jsonString);
    if (!res.valid || !res.normalized) {
      const msg = res.error || 'Некорректный формат резервной копии.';
      setLastWriteError(msg);
      console.error('Import validation failed:', msg);
      notifyListeners();
      return { ok: false, error: msg };
    }

    const n = res.normalized;
    const entries: Array<[string, string]> = [];
    const collect = (key: string, val: unknown) => {
      if (val !== undefined) {
        entries.push([key, JSON.stringify(val)]);
      }
    };

    collect(STORAGE_KEYS.PROFILE, n.profile);
    collect(STORAGE_KEYS.PROGRAMS, n.programs);
    collect(STORAGE_KEYS.WORKOUTS, n.workouts);
    collect(STORAGE_KEYS.SPORTS_SESSIONS, n.sports);
    collect(STORAGE_KEYS.WEEKLY_SCHEDULE, n.weeklySchedule);
    collect(STORAGE_KEYS.CUSTOM_ACTIVITY, n.activity);
    collect(STORAGE_KEYS.EQUIPMENT, n.equipment);
    collect(STORAGE_KEYS.FITNESS_PARAMS, n.fitnessParameters);
    collect(STORAGE_KEYS.FAVORITES, n.favoriteExerciseIds);
    collect(STORAGE_KEYS.CUSTOM_EXERCISES, n.customExercises);
    collect(STORAGE_KEYS.SETTINGS, n.settings);
    collect(STORAGE_KEYS.WELLBEING_CHECKINS, n.wellbeingCheckins);
    collect(STORAGE_KEYS.BODY_MEASUREMENTS, n.bodyMeasurements);

    if (entries.length === 0) {
      const emptyMsg = 'Резервная копия не содержит ни одного раздела для импорта.';
      setLastWriteError(emptyMsg);
      notifyListeners();
      return { ok: false, error: emptyMsg };
    }

    // Снимаем полный снимок затрагиваемых ключей и карантинных замков до начала записи
    const importedKeys = entries.map(([k]) => k);
    const snapshots = captureStorageKeysSnapshot(importedKeys);
    // Карантин и блокировки снимаем ТОЛЬКО после подтверждённой записи ВСЕХ разделов
    const writeOpts = { allowOverwriteCorrupted: true, deferLockClear: true };

    for (const [key, serialized] of entries) {
      const w = safeSetItem(key, serialized, writeOpts);
      if (!w.ok) {
        const failedError =
          w.error || 'Ошибка записи при импорте резервной копии. Выполнен откат к исходным данным.';
        const rollbackRes = restoreStorageKeysSnapshotDetailed(snapshots);
        const failedSummary = rollbackRes.failedDetails
          .map((d) => `${d.key} [${d.stage}]`)
          .join(', ');
        const fullErr = rollbackRes.ok
          ? `${failedError} Исходные данные полностью сохранены (откат выполнен).`
          : `${failedError} Частичный откат: не удалось полностью восстановить (${failedSummary}). Данные для повторного восстановления сохранены.`;
        setLastWriteError(fullErr);
        notifyListeners();
        return { ok: false, error: fullErr };
      }
    }

    const clearRes = confirmClearedLocksAfterRecovery(importedKeys);
    if (!clearRes.ok) {
      notifyListeners();
      return clearRes;
    }

    clearPendingRollbackState();
    clearLastWriteError();
    notifyListeners();
    return { ok: true, error: null };
  },

  importBackupJson(jsonString: string): boolean {
    return this.importBackupJsonWithResult(jsonString).ok;
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
