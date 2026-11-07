/**
 * Data types and models for the FORM workout tracker app
 */

export type MuscleGroup =
  // Base & Rollups
  | 'chest'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'tibialis'
  | 'hamstrings'
  | 'calves'
  | 'lats'
  | 'traps'
  | 'rearDelts'
  | 'lowerback'
  | 'glutes'
  // Chest detailed
  | 'chest_upper'
  | 'chest_mid'
  | 'chest_lower'
  // Shoulders detailed
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  // Arms detailed
  | 'brachialis'
  // Back detailed
  | 'traps_upper'
  | 'traps_mid'
  | 'traps_lower'
  | 'rhomboids'
  // Quads detailed
  | 'quads_rectus'
  | 'quads_lateralis'
  | 'quads_medialis';

export type MusclePeriod = 'session' | '7d' | '30d' | '90d' | 'all';



export interface MuscleInfo {
  id: MuscleGroup;
  nameRu: string;
  view: 'front' | 'back' | 'both';
  category: 'upper' | 'core' | 'lower';
  defaultPercent: number;
  recoveryHours: number;
  locationRu: string;
  functionRu: string;
}

export const MUSCLE_DEFINITIONS: Record<MuscleGroup, MuscleInfo> = {
  // --- CHEST ---
  chest_upper: {
    id: 'chest_upper',
    nameRu: 'Верхняя часть груди',
    view: 'front',
    category: 'upper',
    defaultPercent: 65,
    recoveryHours: 48,
    locationRu: 'Ключичная часть большой грудной мышцы (верхние пучки).',
    functionRu: 'Подъем и приведение руки вперед-вверх, жимы на наклонной скамье.',
  },
  chest_mid: {
    id: 'chest_mid',
    nameRu: 'Средняя часть груди',
    view: 'front',
    category: 'upper',
    defaultPercent: 70,
    recoveryHours: 48,
    locationRu: 'Грудинно-реберная порция большой грудной мышцы.',
    functionRu: 'Горизонтальное приведение рук к центру, базовые жимы лежа и сведения.',
  },
  chest_lower: {
    id: 'chest_lower',
    nameRu: 'Нижняя часть груди',
    view: 'front',
    category: 'upper',
    defaultPercent: 60,
    recoveryHours: 48,
    locationRu: 'Абдоминальная часть грудной мышцы вдоль нижнего реберного контура.',
    functionRu: 'Приведение руки книзу, отжимания на брусьях и жимы на наклонной скамье головой вниз.',
  },
  chest: {
    id: 'chest',
    nameRu: 'Грудные (общие)',
    view: 'front',
    category: 'upper',
    defaultPercent: 68,
    recoveryHours: 48,
    locationRu: 'Большая и малая грудные мышцы.',
    functionRu: 'Горизонтальное приведение, сгибание и внутренняя ротация плеча.',
  },

  // --- SHOULDERS ---
  front_delts: {
    id: 'front_delts',
    nameRu: 'Передняя дельта',
    view: 'front',
    category: 'upper',
    defaultPercent: 50,
    recoveryHours: 48,
    locationRu: 'Передний пучок дельтовидной мышцы на передней стороне плеча.',
    functionRu: 'Сгибание и подъем плеча вперед, вертикальные армейские жимы.',
  },
  side_delts: {
    id: 'side_delts',
    nameRu: 'Средняя дельта',
    view: 'both',
    category: 'upper',
    defaultPercent: 45,
    recoveryHours: 48,
    locationRu: 'Латеральный пучок дельтовидной мышцы, формирующий ширину плеч.',
    functionRu: 'Отведение руки в сторону до горизонтали (махи гантелями).',
  },
  rear_delts: {
    id: 'rear_delts',
    nameRu: 'Задняя дельта',
    view: 'back',
    category: 'upper',
    defaultPercent: 40,
    recoveryHours: 36,
    locationRu: 'Задний пучок дельтовидной мышцы на тыльной поверхности плечевого сустава.',
    functionRu: 'Горизонтальное отведение руки назад, внешняя ротация плеча.',
  },
  rearDelts: {
    id: 'rearDelts',
    nameRu: 'Задняя дельта',
    view: 'back',
    category: 'upper',
    defaultPercent: 40,
    recoveryHours: 36,
    locationRu: 'Задний пучок дельтовидной мышцы.',
    functionRu: 'Горизонтальное отведение плеча назад.',
  },
  shoulders: {
    id: 'shoulders',
    nameRu: 'Плечи (дельтовидные)',
    view: 'both',
    category: 'upper',
    defaultPercent: 46,
    recoveryHours: 48,
    locationRu: 'Дельтовидные мышцы плечевого пояса (передняя, средняя, задняя).',
    functionRu: 'Подъем, отведение и вращение рук во всех плоскостях.',
  },

  // --- ARMS ---
  biceps: {
    id: 'biceps',
    nameRu: 'Бицепс',
    view: 'front',
    category: 'upper',
    defaultPercent: 52,
    recoveryHours: 36,
    locationRu: 'Двуглавая мышца плеча на передней поверхности между плечом и локтем.',
    functionRu: 'Сгибание предплечья в локтевом суставе и супинация кисти (разворот ладонью кверху).',
  },
  brachialis: {
    id: 'brachialis',
    nameRu: 'Брахиалис',
    view: 'front',
    category: 'upper',
    defaultPercent: 42,
    recoveryHours: 36,
    locationRu: 'Плечевая мышца, залегающая под нижней частью бицепса с наружной стороны.',
    functionRu: 'Чистое сгибание предплечья при нейтральном или прямом хвате («молотковые» сгибания).',
  },
  triceps: {
    id: 'triceps',
    nameRu: 'Трицепс',
    view: 'back',
    category: 'upper',
    defaultPercent: 55,
    recoveryHours: 36,
    locationRu: 'Трехглавая мышца задней поверхности плеча (латеральная, длинная и медиальная головки).',
    functionRu: 'Разгибание руки в локтевом суставе и приведение руки к туловищу.',
  },
  forearms: {
    id: 'forearms',
    nameRu: 'Предплечья',
    view: 'both',
    category: 'upper',
    defaultPercent: 35,
    recoveryHours: 24,
    locationRu: 'Мышцы от локтевого сустава до кисти (плечелучевая мышца, сгибатели и разгибатели пальцев).',
    functionRu: 'Хват пальцев, сгибание/разгибание запястья и стабилизация снаряда.',
  },

  // --- BACK ---
  traps_upper: {
    id: 'traps_upper',
    nameRu: 'Верхняя трапеция',
    view: 'back',
    category: 'upper',
    defaultPercent: 45,
    recoveryHours: 36,
    locationRu: 'Верхние волокна трапециевидной мышцы от затылка к ключице и акромиону.',
    functionRu: 'Подъем плечевого пояса вверх (шраги), фиксация лопаток при удержании веса.',
  },
  traps_mid: {
    id: 'traps_mid',
    nameRu: 'Средняя трапеция',
    view: 'back',
    category: 'upper',
    defaultPercent: 42,
    recoveryHours: 36,
    locationRu: 'Горизонтальные пучки трапеции между остью лопатки и позвоночником.',
    functionRu: 'Мощное сведение лопаток назад к позвоночному столбу в тягах.',
  },
  traps_lower: {
    id: 'traps_lower',
    nameRu: 'Нижняя трапеция',
    view: 'back',
    category: 'upper',
    defaultPercent: 38,
    recoveryHours: 36,
    locationRu: 'Нисходящие волокна трапециевидной мышцы к нижним грудным позвонкам.',
    functionRu: 'Опускание лопатки книзу (депрессия) и правильная фиксация плеча при подтягиваниях.',
  },
  rhomboids: {
    id: 'rhomboids',
    nameRu: 'Ромбовидные мышцы',
    view: 'back',
    category: 'upper',
    defaultPercent: 44,
    recoveryHours: 48,
    locationRu: 'Большая и малая ромбовидные мышцы под трапецией вдоль внутреннего края лопатки.',
    functionRu: 'Сведение, вращение и плотное прижатие лопатки к грудной стенке.',
  },
  traps: {
    id: 'traps',
    nameRu: 'Трапеции (общие)',
    view: 'back',
    category: 'upper',
    defaultPercent: 44,
    recoveryHours: 36,
    locationRu: 'Трапециевидная мышца спины от затылка до нижних грудных позвонков.',
    functionRu: 'Подъем, сведение и опускание лопаток.',
  },
  lats: {
    id: 'lats',
    nameRu: 'Широчайшие спины',
    view: 'back',
    category: 'upper',
    defaultPercent: 55,
    recoveryHours: 48,
    locationRu: 'Большие крыловидные мышцы средней и нижней части спины.',
    functionRu: 'Тяга рук сверху вниз и к корпусу, приведение плеча и формирование V-образного силуэта.',
  },
  lowerback: {
    id: 'lowerback',
    nameRu: 'Разгибатели спины (поясница)',
    view: 'back',
    category: 'core',
    defaultPercent: 35,
    recoveryHours: 48,
    locationRu: 'Глубокие мышечные столбы (мышца, выпрямляющая позвоночник) в поясничной зоне.',
    functionRu: 'Разгибание позвоночника, стабилизация корпуса и удержание осанки при осевых нагрузках.',
  },

  // --- CORE ---
  abs: {
    id: 'abs',
    nameRu: 'Прямая мышца живота',
    view: 'front',
    category: 'core',
    defaultPercent: 55,
    recoveryHours: 24,
    locationRu: 'Передняя брюшная стенка от лобкового гребня до мечевидного отростка (кубики пресса).',
    functionRu: 'Сгибание позвоночника вперед, подъем таза к грудной клетке, удержание брюшного давления.',
  },
  obliques: {
    id: 'obliques',
    nameRu: 'Косые мышцы живота',
    view: 'front',
    category: 'core',
    defaultPercent: 45,
    recoveryHours: 24,
    locationRu: 'Боковые стенки живота от нижних ребер до подвздошного гребня.',
    functionRu: 'Вращение и боковое сгибание корпуса, жесткая стабилизация таза и талии.',
  },

  // --- LEGS ---
  quads_rectus: {
    id: 'quads_rectus',
    nameRu: 'Прямая мышца бедра',
    view: 'front',
    category: 'lower',
    defaultPercent: 60,
    recoveryHours: 72,
    locationRu: 'Центральная поверхностная головка квадрицепса, проходящая по центру бедра.',
    functionRu: 'Разгибание ноги в коленном суставе и содействие сгибанию бедра в тазобедренном.',
  },
  quads_lateralis: {
    id: 'quads_lateralis',
    nameRu: 'Латеральная широкая (внешняя)',
    view: 'front',
    category: 'lower',
    defaultPercent: 62,
    recoveryHours: 72,
    locationRu: 'Внешняя массивная головка квадрицепса, формирующая наружный изгиб бедра.',
    functionRu: 'Мощное разгибание ноги в колене в базовых приседаниях и жимах ногами.',
  },
  quads_medialis: {
    id: 'quads_medialis',
    nameRu: 'Медиальная широкая («капля»)',
    view: 'front',
    category: 'lower',
    defaultPercent: 58,
    recoveryHours: 72,
    locationRu: 'Внутренняя каплевидная головка квадрицепса непосредственно над коленным суставом.',
    functionRu: 'Финальное доразгибание колена и центрирование коленной чашечки.',
  },
  quads: {
    id: 'quads',
    nameRu: 'Квадрицепсы (общие)',
    view: 'front',
    category: 'lower',
    defaultPercent: 62,
    recoveryHours: 72,
    locationRu: 'Четырехглавая мышца передней поверхности бедра.',
    functionRu: 'Разгибание ноги в коленном суставе.',
  },
  hamstrings: {
    id: 'hamstrings',
    nameRu: 'Бицепс бедра',
    view: 'back',
    category: 'lower',
    defaultPercent: 48,
    recoveryHours: 72,
    locationRu: 'Задняя поверхность бедра (двуглавая, полусухожильная и полуперепончатая мышцы).',
    functionRu: 'Сгибание голени в колене и разгибание туловища в тазобедренном суставе.',
  },
  glutes: {
    id: 'glutes',
    nameRu: 'Ягодичные мышцы',
    view: 'back',
    category: 'lower',
    defaultPercent: 52,
    recoveryHours: 48,
    locationRu: 'Большая, средняя и малая ягодичные мышцы тазовой области.',
    functionRu: 'Разгибание, отведение и внешняя ротация бедра, стабилизация таза.',
  },
  calves: {
    id: 'calves',
    nameRu: 'Икроножные мышцы',
    view: 'both',
    category: 'lower',
    defaultPercent: 30,
    recoveryHours: 24,
    locationRu: 'Задняя поверхность голени (икроножная и камбаловидная мышцы).',
    functionRu: 'Подошвенное сгибание стопы (подъем на носки), толчок при беге и прыжках.',
  },
  tibialis: {
    id: 'tibialis',
    nameRu: 'Передняя большеберцовая',
    view: 'front',
    category: 'lower',
    defaultPercent: 32,
    recoveryHours: 24,
    locationRu: 'Передняя наружная сторона голени вдоль большеберцовой кости.',
    functionRu: 'Тыльное сгибание стопы (подъем носка вверх), амортизация при приземлениях.',
  },
};


