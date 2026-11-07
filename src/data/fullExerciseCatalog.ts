import { FullExerciseItem } from './exerciseTypes';
import { EXERCISES_PART_1 } from './exercisesPart1';
import { EXERCISES_PART_2 } from './exercisesPart2';
import { EXERCISES_PART_3 } from './exercisesPart3';
import { EXERCISES_PART_4 } from './exercisesPart4';
import { EXERCISES_PART_5 } from './exercisesPart5';
import { EXERCISES_PART_6 } from './exercisesPart6';
import { EXERCISES_PART_7 } from './exercisesPart7';

// Combine all exercises from the 7 category parts (181 total items from the prompt specification)
export const COMPREHENSIVE_FULL_CATALOG: FullExerciseItem[] = [
  ...EXERCISES_PART_1,
  ...EXERCISES_PART_2,
  ...EXERCISES_PART_3,
  ...EXERCISES_PART_4,
  ...EXERCISES_PART_5,
  ...EXERCISES_PART_6,
  ...EXERCISES_PART_7,
];

// Helper map by ID for O(1) lookups
export const EXERCISES_BY_ID_MAP: Record<string, FullExerciseItem> = {};
COMPREHENSIVE_FULL_CATALOG.forEach(ex => {
  EXERCISES_BY_ID_MAP[ex.id] = ex;
});

// Helper map by lowercase Name for backwards-compatibility lookups
export const EXERCISES_BY_NAME_MAP: Record<string, FullExerciseItem> = {};
COMPREHENSIVE_FULL_CATALOG.forEach(ex => {
  EXERCISES_BY_NAME_MAP[ex.name.toLowerCase().trim()] = ex;
  EXERCISES_BY_NAME_MAP[ex.nameEn.toLowerCase().trim()] = ex;
});
