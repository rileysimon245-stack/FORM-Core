/**
 * ============================================================================
 * FORM Core — Единый нормализованный справочник упражнений
 * ============================================================================
 * Объединяет полный каталог (COMPREHENSIVE_FULL_CATALOG, 181 упр.),
 * уникальные исторические позиции из EXERCISE_CATALOG и пользовательские
 * упражнения. Все ключи мышц приведены к каноническому формату.
 */

import type { FullExerciseItem } from '../data/exerciseTypes';
import { EXERCISE_CATALOG, ExerciseLibraryItem, MuscleGroup } from '../types/workout';
import { normalizeMuscleKeyPure, normalizeMuscleListPure } from './muscles';

export interface UnifiedExerciseEntry {
  id: string;
  name: string;
  nameEn?: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  isBodyweight: boolean;
  requiredEquipment: ExerciseLibraryItem['requiredEquipment'];
  difficulty: string;
  type: string;
  homeFriendly: boolean;
  defaultSets: number;
  defaultReps: number;
  defaultWeight: number;
  defaultRestSeconds: number;
  technique: string;
  alternatives: string[];
  isCustom?: boolean;
}

function normalizeFullItem(item: FullExerciseItem): UnifiedExerciseEntry {
  const normPrimary = normalizeMuscleKeyPure(item.primaryMuscle) || 'chest';
  const normSecondaries = normalizeMuscleListPure(item.secondaryMuscles).filter(
    (m) => m !== normPrimary
  );

  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn,
    primaryMuscle: normPrimary,
    secondaryMuscles: normSecondaries,
    isBodyweight: Boolean(item.isBodyweight),
    requiredEquipment: item.requiredEquipment,
    difficulty: item.difficulty,
    type: item.type,
    homeFriendly: Boolean(item.homeFriendly),
    defaultSets: item.defaultSets,
    defaultReps: item.defaultReps,
    defaultWeight: item.defaultWeight,
    defaultRestSeconds: item.defaultRestSeconds,
    technique: item.technique,
    alternatives: Array.isArray(item.alternatives) ? item.alternatives : [],
    isCustom: item.isCustom,
  };
}

function normalizeLegacyItem(item: ExerciseLibraryItem): UnifiedExerciseEntry {
  const normPrimary = normalizeMuscleKeyPure(item.primaryMuscle) || 'chest';
  const normSecondaries = normalizeMuscleListPure(item.secondaryMuscles).filter(
    (m) => m !== normPrimary
  );

  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn,
    primaryMuscle: normPrimary,
    secondaryMuscles: normSecondaries,
    isBodyweight: Boolean(item.isBodyweight),
    requiredEquipment: item.requiredEquipment,
    difficulty: item.difficulty,
    type: item.type,
    homeFriendly: Boolean(item.homeFriendly),
    defaultSets: item.defaultSets,
    defaultReps: item.defaultReps,
    defaultWeight: item.defaultWeight,
    defaultRestSeconds: item.defaultRestSeconds,
    technique: item.technique,
    alternatives: Array.isArray(item.alternatives) ? item.alternatives : [],
    isCustom: item.isCustom,
  };
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, 'е');
}

// Собираем единый каталог без потери одноимённых упражнений разных групп
const builtInList: UnifiedExerciseEntry[] = [];
const byIdMap = new Map<string, UnifiedExerciseEntry>();
const byNameMap = new Map<string, UnifiedExerciseEntry[]>();

function addEntryToNameMap(rawName: string | undefined, entry: UnifiedExerciseEntry) {
  if (!rawName) return;
  const key = normalizeNameKey(rawName);
  if (!key) return;
  const existing = byNameMap.get(key) || [];
  if (!existing.some((e) => e.id === entry.id)) {
    existing.push(entry);
    byNameMap.set(key, existing);
  }
}

function rebuildBuiltInCatalog(fullItems: readonly FullExerciseItem[]): void {
  builtInList.length = 0;
  byIdMap.clear();
  byNameMap.clear();

  for (const item of fullItems) {
    const entry = normalizeFullItem(item);
    if (!byIdMap.has(entry.id)) {
      builtInList.push(entry);
      byIdMap.set(entry.id, entry);
      addEntryToNameMap(entry.name, entry);
      addEntryToNameMap(entry.nameEn, entry);
    }
  }

  for (const legacy of EXERCISE_CATALOG) {
    const nameKey = normalizeNameKey(legacy.name);
    if (!byIdMap.has(legacy.id) && !byNameMap.has(nameKey)) {
      const entry = normalizeLegacyItem(legacy);
      builtInList.push(entry);
      byIdMap.set(entry.id, entry);
      addEntryToNameMap(entry.name, entry);
      addEntryToNameMap(entry.nameEn, entry);
    }
  }
}

// Начальная лёгкая инициализация базовым EXERCISE_CATALOG (полный каталог догружается динамически по требованию)
rebuildBuiltInCatalog([]);

export const UNIFIED_BUILTIN_CATALOG: readonly UnifiedExerciseEntry[] = builtInList;

export interface FullCatalogLoader {
  load: () => Promise<FullExerciseItem[]>;
  isLoaded: () => boolean;
  getCached: () => FullExerciseItem[] | null;
  reset: () => void;
}

