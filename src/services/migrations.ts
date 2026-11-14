/**
 * ============================================================================
 * FORM Core — Безопасное хранение и неразрушающая миграция данных (localStorage)
 * ============================================================================
 * Гарантирует:
 * 1. Существующие данные пользователя никогда не удаляются автоматически.
 * 2. Перед обновлением схемы создаётся снимок резервной копии (form_backup_pre_v11).
 * 3. Повреждённый JSON не затирается молча, а откладывается в карантин.
 * 4. Ошибки переполнения памяти (QuotaExceededError) перехватываются безопасно.
 */

import {
  MuscleGroup,
  WorkoutProgram,
  WorkoutSession,
  SportSession,
  AppSettings,
  DEFAULT_APP_SETTINGS,
} from '../types/workout';
import { FullExerciseItem } from '../data/exerciseTypes';
import { normalizeMuscleKeyPure, normalizeMuscleListPure } from '../training-core/muscles';
import { findExerciseInUnifiedCatalog } from '../training-core/catalog';

export const CURRENT_SCHEMA_VERSION = 11;
export const SCHEMA_VERSION_KEY = 'form_schema_version_v1';
export const PRE_MIGRATION_BACKUP_KEY = 'form_backup_pre_v11';
export const CORRUPTED_RAW_PREFIX = 'form_corrupted_raw_';
export const CORRUPTED_LOCKS_INDEX_KEY = 'form_corrupted_locks_v1';
export const PENDING_ROLLBACK_KEY = 'form_pending_rollback_v1';

const corruptedKeysSet = new Set<string>();
let locksIndexCorruptedInSession = false;
let lastWriteError: string | null = null;
let migrationDoneInSession = false;

export interface SafeWriteResult {
  ok: boolean;
  error: string | null;
}

export interface SafeSetOptions {
  allowOverwriteCorrupted?: boolean;
  deferLockClear?: boolean;
}

export interface SafeRemoveOptions {
  allowRemoveCorrupted?: boolean;
}

type KeyExpectedFormat = 'array' | 'object' | 'number' | 'direction' | 'json_any';

const KNOWN_KEY_FORMATS: Record<string, KeyExpectedFormat> = {
  form_user_profile: 'object',
  form_workout_programs: 'array',
  form_workout_sessions: 'array',
  form_sports_sessions_v1: 'array',
  form_weekly_schedule_v1: 'array',
  form_activity_days: 'object',
  form_active_workout_draft_v2: 'object',
  form_user_equipment_v1: 'array',
  form_fitness_parameters_v1: 'object',
  form_favorite_exercises_v1: 'array',
  form_custom_exercises_v1: 'array',
  form_app_settings_v1: 'object',
  form_anatomy_reset_time: 'number',
  form_active_direction_v1: 'direction',
  form_wellbeing_checkins_v1: 'array',
  form_body_measurements_v1: 'array',
  form_anatomy_custom_mapping: 'object',
  form_reduced_motion: 'json_any',
  [SCHEMA_VERSION_KEY]: 'number',
  [PRE_MIGRATION_BACKUP_KEY]: 'object',
};

export function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isQuotaError(err: any): boolean {
  return Boolean(
    err &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014)
  );
}

function formatWriteError(err: any, fallbackPrefix: string): string {
  if (isQuotaError(err)) {
    return 'Недостаточно памяти устройства (QuotaExceededError) при сохранении данных.';
  }
  return `${fallbackPrefix}: ${err?.message || 'неизвестная ошибка'}`;
}

function isMetadataKey(key: string): boolean {
  return (
    key === CORRUPTED_LOCKS_INDEX_KEY ||
    key === PENDING_ROLLBACK_KEY ||
    key.startsWith(CORRUPTED_RAW_PREFIX)
  );
}

function inspectPersistedLocksIndex(storage: Storage | null): {
  keys: string[];
  corrupted: boolean;
  raw: string | null;
} {
  if (!storage) return { keys: [], corrupted: false, raw: null };

  let raw: string | null = null;
  try {
    raw = storage.getItem(CORRUPTED_LOCKS_INDEX_KEY);
  } catch {
    locksIndexCorruptedInSession = true;
    corruptedKeysSet.add(CORRUPTED_LOCKS_INDEX_KEY);
    return { keys: [], corrupted: true, raw: null };
  }

  if (raw === null || raw === '') {
    return { keys: [], corrupted: false, raw };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Индекс блокировок не является массивом');
    }
    const validStrings = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
    const hasInvalidItems = validStrings.length !== parsed.length;
    if (hasInvalidItems) {
      locksIndexCorruptedInSession = true;
      corruptedKeysSet.add(CORRUPTED_LOCKS_INDEX_KEY);
      if (!lastWriteError) {
        lastWriteError =
          'Повреждён индекс блокировок (form_corrupted_locks_v1): обнаружены некорректные элементы.';
      }
    }
    return {
      keys: Array.from(new Set(validStrings)),
      corrupted: hasInvalidItems,
      raw,
    };
  } catch {
    locksIndexCorruptedInSession = true;
    corruptedKeysSet.add(CORRUPTED_LOCKS_INDEX_KEY);
    const salvaged = raw.match(/form_[a-zA-Z0-9_]+/g) || [];
    try {
      const qKey = `${CORRUPTED_RAW_PREFIX}${CORRUPTED_LOCKS_INDEX_KEY}`;
      if (!storage.getItem(qKey)) {
        storage.setItem(qKey, raw);
      }
    } catch {
      // ignore quarantine backup failure on corrupted index
    }
    if (!lastWriteError) {
      lastWriteError =
        'Повреждён индекс блокировок (form_corrupted_locks_v1). Запись заблокирована для защиты данных от перезаписи.';
    }
    return {
      keys: Array.from(new Set(salvaged.filter((k) => k !== CORRUPTED_LOCKS_INDEX_KEY))),
      corrupted: true,
      raw,
    };
  }
}

export function isLocksIndexCorrupted(): boolean {
  const storage = getStorage();
  const info = inspectPersistedLocksIndex(storage);
  return (
    locksIndexCorruptedInSession ||
    info.corrupted ||
    corruptedKeysSet.has(CORRUPTED_LOCKS_INDEX_KEY)
  );
}