export type EquipmentCategory =
  | 'bodyweight'
  | 'pullup_bar'
  | 'dip_bars'
  | 'dumbbells_adjustable'
  | 'dumbbells_fixed'
  | 'barbell'
  | 'bench'
  | 'resistance_bands'
  | 'kettlebells'
  | 'jump_rope'
  | 'gym_machines'
  | 'crossover'
  | 'other';

export interface EquipmentItem {
  id: EquipmentCategory;
  name: string;
  categoryName: string;
  iconName: string;
  selected: boolean;
  owned?: boolean;
  minWeightKg?: number;
  maxWeightKg?: number;
  weightStepKg?: number;
  singleDumbbellWeightKg?: number;
  notes?: string;
}

export interface ActivityDay {
  date: string;
  status: 'completed' | 'skipped' | 'none';
  sessionName?: string;
  notes?: string;
}

export interface UserFitnessParameters {
  goal: 'Сила' | 'Выносливость' | 'Общая физическая подготовка' | 'Развитие мышц' | 'Улучшение физической формы';
  level: 'Начинающий' | 'Средний' | 'Продвинутый';
  location: 'Дома' | 'В зале' | 'На улице';
  daysPerWeek: number;
  durationMinutes: number;
  availableDays: string[];
  preferredMuscles: MuscleGroup[];
  excludedExercises: string[];
  healthRestrictions: string[];
  notes?: string;
}

