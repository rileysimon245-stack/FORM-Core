import { MuscleGroup, EquipmentCategory } from '../types/workout';

export type ExerciseLocation = 'home' | 'gym' | 'both';
export type ExerciseCategoryKey =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'traps'
  | 'functional';

export type ExerciseMovementType =
  | 'Силовое'
  | 'Функциональное'
  | 'Изоляционное'
  | 'С собственным весом'
  | 'Базовое (многосуставное)';

export interface FullExerciseItem {
  id: string;
  name: string;           // Название на русском
  nameEn: string;         // Название на английском
  categoryKey: ExerciseCategoryKey; // Категория
  categoryNameRu: string; // Имя категории на русском
  subCategory?: string;   // Подкатегория
  primaryMuscle: MuscleGroup; // Основная мышечная группа
  secondaryMuscles?: (MuscleGroup | string)[]; // Дополнительные мышцы
  isBodyweight: boolean;
  requiredEquipment: EquipmentCategory;
  equipmentNameRu: string;
  location: ExerciseLocation; // дом, зал, оба
  type: ExerciseMovementType; // силовое, функциональное, изоляционное, с собственным весом
  difficulty: 'Начинающий' | 'Средний' | 'Сложный';
  homeFriendly: boolean;
  defaultSets: number;
  defaultReps: number;
  defaultWeight: number;
  defaultRestSeconds: number;
  technique: string;
  alternatives: string[];
  isCustom?: boolean;
}

export const EXERCISE_CATEGORIES_CONFIG: {
  key: ExerciseCategoryKey;
  nameRu: string;
  primaryMuscle: MuscleGroup;
}[] = [
  { key: 'chest', nameRu: 'Грудь', primaryMuscle: 'chest' },
  { key: 'back', nameRu: 'Спина', primaryMuscle: 'lats' },
  { key: 'shoulders', nameRu: 'Плечи', primaryMuscle: 'shoulders' },
  { key: 'biceps', nameRu: 'Бицепс', primaryMuscle: 'biceps' },
  { key: 'triceps', nameRu: 'Трицепс', primaryMuscle: 'triceps' },
  { key: 'forearms', nameRu: 'Предплечья', primaryMuscle: 'forearms' },
  { key: 'core', nameRu: 'Пресс', primaryMuscle: 'abs' },
  { key: 'quads', nameRu: 'Квадрицепсы', primaryMuscle: 'quads' },
  { key: 'hamstrings', nameRu: 'Бицепс бедра', primaryMuscle: 'hamstrings' },
  { key: 'glutes', nameRu: 'Ягодицы', primaryMuscle: 'glutes' },
  { key: 'calves', nameRu: 'Икры', primaryMuscle: 'calves' },
  { key: 'traps', nameRu: 'Трапеции', primaryMuscle: 'traps' },
  { key: 'functional', nameRu: 'Функциональные', primaryMuscle: 'abs' },
];

export const EQUIPMENT_OPTIONS_CONFIG: {
  key: string;
  labelRu: string;
  category: EquipmentCategory;
}[] = [
  { key: 'all', labelRu: 'Любое', category: 'bodyweight' },
  { key: 'bodyweight', labelRu: 'Без оборудования', category: 'bodyweight' },
  { key: 'dumbbells', labelRu: 'Гантели', category: 'dumbbells_adjustable' },
  { key: 'barbell', labelRu: 'Штанга', category: 'barbell' },
  { key: 'ez_bar', labelRu: 'EZ-гриф', category: 'barbell' },
  { key: 'pullup_bar', labelRu: 'Турник', category: 'pullup_bar' },
  { key: 'dip_bars', labelRu: 'Брусья', category: 'dip_bars' },
  { key: 'bands', labelRu: 'Резинки / Эспандер', category: 'resistance_bands' },
  { key: 'bench', labelRu: 'Скамья', category: 'bench' },
  { key: 'gym_machines', labelRu: 'Тренажёры', category: 'gym_machines' },
  { key: 'crossover', labelRu: 'Кроссовер / Блоки', category: 'crossover' },
  { key: 'kettlebell', labelRu: 'Гири', category: 'kettlebells' },
  { key: 'jump_rope', labelRu: 'Скакалка', category: 'jump_rope' },
];