function readPersistedLocksIndex(storage: Storage | null): string[] {
  return inspectPersistedLocksIndex(storage).keys;
}

function writePersistedLocksIndex(storage: Storage | null, keys: string[]): boolean {
  if (!storage) return false;
  try {
    const unique = Array.from(new Set(keys.filter((k) => typeof k === 'string' && k.length > 0)));
    if (unique.length === 0) {
      storage.removeItem(CORRUPTED_LOCKS_INDEX_KEY);
    } else {
      storage.setItem(CORRUPTED_LOCKS_INDEX_KEY, JSON.stringify(unique));
    }
    return true;
  } catch {
    return false;
  }
}

function persistCorruptedLock(storage: Storage | null, key: string): boolean {
  corruptedKeysSet.add(key);
  const info = inspectPersistedLocksIndex(storage);
  if (info.corrupted) {
    // Не перезаписываем повреждённый индекс блокировок, чтобы не потерять его содержимое
    return false;
  }
  if (info.keys.includes(key)) return true;
  return writePersistedLocksIndex(storage, [...info.keys, key]);
}

function unpersistCorruptedLock(storage: Storage | null, key: string): boolean {
  const info = inspectPersistedLocksIndex(storage);
  if (info.corrupted) {
    return false;
  }
  if (!info.keys.includes(key)) {
    corruptedKeysSet.delete(key);
    return true;
  }
  const ok = writePersistedLocksIndex(
    storage,
    info.keys.filter((k) => k !== key)
  );
  if (ok) {
    corruptedKeysSet.delete(key);
  }
  return ok;
}

function isRawValidForExpectedFormat(raw: string, expected: KeyExpectedFormat): boolean {
  if (expected === 'direction') {
    return raw === 'programs' || raw === 'mobility';
  }
  if (expected === 'number') {
    if (!raw.trim()) return false;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0;
  }
  try {
    const parsed = JSON.parse(raw);
    if (expected === 'array') return Array.isArray(parsed);
    if (expected === 'object') {
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    }
    return true;
  } catch {
    return false;
  }
}

function inferExpectedFormatForWrite(key: string, nextValue?: string): KeyExpectedFormat | null {
  if (Object.prototype.hasOwnProperty.call(KNOWN_KEY_FORMATS, key)) {
    return KNOWN_KEY_FORMATS[key];
  }
  if (typeof nextValue === 'string') {
    const trimmed = nextValue.trim();
    if (trimmed.startsWith('[')) return 'array';
    if (trimmed.startsWith('{')) return 'object';
    if (trimmed === 'true' || trimmed === 'false') return 'json_any';
  }
  return null;
}

function quarantineAndLockCorruptedKey(
  storage: Storage | null,
  key: string,
  raw: string
): { lockIndexOk: boolean; quarantineOk: boolean } {
  const lockIndexOk = persistCorruptedLock(storage, key);
  let quarantineOk = true;
  let quarantineErrMsg: string | null = null;

  if (storage) {
    try {
      const qKey = `${CORRUPTED_RAW_PREFIX}${key}`;
      if (!storage.getItem(qKey)) {
        storage.setItem(qKey, raw);
      }
    } catch (quarantineErr: any) {
      quarantineOk = false;
      quarantineErrMsg = isQuotaError(quarantineErr)
        ? `Не удалось сохранить полную карантинную копию для "${key}": недостаточно памяти устройства (QuotaExceededError). Ключ заблокирован от перезаписи.`
        : `Не удалось сохранить карантинную копию для "${key}": ${quarantineErr?.message || 'ошибка записи'}. Ключ заблокирован от перезаписи.`;
    }
  } else {
    quarantineOk = false;
    quarantineErrMsg = `Хранилище недоступно при создании карантина для "${key}".`;
  }

  if (!quarantineOk && quarantineErrMsg) {
    lastWriteError = lockIndexOk
      ? quarantineErrMsg
      : `${quarantineErrMsg} (индекс блокировки также не записан из-за переполнения памяти)`;
    console.error('[FORM Storage]', lastWriteError, key);
  } else if (!lockIndexOk) {
    const indexCorrupted = isLocksIndexCorrupted();
    lastWriteError = indexCorrupted
      ? `Индекс блокировок "${CORRUPTED_LOCKS_INDEX_KEY}" повреждён; ключ "${key}" заблокирован только в памяти/карантине.`
      : `Не удалось записать индекс блокировок "${CORRUPTED_LOCKS_INDEX_KEY}" для "${key}". Ключ заблокирован в памяти.`;
    console.error('[FORM Storage]', lastWriteError, key);
  }

  return { lockIndexOk, quarantineOk };
}

function detectAndLockExistingCorruption(
  storage: Storage,
  key: string,
  nextValue?: string
): boolean {
  if (isMetadataKey(key)) return false;

  const fmt = inferExpectedFormatForWrite(key, nextValue);
  if (!fmt) return false;

  let existingRaw: string | null = null;
  try {
    existingRaw = storage.getItem(key);
  } catch {
    corruptedKeysSet.add(key);
    lastWriteError = `Не удалось прочитать ключ "${key}" перед записью: ключ заблокирован.`;
    return true;
  }

  if (existingRaw === null || existingRaw === '') {
    return false;
  }

  if (isRawValidForExpectedFormat(existingRaw, fmt)) {
    return false;
  }

  quarantineAndLockCorruptedKey(storage, key, existingRaw);
  return true;
}

export function flagCorruptedKey(key: string, raw: string): void {
  const storage = getStorage();
  quarantineAndLockCorruptedKey(storage, key, raw);
}