export interface ExerciseSet {
  setNumber: number;
  weightKg: number;
  reps: number;
  completed: boolean;
  previousWeightKg?: number;
  previousReps?: number;
  note?: string;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  targetMuscle: MuscleGroup;
  secondaryMuscles?: (MuscleGroup | string)[];
  isBodyweight: boolean;
  requiredEquipment?: EquipmentCategory;
  sets: ExerciseSet[];
  restSeconds: number;
  notes?: string;
  technique?: string;
  skipped?: boolean;
}

export interface ProgramExerciseTemplate {
  exerciseId?: string;
  name: string;
  targetMuscle: MuscleGroup;
  secondaryMuscles?: (MuscleGroup | string)[];
  isBodyweight: boolean;
  requiredEquipment?: EquipmentCategory;
  sets: number;
  reps: number;
  targetWeight: number;
  restSeconds: number;
  technique?: string;
  notes?: string;
}

export interface ProgramWorkoutDay {
  id: string;
  dayName: string;
  targetMuscleGroups: MuscleGroup[];
  estimatedDuration: number;
  exercises: ProgramExerciseTemplate[];
}

export interface WorkoutProgram {
  id: string;
  name: string;
  description: string;
  goal: string;
  daysPerWeek: number;
  workouts: ProgramWorkoutDay[];
  weeklySchedule?: WeeklyScheduleDay[];
  isCustom: boolean;
  createdAt: string;
}

