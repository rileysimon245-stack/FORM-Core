import { StorageService } from './storage';
import { formatLocalIsoDate } from '../training-core/dateUtils';
import type { MuscleGroup, WellbeingCheckin } from '../types/workout';
import {
  ExerciseSafetyCandidate,
  ExerciseSafetyDecision,
  ExerciseWeightCheckResult,
  SafetyStorageSnapshot,
  SafetyUserContext,
  StalePainArea,
  WellbeingFreshnessStatus,
  WorkoutLaunchSafetyEvaluation,
  buildSafetyContextFromData,
  evaluateExerciseSafety,
  evaluateWeightIncreaseSafetyFromData,
  evaluateWorkoutLaunchSafetyWithData,
} from '../training-core/safetyGuard';

export type { ExerciseWeightCheckResult, StalePainArea, WellbeingFreshnessStatus };

function getCurrentSafetyStorageSnapshot(): SafetyStorageSnapshot {
  return {
    profile: StorageService.getProfile(),
    userParameters: StorageService.getUserParameters(),
    checkins: StorageService.getWellbeingCheckins(),
    sessions: StorageService.getWorkoutSessions(),
    activeDraft: StorageService.getActiveDraft(),
    customExercises: StorageService.getCustomExercises(),
  };
}

export function getCurrentSafetyContext(now: Date = new Date()): SafetyUserContext {
  return buildSafetyContextFromData(getCurrentSafetyStorageSnapshot(), now);
}

export function checkWorkoutLaunchSafety<T extends ExerciseSafetyCandidate>(
  exercises: T[],
  now: Date = new Date()
): WorkoutLaunchSafetyEvaluation {
  return evaluateWorkoutLaunchSafetyWithData(
    exercises,
    getCurrentSafetyStorageSnapshot(),
    now
  );
}

export function checkAddExerciseSafety(
  exercise: ExerciseSafetyCandidate,
  now: Date = new Date()
): ExerciseSafetyDecision {
  const snapshot = getCurrentSafetyStorageSnapshot();
  const context = buildSafetyContextFromData(snapshot, now);
  return evaluateExerciseSafety(exercise, context);
}

export function checkWeightIncreaseSafety(
  exercise: ExerciseSafetyCandidate,
  proposedWeightKg: number,
  currentSetWeightKg?: number,
  now: Date = new Date()
): ExerciseWeightCheckResult {
  return evaluateWeightIncreaseSafetyFromData(
    exercise,
    proposedWeightKg,
    currentSetWeightKg,
    getCurrentSafetyStorageSnapshot(),
    now
  );
}

export function confirmWellbeingPainArea(
  area: StalePainArea,
  nextLevel: number,
  now: Date = new Date()
) {
  const safeLevel =
    typeof nextLevel === 'number' && Number.isFinite(nextLevel) && nextLevel >= 0
      ? nextLevel
      : area.level;
  const todayIso = formatLocalIsoDate(now);
  const checkin: WellbeingCheckin = {
    id: `wb_confirm_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    date: todayIso,
    createdAt: now.getTime(),
    ...(area.areaType === 'general'
      ? { jointPain: safeLevel }
      : {
          painByMuscle: {
            [area.rawKey]: safeLevel,
          } as Partial<Record<MuscleGroup, number>>,
        }),
  };
  const writeResult = StorageService.saveWellbeingCheckin(checkin);
  return {
    writeResult,
    context: getCurrentSafetyContext(now),
  };
}