export function safeGetRaw(key: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function isKeyLockedByCorruption(key: string): boolean {
  if (corruptedKeysSet.has(key)) return true;
  const storage = getStorage();
  if (!storage) return false;
  try {
    if (storage.getItem(`${CORRUPTED_RAW_PREFIX}${key}`) !== null) return true;
    const info = inspectPersistedLocksIndex(storage);
    if (info.corrupted) {
      // Если сам индекс блокировок повреждён, мы не можем гарантировать, что ключ не был заблокирован
      return true;
    }
    return info.keys.includes(key);
  } catch {
    return true;
  }
}

export function clearCorruptedLock(key: string): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    corruptedKeysSet.delete(key);
    return { ok: true, error: null };
  }

  try {
    storage.removeItem(`${CORRUPTED_RAW_PREFIX}${key}`);
  } catch (err: any) {
    corruptedKeysSet.add(key);
    const msg = formatWriteError(err, `Не удалось удалить карантинную копию для "${key}"`);
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  const unpersisted = unpersistCorruptedLock(storage, key);
  if (!unpersisted) {
    corruptedKeysSet.add(key);
    const msg = `Не удалось обновить индекс блокировок "${CORRUPTED_LOCKS_INDEX_KEY}" при снятии блокировки "${key}".`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  corruptedKeysSet.delete(key);
  return { ok: true, error: null };
}

export function getCorruptedKeys(): string[] {
  const storage = getStorage();
  const keys = new Set<string>(corruptedKeysSet);
  if (storage) {
    const info = inspectPersistedLocksIndex(storage);
    for (const k of info.keys) {
      keys.add(k);
    }
    if (info.corrupted || locksIndexCorruptedInSession) {
      keys.add(CORRUPTED_LOCKS_INDEX_KEY);
    }
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(CORRUPTED_RAW_PREFIX)) {
          const origKey = k.slice(CORRUPTED_RAW_PREFIX.length);
          if (origKey) keys.add(origKey);
        }
      }
    } catch {
      // ignore storage inspection error
    }
  }
  return Array.from(keys);
}

export function getLastWriteError(): string | null {
  return lastWriteError;
}

export function setLastWriteError(error: string | null): void {
  lastWriteError = error;
}

export function clearLastWriteError(): void {
  lastWriteError = null;
}

function confirmSingleKeyLockCleared(storage: Storage, key: string): SafeWriteResult {
  try {
    storage.removeItem(`${CORRUPTED_RAW_PREFIX}${key}`);
  } catch (err: any) {
    corruptedKeysSet.add(key);
    const msg = formatWriteError(
      err,
      `Данные "${key}" записаны, но не удалось удалить карантинную копию`
    );
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  const unpersisted = unpersistCorruptedLock(storage, key);
  if (!unpersisted) {
    corruptedKeysSet.add(key);
    const msg = `Данные "${key}" записаны, но не удалось снять блокировку в индексе "${CORRUPTED_LOCKS_INDEX_KEY}".`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  corruptedKeysSet.delete(key);
  return { ok: true, error: null };
}

export function confirmClearedLocksAfterRecovery(keys: string[]): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
  }

  const clearedKeys: string[] = [];
  const failedKeys: string[] = [];

  for (const key of keys) {
    try {
      storage.removeItem(`${CORRUPTED_RAW_PREFIX}${key}`);
      clearedKeys.push(key);
    } catch {
      corruptedKeysSet.add(key);
      failedKeys.push(key);
    }
  }

  const info = inspectPersistedLocksIndex(storage);
  if (!info.corrupted) {
    const clearedSet = new Set(clearedKeys);
    const remaining = info.keys.filter((k) => !clearedSet.has(k));
    const idxOk = writePersistedLocksIndex(storage, remaining);
    if (!idxOk) {
      for (const k of clearedKeys) {
        if (info.keys.includes(k)) {
          corruptedKeysSet.add(k);
        }
      }
      const msg = `Данные импортированы, но не удалось обновить индекс блокировок "${CORRUPTED_LOCKS_INDEX_KEY}". Блокировка сохранена.`;
      lastWriteError = msg;
      return { ok: false, error: msg };
    }
    for (const k of clearedKeys) {
      corruptedKeysSet.delete(k);
    }
  } else {
    // Индекс блокировок был повреждён: проверяем, остались ли на диске другие повреждённые ключи или карантин
    let hasOtherCorruptedOnDisk = false;
    const clearedSet = new Set(clearedKeys);

    for (const knownKey of Object.keys(KNOWN_KEY_FORMATS)) {
      if (clearedSet.has(knownKey)) continue;
      if (detectAndLockExistingCorruption(storage, knownKey)) {
        hasOtherCorruptedOnDisk = true;
      }
    }

    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k || !k.startsWith(CORRUPTED_RAW_PREFIX)) continue;
        const target = k.slice(CORRUPTED_RAW_PREFIX.length);
        if (target && target !== CORRUPTED_LOCKS_INDEX_KEY && !clearedSet.has(target)) {
          hasOtherCorruptedOnDisk = true;
        }
      }
    } catch {
      hasOtherCorruptedOnDisk = true;
    }

    if (hasOtherCorruptedOnDisk) {
      const msg =
        'Разделы из копии записаны, но индекс блокировок form_corrupted_locks_v1 повреждён при наличии других невосстановленных ключей.';
      lastWriteError = msg;
      return { ok: false, error: msg };
    }

    try {
      storage.removeItem(`${CORRUPTED_RAW_PREFIX}${CORRUPTED_LOCKS_INDEX_KEY}`);
      storage.removeItem(CORRUPTED_LOCKS_INDEX_KEY);
      locksIndexCorruptedInSession = false;
      corruptedKeysSet.delete(CORRUPTED_LOCKS_INDEX_KEY);
      for (const k of clearedKeys) {
        corruptedKeysSet.delete(k);
      }
    } catch (err: any) {
      const msg = formatWriteError(
        err,
        `Данные записаны, но не удалось очистить повреждённый индекс "${CORRUPTED_LOCKS_INDEX_KEY}"`
      );
      lastWriteError = msg;
      return { ok: false, error: msg };
    }
  }

  if (failedKeys.length > 0) {
    const msg = `Данные записаны, но не удалось очистить карантин для: ${failedKeys.join(', ')}.`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  return { ok: true, error: null };
}

