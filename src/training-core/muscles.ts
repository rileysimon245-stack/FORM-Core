/**
 * ============================================================================
 * FORM Core — Нормализация ключей мышц и иерархия групп
 * ============================================================================
 * Приводит исторические псевдонимы ('rearDelts', 'core', русские названия и т.д.)
 * к единому каноническому формату MuscleGroup без потери старых данных.
 */

import { MuscleGroup } from '../types/workout';

export const CANONICAL_MUSCLE_KEYS: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'chest',
  'chest_upper',
  'chest_mid',
  'chest_lower',
  'shoulders',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'brachialis',
  'triceps',
  'forearms',
  'traps',
  'traps_upper',
  'traps_mid',
  'traps_lower',
  'rhomboids',
  'lats',
  'lowerback',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'quads_rectus',
  'quads_lateralis',
  'quads_medialis',
  'hamstrings',
  'calves',
  'tibialis',
]);

const ALIAS_MAP: Record<string, MuscleGroup> = {
  // Грудные
  'грудные (общие)': 'chest',
  'грудные': 'chest',
  'грудь': 'chest',
  'верх груди': 'chest_upper',
  'верхняя часть груди': 'chest_upper',
  'средняя часть груди': 'chest_mid',
  'низ груди': 'chest_lower',
  'нижняя часть груди': 'chest_lower',
  'chest': 'chest',
  'chest_upper': 'chest_upper',
  'chest_mid': 'chest_mid',
  'chest_lower': 'chest_lower',

  // Плечи
  'плечи': 'shoulders',
  'дельты': 'shoulders',
  'передняя дельта': 'front_delts',
  'передние дельты': 'front_delts',
  'боковая дельта': 'side_delts',
  'средняя дельта': 'side_delts',
  'боковые дельты': 'side_delts',
  'средние дельты': 'side_delts',
  'задняя дельта': 'rear_delts',
  'задние дельты': 'rear_delts',
  'shoulders': 'shoulders',
  'front_delts': 'front_delts',
  'side_delts': 'side_delts',
  'rear_delts': 'rear_delts',
  'reardelts': 'rear_delts',
  'rotator_cuff': 'rear_delts',

  // Руки
  'бицепс': 'biceps',
  'двуглавая мышца плеча': 'biceps',
  'плечевая мышца': 'brachialis',
  'брахиалис': 'brachialis',
  'трицепс': 'triceps',
  'трехглавая мышца плеча': 'triceps',
  'предплечья': 'forearms',
  'предплечье': 'forearms',
  'biceps': 'biceps',
  'brachialis': 'brachialis',
  'triceps': 'triceps',
  'forearms': 'forearms',

  // Спина и трапеции
  'широчайшие': 'lats',
  'широчайшие мышцы спины': 'lats',
  'спина': 'lats',
  'back': 'lats',
  'upper_back': 'traps_mid',
  'трапеция': 'traps',
  'трапеции': 'traps',
  'верх трапеции': 'traps_upper',
  'середина трапеции': 'traps_mid',
  'низ трапеции': 'traps_lower',
  'ромбовидные': 'rhomboids',
  'поясница': 'lowerback',
  'разгибатели спины': 'lowerback',
  'lats': 'lats',
  'traps': 'traps',
  'traps_upper': 'traps_upper',
  'traps_mid': 'traps_mid',
  'traps_lower': 'traps_lower',
  'rhomboids': 'rhomboids',
  'lowerback': 'lowerback',

  // Кор
  'пресс': 'abs',
  'кор': 'abs',
  'core': 'abs',
  'прямая мышца живота': 'abs',
  'косые': 'obliques',
  'косые мышцы живота': 'obliques',
  'abs': 'abs',
  'obliques': 'obliques',

  // Ноги и ягодицы
  'ягодицы': 'glutes',
  'ягодичные': 'glutes',
  'abductors': 'glutes',
  'квадрицепс': 'quads',
  'квадрицепсы': 'quads',
  'четырехглавая мышца бедра': 'quads',
  'прямая мышца бедра': 'quads_rectus',
  'латеральная мышца бедра': 'quads_lateralis',
  'медиальная мышца бедра': 'quads_medialis',
  'adductors': 'quads_medialis',
  'бицепс бедра': 'hamstrings',
  'задняя поверхность бедра': 'hamstrings',
  'икры': 'calves',
  'икроножная': 'calves',
  'передняя большеберцовая': 'tibialis',
  'glutes': 'glutes',
  'quads': 'quads',
  'quads_rectus': 'quads_rectus',
  'quads_lateralis': 'quads_lateralis',
  'quads_medialis': 'quads_medialis',
  'hamstrings': 'hamstrings',
  'calves': 'calves',
  'tibialis': 'tibialis',
};

export function normalizeMuscleKeyPure(rawKey?: string | null): MuscleGroup | null {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const clean = rawKey.trim().toLowerCase();
  if (!clean) return null;
  if (ALIAS_MAP[clean]) return ALIAS_MAP[clean];
  if (CANONICAL_MUSCLE_KEYS.has(clean as MuscleGroup)) {
    return clean as MuscleGroup;
  }
  return null;
}

export function normalizeMuscleListPure(rawList?: (MuscleGroup | string)[] | null): MuscleGroup[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<MuscleGroup>();
  const out: MuscleGroup[] = [];
  for (const raw of rawList) {
    const norm = normalizeMuscleKeyPure(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}