export interface PersonalRecordInfo {
  exerciseName: string;
  weightKg: number;
  reps: number;
  date: string;
  isNew?: boolean;
}

export interface ExerciseProgressPoint {
  date: string;
  fullDate: string;
  maxWeight: number;
  maxReps: number;
  totalReps: number;
  volume: number;
  setsCount: number;
  setsDetails: { setNumber: number; weightKg: number; reps: number }[];
  sessionName: string;
}

export interface ProgramSnapshotExercise {
  name: string;
  targetMuscle: MuscleGroup;
  sets: number;
  reps: number;
  targetWeight?: number;
  isBodyweight?: boolean;
  restSeconds?: number;
}

export interface ProgramSnapshot {
  programId?: string;
  programName?: string;
  dayId?: string;
  dayName?: string;
  targetMuscleGroups?: MuscleGroup[];
  plannedExercises?: ProgramSnapshotExercise[];
}

export interface WorkoutSession {
  id: string;
  programId?: string;
  programName?: string;
  programDayId?: string;
  programDayName?: string;
  programSnapshot?: ProgramSnapshot;
  name: string;
  date: string;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  exercises: WorkoutExercise[];
  totalVolumeKg: number;
  completedSets: number;
  totalReps?: number;
  notes?: string;
  status: 'completed' | 'in_progress' | 'skipped';
  personalRecords?: PersonalRecordInfo[];
}

export interface UserProfile {
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  fitnessGoal: string;
  experienceLevel: string;
  streakDays: number;
}

export type SportType =
  | 'strength'
  | 'boxing'
  | 'basketball'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'other_sport'
  | 'rest';

export type ActivityIntensity = 'low' | 'medium' | 'high';

export interface SportSession {
  id: string;
  sportType: SportType;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  intensity: ActivityIntensity;
  status: 'planned' | 'completed' | 'skipped' | 'rescheduled';
  notes?: string;
  loadScore?: number; // Calculated load points: intensity × duration × sport Coeff
  strengthSessionId?: string; // Link to WorkoutSession if it's strength
}

export interface DayActivityItem {
  id: string;
  sportType: SportType;
  title: string;
  startTime: string; // HH:MM e.g. "08:30" or "18:00"
  durationMinutes: number;
  intensity: ActivityIntensity;
  notes?: string;
  strengthWorkoutDayId?: string;
}

export interface WeeklyScheduleDay {
  dayOfWeek: number; // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  dayName: string; // 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'
  fullDayName: string; // 'Понедельник', 'Вторник'...
  activities: DayActivityItem[];
}

export const SPORT_DEFINITIONS: Record<
  SportType,
  {
    nameRu: string;
    icon: string;
    color: string;
    bgBadge: string;
    loadMultiplier: number;
    primaryMuscles: MuscleGroup[];
    secondaryMuscles: MuscleGroup[];
    description: string;
  }