export function safeSetItem(
  key: string,
  value: string,
  options?: SafeSetOptions
): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    const msg = 'Локальное хранилище (localStorage) недоступно.';
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  if (!options?.allowOverwriteCorrupted) {
    if (isKeyLockedByCorruption(key)) {
      const msg = isLocksIndexCorrupted()
        ? `Запись в "${key}" заблокирована: повреждён индекс блокировок "${CORRUPTED_LOCKS_INDEX_KEY}". Сначала восстановите данные из резервной копии или сбросьте хранилище.`
        : `Запись в "${key}" заблокирована: обнаружены повреждённые исходные данные (карантин). Сначала восстановите из резервной копии или явно сбросьте данные.`;
      lastWriteError = msg;
      console.error('[FORM Storage]', msg, key);
      return { ok: false, error: msg };
    }

    if (detectAndLockExistingCorruption(storage, key, value)) {
      const prevErr = lastWriteError;
      const msg = prevErr
        ? `Запись в "${key}" заблокирована: существующие данные повреждены. ${prevErr}`
        : `Запись в "${key}" заблокирована: на диске обнаружены повреждённые данные (карантин).`;
      lastWriteError = msg;
      console.error('[FORM Storage]', msg, key);
      return { ok: false, error: msg };
    }
  }

  try {
    storage.setItem(key, value);
    if (options?.allowOverwriteCorrupted && !options?.deferLockClear) {
      const clearRes = confirmSingleKeyLockCleared(storage, key);
      if (!clearRes.ok) {
        return clearRes;
      }
    }
    if (!options?.deferLockClear) {
      lastWriteError = null;
    }
    return { ok: true, error: null };
  } catch (err: any) {
    const msg = formatWriteError(err, 'Ошибка записи в память устройства');
    lastWriteError = msg;
    console.error('[FORM Storage]', msg, key);
    return { ok: false, error: msg };
  }
}

export function safeRemoveItem(key: string, options?: SafeRemoveOptions): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
  }

  if (!options?.allowRemoveCorrupted && !isMetadataKey(key)) {
    if (isKeyLockedByCorruption(key) || detectAndLockExistingCorruption(storage, key)) {
      const msg = `Удаление "${key}" заблокировано: обнаружены повреждённые данные или блокировка карантина.`;
      lastWriteError = msg;
      return { ok: false, error: msg };
    }
  }

  try {
    storage.removeItem(key);
    return { ok: true, error: null };
  } catch (err: any) {
    const msg = formatWriteError(err, 'Ошибка удаления ключа из памяти устройства');
    lastWriteError = msg;
    return { ok: false, error: msg };
  }
}

export function safeGetJson<T>(
  key: string,
  fallback: T,
  options?: { expectArray?: boolean; expectObject?: boolean }
): T {
  const storage = getStorage();
  if (!storage) return fallback;

  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }

  if (raw === null || raw === '') return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (options?.expectArray && !Array.isArray(parsed)) {
      throw new Error('Ожидался массив JSON');
    }
    if (
      options?.expectObject &&
      (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    ) {
      throw new Error('Ожидался объект JSON');
    }
    return parsed as T;
  } catch {
    // 1. Фиксируем блокировку в памяти и в индексе (если индекс цел)
    // 2. Пытаемся сохранить сырую повреждённую строку в карантин без удаления исходного ключа
    quarantineAndLockCorruptedKey(storage, key, raw);
    return fallback;
  }
}

function normalizeWorkoutSessionsNonDestructive(sessions: any[]): {
  data: WorkoutSession[];
  changed: boolean;
} {
  let changed = false;
  const normalized: WorkoutSession[] = sessions
    .filter((s) => s && typeof s === 'object')
    .map((session) => {
      if (!Array.isArray(session.exercises)) return session;
      let exChanged = false;
      const newExercises = session.exercises.map((ex: any) => {
        if (!ex || typeof ex !== 'object') return ex;
        const catalogEntry = findExerciseInUnifiedCatalog(
          ex.exerciseId,
          ex.name,
          [],
          ex.targetMuscle
        );
        const rawPrimary = ex.targetMuscle || catalogEntry?.primaryMuscle;
        const normPrimary = normalizeMuscleKeyPure(rawPrimary) || ex.targetMuscle;

        const rawSecondaries =
          Array.isArray(ex.secondaryMuscles) && ex.secondaryMuscles.length > 0
            ? ex.secondaryMuscles
            : catalogEntry?.secondaryMuscles || [];
        const normSecondaries = normalizeMuscleListPure(rawSecondaries).filter(
          (m) => m !== normPrimary
        );

        const resolvedId =
          (!ex.exerciseId || /^ex_\d+$/.test(ex.exerciseId)) && catalogEntry
            ? catalogEntry.id
            : ex.exerciseId;

        if (
          normPrimary !== ex.targetMuscle ||
          resolvedId !== ex.exerciseId ||
          (Array.isArray(ex.secondaryMuscles)
            ? JSON.stringify(normSecondaries) !== JSON.stringify(ex.secondaryMuscles)
            : normSecondaries.length > 0)
        ) {
          exChanged = true;
          return {
            ...ex,
            ...(resolvedId ? { exerciseId: resolvedId } : {}),
            ...(normPrimary ? { targetMuscle: normPrimary } : {}),
            secondaryMuscles: normSecondaries,
          };
        }
        return ex;
      });

      if (exChanged) {
        changed = true;
        return { ...session, exercises: newExercises };
      }
      return session;
    });

  return { data: normalized, changed };
}

