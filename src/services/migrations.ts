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
export const ROLLBACK_SNAPSHOT_KEY = 'form_rollback_snapshot_v1';
export const ROLLBACK_SNAPSHOT_STAGING_KEY = 'form_rollback_snapshot_staging_v1';

const INTERNAL_GATEWAY_TOKEN = Symbol('FORM_INTERNAL_GATEWAY');

const corruptedKeysSet = new Set<string>();
let locksIndexCorruptedInSession = false;
let lastWriteError: string | null = null;
let migrationDoneInSession = false;
let startupAutoRecoveryAttempted = false;

export interface SafeWriteResult {
  ok: boolean;
  error: string | null;
}

export type RollbackRecoveryStatus = 'none' | 'pending' | 'unknown';

export interface RollbackRecoveryState {
  status: RollbackRecoveryStatus;
  error: string | null;
  pendingKeys: string[];
  rawPendingValue: string | null;
  rawSnapshotValue: string | null;
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

const LEASE_KEY = 'form_storage_lease_v1';
const LEASE_TTL_MS = 5000;
const tabOwnerId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);

function acquireLocalStorageLease(storage: Storage): boolean {
  const now = Date.now();
  try {
    const raw = storage.getItem(LEASE_KEY);
    if (raw) {
      try {
        const lease = JSON.parse(raw);
        if (lease && typeof lease.expiresAt === 'number' && lease.expiresAt > now && lease.owner !== tabOwnerId) {
          return false;
        }
      } catch {}
    }
    const data = JSON.stringify({ owner: tabOwnerId, expiresAt: now + LEASE_TTL_MS });
    const setRes = gatewayRawSet(storage, LEASE_KEY, data);
    return setRes.ok;
  } catch {}
  return false;
}

function releaseLocalStorageLease(storage: Storage): void {
  try {
    const raw = storage.getItem(LEASE_KEY);
    if (raw) {
      const lease = JSON.parse(raw);
      if (lease && lease.owner === tabOwnerId) {
        gatewayRawRemove(storage, LEASE_KEY);
      }
    }
  } catch {}
}

function withStorageLock<T>(opName: string, fn: () => T): T {
  const storage = getStorage();
  if (!storage) return fn();
  let acquired = acquireLocalStorageLease(storage);
  if (!acquired) {
    for (let i = 0; i < 2; i++) {
      const start = Date.now();
      while (Date.now() - start < 40) {}
      acquired = acquireLocalStorageLease(storage);
      if (acquired) break;
    }
  }
  if (!acquired) {
    const msg = `Операция "${opName}" отклонена: хранилище заблокировано другой вкладкой или процессом.`;
    setLastWriteError(msg);
    throw new Error(msg);
  }
  try {
    return fn();
  } finally {
    releaseLocalStorageLease(storage);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (
      e.key === PENDING_ROLLBACK_KEY ||
      e.key === ROLLBACK_SNAPSHOT_KEY ||
      e.key === CORRUPTED_LOCKS_INDEX_KEY ||
      e.key === ROLLBACK_SNAPSHOT_STAGING_KEY ||
      e.key === LEASE_KEY
    ) {
      getRollbackRecoveryState();
    }
  });
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
    key === ROLLBACK_SNAPSHOT_KEY ||
    key === ROLLBACK_SNAPSHOT_STAGING_KEY ||
    key.startsWith(CORRUPTED_RAW_PREFIX)
  );
}

// Единая низкоуровневая точка записи с обязательной проверкой перечитыванием
function gatewayRawSet(storage: Storage, key: string, value: string): SafeWriteResult {
  try {
    storage.setItem(key, value);
  } catch (err: any) {
    return { ok: false, error: formatWriteError(err, `Ошибка записи ключа "${key}"`) };
  }
  let readBack: string | null = null;
  try {
    readBack = storage.getItem(key);
  } catch (err: any) {
    return {
      ok: false,
      error: formatWriteError(err, `Не удалось перечитать ключ "${key}" после записи`),
    };
  }
  if (readBack !== value) {
    return {
      ok: false,
      error: `Проверка записи "${key}" не пройдена: сохранённое содержимое не совпадает с ожидаемым.`,
    };
  }
  return { ok: true, error: null };
}