> = {
  strength: {
    nameRu: 'Силовая тренировка',
    icon: 'Dumbbell',
    color: '#58C995',
    bgBadge: 'bg-[#14231b] border-[#2f553f] text-[#58C995]',
    loadMultiplier: 2.0,
    primaryMuscles: ['chest', 'lats', 'quads', 'shoulders'],
    secondaryMuscles: ['biceps', 'triceps', 'hamstrings', 'abs'],
    description: 'Работа с отягощениями, развитие мышечной массы и максимальной силы.',
  },
  boxing: {
    nameRu: 'Бокс / Единоборства',
    icon: 'Swords',
    color: '#E06D53',
    bgBadge: 'bg-[#2a1714] border-[#552720] text-[#E06D53]',
    loadMultiplier: 2.2,
    primaryMuscles: ['shoulders', 'triceps', 'rearDelts', 'abs'],
    secondaryMuscles: ['chest', 'lats', 'calves', 'forearms'],
    description: 'Высокоинтенсивная ударная нагрузка на плечевой пояс, руки, корпус и координацию.',
  },
  basketball: {
    nameRu: 'Баскетбол',
    icon: 'Trophy',
    color: '#E5A93C',
    bgBadge: 'bg-[#2b2210] border-[#54431e] text-[#E5A93C]',
    loadMultiplier: 1.9,
    primaryMuscles: ['quads', 'calves', 'glutes'],
    secondaryMuscles: ['abs', 'shoulders', 'hamstrings'],
    description: 'Прыжковая интервальная нагрузка на ноги, икры, взрывную силу и выносливость.',
  },
  running: {
    nameRu: 'Бег',
    icon: 'Zap',
    color: '#4EA5D9',
    bgBadge: 'bg-[#12222d] border-[#234257] text-[#4EA5D9]',
    loadMultiplier: 1.6,
    primaryMuscles: ['quads', 'calves', 'hamstrings'],
    secondaryMuscles: ['glutes', 'abs'],
    description: 'Аэробная выносливость, ударная нагрузка на стопы, икроножные и квадрицепсы.',
  },
  cycling: {
    nameRu: 'Велоспорт',
    icon: 'Bike',
    color: '#44CF6C',
    bgBadge: 'bg-[#12281a] border-[#235034] text-[#44CF6C]',
    loadMultiplier: 1.5,
    primaryMuscles: ['quads', 'glutes', 'calves'],
    secondaryMuscles: ['lowerback', 'hamstrings'],
    description: 'Циклическая силовая выносливость ног и кардиоваскулярная система без удара о грунт.',
  },
  swimming: {
    nameRu: 'Плавание',
    icon: 'Waves',
    color: '#2EC4B6',
    bgBadge: 'bg-[#102726] border-[#1f4e4c] text-[#2EC4B6]',
    loadMultiplier: 1.8,
    primaryMuscles: ['lats', 'shoulders', 'triceps', 'abs'],
    secondaryMuscles: ['chest', 'quads', 'traps'],
    description: 'Симметричная разгрузка позвоночника при глубокой проработке спины, плеч и кора.',
  },
  other_sport: {
    nameRu: 'Другой вид спорта',
    icon: 'Activity',
    color: '#A06CD5',
    bgBadge: 'bg-[#21162d] border-[#442c5c] text-[#A06CD5]',
    loadMultiplier: 1.5,
    primaryMuscles: ['abs', 'quads', 'shoulders'],
    secondaryMuscles: ['calves', 'lats'],
    description: 'Функциональная физическая активность по выбору пользователя.',
  },
  rest: {
    nameRu: 'День отдыха',
    icon: 'Moon',
    color: '#92999A',
    bgBadge: 'bg-[#151a1c] border-[#252d2f] text-[#92999A]',
    loadMultiplier: 0,
    primaryMuscles: [],
    secondaryMuscles: [],
    description: 'Полное физическое и нервное восстановление мышечных волокон.',
  },
};

export interface MuscleLoadHistoryItem {
  date: string;
  volumeKg: number;
  sets: number;
  exerciseName: string;
}

export interface MuscleLoadStats {
  muscle: MuscleGroup;
  nameRu: string;
  percent: number;
  weeklyTonnageKg: number;
  recentWorkoutsCount: number;
  exerciseCount: number;
  setsCount: number;
  recoveryDays: number | null;
  recoveryTime: string | null;
  status: 'fatigued' | 'recovering' | 'recovered';
  history: MuscleLoadHistoryItem[];
  hasData: boolean;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  textSize: 'compact' | 'normal' | 'large';
  accentColor: 'emerald' | 'mint' | 'amber';
  animationMode: 'full' | 'reduced' | 'off';
  reducedMotion: boolean;
  // Notifications
  notificationsEnabled: boolean;
  workoutReminders: boolean;
  scheduledActivityReminders: boolean;
  reminderTime: string;
  // Workouts
  weightUnit: 'kg' | 'lbs';
  autoRestTimer: boolean;
  defaultRestSeconds: number;
  vibrateOnTimerEnd: boolean;
  autoAdvanceSet: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  textSize: 'normal',
  accentColor: 'emerald',
  animationMode: 'full',
  reducedMotion: false,
  notificationsEnabled: true,
  workoutReminders: true,
  scheduledActivityReminders: true,
  reminderTime: '18:00',
  weightUnit: 'kg',
  autoRestTimer: true,
  defaultRestSeconds: 90,
  vibrateOnTimerEnd: true,
  autoAdvanceSet: true,
};

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  nameEn?: string;
  categoryKey?: string;
  categoryNameRu?: string;
  subCategory?: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: (MuscleGroup | string)[];
  isBodyweight: boolean;
  requiredEquipment: EquipmentCategory;
  equipmentNameRu?: string;
  location?: 'home' | 'gym' | 'both';
  difficulty: 'Начинающий' | 'Средний' | 'Сложный' | 'Опытный' | string;
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