function normalizeProgramsNonDestructive(programs: any[]): {
  data: WorkoutProgram[];
  changed: boolean;
} {
  let changed = false;
  const normalized: WorkoutProgram[] = programs
    .filter((p) => p && typeof p === 'object')
    .map((prog) => {
      let progChanged = false;
      const workouts = Array.isArray(prog.workouts)
        ? prog.workouts.map((day: any) => {
            if (!day || typeof day !== 'object') return day;
            const normDayGroups = Array.isArray(day.targetMuscleGroups)
              ? normalizeMuscleListPure(day.targetMuscleGroups)
              : day.targetMuscleGroups;

            let dayChanged =
              Array.isArray(day.targetMuscleGroups) &&
              JSON.stringify(normDayGroups) !== JSON.stringify(day.targetMuscleGroups);

            const exercises = Array.isArray(day.exercises)
              ? day.exercises.map((ex: any) => {
                  if (!ex || typeof ex !== 'object') return ex;
                  const catalogEntry = findExerciseInUnifiedCatalog(
                    ex.exerciseId,
                    ex.name,
                    [],
                    ex.targetMuscle
                  );
                  const normPrimary =
                    normalizeMuscleKeyPure(ex.targetMuscle || catalogEntry?.primaryMuscle) ||
                    ex.targetMuscle;
                  const rawSec =
                    Array.isArray(ex.secondaryMuscles) && ex.secondaryMuscles.length > 0
                      ? ex.secondaryMuscles
                      : catalogEntry?.secondaryMuscles || [];
                  const normSec = normalizeMuscleListPure(rawSec).filter(
                    (m) => m !== normPrimary
                  );

                  if (
                    normPrimary !== ex.targetMuscle ||
                    JSON.stringify(normSec) !== JSON.stringify(ex.secondaryMuscles || [])
                  ) {
                    dayChanged = true;
                    return {
                      ...ex,
                      ...(normPrimary ? { targetMuscle: normPrimary } : {}),
                      secondaryMuscles: normSec,
                    };
                  }
                  return ex;
                })
              : day.exercises;

            if (dayChanged) {
              progChanged = true;
              return {
                ...day,
                targetMuscleGroups: normDayGroups,
                exercises,
              };
            }
            return day;
          })
        : prog.workouts;

      if (progChanged) {
        changed = true;
        return { ...prog, workouts };
      }
      return prog;
    });

  return { data: normalized, changed };
}

export interface MigrationKeys {
  PROFILE: string;
  PROGRAMS: string;
  WORKOUTS: string;
  SPORTS_SESSIONS: string;
  WEEKLY_SCHEDULE: string;
  CUSTOM_ACTIVITY: string;
  EQUIPMENT: string;
  FITNESS_PARAMS: string;
  CUSTOM_EXERCISES?: string;
}

export interface KeyBackupSnapshot {
  key: string;
  rawValue: string | null;
  quarantineRawValue: string | null;
  wasLockedInMemory: boolean;
  wasLockedInIndex: boolean;
}

export function captureStorageKeysSnapshot(keys: string[]): KeyBackupSnapshot[] {
  const storage = getStorage();
  const persistedLocks = readPersistedLocksIndex(storage);
  return keys.map((key) => {
    let rawValue: string | null = null;
    let quarantineRawValue: string | null = null;
    if (storage) {
      try {
        rawValue = storage.getItem(key);
        quarantineRawValue = storage.getItem(`${CORRUPTED_RAW_PREFIX}${key}`);
      } catch {
        // ignore read error
      }
    }
    return {
      key,
      rawValue,
      quarantineRawValue,
      wasLockedInMemory: corruptedKeysSet.has(key),
      wasLockedInIndex: persistedLocks.includes(key),
    };
  });
}

export interface RollbackFailureDetail {
  key: string;
  stage:
    | 'remove_new_key'
    | 'remove_unused_quarantine'
    | 'restore_value'
    | 'restore_quarantine'
    | 'restore_lock_index'
    | 'clear_lock_index';
  error: string;
}

export interface DetailedRollbackResult {
  ok: boolean;
  restoredKeys: string[];
  failedDetails: RollbackFailureDetail[];
}

let pendingRollbackSnapshots: KeyBackupSnapshot[] | null = null;
let pendingRollbackFailedDetails: RollbackFailureDetail[] = [];

function loadPendingRollbackFromStorage(storage: Storage | null): {
  snapshots: KeyBackupSnapshot[];
  failedDetails: RollbackFailureDetail[];
} | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_ROLLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.snapshots)) {
      return {
        snapshots: parsed.snapshots,
        failedDetails: Array.isArray(parsed.failedDetails) ? parsed.failedDetails : [],
      };
    }
  } catch {
    // ignore malformed pending rollback
  }
  return null;
}

function savePendingRollbackState(
  storage: Storage | null,
  snapshots: KeyBackupSnapshot[],
  failedDetails: RollbackFailureDetail[]
): void {
  pendingRollbackSnapshots = snapshots.map((s) => ({ ...s }));
  pendingRollbackFailedDetails = [...failedDetails];
  if (!storage) return;
  try {
    storage.setItem(
      PENDING_ROLLBACK_KEY,
      JSON.stringify({
        createdAt: new Date().toISOString(),
        snapshots: pendingRollbackSnapshots,
        failedDetails: pendingRollbackFailedDetails,
      })
    );
  } catch {
    // При переполнении памяти состояние для повторного восстановления сохраняется в ОЗУ текущей сессии
  }
}

export function clearPendingRollbackState(): void {
  pendingRollbackSnapshots = null;
  pendingRollbackFailedDetails = [];
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(PENDING_ROLLBACK_KEY);
  } catch {
    // ignore cleanup error
  }
}

export function hasPendingRollbackRecovery(): boolean {
  if (pendingRollbackSnapshots && pendingRollbackSnapshots.length > 0) return true;
  const storage = getStorage();
  return loadPendingRollbackFromStorage(storage) !== null;
}

export function getPendingRollbackKeys(): string[] {
  if (pendingRollbackFailedDetails.length > 0) {
    return Array.from(new Set(pendingRollbackFailedDetails.map((d) => d.key)));
  }
  if (pendingRollbackSnapshots && pendingRollbackSnapshots.length > 0) {
    return pendingRollbackSnapshots.map((s) => s.key);
  }
  const storage = getStorage();
  const stored = loadPendingRollbackFromStorage(storage);
  if (!stored) return [];
  if (stored.failedDetails.length > 0) {
    return Array.from(new Set(stored.failedDetails.map((d) => d.key)));
  }
  return stored.snapshots.map((s) => s.key);
}

