import { StorageService } from './storage';
import {
  ExerciseSafetyCandidate,
  ExerciseSafetyDecision,
  ExerciseWeightCheckResult,
  SafetyStorageSnapshot,
  SafetyUserContext,
  WorkoutLaunchSafetyEvaluation,
  buildSafetyContextFromData,
  evaluateExerciseSafety,
  evaluateWeightIncreaseSafetyFromData,
  evaluateWorkoutLaunchSafetyWithData,
} from '../training-core/safetyGuard';

export type { ExerciseWeightCheckResult };

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