export function createFullExerciseCatalogLoader(
  importer: () => Promise<readonly FullExerciseItem[]>,
  onLoaded?: (items: FullExerciseItem[]) => void
): FullCatalogLoader {
  let cached: FullExerciseItem[] | null = null;
  let inFlight: Promise<FullExerciseItem[]> | null = null;

  return {
    load: async (): Promise<FullExerciseItem[]> => {
      if (cached !== null) {
        return cached;
      }
      if (inFlight !== null) {
        return inFlight;
      }

      inFlight = (async () => {
        try {
          const loaded = await importer();
          if (!Array.isArray(loaded) || loaded.length === 0) {
            throw new Error('Загруженный каталог упражнений пуст или повреждён.');
          }
          const copy = [...loaded];
          cached = copy;
          if (onLoaded) {
            onLoaded(copy);
          }
          return copy;
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    },
    isLoaded: () => cached !== null,
    getCached: () => cached,
    reset: () => {
      cached = null;
      inFlight = null;
    },
  };
}

const defaultFullCatalogLoader = createFullExerciseCatalogLoader(
  () => import('../data/fullExerciseCatalog').then((mod) => mod.COMPREHENSIVE_FULL_CATALOG),
  (items) => {
    rebuildBuiltInCatalog(items);
  }
);

export function loadFullExerciseCatalog(): Promise<FullExerciseItem[]> {
  return defaultFullCatalogLoader.load();
}

export function isFullExerciseCatalogLoaded(): boolean {
  return defaultFullCatalogLoader.isLoaded();
}

export function getCachedFullExerciseCatalog(): FullExerciseItem[] | null {
  return defaultFullCatalogLoader.getCached();
}

export function resetFullExerciseCatalogCacheForTests(): void {
  defaultFullCatalogLoader.reset();
  rebuildBuiltInCatalog([]);
}

export function getUnifiedCatalog(customExercises: FullExerciseItem[] = []): UnifiedExerciseEntry[] {
  const customEntries = customExercises.map(normalizeFullItem);
  return [...UNIFIED_BUILTIN_CATALOG, ...customEntries];
}

export type ExerciseLookupStatus =
  | 'exact_id'
  | 'unique_name'
  | 'disambiguated'
  | 'ambiguous_name'
  | 'not_found';

export interface ExerciseLookupResult {
  status: ExerciseLookupStatus;
  entry: UnifiedExerciseEntry | null;
  matches: UnifiedExerciseEntry[];
}

export function resolveExerciseInUnifiedCatalog(
  exerciseId?: string | null,
  exerciseName?: string | null,
  customExercises: FullExerciseItem[] = [],
  preferredPrimaryMuscle?: string | null
): ExerciseLookupResult {
  // 1. Точный поиск по ID (включая пользовательские и встроенные)
  if (exerciseId) {
    if (customExercises.length > 0) {
      const customById = customExercises.find((c) => c.id === exerciseId);
      if (customById) {
        const entry = normalizeFullItem(customById);
        return { status: 'exact_id', entry, matches: [entry] };
      }
    }
    const builtInById = byIdMap.get(exerciseId);
    if (builtInById) {
      return { status: 'exact_id', entry: builtInById, matches: [builtInById] };
    }
  }

  // 2. Поиск по имени без затирания одноимённых упражнений
  if (exerciseName) {
    const clean = normalizeNameKey(exerciseName);
    if (clean) {
      const candidates: UnifiedExerciseEntry[] = [];
      const seenIds = new Set<string>();

      for (const c of customExercises) {
        if (
          normalizeNameKey(c.name) === clean ||
          (c.nameEn && normalizeNameKey(c.nameEn) === clean)
        ) {
          const entry = normalizeFullItem(c);
          if (!seenIds.has(entry.id)) {
            seenIds.add(entry.id);
            candidates.push(entry);
          }
        }
      }

      const builtInMatches = byNameMap.get(clean) || [];
      for (const m of builtInMatches) {
        if (!seenIds.has(m.id)) {
          seenIds.add(m.id);
          candidates.push(m);
        }
      }

      if (candidates.length === 1) {
        return { status: 'unique_name', entry: candidates[0], matches: candidates };
      }

      if (candidates.length > 1) {
        const normPref = normalizeMuscleKeyPure(preferredPrimaryMuscle);
        if (normPref) {
          const byMuscle = candidates.filter((c) => c.primaryMuscle === normPref);
          if (byMuscle.length === 1) {
            return { status: 'disambiguated', entry: byMuscle[0], matches: candidates };
          }
        }
        return { status: 'ambiguous_name', entry: null, matches: candidates };
      }
    }
  }

  return { status: 'not_found', entry: null, matches: [] };
}

export function findExerciseInUnifiedCatalog(
  exerciseId?: string | null,
  exerciseName?: string | null,
  customExercises: FullExerciseItem[] = [],
  preferredPrimaryMuscle?: string | null
): UnifiedExerciseEntry | null {
  return resolveExerciseInUnifiedCatalog(
    exerciseId,
    exerciseName,
    customExercises,
    preferredPrimaryMuscle
  ).entry;
}