export function restoreStorageKeysSnapshotDetailed(
  snapshots: KeyBackupSnapshot[]
): DetailedRollbackResult {
  const storage = getStorage();
  if (!storage) {
    const failedDetails: RollbackFailureDetail[] = snapshots.map((s) => ({
      key: s.key,
      stage: 'restore_value',
      error: 'Локальное хранилище (localStorage) недоступно.',
    }));
    savePendingRollbackState(null, snapshots, failedDetails);
    return { ok: false, restoredKeys: [], failedDetails };
  }

  const failedDetails: RollbackFailureDetail[] = [];
  const failedKeysSet = new Set<string>();

  const recordFailure = (
    key: string,
    stage: RollbackFailureDetail['stage'],
    err: any,
    fallbackMsg: string
  ) => {
    failedKeysSet.add(key);
    failedDetails.push({
      key,
      stage,
      error: typeof err === 'string' ? err : formatWriteError(err, fallbackMsg),
    });
  };

  // Шаг 1. Безопасно удаляем ТОЛЬКО те ключи и карантин, которых НЕ БЫЛО до операции (rawValue === null),
  // чтобы освободить место без риска удалить существовавшие ранее исходные данные.
  for (const snap of snapshots) {
    if (snap.rawValue === null) {
      try {
        const currentVal = storage.getItem(snap.key);
        if (currentVal !== null) {
          storage.removeItem(snap.key);
        }
      } catch (err) {
        recordFailure(
          snap.key,
          'remove_new_key',
          err,
          `Не удалось удалить новый ключ "${snap.key}" при откате`
        );
      }
    }

    if (snap.quarantineRawValue === null) {
      try {
        const qKey = `${CORRUPTED_RAW_PREFIX}${snap.key}`;
        if (storage.getItem(qKey) !== null) {
          storage.removeItem(qKey);
        }
      } catch (err) {
        recordFailure(
          snap.key,
          'remove_unused_quarantine',
          err,
          `Не удалось удалить лишний карантин для "${snap.key}" при откате`
        );
      }
    }
  }

  // Шаг 2. Восстанавливаем исходные значения, карантинные копии, замки в памяти и индекс блокировок
  // максимально независимо друг от друга, проверяя результат каждой операции.
  for (const snap of snapshots) {
    // 2a. Блокировку в памяти восстанавливаем всегда независимо от ошибок записи карантина или диска
    if (snap.wasLockedInMemory) {
      corruptedKeysSet.add(snap.key);
    } else {
      corruptedKeysSet.delete(snap.key);
    }

    // 2b. Восстановление исходного значения (если ключ существовал до импорта — НИКОГДА не удаляем его предварительно)
    if (snap.rawValue !== null) {
      try {
        const currentVal = storage.getItem(snap.key);
        if (currentVal !== snap.rawValue) {
          storage.setItem(snap.key, snap.rawValue);
        }
      } catch (err) {
        recordFailure(
          snap.key,
          'restore_value',
          err,
          `Не удалось восстановить исходное значение "${snap.key}"`
        );
      }
    }

    // 2c. Восстановление сырой карантинной копии (независимо от locksIndex и памяти)
    if (snap.quarantineRawValue !== null) {
      try {
        const qKey = `${CORRUPTED_RAW_PREFIX}${snap.key}`;
        const currentQ = storage.getItem(qKey);
        if (currentQ !== snap.quarantineRawValue) {
          storage.setItem(qKey, snap.quarantineRawValue);
        }
      } catch (err) {
        recordFailure(
          snap.key,
          'restore_quarantine',
          err,
          `Не удалось восстановить карантинную копию "${snap.key}"`
        );
      }
    }

    // 2d. Восстановление персистентного индекса блокировок с проверкой результата persistCorruptedLock
    if (snap.wasLockedInIndex) {
      const persistedOk = persistCorruptedLock(storage, snap.key);
      if (!persistedOk) {
        recordFailure(
          snap.key,
          'restore_lock_index',
          `Не удалось восстановить блокировку "${snap.key}" в индексе ${CORRUPTED_LOCKS_INDEX_KEY}.`,
          'Ошибка восстановления индекса блокировок'
        );
      }
    } else {
      const idxInfo = inspectPersistedLocksIndex(storage);
      if (idxInfo.keys.includes(snap.key)) {
        const clearedOk = unpersistCorruptedLock(storage, snap.key);
        if (!clearedOk) {
          recordFailure(
            snap.key,
            'clear_lock_index',
            `Не удалось очистить лишнюю блокировку "${snap.key}" в индексе ${CORRUPTED_LOCKS_INDEX_KEY}.`,
            'Ошибка обновления индекса блокировок'
          );
        }
      }
    }
  }

  const restoredKeys = snapshots
    .map((s) => s.key)
    .filter((k) => !failedKeysSet.has(k));
  const ok = failedDetails.length === 0;

  if (!ok) {
    savePendingRollbackState(storage, snapshots, failedDetails);
  } else {
    clearPendingRollbackState();
  }

  return {
    ok,
    restoredKeys,
    failedDetails,
  };
}

export function restoreStorageKeysSnapshot(snapshots: KeyBackupSnapshot[]): boolean {
  return restoreStorageKeysSnapshotDetailed(snapshots).ok;
}

export function retryPendingRollbackRecovery(): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
  }

  let snapshotsToRestore = pendingRollbackSnapshots;
  if (!snapshotsToRestore || snapshotsToRestore.length === 0) {
    const stored = loadPendingRollbackFromStorage(storage);
    snapshotsToRestore = stored?.snapshots || null;
  }

  if (!snapshotsToRestore || snapshotsToRestore.length === 0) {
    clearPendingRollbackState();
    return { ok: true, error: null };
  }

  const res = restoreStorageKeysSnapshotDetailed(snapshotsToRestore);
  if (res.ok) {
    lastWriteError = null;
    return { ok: true, error: null };
  }

  const summary = res.failedDetails.map((d) => `${d.key} (${d.stage})`).join(', ');
  const errMsg = `Повторное восстановление выполнено частично. Остались ошибки для: ${summary}.`;
  lastWriteError = errMsg;
  return { ok: false, error: errMsg };
}

/**
 * Неразрушающая миграция схемы до CURRENT_SCHEMA_VERSION.
 * Работает один раз на версию схемы и никогда не стирает пользовательские записи.
 */