export const EXERCISE_CATALOG: ExerciseLibraryItem[] = [
  // CHEST
  {
    id: 'bench_press',
    name: 'Жим штанги лежа',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 4,
    defaultReps: 8,
    defaultWeight: 80,
    defaultRestSeconds: 90,
    technique: 'Лопатки сведены и прижаты к скамье. Ступни жестко упираются в пол. Опускайте штангу на середину груди на вдохе, выжимайте на выдохе без резкого толчка.',
    alternatives: ['Жим гантелей лежа', 'Отжимания на брусьях', 'Отжимания от пола'],
  },
  {
    id: 'incline_dumbbells',
    name: 'Жим гантелей на наклонной скамье',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 26,
    defaultRestSeconds: 75,
    technique: 'Угол скамьи 30–45 градусов. Опускайте гантели до уровня плеч, чувствуя растяжение верхних пучков грудных мышц, мощно выжимайте вверх.',
    alternatives: ['Жим штанги лежа', 'Отжимания с ногами на возвышении', 'Жим гантелей лежа'],
  },
  {
    id: 'pushups_floor',
    name: 'Отжимания от пола',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'abs', 'shoulders'],
    isBodyweight: true,
    requiredEquipment: 'bodyweight',
    difficulty: 'Начинающий',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 15,
    defaultWeight: 0,
    defaultRestSeconds: 60,
    technique: 'Тело образует прямую линию от макушки до пят. Кор и ягодицы напряжены. Касайтесь грудью пола, не прогибая поясницу.',
    alternatives: ['Отжимания на брусьях', 'Жим штанги лежа', 'Жим с резиновой лентой'],
  },
  {
    id: 'dips_chest',
    name: 'Отжимания на брусьях',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    isBodyweight: true,
    requiredEquipment: 'dip_bars',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 0,
    defaultRestSeconds: 90,
    technique: 'Наклоните корпус слегка вперед для акцента на грудные мышцы. Опускайтесь до угла 90 градусов в локтях, мощно выжимайте себя вверх.',
    alternatives: ['Отжимания от пола', 'Жим штанги узким хватом', 'Французский жим'],
  },
  {
    id: 'cable_crossover',
    name: 'Сведение рук в кроссовере',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders'],
    isBodyweight: false,
    requiredEquipment: 'gym_machines',
    difficulty: 'Средний',
    type: 'Изолирующее',
    homeFriendly: false,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 15,
    defaultRestSeconds: 60,
    technique: 'Легкий наклон вперед, локти зафиксированы в полусогнутом положении. Сводите рукояти перед собой с пиковым сокращением грудных мышц.',
    alternatives: ['Разводка гантелей лежа', 'Сведение с резиновой лентой'],
  },

  // BACK & LATS
  {
    id: 'pullups_wide',
    name: 'Подтягивания широким хватом',
    primaryMuscle: 'lats',
    secondaryMuscles: ['biceps', 'rearDelts', 'traps'],
    isBodyweight: true,
    requiredEquipment: 'pullup_bar',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 4,
    defaultReps: 8,
    defaultWeight: 0,
    defaultRestSeconds: 90,
    technique: 'Хват чуть шире плеч. Начните движение с опускания лопаток, тянитесь верхней частью груди к перекладине без рывков.',
    alternatives: ['Тяга верхнего блока к груди', 'Австралийские подтягивания', 'Тяга штанги в наклоне'],
  },
  {
    id: 'barbell_row',
    name: 'Тяга штанги в наклоне',
    primaryMuscle: 'lats',
    secondaryMuscles: ['rearDelts', 'biceps', 'lowerback', 'traps'],
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Сложный',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 4,
    defaultReps: 8,
    defaultWeight: 70,
    defaultRestSeconds: 90,
    technique: 'Наклон корпуса около 45 градусов, спина прямая с естественным прогибом. Тяните гриф к низу живота, сводя лопатки.',
    alternatives: ['Тяга гантели к поясу одной рукой', 'Тяга горизонтального блока', 'Тяга резины к поясу'],
  },
  {
    id: 'dumbbell_row_single',
    name: 'Тяга гантели в наклоне одной рукой',
    primaryMuscle: 'lats',
    secondaryMuscles: ['rearDelts', 'biceps'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Начинающий',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 24,
    defaultRestSeconds: 75,
    technique: 'Опирайтесь коленом и рукой о скамью или устойчивую поверхность. Тяните гантель к бедру, максимально сокращая широчайшую мышцу.',
    alternatives: ['Тяга штанги в наклоне', 'Тяга блока к поясу'],
  },
  {
    id: 'deadlift_classic',
    name: 'Становая тяга',
    primaryMuscle: 'lowerback',
    secondaryMuscles: ['glutes', 'hamstrings', 'traps', 'forearms'],
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Сложный',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 4,
    defaultReps: 5,
    defaultWeight: 110,
    defaultRestSeconds: 150,
    technique: 'Гриф плотно прилегает к голеням. Плечи строго над штангой, спина идеально прямая. Срыв выполняется ногами, фиксация за счет ягодиц и спины.',
    alternatives: ['Румынская тяга с гантелями', 'Гиперэкстензия', 'Становая тяга с гирей'],
  },
  {
    id: 'lat_pulldown_machine',
    name: 'Тяга верхнего блока к груди',
    primaryMuscle: 'lats',
    secondaryMuscles: ['biceps'],
    isBodyweight: false,
    requiredEquipment: 'gym_machines',
    difficulty: 'Начинающий',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 60,
    defaultRestSeconds: 75,
    technique: 'Бедра плотно зафиксированы валиками. Тяните рукоять к ключицам, отводя локти вниз и назад. Не отклоняйте корпус назад более чем на 15 градусов.',
    alternatives: ['Подтягивания широким хватом', 'Тяга резиновой ленты сверху'],
  },

  // SHOULDERS
  {
    id: 'military_press',
    name: 'Армейский жим стоя',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps', 'abs'],
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Сложный',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 4,
    defaultReps: 8,
    defaultWeight: 50,
    defaultRestSeconds: 90,
    technique: 'Штанга на груди, хват чуть шире плеч. На выдохе выжимайте штангу вертикально вверх, фиксируя в верхней точке над головой без прогиба в пояснице.',
    alternatives: ['Жим гантелей сидя', 'Отжимания в стойке у стены', 'Жим гири одной рукой'],
  },
  {
    id: 'seated_dumbbell_press',
    name: 'Жим гантелей сидя',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 20,
    defaultRestSeconds: 75,
    technique: 'Спина плотно прижата к спинке скамьи. Выжимайте гантели по плавной дуге вверх, не соударяя их в верхней точке.',
    alternatives: ['Армейский жим стоя', 'Жим гантелей стоя'],
  },
  {
    id: 'lateral_raises',
    name: 'Махи гантелями в стороны',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['traps'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 4,
    defaultReps: 12,
    defaultWeight: 12,
    defaultRestSeconds: 60,
    technique: 'Локти чуть согнуты, движение инициируется боковой дельтой. Поднимайте руки до уровня параллели с полом.',
    alternatives: ['Махи с резиновой лентой в стороны', 'Тяга штанги к подбородку'],
  },
  {
    id: 'rear_delt_flyes',
    name: 'Махи гантелями на заднюю дельту в наклоне',
    primaryMuscle: 'rearDelts',
    secondaryMuscles: ['traps', 'lats'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Средний',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 10,
    defaultRestSeconds: 60,
    technique: 'Корпус наклонен вперед почти до параллели с полом. Разводите локти в стороны, концентрируясь на напряжении заднего пучка дельт.',
    alternatives: ['Face Pull на блоке', 'Тяга ленты к лицу'],
  },

  // LEGS & GLUTES
  {
    id: 'squats_barbell',
    name: 'Приседания со штангой',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings', 'calves', 'abs'],
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Сложный',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 4,
    defaultReps: 8,
    defaultWeight: 95,
    defaultRestSeconds: 120,
    technique: 'Гриф на трапециях, стопы на ширине плеч. Опускайтесь до параллели бедер с полом или чуть глубже, колени сонаправлены со стопами.',
    alternatives: ['Кубковые приседания с гантелью', 'Приседания с собственным весом', 'Жим ногами'],
  },
  {
    id: 'goblet_squat',
    name: 'Кубковые приседания с гантелью',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'abs'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Начинающий',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 22,
    defaultRestSeconds: 75,
    technique: 'Держите гантель вертикально обеими руками у груди. Приседайте глубоко между коленями, сохраняя грудь расправленной.',
    alternatives: ['Приседания со штангой', 'Воздушные приседания'],
  },
  {
    id: 'romanian_deadlift',
    name: 'Румынская тяга с гантелями',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'lowerback'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 26,
    defaultRestSeconds: 90,
    technique: 'Колени слегка согнуты и зафиксированы. Отводите таз назад, скользя гантелями вдоль бедер до ощущения сильного растяжения задней поверхности бедра.',
    alternatives: ['Румынская тяга со штангой', 'Сгибания ног в тренажере', 'Ягодичный мостик'],
  },
  {
    id: 'lunges_dumbbells',
    name: 'Выпады с гантелями',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 16,
    defaultRestSeconds: 75,
    technique: 'Шаг вперед достаточной длины, чтобы переднее колено не выходило за носок. Опускайтесь до касания пола задним коленом.',
    alternatives: ['Болгарские сплит-приседания', 'Воздушные выпады'],
  },
  {
    id: 'calf_raises_standing',
    name: 'Подъемы на носки стоя',
    primaryMuscle: 'calves',
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 4,
    defaultReps: 15,
    defaultWeight: 40,
    defaultRestSeconds: 60,
    technique: 'Встаньте носками на возвышение (ступеньку). Опускайте пятки максимально вниз для растяжки, затем мощно поднимайтесь на носки с паузой в 1 секунду.',
    alternatives: ['Подъемы на носки на одной ноге', 'Подъемы на носки в тренажере'],
  },

  // ARMS (BICEPS & TRICEPS)
  {
    id: 'barbell_biceps_curl',
    name: 'Подъем штанги на бицепс',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: false,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 35,
    defaultRestSeconds: 60,
    technique: 'Локти прижаты к бокам и зафиксированы. Сгибайте руки со штангой без раскачки корпуса, плавно опускайте под контроль.',
    alternatives: ['Сгибания рук с гантелями с супинацией', 'Молотковые сгибания', 'Сгибания с эспандером'],
  },
  {
    id: 'hammer_curls',
    name: 'Молотковые сгибания с гантелями',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    isBodyweight: false,
    requiredEquipment: 'dumbbells_adjustable',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 16,
    defaultRestSeconds: 60,
    technique: 'Нейтральный хват (ладони обращены друг к другу). Отлично прорабатывает брахиалис и предплечья, придавая рукам плотность.',
    alternatives: ['Подъем штанги на бицепс', 'Сгибания на скамье Скотта'],
  },
  {
    id: 'skull_crushers',
    name: 'Французский жим со штангой лежа',
    primaryMuscle: 'triceps',
    isBodyweight: false,
    requiredEquipment: 'barbell',
    difficulty: 'Средний',
    type: 'Изолирующее',
    homeFriendly: false,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 30,
    defaultRestSeconds: 75,
    technique: 'Опускайте гриф ко лбу или за голову, сохраняя плечевые кости неподвижными. Разгибайте руки исключительно усилием трицепса.',
    alternatives: ['Разгибания рук на блоке', 'Отжимания на брусьях', 'Французский жим с гантелями'],
  },
  {
    id: 'triceps_rope_pushdown',
    name: 'Разгибания рук на блоке с канатом',
    primaryMuscle: 'triceps',
    isBodyweight: false,
    requiredEquipment: 'gym_machines',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: false,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 25,
    defaultRestSeconds: 60,
    technique: 'Локти зафиксированы у корпуса. Разгибайте руки вниз с разведением концов каната в нижней точке для максимального пикового сокращения.',
    alternatives: ['Отжимания с узкой постановкой рук', 'Разгибания с резиновой лентой'],
  },

  // CORE / ABS
  {
    id: 'hanging_leg_raises',
    name: 'Подъем ног в висе на турнике',
    primaryMuscle: 'abs',
    secondaryMuscles: ['forearms'],
    isBodyweight: true,
    requiredEquipment: 'pullup_bar',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 0,
    defaultRestSeconds: 60,
    technique: 'Вис на перекладине. Поднимайте прямые или согнутые ноги до параллели или выше за счет скручивания таза, избегая раскачки.',
    alternatives: ['Скручивания на наклонной скамье', 'Планка', 'Складка на полу'],
  },
  {
    id: 'plank_core',
    name: 'Планка на предплечьях',
    primaryMuscle: 'abs',
    secondaryMuscles: ['lowerback', 'shoulders'],
    isBodyweight: true,
    requiredEquipment: 'bodyweight',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 60,
    defaultWeight: 0,
    defaultRestSeconds: 60,
    technique: 'Локти под плечами, тело натянуто как струна. Пресс и ягодицы напряжены максимально, не допускайте провисания таза.',
    alternatives: ['Боковая планка', 'Колесо для пресса'],
  },

  // OBLIQUES (Косые мышцы живота)
  {
    id: 'russian_twists',
    name: 'Русские скручивания с весом',
    primaryMuscle: 'obliques',
    secondaryMuscles: ['abs'],
    isBodyweight: false,
    requiredEquipment: 'bodyweight',
    difficulty: 'Средний',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 20,
    defaultWeight: 8,
    defaultRestSeconds: 60,
    technique: 'Сидя на полу с согнутыми коленями и отклоненным назад корпусом под 45 градусов. Поворачивайте корпус из стороны в сторону, касаясь снарядом пола.',
    alternatives: ['Боковая планка с подъемом таза', 'Скручивания на боку', 'Дровосек на блоке'],
  },
  {
    id: 'side_plank',
    name: 'Боковая планка на предплечье',
    primaryMuscle: 'obliques',
    secondaryMuscles: ['abs', 'glutes', 'shoulders'],
    isBodyweight: true,
    requiredEquipment: 'bodyweight',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 45,
    defaultWeight: 0,
    defaultRestSeconds: 60,
    technique: 'Упор на одно предплечье и ребро стопы. Тело вытянуто в прямую линию, таз поднят, косые мышцы напряжены.',
    alternatives: ['Русские скручивания', 'Боковые наклоны с гантелью'],
  },
  {
    id: 'cable_woodchopper',
    name: 'Дровосек на блоке (повороты корпуса)',
    primaryMuscle: 'obliques',
    secondaryMuscles: ['abs', 'shoulders'],
    isBodyweight: false,
    requiredEquipment: 'gym_machines',
    difficulty: 'Средний',
    type: 'Базовое (многосуставное)',
    homeFriendly: false,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 20,
    defaultRestSeconds: 60,
    technique: 'Тяга рукояти кроссовера по диагонали сверху вниз с мощным вращением корпуса за счет косых мышц пресса.',
    alternatives: ['Русские скручивания с медболом', 'Повороты корпуса с блином'],
  },

  // TIBIALIS (Передняя большеберцовая мышца)
  {
    id: 'tibialis_raises_wall',
    name: 'Подъемы носков у стены (Tibialis Raise)',
    primaryMuscle: 'tibialis',
    secondaryMuscles: ['calves'],
    isBodyweight: true,
    requiredEquipment: 'bodyweight',
    difficulty: 'Начинающий',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 20,
    defaultWeight: 0,
    defaultRestSeconds: 45,
    technique: 'Прислонитесь спиной к стене, ноги выставите вперед на 30-40 см. Не отрывая пятки от пола, максимально тяните носки стоп на себя вверх.',
    alternatives: ['Подъемы носков со свободным весом', 'Тренажер для тибиалиса'],
  },
  {
    id: 'tibialis_kettlebell_raise',
    name: 'Подъем носка с гирей на стопе',
    primaryMuscle: 'tibialis',
    secondaryMuscles: ['calves'],
    isBodyweight: false,
    requiredEquipment: 'kettlebells',
    difficulty: 'Средний',
    type: 'Изолирующее',
    homeFriendly: true,
    defaultSets: 3,
    defaultReps: 15,
    defaultWeight: 8,
    defaultRestSeconds: 60,
    technique: 'Сидя на возвышении, свесьте стопу с надетой гирей или лентой. Выполняйте плавное сгибание стопы носком вверх с паузой в верхней точке.',
    alternatives: ['Подъемы носков у стены', 'Разгибания стопы с резиной'],
  },
];