// Единая низкоуровневая точка удаления с обязательной проверкой перечитыванием
function gatewayRawRemove(storage: Storage, key: string): SafeWriteResult {
  try {
    storage.removeItem(key);
  } catch (err: any) {
    return { ok: false, error: formatWriteError(err, `Ошибка удаления ключа "${key}"`) };
  }
  let readBack: string | null = null;
  try {
    readBack = storage.getItem(key);
  } catch (err: any) {
    return {
      ok: false,
      error: formatWriteError(err, `Не удалось проверить удаление ключа "${key}"`),
    };
  }
  if (readBack !== null) {
    return {
      ok: false,
      error: `Проверка удаления "${key}" не пройдена: ключ остался в хранилище.`,
    };
  }
  return { ok: true, error: null };
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
      if (!storage.getItem(qKey) && getRollbackRecoveryState().status === 'none') {
        gatewayRawSet(storage, qKey, raw);
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
  const unique = Array.from(new Set(keys.filter((k) => typeof k === 'string' && k.length > 0)));
  if (unique.length === 0) {
    return gatewayRawRemove(storage, CORRUPTED_LOCKS_INDEX_KEY).ok;
  }
  return gatewayRawSet(storage, CORRUPTED_LOCKS_INDEX_KEY, JSON.stringify(unique)).ok;
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
  corruptedKeysSet.add(key);

  // Во время pending/unknown не мутируем localStorage (блокировка остаётся в памяти)
  if (getRollbackRecoveryState().status !== 'none') {
    return { lockIndexOk: false, quarantineOk: false };
  }

  const lockIndexOk = persistCorruptedLock(storage, key);
  let quarantineOk = true;
  let quarantineErrMsg: string | null = null;

  if (storage) {
    try {
      const qKey = `${CORRUPTED_RAW_PREFIX}${key}`;
      if (!storage.getItem(qKey)) {
        const qRes = gatewayRawSet(storage, qKey, raw);
        if (!qRes.ok) {
          quarantineOk = false;
          quarantineErrMsg =
            qRes.error && qRes.error.includes('QuotaExceededError')
              ? `Не удалось сохранить полную карантинную копию для "${key}": недостаточно памяти устройства (QuotaExceededError). Ключ заблокирован от перезаписи.`
              : `Не удалось сохранить карантинную копию для "${key}": ${qRes.error || 'ошибка записи'}. Ключ заблокирован от перезаписи.`;
        }
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
  const recState = getRollbackRecoveryState();
  if (recState.status !== 'none') {
    const msg =
      recState.error ||
      `Снятие блокировки "${key}" запрещено: имеется незавершённое или повреждённое восстановление (${recState.status}).`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  const storage = getStorage();
  if (!storage) {
    corruptedKeysSet.delete(key);
    return { ok: true, error: null };
  }

  const rmQ = gatewayRawRemove(storage, `${CORRUPTED_RAW_PREFIX}${key}`);
  if (!rmQ.ok) {
    corruptedKeysSet.add(key);
    const msg = rmQ.error || `Не удалось удалить карантинную копию для "${key}"`;
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
  const rmQ = gatewayRawRemove(storage, `${CORRUPTED_RAW_PREFIX}${key}`);
  if (!rmQ.ok) {
    corruptedKeysSet.add(key);
    const msg = rmQ.error || `Данные "${key}" записаны, но не удалось удалить карантинную копию`;
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
    const rmRes = gatewayRawRemove(storage, `${CORRUPTED_RAW_PREFIX}${key}`);
    if (rmRes.ok) {
      clearedKeys.push(key);
    } else {
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

    const rmIdxQ = gatewayRawRemove(storage, `${CORRUPTED_RAW_PREFIX}${CORRUPTED_LOCKS_INDEX_KEY}`);
    const rmIdx = gatewayRawRemove(storage, CORRUPTED_LOCKS_INDEX_KEY);
    if (!rmIdxQ.ok || !rmIdx.ok) {
      const msg =
        rmIdx.error ||
        rmIdxQ.error ||
        `Данные записаны, но не удалось очистить повреждённый индекс "${CORRUPTED_LOCKS_INDEX_KEY}"`;
      lastWriteError = msg;
      return { ok: false, error: msg };
    }
    locksIndexCorruptedInSession = false;
    corruptedKeysSet.delete(CORRUPTED_LOCKS_INDEX_KEY);
    for (const k of clearedKeys) {
      corruptedKeysSet.delete(k);
    }
  }

  if (failedKeys.length > 0) {
    const msg = `Данные записаны, но не удалось очистить карантин для: ${failedKeys.join(', ')}.`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  return { ok: true, error: null };
}

function buildPendingBlockError(recState: RollbackRecoveryState, targetKey: string, isDelete: boolean): string {
  const action = isDelete ? `Удаление "${targetKey}"` : `Запись в "${targetKey}"`;
  if (recState.status === 'unknown') {
    return `${action} заблокировано: ${recState.error || 'снимок восстановления повреждён (состояние unknown).'}`;
  }
  const keysSuffix = recState.pendingKeys.length > 0 ? ` (${recState.pendingKeys.join(', ')})` : '';
  return `${action} заблокировано: имеется незавершённое восстановление предыдущей операции${keysSuffix}. Сначала завершите восстановление.`;
}

function writeViaGateway(
  key: string,
  value: string,
  options?: SafeSetOptions,
  internalToken?: symbol
): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    const msg = 'Локальное хранилище (localStorage) недоступно.';
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  const isInternalContext = internalToken === INTERNAL_GATEWAY_TOKEN;
  if (!isInternalContext) {
    const recState = getRollbackRecoveryState();
    if (recState.status !== 'none') {
      const msg = buildPendingBlockError(recState, key, false);
      lastWriteError = msg;
      console.error('[FORM Storage]', msg, key);
      return { ok: false, error: msg };
    }
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

  const writeRes = gatewayRawSet(storage, key, value);
  if (!writeRes.ok) {
    lastWriteError = writeRes.error;
    console.error('[FORM Storage]', writeRes.error, key);
    return writeRes;
  }

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
}

function removeViaGateway(
  key: string,
  options?: SafeRemoveOptions,
  internalToken?: symbol
): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
  }

  const isInternalContext = internalToken === INTERNAL_GATEWAY_TOKEN;
  if (!isInternalContext) {
    const recState = getRollbackRecoveryState();
    if (recState.status !== 'none') {
      const msg = buildPendingBlockError(recState, key, true);
      lastWriteError = msg;
      console.error('[FORM Storage]', msg, key);
      return { ok: false, error: msg };
    }
  }

  if (!options?.allowRemoveCorrupted && !isMetadataKey(key)) {
    if (isKeyLockedByCorruption(key) || detectAndLockExistingCorruption(storage, key)) {
      const msg = `Удаление "${key}" заблокировано: обнаружены повреждённые данные или блокировка карантина.`;
      lastWriteError = msg;
      return { ok: false, error: msg };
    }
  }

  const rmRes = gatewayRawRemove(storage, key);
  if (!rmRes.ok) {
    lastWriteError = rmRes.error;
    return rmRes;
  }
  return { ok: true, error: null };
}

export function safeSetItem(
  key: string,
  value: string,
  options?: SafeSetOptions
): SafeWriteResult {
  return writeViaGateway(key, value, options);
}

export function safeRemoveItem(key: string, options?: SafeRemoveOptions): SafeWriteResult {
  return removeViaGateway(key, options);
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
      rawValue = storage.getItem(key);
      quarantineRawValue = storage.getItem(`${CORRUPTED_RAW_PREFIX}${key}`);
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

export interface PersistedRollbackSnapshotPayload {
  version: 1;
  operationId: string;
  operationName: string;
  createdAt: string;
  checksum: string;
  snapshots: KeyBackupSnapshot[];
}

export interface PersistedPendingMarkerPayload {
  version: 1;
  operationId: string;
  operationName: string;
  createdAt: string;
  status: 'in_progress' | 'rollback_failed';
  snapshotKey: string;
  checksum: string;
  snapshots: KeyBackupSnapshot[];
  failedDetails: RollbackFailureDetail[];
}

export interface ProtectedTransactionContext {
  setItem: (key: string, value: string, options?: SafeSetOptions) => SafeWriteResult;
  removeItem: (key: string, options?: SafeRemoveOptions) => SafeWriteResult;
  confirmClearedLocks: (keys: string[]) => SafeWriteResult;
}

const VALID_FAILURE_STAGES = new Set<RollbackFailureDetail['stage']>([
  'remove_new_key',
  'remove_unused_quarantine',
  'restore_value',
  'restore_quarantine',
  'restore_lock_index',
  'clear_lock_index',
]);

let pendingRollbackSnapshots: KeyBackupSnapshot[] | null = null;
let pendingRollbackFailedDetails: RollbackFailureDetail[] = [];

function computeSnapshotChecksum(snapshots: KeyBackupSnapshot[]): string {
  const canonical = JSON.stringify(
    snapshots.map((s) => ({
      key: s.key,
      rawValue: s.rawValue,
      quarantineRawValue: s.quarantineRawValue,
      wasLockedInMemory: s.wasLockedInMemory,
      wasLockedInIndex: s.wasLockedInIndex,
    }))
  );
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < canonical.length; i++) {
    const code = canonical.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 = ((h2 << 5) + h2 + code) | 0;
  }
  return `v1:${canonical.length}:${(h1 >>> 0).toString(16).padStart(8, '0')}:${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function isValidSnapshotItem(item: unknown): item is KeyBackupSnapshot {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const s = item as Record<string, unknown>;
  return (
    typeof s.key === 'string' &&
    s.key.length > 0 &&
    (s.rawValue === null || typeof s.rawValue === 'string') &&
    (s.quarantineRawValue === null || typeof s.quarantineRawValue === 'string') &&
    typeof s.wasLockedInMemory === 'boolean' &&
    typeof s.wasLockedInIndex === 'boolean'
  );
}

function isValidFailureDetail(item: unknown): item is RollbackFailureDetail {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const d = item as Record<string, unknown>;
  return (
    typeof d.key === 'string' &&
    d.key.length > 0 &&
    typeof d.stage === 'string' &&
    VALID_FAILURE_STAGES.has(d.stage as RollbackFailureDetail['stage']) &&
    typeof d.error === 'string'
  );
}

function parseAndValidateSnapshotPayload(
  raw: string
): { valid: true; payload: PersistedRollbackSnapshotPayload } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Снимок восстановления пуст.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'Некорректный JSON снимка восстановления.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Снимок восстановления должен быть JSON-объектом.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1 || typeof obj.operationId !== 'string' || !obj.operationId) {
    return { valid: false, error: 'Некорректная версия или идентификатор снимка восстановления.' };
  }
  if (!Array.isArray(obj.snapshots) || obj.snapshots.length === 0) {
    return { valid: false, error: 'Список ключей в снимке восстановления отсутствует или пуст.' };
  }
  if (!obj.snapshots.every(isValidSnapshotItem)) {
    return { valid: false, error: 'Один или несколько элементов снимка имеют неверную структуру.' };
  }
  const expectedChecksum = computeSnapshotChecksum(obj.snapshots);
  if (typeof obj.checksum !== 'string' || obj.checksum !== expectedChecksum) {
    return { valid: false, error: 'Контрольная сумма снимка восстановления не совпадает.' };
  }
  return {
    valid: true,
    payload: parsed as PersistedRollbackSnapshotPayload,
  };
}

function parseAndValidatePendingMarker(
  raw: string,
  storage: Storage | null
):
  | {
      valid: true;
      snapshots: KeyBackupSnapshot[];
      failedDetails: RollbackFailureDetail[];
      operationId?: string;
      operationName?: string;
      snapshotKey?: string;
      checksum?: string;
      createdAt?: string;
    }
  | { valid: false; error: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Маркер восстановления пуст.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'Некорректный JSON маркера восстановления.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Маркер восстановления должен быть JSON-объектом.' };
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.version !== undefined && obj.version !== 1) {
    return { valid: false, error: 'Неподдерживаемая версия маркера восстановления.' };
  }
  if (
    obj.status !== undefined &&
    obj.status !== 'in_progress' &&
    obj.status !== 'rollback_failed'
  ) {
    return { valid: false, error: 'Некорректный статус маркера восстановления.' };
  }
  if (!Array.isArray(obj.snapshots) || obj.snapshots.length === 0) {
    return { valid: false, error: 'В маркере восстановления отсутствуют снимки ключей.' };
  }
  if (!obj.snapshots.every(isValidSnapshotItem)) {
    return { valid: false, error: 'Структура ключей в маркере восстановления повреждена.' };
  }

  let failedDetails: RollbackFailureDetail[] = [];
  if (obj.failedDetails !== undefined) {
    if (!Array.isArray(obj.failedDetails) || !obj.failedDetails.every(isValidFailureDetail)) {
      return { valid: false, error: 'Структура failedDetails в маркере восстановления повреждена.' };
    }
    failedDetails = obj.failedDetails;
  }

  const expectedChecksum = computeSnapshotChecksum(obj.snapshots);
  if (obj.checksum !== undefined) {
    if (typeof obj.checksum !== 'string' || obj.checksum !== expectedChecksum) {
      return { valid: false, error: 'Контрольная сумма маркера восстановления не совпадает.' };
    }
  }

  if (obj.snapshotKey !== undefined) {
    if (typeof obj.snapshotKey !== 'string' || !obj.snapshotKey) {
      return { valid: false, error: 'Некорректная ссылка snapshotKey в маркере восстановления.' };
    }
    if (storage) {
      let stagingRaw: string | null = null;
      try {
        stagingRaw = storage.getItem(obj.snapshotKey);
      } catch {
        return {
          valid: false,
          error: `Не удалось прочитать связанный снимок "${obj.snapshotKey}".`,
        };
      }
      if (stagingRaw !== null) {
        const stagingParsed = parseAndValidateSnapshotPayload(stagingRaw);
        if (!stagingParsed.valid) {
          return {
            valid: false,
            error: `Связанный снимок "${obj.snapshotKey}" повреждён: ${stagingParsed.error}`,
          };
        }
        if (obj.checksum !== undefined && stagingParsed.payload.checksum !== obj.checksum) {
          return {
            valid: false,
            error: `Контрольная сумма связанного снимка "${obj.snapshotKey}" не совпадает с маркером.`,
          };
        }
      }
    }
  }

  return {
    valid: true,
    snapshots: obj.snapshots,
    failedDetails,
    operationId: typeof obj.operationId === 'string' ? obj.operationId : undefined,
    operationName: typeof obj.operationName === 'string' ? obj.operationName : undefined,
    snapshotKey: typeof obj.snapshotKey === 'string' ? obj.snapshotKey : undefined,
    checksum: typeof obj.checksum === 'string' ? obj.checksum : expectedChecksum,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
  };
}

export function getRollbackRecoveryState(): RollbackRecoveryState {
  const storage = getStorage();
  if (storage) {
    let rawPending: string | null = null;
    try {
      rawPending = storage.getItem(PENDING_ROLLBACK_KEY);
    } catch {
      return {
        status: 'unknown',
        error: `Не удалось прочитать маркер восстановления (${PENDING_ROLLBACK_KEY}). Запись и импорт заблокированы.`,
        pendingKeys: [],
        rawPendingValue: null,
        rawSnapshotValue: null,
      };
    }

    let rawConfirmedSnapshot: string | null = null;
    try {
      rawConfirmedSnapshot = storage.getItem(ROLLBACK_SNAPSHOT_KEY);
    } catch {
      return {
        status: 'unknown',
        error: `Не удалось прочитать снимок восстановления (${ROLLBACK_SNAPSHOT_KEY}). Запись и импорт заблокированы.`,
        pendingKeys: [],
        rawPendingValue: rawPending,
        rawSnapshotValue: null,
      };
    }

    if (rawPending !== null) {
      const parsedPending = parseAndValidatePendingMarker(rawPending, storage);
      if (!parsedPending.valid) {
        return {
          status: 'unknown',
          error: `Повреждены данные незавершённого восстановления (${PENDING_ROLLBACK_KEY}): ${parsedPending.error}`,
          pendingKeys: [],
          rawPendingValue: rawPending,
          rawSnapshotValue: rawConfirmedSnapshot,
        };
      }
      const pendingKeys =
        parsedPending.failedDetails.length > 0
          ? Array.from(new Set(parsedPending.failedDetails.map((d) => d.key)))
          : parsedPending.snapshots.map((s) => s.key);
      return {
        status: 'pending',
        error: null,
        pendingKeys,
        rawPendingValue: rawPending,
        rawSnapshotValue: rawConfirmedSnapshot,
      };
    }

    if (rawConfirmedSnapshot !== null) {
      const snapCheck = parseAndValidateSnapshotPayload(rawConfirmedSnapshot);
      if (!snapCheck.valid) {
        return {
          status: 'unknown',
          error: `Повреждён сохранённый снимок восстановления (${ROLLBACK_SNAPSHOT_KEY}): ${snapCheck.error}`,
          pendingKeys: [],
          rawPendingValue: null,
          rawSnapshotValue: rawConfirmedSnapshot,
        };
      }
    }

    let rawStaging: string | null = null;
    try {
      rawStaging = storage.getItem(ROLLBACK_SNAPSHOT_STAGING_KEY);
    } catch {
      return {
        status: 'unknown',
        error: `Не удалось прочитать буферный снимок (${ROLLBACK_SNAPSHOT_STAGING_KEY}). Запись и импорт заблокированы.`,
        pendingKeys: [],
        rawPendingValue: null,
        rawSnapshotValue: rawConfirmedSnapshot,
      };
    }
    if (rawStaging !== null) {
      const stagingCheck = parseAndValidateSnapshotPayload(rawStaging);
      if (!stagingCheck.valid) {
        return {
          status: 'unknown',
          error: `Повреждён буферный снимок восстановления (${ROLLBACK_SNAPSHOT_STAGING_KEY}): ${stagingCheck.error}`,
          pendingKeys: [],
          rawPendingValue: null,
          rawSnapshotValue: rawStaging,
        };
      }
    }
  }

  if (pendingRollbackSnapshots && pendingRollbackSnapshots.length > 0) {
    const pendingKeys =
      pendingRollbackFailedDetails.length > 0
        ? Array.from(new Set(pendingRollbackFailedDetails.map((d) => d.key)))
        : pendingRollbackSnapshots.map((s) => s.key);
    return {
      status: 'pending',
      error: null,
      pendingKeys,
      rawPendingValue: null,
      rawSnapshotValue: null,
    };
  }

  return {
    status: 'none',
    error: null,
    pendingKeys: [],
    rawPendingValue: null,
    rawSnapshotValue: null,
  };
}

function savePendingRollbackState(
  storage: Storage | null,
  snapshots: KeyBackupSnapshot[],
  failedDetails: RollbackFailureDetail[],
  meta?: { operationId?: string; operationName?: string; snapshotKey?: string; createdAt?: string }
): SafeWriteResult {
  const cloned = snapshots.map((s) => ({ ...s }));
  pendingRollbackSnapshots = cloned;
  pendingRollbackFailedDetails = [...failedDetails];

  if (!storage) {
    return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
  }

  const checksum = computeSnapshotChecksum(cloned);
  const payload: PersistedPendingMarkerPayload = {
    version: 1,
    operationId: meta?.operationId || `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    operationName: meta?.operationName || 'rollback_recovery',
    createdAt: meta?.createdAt || new Date().toISOString(),
    status: failedDetails.length > 0 ? 'rollback_failed' : 'in_progress',
    snapshotKey: meta?.snapshotKey || ROLLBACK_SNAPSHOT_STAGING_KEY,
    checksum,
    snapshots: cloned,
    failedDetails: [...failedDetails],
  };

  const serialized = JSON.stringify(payload);
  const writeRes = gatewayRawSet(storage, PENDING_ROLLBACK_KEY, serialized);
  if (!writeRes.ok) {
    return writeRes;
  }

  const readCheck = storage.getItem(PENDING_ROLLBACK_KEY);
  if (readCheck === null) {
    return { ok: false, error: 'Маркер восстановления не сохранился после записи.' };
  }
  const validated = parseAndValidatePendingMarker(readCheck, storage);
  if (!validated.valid) {
    return { ok: false, error: `Записанный маркер восстановления не прошёл проверку: ${validated.error}` };
  }

  return { ok: true, error: null };
}

export function clearPendingRollbackState(): SafeWriteResult {
  const storage = getStorage();
  if (!storage) {
    pendingRollbackSnapshots = null;
    pendingRollbackFailedDetails = [];
    return { ok: true, error: null };
  }

  const rmPending = gatewayRawRemove(storage, PENDING_ROLLBACK_KEY);
  if (!rmPending.ok) {
    // Маркер остался -> состояние остаётся pending
    return rmPending;
  }

  gatewayRawRemove(storage, ROLLBACK_SNAPSHOT_STAGING_KEY);
  pendingRollbackSnapshots = null;
  pendingRollbackFailedDetails = [];
  return { ok: true, error: null };
}

export function hasPendingRollbackRecovery(): boolean {
  return getRollbackRecoveryState().status !== 'none';
}

export function getPendingRollbackKeys(): string[] {
  return getRollbackRecoveryState().pendingKeys;
}

function verifyRestoredStorageMatchesSnapshot(
  storage: Storage,
  snapshots: KeyBackupSnapshot[]
): RollbackFailureDetail[] {
  const mismatches: RollbackFailureDetail[] = [];
  const persistedInfo = inspectPersistedLocksIndex(storage);

  for (const snap of snapshots) {
    try {
      const actualVal = storage.getItem(snap.key);
      if (actualVal !== snap.rawValue) {
        mismatches.push({
          key: snap.key,
          stage: 'restore_value',
          error: `Проверка после отката выявила расхождение содержимого ключа "${snap.key}".`,
        });
      }
    } catch (err) {
      mismatches.push({
        key: snap.key,
        stage: 'restore_value',
        error: formatWriteError(err, `Не удалось перечитать "${snap.key}" после отката`),
      });
    }

    try {
      const qKey = `${CORRUPTED_RAW_PREFIX}${snap.key}`;
      const actualQ = storage.getItem(qKey);
      if (actualQ !== snap.quarantineRawValue) {
        mismatches.push({
          key: snap.key,
          stage: 'restore_quarantine',
          error: `Проверка после отката выявила расхождение карантина для "${snap.key}".`,
        });
      }
    } catch (err) {
      mismatches.push({
        key: snap.key,
        stage: 'restore_quarantine',
        error: formatWriteError(err, `Не удалось перечитать карантин "${snap.key}" после отката`),
      });
    }

    if (snap.wasLockedInIndex) {
      if (persistedInfo.corrupted || !persistedInfo.keys.includes(snap.key)) {
        mismatches.push({
          key: snap.key,
          stage: 'restore_lock_index',
          error: `Проверка после отката: ключ "${snap.key}" отсутствует в индексе блокировок.`,
        });
      }
    } else if (!persistedInfo.corrupted && persistedInfo.keys.includes(snap.key)) {
      mismatches.push({
        key: snap.key,
        stage: 'clear_lock_index',
        error: `Проверка после отката: лишняя блокировка "${snap.key}" осталась в индексе.`,
      });
    }
  }

  return mismatches;
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

  // Шаг 1. Безопасно удаляем ТОЛЬКО те ключи и карантин, которых НЕ БЫЛО до операции (rawValue === null)
  for (const snap of snapshots) {
    if (snap.rawValue === null) {
      try {
        const currentVal = storage.getItem(snap.key);
        if (currentVal !== null) {
          const rmRes = removeViaGateway(
            snap.key,
            { allowRemoveCorrupted: true },
            INTERNAL_GATEWAY_TOKEN
          );
          if (!rmRes.ok) {
            recordFailure(
              snap.key,
              'remove_new_key',
              rmRes.error || `Не удалось удалить новый ключ "${snap.key}" при откате`,
              `Не удалось удалить новый ключ "${snap.key}" при откате`
            );
          }
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
          const rmQ = gatewayRawRemove(storage, qKey);
          if (!rmQ.ok) {
            recordFailure(
              snap.key,
              'remove_unused_quarantine',
              rmQ.error || `Не удалось удалить лишний карантин для "${snap.key}" при откате`,
              `Не удалось удалить лишний карантин для "${snap.key}" при откате`
            );
          }
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
  for (const snap of snapshots) {
    if (snap.wasLockedInMemory) {
      corruptedKeysSet.add(snap.key);
    } else {
      corruptedKeysSet.delete(snap.key);
    }

    if (snap.rawValue !== null) {
      try {
        const currentVal = storage.getItem(snap.key);
        if (currentVal !== snap.rawValue) {
          const setRes = writeViaGateway(
            snap.key,
            snap.rawValue,
            { allowOverwriteCorrupted: true, deferLockClear: true },
            INTERNAL_GATEWAY_TOKEN
          );
          if (!setRes.ok) {
            recordFailure(
              snap.key,
              'restore_value',
              setRes.error || `Не удалось восстановить исходное значение "${snap.key}"`,
              `Не удалось восстановить исходное значение "${snap.key}"`
            );
          }
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

    if (snap.quarantineRawValue !== null) {
      try {
        const qKey = `${CORRUPTED_RAW_PREFIX}${snap.key}`;
        const currentQ = storage.getItem(qKey);
        if (currentQ !== snap.quarantineRawValue) {
          const setQRes = gatewayRawSet(storage, qKey, snap.quarantineRawValue);
          if (!setQRes.ok) {
            recordFailure(
              snap.key,
              'restore_quarantine',
              setQRes.error || `Не удалось восстановить карантинную копию "${snap.key}"`,
              `Не удалось восстановить карантинную копию "${snap.key}"`
            );
          }
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

  // Шаг 3. Обязательная проверка перечитыванием: сверяем фактическое хранилище со снимком
  if (failedDetails.length === 0) {
    const mismatches = verifyRestoredStorageMatchesSnapshot(storage, snapshots);
    for (const m of mismatches) {
      recordFailure(m.key, m.stage, m.error, m.error);
    }
  }

  let ok = failedDetails.length === 0;
  if (!ok) {
    savePendingRollbackState(storage, snapshots, failedDetails);
  } else {
    const clearRes = clearPendingRollbackState();
    if (!clearRes.ok) {
      ok = false;
      const firstKey = snapshots[0]?.key || PENDING_ROLLBACK_KEY;
      recordFailure(
        firstKey,
        'restore_value',
        clearRes.error || 'Не удалось удалить маркер незавершённого восстановления.',
        'Не удалось очистить маркер восстановления'
      );
      pendingRollbackSnapshots = snapshots.map((s) => ({ ...s }));
      pendingRollbackFailedDetails = [...failedDetails];
    }
  }

  const restoredKeys = snapshots
    .map((s) => s.key)
    .filter((k) => !failedKeysSet.has(k));

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
  try {
    const storage = getStorage();
    if (!storage) {
      return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
    }

    const recState = getRollbackRecoveryState();
    if (recState.status === 'unknown') {
      const errMsg =
        recState.error ||
        `Невозможно выполнить восстановление: повреждён снимок или маркер (${PENDING_ROLLBACK_KEY}). Исходные данные не удалены.`;
      lastWriteError = errMsg;
      return { ok: false, error: errMsg };
    }

    if (recState.status === 'none') {
      const msg = 'Нет незавершённого восстановления для выполнения.';
      return { ok: false, error: msg };
    }

    return withStorageLock('retry_recovery', () => {
      let snapshotsToRestore: KeyBackupSnapshot[] | null = null;
      if (recState.rawPendingValue !== null) {
        const parsed = parseAndValidatePendingMarker(recState.rawPendingValue, storage);
        if (!parsed.valid) {
          lastWriteError = parsed.error;
          return { ok: false, error: parsed.error };
        }
        snapshotsToRestore = parsed.snapshots;
      } else if (pendingRollbackSnapshots && pendingRollbackSnapshots.length > 0) {
        snapshotsToRestore = pendingRollbackSnapshots;
      }

      if (!snapshotsToRestore || snapshotsToRestore.length === 0) {
        const msg = 'Снимок для повторного восстановления пуст или недоступен.';
        lastWriteError = msg;
        return { ok: false, error: msg };
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
    });
  } catch (err: any) {
    const msg = err?.message || 'Ошибка блокировки при повторном восстановлении.';
    lastWriteError = msg;
    return { ok: false, error: msg };
  }
}

/**
 * Защищённая транзакция над localStorage:
 * 1) Проверяет отсутствие pending/unknown;
 * 2) Записывает и перечитывает снимок в буферный слот (не затирая предыдущий ROLLBACK_SNAPSHOT_KEY);
 * 3) Записывает и перечитывает маркер PENDING_ROLLBACK_KEY;
 * 4) Выполняет операцию; при ошибке запускает полный откат и проверку;
 * 5) Только после подтверждённого успеха обновляет ROLLBACK_SNAPSHOT_KEY и очищает PENDING_ROLLBACK_KEY.
 */
export function executeProtectedStorageTransaction(
  keysToProtect: string[],
  operationName: string,
  operation: (tx: ProtectedTransactionContext) => SafeWriteResult
): SafeWriteResult {
  try {
    return withStorageLock(operationName, () => {
      const storage = getStorage();
      if (!storage) {
        const msg = 'Локальное хранилище (localStorage) недоступно.';
        lastWriteError = msg;
        return { ok: false, error: msg };
      }

      const recState = getRollbackRecoveryState();
      if (recState.status !== 'none') {
        const msg = buildPendingBlockError(recState, operationName, false);
        lastWriteError = msg;
        return { ok: false, error: msg };
      }

      const uniqueKeys = Array.from(new Set(keysToProtect.filter((k) => Boolean(k))));
      if (uniqueKeys.length === 0) {
        const msg = 'Транзакция не содержит защищаемых ключей.';
        lastWriteError = msg;
        return { ok: false, error: msg };
      }

      // Шаг 1: собираем снимок затрагиваемых ключей (Point 1: read error throws and aborts before any changes)
      let snapshots: KeyBackupSnapshot[];
      try {
        snapshots = captureStorageKeysSnapshot(uniqueKeys);
      } catch (err: any) {
        const msg = formatWriteError(err, `Не удалось прочитать хранилище при создании снимка перед операцией (${operationName})`);
        lastWriteError = msg;
        return { ok: false, error: msg };
      }
  const checksum = computeSnapshotChecksum(snapshots);
  const operationId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();

  const snapshotPayload: PersistedRollbackSnapshotPayload = {
    version: 1,
    operationId,
    operationName,
    createdAt,
    checksum,
    snapshots,
  };
  const serializedSnapshot = JSON.stringify(snapshotPayload);

  // Шаг 2-4: записываем в буферный слот (ROLLBACK_SNAPSHOT_KEY остаётся нетронутым), перечитываем и валидируем
  const stageWrite = gatewayRawSet(storage, ROLLBACK_SNAPSHOT_STAGING_KEY, serializedSnapshot);
  if (!stageWrite.ok) {
    gatewayRawRemove(storage, ROLLBACK_SNAPSHOT_STAGING_KEY);
    const msg = `Не удалось сохранить снимок перед операцией (${operationName}): ${stageWrite.error}`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  const stageRead = storage.getItem(ROLLBACK_SNAPSHOT_STAGING_KEY);
  const stageCheck =
    stageRead !== null ? parseAndValidateSnapshotPayload(stageRead) : { valid: false as const, error: 'Снимок отсутствует после записи.' };
  if (!stageCheck.valid || stageRead !== serializedSnapshot) {
    gatewayRawRemove(storage, ROLLBACK_SNAPSHOT_STAGING_KEY);
    const msg = `Проверка структуры снимка перед операцией (${operationName}) не пройдена: ${!stageCheck.valid ? stageCheck.error : 'расхождение содержимого'}`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  // Шаг 5: записываем pending-маркер и так же проверяем его перечитыванием и валидацией
  const markerSaveRes = savePendingRollbackState(storage, snapshots, [], {
    operationId,
    operationName,
    snapshotKey: ROLLBACK_SNAPSHOT_STAGING_KEY,
    createdAt,
  });
  if (!markerSaveRes.ok) {
    // Пре-флайт не удался до изменения пользовательских данных: удаляем несостоявшиеся временные записи, не трогая ROLLBACK_SNAPSHOT_KEY
    gatewayRawRemove(storage, PENDING_ROLLBACK_KEY);
    gatewayRawRemove(storage, ROLLBACK_SNAPSHOT_STAGING_KEY);
    pendingRollbackSnapshots = null;
    pendingRollbackFailedDetails = [];
    const msg = `Не удалось зафиксировать маркер безопасности перед операцией (${operationName}): ${markerSaveRes.error}`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  const txContext: ProtectedTransactionContext = {
    setItem: (k, v, opts) => writeViaGateway(k, v, opts, INTERNAL_GATEWAY_TOKEN),
    removeItem: (k, opts) => removeViaGateway(k, opts, INTERNAL_GATEWAY_TOKEN),
    confirmClearedLocks: (keys) => confirmClearedLocksAfterRecovery(keys),
  };

  let opRes: SafeWriteResult;
  try {
    opRes = operation(txContext);
  } catch (err: any) {
    opRes = {
      ok: false,
      error: formatWriteError(err, `Исключение при выполнении "${operationName}"`),
    };
  }

  if (!opRes.ok) {
    const failedError =
      opRes.error || `Ошибка записи при выполнении "${operationName}". Выполняется откат к исходным данным.`;
    const rollbackRes = restoreStorageKeysSnapshotDetailed(snapshots);
    const failedSummary = rollbackRes.failedDetails
      .map((d) => `${d.key} [${d.stage}]`)
      .join(', ');
    const fullErr = rollbackRes.ok
      ? `${failedError} Исходные данные полностью сохранены (откат выполнен).`
      : `${failedError} Частичный откат: не удалось полностью восстановить (${failedSummary}). Данные для повторного восстановления сохранены.`;
    lastWriteError = fullErr;
    return { ok: false, error: fullErr };
  }

  // Только после подтверждённого успеха операции обновляем основной слот снимка (ROLLBACK_SNAPSHOT_KEY)
  const commitSnapshotRes = gatewayRawSet(storage, ROLLBACK_SNAPSHOT_KEY, serializedSnapshot);
  if (!commitSnapshotRes.ok) {
    const rollbackRes = restoreStorageKeysSnapshotDetailed(snapshots);
    const failedSummary = rollbackRes.failedDetails
      .map((d) => `${d.key} [${d.stage}]`)
      .join(', ');
    const errMsg = rollbackRes.ok
      ? `Операция отменена: не удалось обновить подтверждённый снимок (${commitSnapshotRes.error}). Исходные данные восстановлены.`
      : `Не удалось обновить снимок (${commitSnapshotRes.error}) и откат выполнен частично (${failedSummary}).`;
    lastWriteError = errMsg;
    return { ok: false, error: errMsg };
  }

  // Только после подтверждённого успеха и сохранения основного снимка очищаем pending-маркер
  const clearPendingRes = clearPendingRollbackState();
  if (!clearPendingRes.ok) {
    const msg = `Операция выполнена, но не удалось очистить маркер восстановления (${PENDING_ROLLBACK_KEY}): ${clearPendingRes.error}. Состояние оставлено в pending.`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }

  lastWriteError = null;
  return { ok: true, error: null };
    });
  } catch (err: any) {
    const msg = err?.message || `Ошибка блокировки при выполнении "${operationName}".`;
    lastWriteError = msg;
    return { ok: false, error: msg };
  }
}

/**
 * Неразрушающая миграция схемы до CURRENT_SCHEMA_VERSION.
 * Работает один раз на версию схемы и никогда не стирает пользовательские записи.
 */
export function runSafeMigrations(keys: MigrationKeys): void {
  const recState = getRollbackRecoveryState();
  if (recState.status !== 'none') {
    lastWriteError = buildPendingBlockError(recState, 'миграция схемы', false);
    return;
  }

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
    const plannedWrites: Array<[string, string]> = [];

    // 1. Готовим одноразовый снимок существующих данных перед миграцией v11
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
        plannedWrites.push([
          PRE_MIGRATION_BACKUP_KEY,
          JSON.stringify({
            createdAt: new Date().toISOString(),
            previousVersion: currentVer,
            snapshot,
          }),
        ]);
      }
    }

    // 2. Неразрушающая нормализация ключей мышц и каталога в тренировках
    const rawWorkouts = safeGetJson<any[] | null>(keys.WORKOUTS, null, { expectArray: true });
    if (Array.isArray(rawWorkouts)) {
      const { data, changed } = normalizeWorkoutSessionsNonDestructive(rawWorkouts);
      if (changed) {
        plannedWrites.push([keys.WORKOUTS, JSON.stringify(data)]);
      }
    } else if (isKeyLockedByCorruption(keys.WORKOUTS)) {
      migrationHadFailure = true;
    }

    // 3. Неразрушающая нормализация программ
    const rawPrograms = safeGetJson<any[] | null>(keys.PROGRAMS, null, { expectArray: true });
    if (Array.isArray(rawPrograms)) {
      const { data, changed } = normalizeProgramsNonDestructive(rawPrograms);
      if (changed) {
        plannedWrites.push([keys.PROGRAMS, JSON.stringify(data)]);
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
        plannedWrites.push([keys.SPORTS_SESSIONS, JSON.stringify(normSports)]);
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
        plannedWrites.push([
          keys.FITNESS_PARAMS,
          JSON.stringify({ ...rawParams, preferredMuscles: normPref }),
        ]);
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
          plannedWrites.push([keys.CUSTOM_EXERCISES, JSON.stringify(normCustom)]);
        }
      } else if (isKeyLockedByCorruption(keys.CUSTOM_EXERCISES)) {
        migrationHadFailure = true;
      }
    }

    if (!migrationHadFailure) {
      plannedWrites.push([SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION)]);
    }

    if (plannedWrites.length > 0) {
      const txRes = executeProtectedStorageTransaction(
        plannedWrites.map(([k]) => k),
        'schema_migration',
        (tx) => {
          for (const [k, v] of plannedWrites) {
            const w = tx.setItem(k, v);
            if (!w.ok) {
              return w;
            }
          }
          return { ok: true, error: null };
        }
      );
      if (!txRes.ok) {
        migrationHadFailure = true;
        return;
      }
    }

    migrationDoneInSession = true;
  } catch (err) {
    console.error('[FORM Migrations] Ошибка при миграции:', err);
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

export interface StartupRecoveryResolution {
  state: RollbackRecoveryState;
  autoAttempted: boolean;
  autoError: string | null;
}

export function resolveStartupRecoveryState(): StartupRecoveryResolution {
  const initial = getRollbackRecoveryState();
  if (initial.status === 'none') {
    return { state: initial, autoAttempted: false, autoError: null };
  }
  if (initial.status === 'unknown') {
    const errMsg =
      initial.error ||
      'Состояние восстановления повреждено (unknown). Автоматическое восстановление недоступно.';
    lastWriteError = errMsg;
    return { state: initial, autoAttempted: false, autoError: errMsg };
  }

  if (startupAutoRecoveryAttempted) {
    return {
      state: initial,
      autoAttempted: true,
      autoError: lastWriteError,
    };
  }

  startupAutoRecoveryAttempted = true;
  const retryRes = retryPendingRollbackRecovery();
  if (retryRes.ok) {
    lastWriteError = null;
    return {
      state: getRollbackRecoveryState(),
      autoAttempted: true,
      autoError: null,
    };
  }

  const nextState = getRollbackRecoveryState();
  const errMsg = retryRes.error || lastWriteError || 'Не удалось выполнить автоматическое восстановление.';
  lastWriteError = errMsg;
  return {
    state: nextState,
    autoAttempted: true,
    autoError: errMsg,
  };
}

export interface EmergencyRawBackupPayload {
  format: 'form_raw_emergency_backup_v1';
  exportedAt: string;
  recoveryState: RollbackRecoveryState;
  rawKeys: Record<string, string>;
  parsedBackupSections: Record<string, unknown>;
}

const BACKUP_SECTION_BY_KEY: Record<string, string> = {
  form_user_profile: 'profile',
  form_workout_programs: 'programs',
  form_workout_sessions: 'workouts',
  form_sports_sessions_v1: 'sports',
  form_weekly_schedule_v1: 'weeklySchedule',
  form_activity_days: 'activity',
  form_user_equipment_v1: 'equipment',
  form_fitness_parameters_v1: 'fitnessParameters',
  form_favorite_exercises_v1: 'favoriteExerciseIds',
  form_custom_exercises_v1: 'customExercises',
  form_app_settings_v1: 'settings',
  form_wellbeing_checkins_v1: 'wellbeingCheckins',
  form_body_measurements_v1: 'bodyMeasurements',
};

export let lastEmergencyExportRawHash: string | null = null;

export function exportAllStorageRawSnapshot(updateExportHash: boolean = true): EmergencyRawBackupPayload {
  const storage = getStorage();
  const recoveryState = getRollbackRecoveryState();
  const rawKeys: Record<string, string> = {};
  const parsedBackupSections: Record<string, unknown> = {};

  if (storage) {
    const keyNames: string[] = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k) keyNames.push(k);
      }
    } catch {
      // ignore key enumeration failures
    }
    keyNames.sort();

    for (const key of keyNames) {
      try {
        const val = storage.getItem(key);
        if (val !== null) {
          rawKeys[key] = val;
          const section = BACKUP_SECTION_BY_KEY[key];
          if (section) {
            try {
              parsedBackupSections[section] = JSON.parse(val);
            } catch {
              // Keep raw string intact in rawKeys when JSON is invalid
            }
          }
        }
      } catch {
        // ignore single-key read failure
      }
    }
  }

  const dummySnapshots: KeyBackupSnapshot[] = Object.entries(rawKeys).map(([key, value]) => ({
    key,
    rawValue: value,
    quarantineRawValue: null,
    wasLockedInMemory: false,
    wasLockedInIndex: false,
  }));
  const checksum = computeSnapshotChecksum(dummySnapshots);
  if (updateExportHash) {
    lastEmergencyExportRawHash = checksum;
  }

  return {
    format: 'form_raw_emergency_backup_v1',
    exportedAt: new Date().toISOString(),
    recoveryState,
    rawKeys,
    parsedBackupSections,
  };
}

/**
 * Внутренний сброс ТОЛЬКО служебных ключей восстановления через INTERNAL_GATEWAY_TOKEN.
 * Пользовательские данные, карантинные копии и индекс повреждений не затрагиваются.
 */
export function resetRecoveryStateOnly(options: {
  backupConfirmed: boolean;
  userConfirmed: boolean;
}): SafeWriteResult {
  if (!options?.backupConfirmed) {
    return {
      ok: false,
      error: 'Перед сбросом состояния восстановления необходимо сохранить или подтвердить копию данных.',
    };
  }
  if (!options?.userConfirmed) {
    return {
      ok: false,
      error: 'Требуется явное подтверждение пользователя для сброса состояния восстановления.',
    };
  }
  if (!lastEmergencyExportRawHash) {
    return {
      ok: false,
      error: 'Резервная копия не была экспортирована. Перед сбросом необходимо сделать экспорт данных.',
    };
  }

  const storage = getStorage();
  if (!storage) {
    return { ok: false, error: 'Локальное хранилище (localStorage) недоступно.' };
  }

  const currentSnap = exportAllStorageRawSnapshot(false);
  const currentHash = computeSnapshotChecksum(
    Object.entries(currentSnap.rawKeys).map(([key, value]) => ({
      key,
      rawValue: value,
      quarantineRawValue: null,
      wasLockedInMemory: false,
      wasLockedInIndex: false,
    }))
  );
  if (currentHash !== lastEmergencyExportRawHash) {
    return {
      ok: false,
      error: 'Резервная копия устарела: данные в хранилище изменились с момента экспорта. Сделайте свежий экспорт.',
    };
  }

  return withStorageLock('reset_recovery', () => {

    const serviceRecoveryKeys = [
      PENDING_ROLLBACK_KEY,
      ROLLBACK_SNAPSHOT_KEY,
      ROLLBACK_SNAPSHOT_STAGING_KEY,
    ];

    for (const key of serviceRecoveryKeys) {
      if (storage.getItem(key) !== null) {
        const rmRes = removeViaGateway(
          key,
          { allowRemoveCorrupted: true },
          INTERNAL_GATEWAY_TOKEN
        );
        if (!rmRes.ok) {
          lastWriteError = rmRes.error || `Не удалось удалить служебный ключ восстановления "${key}".`;
          return { ok: false, error: lastWriteError };
        }
      }
    }

    // Verify all 3 service keys are deleted (Point 4)
    for (const key of serviceRecoveryKeys) {
      if (storage.getItem(key) !== null) {
        lastWriteError = `Не удалось подтвердить удаление служебного ключа "${key}" из хранилища.`;
        return { ok: false, error: lastWriteError };
      }
    }

    pendingRollbackSnapshots = null;
    pendingRollbackFailedDetails = [];
    lastWriteError = null;
    lastEmergencyExportRawHash = null;
    return { ok: true, error: null };
  });
}

export function resetMigrationSessionFlagForTests(): void {
  migrationDoneInSession = false;
  startupAutoRecoveryAttempted = false;
  corruptedKeysSet.clear();
  locksIndexCorruptedInSession = false;
  lastWriteError = null;
  pendingRollbackSnapshots = null;
  pendingRollbackFailedDetails = [];
  lastEmergencyExportRawHash = null;
}