export function runSafeMigrations(keys: MigrationKeys): void {
  if (migrationDoneInSession) return;
  const storage = getStorage();
  if (!storage) {
    migrationDoneInSession = true;
    return;
  }

  try {
    const rawVer = storage.getItem(SCHEMA_VERSION_KEY);
    const currentVer = rawVer ? Number(rawVer) : 0;
    if (Number.isFinite(currentVer) && currentVer >= CURRENT_SCHEMA_VERSION) {
      migrationDoneInSession = true;
      return;
    }

    let migrationHadFailure = isLocksIndexCorrupted();

    // 1. Создаём одноразовый снимок существующих данных перед миграцией v11
    if (!storage.getItem(PRE_MIGRATION_BACKUP_KEY)) {
      const snapshot: Record<string, string | null> = {};
      let hasAnyData = false;
      Object.values(keys).forEach((k) => {
        if (!k) return;
        const val = storage.getItem(k);
        if (val !== null) {
          snapshot[k] = val;
          hasAnyData = true;
        }
      });
      if (hasAnyData) {
        const snapRes = safeSetItem(
          PRE_MIGRATION_BACKUP_KEY,
          JSON.stringify({
            createdAt: new Date().toISOString(),
            previousVersion: currentVer,
            snapshot,
          })
        );
        if (!snapRes.ok) migrationHadFailure = true;
      }
    }

    // 2. Неразрушающая нормализация ключей мышц и каталога в тренировках
    const rawWorkouts = safeGetJson<any[] | null>(keys.WORKOUTS, null, { expectArray: true });
    if (Array.isArray(rawWorkouts)) {
      const { data, changed } = normalizeWorkoutSessionsNonDestructive(rawWorkouts);
      if (changed) {
        const wRes = safeSetItem(keys.WORKOUTS, JSON.stringify(data));
        if (!wRes.ok) migrationHadFailure = true;
      }
    } else if (isKeyLockedByCorruption(keys.WORKOUTS)) {
      migrationHadFailure = true;
    }

    // 3. Неразрушающая нормализация программ
    const rawPrograms = safeGetJson<any[] | null>(keys.PROGRAMS, null, { expectArray: true });
    if (Array.isArray(rawPrograms)) {
      const { data, changed } = normalizeProgramsNonDestructive(rawPrograms);
      if (changed) {
        const pRes = safeSetItem(keys.PROGRAMS, JSON.stringify(data));
        if (!pRes.ok) migrationHadFailure = true;
      }
    } else if (isKeyLockedByCorruption(keys.PROGRAMS)) {
      migrationHadFailure = true;
    }

    // 4. Неразрушающая нормализация спортивных сессий (manualMuscles)
    const rawSports = safeGetJson<any[] | null>(keys.SPORTS_SESSIONS, null, { expectArray: true });
    if (Array.isArray(rawSports)) {
      let sportsChanged = false;
      const normSports: SportSession[] = rawSports
        .filter((sp) => sp && typeof sp === 'object')
        .map((sp) => {
          if (Array.isArray(sp.manualMuscles)) {
            const norm = normalizeMuscleListPure(sp.manualMuscles);
            if (JSON.stringify(norm) !== JSON.stringify(sp.manualMuscles)) {
              sportsChanged = true;
              return { ...sp, manualMuscles: norm };
            }
          }
          return sp;
        });
      if (sportsChanged) {
        const sRes = safeSetItem(keys.SPORTS_SESSIONS, JSON.stringify(normSports));
        if (!sRes.ok) migrationHadFailure = true;
      }
    } else if (isKeyLockedByCorruption(keys.SPORTS_SESSIONS)) {
      migrationHadFailure = true;
    }

    // 5. Неразрушающая нормализация preferredMuscles в параметрах пользователя
    const rawParams = safeGetJson<Record<string, any> | null>(keys.FITNESS_PARAMS, null, {
      expectObject: true,
    });
    if (rawParams && Array.isArray(rawParams.preferredMuscles)) {
      const normPref = normalizeMuscleListPure(rawParams.preferredMuscles);
      if (JSON.stringify(normPref) !== JSON.stringify(rawParams.preferredMuscles)) {
        const prRes = safeSetItem(
          keys.FITNESS_PARAMS,
          JSON.stringify({ ...rawParams, preferredMuscles: normPref })
        );
        if (!prRes.ok) migrationHadFailure = true;
      }
    } else if (isKeyLockedByCorruption(keys.FITNESS_PARAMS)) {
      migrationHadFailure = true;
    }

    // 6. Неразрушающая нормализация пользовательских упражнений (если ключ передан)
    if (keys.CUSTOM_EXERCISES) {
      const rawCustom = safeGetJson<any[] | null>(keys.CUSTOM_EXERCISES, null, { expectArray: true });
      if (Array.isArray(rawCustom)) {
        let customChanged = false;
        const normCustom = rawCustom.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const normPrimary = normalizeMuscleKeyPure(item.primaryMuscle) || item.primaryMuscle;
          const normSec = Array.isArray(item.secondaryMuscles)
            ? normalizeMuscleListPure(item.secondaryMuscles).filter((m) => m !== normPrimary)
            : item.secondaryMuscles;
          if (
            normPrimary !== item.primaryMuscle ||
            (Array.isArray(item.secondaryMuscles) &&
              JSON.stringify(normSec) !== JSON.stringify(item.secondaryMuscles))
          ) {
            customChanged = true;
            return { ...item, primaryMuscle: normPrimary, secondaryMuscles: normSec };
          }
          return item;
        });
        if (customChanged) {
          const cRes = safeSetItem(keys.CUSTOM_EXERCISES, JSON.stringify(normCustom));
          if (!cRes.ok) migrationHadFailure = true;
        }
      } else if (isKeyLockedByCorruption(keys.CUSTOM_EXERCISES)) {
        migrationHadFailure = true;
      }
    }

    if (!migrationHadFailure) {
      safeSetItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
    }
  } catch (err) {
    console.error('[FORM Migrations] Ошибка при миграции:', err);
  } finally {
    migrationDoneInSession = true;
  }
}

export interface ValidatedBackupPayload {
  valid: boolean;
  error?: string;
  normalized?: {
    profile?: Record<string, any>;
    programs?: WorkoutProgram[];
    workouts?: WorkoutSession[];
    sports?: SportSession[];
    weeklySchedule?: any[];
    activity?: Record<string, 'completed' | 'skipped' | 'none'>;
    equipment?: any[];
    fitnessParameters?: Record<string, any>;
    favoriteExerciseIds?: string[];
    customExercises?: FullExerciseItem[];
    settings?: AppSettings;
    wellbeingCheckins?: any[];
    bodyMeasurements?: any[];
  };
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function validateAndMigrateBackup(jsonString: string): ValidatedBackupPayload {
  if (!jsonString || typeof jsonString !== 'string') {
    return { valid: false, error: 'Пустой файл резервной копии.' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: 'Файл не является корректным JSON.' };
  }

  if (!isPlainObject(parsed)) {
    return { valid: false, error: 'Неверная структура резервной копии (ожидался JSON-объект).' };
  }

  const checkArrayField = (name: string) => {
    if (parsed[name] !== undefined && !Array.isArray(parsed[name])) {
      return `Поле "${name}" должно быть массивом.`;
    }
    return null;
  };

  for (const field of [
    'programs',
    'workouts',
    'sports',
    'weeklySchedule',
    'equipment',
    'favoriteExerciseIds',
    'customExercises',
    'wellbeingCheckins',
    'bodyMeasurements',
  ]) {
    const err = checkArrayField(field);
    if (err) return { valid: false, error: err };
  }

  for (const objField of ['profile', 'activity', 'fitnessParameters', 'settings']) {
    if (parsed[objField] !== undefined && !isPlainObject(parsed[objField])) {
      return { valid: false, error: `Поле "${objField}" должно быть объектом.` };
    }
  }

  const normalized: ValidatedBackupPayload['normalized'] = {};

  if (parsed.profile !== undefined) {
    normalized.profile = parsed.profile;
  }
  if (Array.isArray(parsed.programs)) {
    normalized.programs = normalizeProgramsNonDestructive(parsed.programs).data;
  }
  if (Array.isArray(parsed.workouts)) {
    normalized.workouts = normalizeWorkoutSessionsNonDestructive(parsed.workouts).data;
  }
  if (Array.isArray(parsed.sports)) {
    normalized.sports = parsed.sports
      .filter((s: any) => isPlainObject(s))
      .map((sp: any) =>
        Array.isArray(sp.manualMuscles)
          ? { ...sp, manualMuscles: normalizeMuscleListPure(sp.manualMuscles) }
          : sp
      );
  }
  if (Array.isArray(parsed.weeklySchedule)) {
    normalized.weeklySchedule = parsed.weeklySchedule;
  }
  if (parsed.activity !== undefined) {
    normalized.activity = parsed.activity;
  }
  if (Array.isArray(parsed.equipment)) {
    normalized.equipment = parsed.equipment;
  }
  if (parsed.fitnessParameters !== undefined) {
    const fp = { ...parsed.fitnessParameters };
    if (Array.isArray(fp.preferredMuscles)) {
      fp.preferredMuscles = normalizeMuscleListPure(fp.preferredMuscles);
    }
    normalized.fitnessParameters = fp;
  }
  if (Array.isArray(parsed.favoriteExerciseIds)) {
    normalized.favoriteExerciseIds = parsed.favoriteExerciseIds.filter(
      (id: any) => typeof id === 'string'
    );
  }
  if (Array.isArray(parsed.customExercises)) {
    const validCustom: FullExerciseItem[] = [];
    for (const item of parsed.customExercises) {
      if (
        !isPlainObject(item) ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.name !== 'string' ||
        !item.name.trim()
      ) {
        return {
          valid: false,
          error: 'Некорректное пользовательское упражнение в резервной копии (требуются id и name).',
        };
      }
      const normPrimary = normalizeMuscleKeyPure(item.primaryMuscle);
      if (!normPrimary) {
        return {
          valid: false,
          error: `Некорректная целевая мышца в пользовательском упражнении "${item.name}".`,
        };
      }
      const normSec = Array.isArray(item.secondaryMuscles)
        ? normalizeMuscleListPure(item.secondaryMuscles).filter((m) => m !== normPrimary)
        : [];
      validCustom.push({
        ...(item as FullExerciseItem),
        id: item.id.trim(),
        name: item.name.trim(),
        primaryMuscle: normPrimary,
        secondaryMuscles: normSec,
        isCustom: true,
      });
    }
    normalized.customExercises = validCustom;
  }
  if (parsed.settings !== undefined) {
    const s = parsed.settings;
    if (
      (s.theme !== undefined && !['dark', 'light', 'system'].includes(s.theme)) ||
      (s.textSize !== undefined && !['compact', 'normal', 'large'].includes(s.textSize)) ||
      (s.accentColor !== undefined && !['emerald', 'mint', 'amber'].includes(s.accentColor)) ||
      (s.animationMode !== undefined && !['full', 'reduced', 'off'].includes(s.animationMode)) ||
      (s.weightUnit !== undefined && !['kg', 'lbs'].includes(s.weightUnit)) ||
      (s.defaultRestSeconds !== undefined &&
        (typeof s.defaultRestSeconds !== 'number' ||
          !Number.isFinite(s.defaultRestSeconds) ||
          s.defaultRestSeconds <= 0)) ||
      (s.reminderTime !== undefined && typeof s.reminderTime !== 'string')
    ) {
      return { valid: false, error: 'Поле "settings" содержит некорректные значения настроек.' };
    }
    for (const boolKey of [
      'reducedMotion',
      'notificationsEnabled',
      'workoutReminders',
      'scheduledActivityReminders',
      'autoRestTimer',
      'vibrateOnTimerEnd',
      'autoAdvanceSet',
    ] as const) {
      if (s[boolKey] !== undefined && typeof s[boolKey] !== 'boolean') {
        return { valid: false, error: `Настройка "${boolKey}" должна быть логическим значением.` };
      }
    }
    normalized.settings = { ...DEFAULT_APP_SETTINGS, ...s };
  }
  if (Array.isArray(parsed.wellbeingCheckins)) {
    normalized.wellbeingCheckins = parsed.wellbeingCheckins.filter((c: any) => isPlainObject(c));
  }
  if (Array.isArray(parsed.bodyMeasurements)) {
    normalized.bodyMeasurements = parsed.bodyMeasurements.filter((m: any) => isPlainObject(m));
  }

  return { valid: true, normalized };
}

export function resetMigrationSessionFlagForTests(): void {
  migrationDoneInSession = false;
  corruptedKeysSet.clear();
  locksIndexCorruptedInSession = false;
  lastWriteError = null;
  pendingRollbackSnapshots = null;
  pendingRollbackFailedDetails = [];
}
