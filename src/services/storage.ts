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
} from '../types/workout';

const STORAGE_KEYS = {
  APP_INITIALIZED: 'form_app_initialized_v5',
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
};

// Default athletic user profile
const DEFAULT_PROFILE: UserProfile = {
  name: 'Алексей',
  age: 28,
  heightCm: 182,
  weightKg: 82.5,
  fitnessGoal: 'Набор мышечной массы и сила',
  experienceLevel: 'Продвинутый',
  streakDays: 12,
};

// Default high-quality training programs
const DEFAULT_PROGRAMS: WorkoutProgram[] = [
  {
    id: 'prog_push_pull_legs',
    name: 'Push / Pull / Legs (Сила + Масса)',
    description: 'Классический трехдневный сплит с акцентом на базовые многосуставные движения и гипертрофию.',
    goal: 'Набор массы',
    daysPerWeek: 3,
    isCustom: false,
    createdAt: '2026-01-10',
    workouts: [
      {
        id: 'w_push',
        dayName: 'День 1: Push (Грудь, Плечи, Трицепс)',
        targetMuscleGroups: ['chest', 'shoulders', 'triceps'],
        estimatedDuration: 55,
        exercises: [
          { name: 'Жим штанги лежа', targetMuscle: 'chest', isBodyweight: false, sets: 4, reps: 8, targetWeight: 85, restSeconds: 90, notes: 'Лопатки сведены, пауза в нижней точке' },
          { name: 'Жим гантелей на наклонной', targetMuscle: 'chest', isBodyweight: false, sets: 3, reps: 10, targetWeight: 28, restSeconds: 75 },
          { name: 'Армейский жим стоя', targetMuscle: 'shoulders', isBodyweight: false, sets: 3, reps: 8, targetWeight: 50, restSeconds: 90 },
          { name: 'Махи гантелями в стороны', targetMuscle: 'shoulders', isBodyweight: false, sets: 4, reps: 12, targetWeight: 14, restSeconds: 60 },
          { name: 'Французский жим со штангой', targetMuscle: 'triceps', isBodyweight: false, sets: 3, reps: 10, targetWeight: 35, restSeconds: 60 },
          { name: 'Отжимания на брусьях', targetMuscle: 'triceps', isBodyweight: true, sets: 3, reps: 12, targetWeight: 0, restSeconds: 75 },
        ],
      },
      {
        id: 'w_pull',
        dayName: 'День 2: Pull (Спина, Задние дельты, Бицепс)',
        targetMuscleGroups: ['lats', 'rearDelts', 'biceps', 'traps'],
        estimatedDuration: 60,
        exercises: [
          { name: 'Подтягивания широким хватом', targetMuscle: 'lats', isBodyweight: true, sets: 4, reps: 10, targetWeight: 0, restSeconds: 90 },
          { name: 'Тяга штанги в наклоне', targetMuscle: 'lats', isBodyweight: false, sets: 4, reps: 8, targetWeight: 75, restSeconds: 90 },
          { name: 'Тяга верхнего блока к груди', targetMuscle: 'lats', isBodyweight: false, sets: 3, reps: 10, targetWeight: 65, restSeconds: 75 },
          { name: 'Махи на заднюю дельту в наклоне', targetMuscle: 'rearDelts', isBodyweight: false, sets: 4, reps: 12, targetWeight: 12, restSeconds: 60 },
          { name: 'Подъем штанги на бицепс', targetMuscle: 'biceps', isBodyweight: false, sets: 3, reps: 10, targetWeight: 35, restSeconds: 60 },
          { name: 'Молотковые сгибания', targetMuscle: 'biceps', isBodyweight: false, sets: 3, reps: 12, targetWeight: 16, restSeconds: 60 },
        ],
      },
      {
        id: 'w_legs',
        dayName: 'День 3: Legs & Core (Ноги, Пресс)',
        targetMuscleGroups: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'],
        estimatedDuration: 65,
        exercises: [
          { name: 'Приседания со штангой', targetMuscle: 'quads', isBodyweight: false, sets: 4, reps: 8, targetWeight: 110, restSeconds: 120, notes: 'Глубокий сед ниже параллели' },
          { name: 'Румынская тяга с гантелями', targetMuscle: 'hamstrings', isBodyweight: false, sets: 3, reps: 10, targetWeight: 32, restSeconds: 90 },
          { name: 'Жим ногами в тренажере', targetMuscle: 'quads', isBodyweight: false, sets: 3, reps: 12, targetWeight: 180, restSeconds: 90 },
          { name: 'Подъемы на носки стоя (икры)', targetMuscle: 'calves', isBodyweight: false, sets: 4, reps: 15, targetWeight: 60, restSeconds: 60 },
          { name: 'Подъем ног в висе', targetMuscle: 'abs', isBodyweight: true, sets: 3, reps: 15, targetWeight: 0, restSeconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'prog_upper_lower',
    name: 'Upper / Lower (Верх и Низ 4 дня)',
    description: 'Оптимальный сплит для высокой частоты проработки каждой мышечной группы дважды в неделю.',
    goal: 'Сила и баланс',
    daysPerWeek: 4,
    isCustom: false,
    createdAt: '2026-02-01',
    workouts: [
      {
        id: 'w_upper_a',
        dayName: 'Верх А: Силовой акцент (Грудь и Спина)',
        targetMuscleGroups: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'],
        estimatedDuration: 55,
        exercises: [
          { name: 'Жим штанги лежа', targetMuscle: 'chest', isBodyweight: false, sets: 4, reps: 6, targetWeight: 90, restSeconds: 120 },
          { name: 'Тяга штанги в наклоне', targetMuscle: 'lats', isBodyweight: false, sets: 4, reps: 6, targetWeight: 80, restSeconds: 120 },
          { name: 'Армейский жим стоя', targetMuscle: 'shoulders', isBodyweight: false, sets: 3, reps: 8, targetWeight: 50, restSeconds: 90 },
          { name: 'Подтягивания широким хватом', targetMuscle: 'lats', isBodyweight: true, sets: 3, reps: 8, targetWeight: 0, restSeconds: 90 },
        ],
      },
      {
        id: 'w_lower_a',
        dayName: 'Низ А: Квадрицепсы и Икры',
        targetMuscleGroups: ['quads', 'calves', 'abs'],
        estimatedDuration: 50,
        exercises: [
          { name: 'Приседания со штангой', targetMuscle: 'quads', isBodyweight: false, sets: 4, reps: 8, targetWeight: 100, restSeconds: 120 },
          { name: 'Выпады с гантелями', targetMuscle: 'quads', isBodyweight: false, sets: 3, reps: 10, targetWeight: 20, restSeconds: 75 },
          { name: 'Подъемы на носки стоя (икры)', targetMuscle: 'calves', isBodyweight: false, sets: 4, reps: 15, targetWeight: 50, restSeconds: 60 },
          { name: 'Скручивания на скамье', targetMuscle: 'abs', isBodyweight: true, sets: 3, reps: 20, targetWeight: 0, restSeconds: 45 },
        ],
      },
    ],
  },
];

// Generate consistent year-long activity map for 2026 that mirrors the screenshot
function generateInitial2026Activity(): Record<string, 'completed' | 'skipped' | 'none'> {
  const map: Record<string, 'completed' | 'skipped' | 'none'> = {};
  const year = 2026;
  const today = new Date(2026, 9, 29); // 2026-10-29

  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, m, d);
      const dateKey = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      if (date > today) {
        map[dateKey] = 'none';
        continue;
      }

      const dayOfWeek = date.getDay();
      const dayOfYear = Math.floor((date.getTime() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
      const isMissed = [38, 79, 114, 156, 185, 212, 240, 275].includes(dayOfYear);

      if (isMissed) {
        map[dateKey] = 'skipped';
      } else if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5 || (dayOfWeek === 6 && dayOfYear % 3 === 0) || (dayOfWeek === 2 && dayOfYear % 5 === 0)) {
        map[dateKey] = 'completed';
      } else {
        map[dateKey] = 'none';
      }
    }
  }

  map['2026-10-26'] = 'completed';
  map['2026-10-28'] = 'completed';
  return map;
}

function generateInitialSessions(): WorkoutSession[] {
  return [
    {
      id: 'session_oct_28',
      name: 'Push: Грудь и Плечи (Тяжелая)',
      programName: 'Push / Pull / Legs',
      date: '2026-10-28',
      startTime: '18:15',
      durationMinutes: 58,
      status: 'completed',
      totalVolumeKg: 8420,
      completedSets: 14,
      totalReps: 122,
      notes: 'Отличное самочувствие, в жиме лежа взял 90 кг на 5 повторений.',
      personalRecords: [
        { exerciseName: 'Жим штанги лежа', weightKg: 90, reps: 5, date: '2026-10-28', isNew: true },
      ],
      exercises: [
        {
          id: 'ex_1',
          exerciseId: 'bench_press',
          name: 'Жим штанги лежа',
          targetMuscle: 'chest',
          isBodyweight: false,
          restSeconds: 90,
          sets: [
            { setNumber: 1, weightKg: 70, reps: 10, completed: true, previousWeightKg: 70, previousReps: 10 },
            { setNumber: 2, weightKg: 80, reps: 8, completed: true, previousWeightKg: 80, previousReps: 8 },
            { setNumber: 3, weightKg: 85, reps: 6, completed: true, previousWeightKg: 85, previousReps: 6 },
            { setNumber: 4, weightKg: 90, reps: 5, completed: true, previousWeightKg: 85, previousReps: 6 },
          ],
        },
        {
          id: 'ex_2',
          exerciseId: 'incline_dumbbells',
          name: 'Жим гантелей на наклонной',
          targetMuscle: 'chest',
          isBodyweight: false,
          restSeconds: 75,
          sets: [
            { setNumber: 1, weightKg: 26, reps: 10, completed: true, previousWeightKg: 24, previousReps: 10 },
            { setNumber: 2, weightKg: 28, reps: 9, completed: true, previousWeightKg: 26, previousReps: 9 },
            { setNumber: 3, weightKg: 30, reps: 8, completed: true, previousWeightKg: 28, previousReps: 8 },
          ],
        },
        {
          id: 'ex_3',
          exerciseId: 'military_press',
          name: 'Армейский жим стоя',
          targetMuscle: 'shoulders',
          isBodyweight: false,
          restSeconds: 90,
          sets: [
            { setNumber: 1, weightKg: 45, reps: 8, completed: true, previousWeightKg: 45, previousReps: 8 },
            { setNumber: 2, weightKg: 50, reps: 7, completed: true, previousWeightKg: 50, previousReps: 6 },
            { setNumber: 3, weightKg: 50, reps: 6, completed: true, previousWeightKg: 50, previousReps: 6 },
          ],
        },
        {
          id: 'ex_4',
          exerciseId: 'dips',
          name: 'Отжимания на брусьях',
          targetMuscle: 'triceps',
          isBodyweight: true,
          restSeconds: 60,
          sets: [
            { setNumber: 1, weightKg: 0, reps: 15, completed: true, previousWeightKg: 0, previousReps: 15 },
            { setNumber: 2, weightKg: 0, reps: 12, completed: true, previousWeightKg: 0, previousReps: 12 },
            { setNumber: 3, weightKg: 0, reps: 12, completed: true, previousWeightKg: 0, previousReps: 10 },
          ],
        },
      ],
    },
    {
      id: 'session_oct_26',
      name: 'Pull: Спина и Бицепс',
      programName: 'Push / Pull / Legs',
      date: '2026-10-26',
      startTime: '19:00',
      durationMinutes: 62,
      status: 'completed',
      totalVolumeKg: 7850,
      completedSets: 14,
      totalReps: 115,
      notes: 'Хорошая прокачка широчайших, подтягивания с чистой техникой.',
      exercises: [
        {
          id: 'ex_pull_1',
          exerciseId: 'pull_ups',
          name: 'Подтягивания широким хватом',
          targetMuscle: 'lats',
          isBodyweight: true,
          restSeconds: 90,
          sets: [
            { setNumber: 1, weightKg: 0, reps: 12, completed: true },
            { setNumber: 2, weightKg: 0, reps: 10, completed: true },
            { setNumber: 3, weightKg: 0, reps: 9, completed: true },
            { setNumber: 4, weightKg: 0, reps: 8, completed: true },
          ],
        },
        {
          id: 'ex_pull_2',
          exerciseId: 'barbell_row',
          name: 'Тяга штанги в наклоне',
          targetMuscle: 'lats',
          isBodyweight: false,
          restSeconds: 90,
          sets: [
            { setNumber: 1, weightKg: 70, reps: 10, completed: true },
            { setNumber: 2, weightKg: 75, reps: 8, completed: true },
            { setNumber: 3, weightKg: 80, reps: 6, completed: true },
          ],
        },
      ],
    },
    {
      id: 'session_oct_24',
      name: 'Legs: Приседания и Ноги',
      programName: 'Push / Pull / Legs',
      date: '2026-10-24',
      startTime: '11:00',
      durationMinutes: 70,
      status: 'completed',
      totalVolumeKg: 11200,
      completedSets: 16,
      totalReps: 140,
      notes: 'Тяжелый день ног, приседания 115 кг.',
      personalRecords: [
        { exerciseName: 'Приседания со штангой', weightKg: 115, reps: 6, date: '2026-10-24', isNew: true },
      ],
      exercises: [
        {
          id: 'ex_leg_1',
          exerciseId: 'squats',
          name: 'Приседания со штангой',
          targetMuscle: 'quads',
          isBodyweight: false,
          restSeconds: 120,
          sets: [
            { setNumber: 1, weightKg: 80, reps: 10, completed: true },
            { setNumber: 2, weightKg: 100, reps: 8, completed: true },
            { setNumber: 3, weightKg: 110, reps: 6, completed: true },
            { setNumber: 4, weightKg: 115, reps: 6, completed: true },
          ],
        },
      ],
    },
  ];
}

export const DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleDay[] = [
  {
    dayOfWeek: 0,
    dayName: 'Пн',
    fullDayName: 'Понедельник',
    activities: [
      {
        id: 'act_mon_strength',
        sportType: 'strength',
        title: 'Силовая: Push (Грудь, Плечи, Трицепс)',
        startTime: '18:30',
        durationMinutes: 60,
        intensity: 'high',
        notes: 'Базовый силовой сплит',
      },
    ],
  },
  {
    dayOfWeek: 1,
    dayName: 'Вт',
    fullDayName: 'Вторник',
    activities: [
      {
        id: 'act_tue_boxing',
        sportType: 'boxing',
        title: 'Бокс: Отработка ударов и челнок',
        startTime: '19:00',
        durationMinutes: 75,
        intensity: 'high',
        notes: 'Работа на мешке, лапы, скакалка',
      },
    ],
  },
  {
    dayOfWeek: 2,
    dayName: 'Ср',
    fullDayName: 'Среда',
    activities: [
      {
        id: 'act_wed_strength',
        sportType: 'strength',
        title: 'Силовая: Pull (Спина, Дельты, Бицепс)',
        startTime: '18:30',
        durationMinutes: 60,
        intensity: 'high',
        notes: 'Тяжелые тяги и подтягивания',
      },
    ],
  },
  {
    dayOfWeek: 3,
    dayName: 'Чт',
    fullDayName: 'Четверг',
    activities: [
      {
        id: 'act_thu_boxing',
        sportType: 'boxing',
        title: 'Бокс: Скоростные раунды и спарринг',
        startTime: '19:00',
        durationMinutes: 60,
        intensity: 'medium',
        notes: 'Техника защиты и бой с тенью',
      },
    ],
  },
  {
    dayOfWeek: 4,
    dayName: 'Пт',
    fullDayName: 'Пятница',
    activities: [
      {
        id: 'act_fri_strength',
        sportType: 'strength',
        title: 'Силовая: Legs & Core (Ноги и Пресс)',
        startTime: '18:30',
        durationMinutes: 65,
        intensity: 'high',
        notes: 'Приседания со штангой, выпады',
      },
    ],
  },
  {
    dayOfWeek: 5,
    dayName: 'Сб',
    fullDayName: 'Суббота',
    activities: [
      {
        id: 'act_sat_basketball',
        sportType: 'basketball',
        title: 'Баскетбол / Игра на площадке',
        startTime: '11:00',
        durationMinutes: 90,
        intensity: 'high',
        notes: 'Интервальный бег, прыжки, броски',
      },
    ],
  },
  {
    dayOfWeek: 6,
    dayName: 'Вс',
    fullDayName: 'Воскресенье',
    activities: [
      {
        id: 'act_sun_rest',
        sportType: 'rest',
        title: 'День отдыха и суперкомпенсации',
        startTime: '10:00',
        durationMinutes: 40,
        intensity: 'low',
        notes: 'МФР-ролл, легкая растяжка, сон',
      },
    ],
  },
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

export const StorageService = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getProfile(): UserProfile {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
      return data ? JSON.parse(data) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  },

  updateProfile(profile: Partial<UserProfile>): UserProfile {
    const current = this.getProfile();
    const updated = { ...current, ...profile };
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
    notifyListeners();
    return updated;
  },

  getPrograms(): WorkoutProgram[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROGRAMS);
      if (data !== null) {
        return JSON.parse(data);
      }
      const isInit = localStorage.getItem(STORAGE_KEYS.APP_INITIALIZED);
      if (isInit) {
        return [];
      }
      localStorage.setItem(STORAGE_KEYS.APP_INITIALIZED, 'true');
      localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(DEFAULT_PROGRAMS));
      return DEFAULT_PROGRAMS;
    } catch {
      return [];
    }
  },

  saveProgram(program: WorkoutProgram): void {
    const list = this.getPrograms();
    const index = list.findIndex((p) => p.id === program.id);
    if (index >= 0) {
      list[index] = program;
    } else {
      list.unshift(program);
    }
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
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
      createdAt: new Date().toISOString().split('T')[0],
      workouts: target.workouts.map((w, idx) => ({
        ...w,
        id: `w_copy_${idx}_${Date.now()}`,
      })),
    };

    list.unshift(copy);
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
    return copy;
  },

  deleteProgram(programId: string): void {
    const list = this.getPrograms().filter((p) => p.id !== programId);
    localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(list));
    notifyListeners();
  },

  getWorkoutSessions(): WorkoutSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKOUTS);
      if (data !== null) {
        return JSON.parse(data);
      }
      const isInit = localStorage.getItem(STORAGE_KEYS.APP_INITIALIZED);
      if (isInit) {
        return [];
      }
      const initial = generateInitialSessions();
      localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(initial));
      return initial;
    } catch {
      return [];
    }
  },

  // MULTI-SPORT SESSIONS (Boxing, Basketball, Running, Cycling, Swimming, etc.)
  getSportSessions(): SportSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SPORTS_SESSIONS);
      if (data !== null) {
        return JSON.parse(data);
      }
      return [];
    } catch {
      return [];
    }
  },

  saveSportSession(session: SportSession): void {
    const list = this.getSportSessions();
    const duration = session.actualDurationMinutes || session.plannedDurationMinutes || 45;
    const intensityMult = session.intensity === 'high' ? 2.2 : session.intensity === 'medium' ? 1.5 : 1.0;
    const spDef = SPORT_DEFINITIONS[session.sportType] || SPORT_DEFINITIONS.other_sport;
    const loadScore = Math.round(duration * intensityMult * (spDef.loadMultiplier / 1.5));

    const prepared: SportSession = {
      ...session,
      loadScore,
    };

    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }
    localStorage.setItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(list));

    if (prepared.status === 'completed') {
      this.setDayStatus(prepared.date, 'completed', prepared.title);
    } else if (prepared.status === 'skipped') {
      this.setDayStatus(prepared.date, 'skipped', prepared.title);
    }
    notifyListeners();
  },

  deleteSportSession(sessionId: string): void {
    const list = this.getSportSessions();
    const target = list.find((s) => s.id === sessionId);
    const filtered = list.filter((s) => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(filtered));

    if (target) {
      const remainingSports = filtered.filter((s) => s.date === target.date);
      const remainingWorkouts = this.getWorkoutSessions().filter((s) => s.date === target.date);
      if (remainingSports.length === 0 && remainingWorkouts.length === 0) {
        this.setDayStatus(target.date, 'none');
      }
    }
    notifyListeners();
  },

  // WEEKLY SCHEDULE CONSTRUCTOR
  getWeeklySchedule(): WeeklyScheduleDay[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WEEKLY_SCHEDULE);
      if (data !== null) {
        return JSON.parse(data);
      }
      return DEFAULT_WEEKLY_SCHEDULE;
    } catch {
      return DEFAULT_WEEKLY_SCHEDULE;
    }
  },

  saveWeeklySchedule(schedule: WeeklyScheduleDay[]): void {
    localStorage.setItem(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify(schedule));
    notifyListeners();
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

  // Calculate Personal Record (PR) for exercise
  getPersonalRecord(exerciseName: string): { maxWeight: number; maxRepsAtMax: number; date: string } | null {
    const sessions = this.getWorkoutSessions();
    const cleanName = exerciseName.trim().toLowerCase();
    let record: { maxWeight: number; maxRepsAtMax: number; date: string } | null = null;

    sessions.forEach((s) => {
      s.exercises?.forEach((ex) => {
        if (ex.name.trim().toLowerCase() === cleanName) {
          ex.sets?.forEach((st) => {
            if (st.completed && (!record || st.weightKg > record.maxWeight)) {
              record = {
                maxWeight: st.weightKg,
                maxRepsAtMax: st.reps,
                date: s.date,
              };
            }
          });
        }
      });
    });

    return record;
  },

  // Exercise history for progress charts
  getExerciseHistory(exerciseName: string): { date: string; maxWeight: number; maxReps: number; volume: number }[] {
    const sessions = [...this.getWorkoutSessions()].reverse(); // chronological
    const cleanName = exerciseName.trim().toLowerCase();
    const points: { date: string; maxWeight: number; maxReps: number; volume: number }[] = [];

    sessions.forEach((s) => {
      s.exercises?.forEach((ex) => {
        if (ex.name.trim().toLowerCase() === cleanName) {
          let maxW = 0;
          let maxR = 0;
          let vol = 0;
          ex.sets?.forEach((st) => {
            if (st.completed) {
              if (st.weightKg > maxW) maxW = st.weightKg;
              if (st.reps > maxR) maxR = st.reps;
              vol += (ex.isBodyweight ? 75 : st.weightKg) * st.reps;
            }
          });
          if (maxW > 0 || maxR > 0) {
            points.push({
              date: s.date.slice(5), // MM-DD
              maxWeight: maxW,
              maxReps: maxR,
              volume: Math.round(vol),
            });
          }
        }
      });
    });

    return points;
  },

  // Save completed workout session and check for new PRs
  saveWorkoutSession(session: WorkoutSession): void {
    const list = this.getWorkoutSessions();

    // Check for personal records
    const prs: PersonalRecordInfo[] = [];
    session.exercises.forEach((ex) => {
      if (!ex.isBodyweight) {
        const prevPR = this.getPersonalRecord(ex.name);
        ex.sets.forEach((set) => {
          if (set.completed && set.weightKg > 0) {
            if (!prevPR || set.weightKg > prevPR.maxWeight) {
              prs.push({
                exerciseName: ex.name,
                weightKg: set.weightKg,
                reps: set.reps,
                date: session.date,
                isNew: true,
              });
            }
          }
        });
      }
    });

    const sessionWithPR: WorkoutSession = {
      ...session,
      personalRecords: prs,
    };

    const existingIndex = list.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      list[existingIndex] = sessionWithPR;
    } else {
      list.unshift(sessionWithPR);
    }
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(list));

    // Update activity map for that day
    this.setDayStatus(session.date, 'completed', session.name, session.totalVolumeKg);

    // Clear active draft if saved
    this.clearActiveDraft();

    notifyListeners();
  },

  updateSession(session: WorkoutSession): void {
    const list = this.getWorkoutSessions();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = session;
      localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(list));
      notifyListeners();
    }
  },

  deleteWorkoutSession(sessionId: string): void {
    const list = this.getWorkoutSessions();
    const session = list.find((s) => s.id === sessionId);
    const filtered = list.filter((s) => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(filtered));

    if (session) {
      const others = filtered.filter((s) => s.date === session.date);
      if (others.length === 0) {
        this.setDayStatus(session.date, 'none');
      }
    }
    notifyListeners();
  },

  // Persistent in-progress draft (so user never loses active workout if closed)
  saveActiveDraft(session: WorkoutSession): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DRAFT, JSON.stringify(session));
    } catch {
      // quota or local storage error
    }
  },

  getActiveDraft(): WorkoutSession | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_DRAFT);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  clearActiveDraft(): void {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
  },

  getActivityMap(year: number = 2026): Record<string, 'completed' | 'skipped' | 'none'> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_ACTIVITY);
      if (data) {
        return JSON.parse(data);
      }
      const initial = generateInitial2026Activity();
      localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, JSON.stringify(initial));
      return initial;
    } catch {
      return generateInitial2026Activity();
    }
  },

  setDayStatus(date: string, status: 'completed' | 'skipped' | 'none', title?: string, volumeKg?: number): void {
    const map = this.getActivityMap();
    map[date] = status;
    localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, JSON.stringify(map));
    notifyListeners();
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
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      let checkDate = new Date(today);
      // Check if trained today or yesterday
      if (!map[todayStr]) {
        checkDate.setDate(checkDate.getDate() - 1);
      }
      
      while (true) {
        const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
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

  // REAL MUSCLE IMPACT: Combines Strength sets + Multi-sport sessions
  getMuscleStats(): Record<MuscleGroup, MuscleLoadStats> {
    const sessions = this.getWorkoutSessions();
    const sportSessions = this.getSportSessions();
    const stats: Partial<Record<MuscleGroup, MuscleLoadStats>> = {};

    (Object.keys(MUSCLE_DEFINITIONS) as MuscleGroup[]).forEach((m) => {
      const def = MUSCLE_DEFINITIONS[m];

      // 1. Strength sessions load
      let strengthVolume = 0;
      let strengthHits = 0;
      sessions.forEach((s) => {
        s.exercises?.forEach((ex) => {
          if (ex.targetMuscle === m) {
            strengthHits++;
            ex.sets?.forEach((st) => {
              if (st.completed) {
                strengthVolume += (st.weightKg > 0 ? st.weightKg : (ex.isBodyweight ? 75 : 50)) * st.reps;
              }
            });
          }
        });
      });

      // 2. Multi-sport sessions load (Boxing, Basketball, Running, etc.)
      let sportLoadPoints = 0;
      let sportHits = 0;
      sportSessions.forEach((sp) => {
        if (sp.status === 'completed' || sp.status === 'planned') {
          const spDef = SPORT_DEFINITIONS[sp.sportType];
          if (spDef) {
            const isPrimary = spDef.primaryMuscles.includes(m);
            const isSecondary = spDef.secondaryMuscles.includes(m);
            if (isPrimary || isSecondary) {
              sportHits++;
              const duration = sp.actualDurationMinutes || sp.plannedDurationMinutes || 45;
              const intensityMult = sp.intensity === 'high' ? 2.2 : sp.intensity === 'medium' ? 1.5 : 1.0;
              const weight = isPrimary ? 1.0 : 0.5;
              sportLoadPoints += duration * intensityMult * weight;
            }
          }
        }
      });

      const totalHits = strengthHits + sportHits;
      // 1 sport load point ~ 20 kg volume equivalent
      const totalEffectiveKg = Math.round(strengthVolume + sportLoadPoints * 20);

      let effectivePercent = 0;
      let recoveryDays = 0;
      let status: 'fatigued' | 'recovering' | 'recovered' = 'recovered';

      if (totalHits > 0) {
        effectivePercent = Math.min(100, Math.max(10, Math.round((totalEffectiveKg / 8000) * 75)));
        recoveryDays = effectivePercent > 70 ? 3 : effectivePercent > 45 ? 2 : 1;
        status = effectivePercent > 65 ? 'fatigued' : effectivePercent > 35 ? 'recovering' : 'recovered';
      }

      stats[m] = {
        muscle: m,
        nameRu: def.nameRu,
        percent: effectivePercent,
        weeklyTonnageKg: totalEffectiveKg,
        recentWorkoutsCount: totalHits,
        recoveryDays,
        status,
      };
    });

    return stats as Record<MuscleGroup, MuscleLoadStats>;
  },

  // EQUIPMENT MANAGEMENT
  getEquipmentList(): EquipmentItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EQUIPMENT);
      if (data) return JSON.parse(data);
    } catch {}
    return DEFAULT_EQUIPMENT;
  },

  saveEquipmentList(items: EquipmentItem[]): void {
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(items));
    notifyListeners();
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
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FITNESS_PARAMS);
      if (data) return JSON.parse(data);
    } catch {}
    return DEFAULT_USER_PARAMETERS;
  },

  saveUserParameters(params: UserFitnessParameters): void {
    localStorage.setItem(STORAGE_KEYS.FITNESS_PARAMS, JSON.stringify(params));
    notifyListeners();
  },

  // FAVORITES
  getFavoriteExerciseIds(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (data) return JSON.parse(data);
    } catch {}
    return ['bench_press', 'pullups_wide', 'squats_barbell', 'military_press'];
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
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
    notifyListeners();
    return isFav;
  },

  resetAllData(): void {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.PROGRAMS);
    localStorage.removeItem(STORAGE_KEYS.WORKOUTS);
    localStorage.removeItem(STORAGE_KEYS.SPORTS_SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.WEEKLY_SCHEDULE);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_ACTIVITY);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
    localStorage.removeItem(STORAGE_KEYS.EQUIPMENT);
    localStorage.removeItem(STORAGE_KEYS.FITNESS_PARAMS);
    localStorage.removeItem(STORAGE_KEYS.FAVORITES);
    notifyListeners();
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
      exportedAt: new Date().toISOString(),
      version: 4,
    };
    return JSON.stringify(data, null, 2);
  },

  importBackupJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.profile) localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(parsed.profile));
      if (parsed.programs) localStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(parsed.programs));
      if (parsed.workouts) localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(parsed.workouts));
      if (parsed.sports) localStorage.setItem(STORAGE_KEYS.SPORTS_SESSIONS, JSON.stringify(parsed.sports));
      if (parsed.weeklySchedule) localStorage.setItem(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify(parsed.weeklySchedule));
      if (parsed.activity) localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, JSON.stringify(parsed.activity));
      if (parsed.equipment) localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(parsed.equipment));
      if (parsed.fitnessParameters) localStorage.setItem(STORAGE_KEYS.FITNESS_PARAMS, JSON.stringify(parsed.fitnessParameters));
      if (parsed.favoriteExerciseIds) localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(parsed.favoriteExerciseIds));
      notifyListeners();
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },
};

export const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  { id: 'bodyweight', name: 'Собственный вес', categoryName: 'Без оборудования', iconName: 'User', selected: true },
  { id: 'pullup_bar', name: 'Турник', categoryName: 'Перекладина для подтягиваний', iconName: 'Minus', selected: true },
  { id: 'dip_bars', name: 'Брусья', categoryName: 'Параллельные брусья', iconName: 'Equal', selected: true },
  { id: 'dumbbells_adjustable', name: 'Гантели с регулируемым весом', categoryName: 'Разборные гантели', iconName: 'Dumbbell', selected: true, minWeightKg: 2, maxWeightKg: 32, weightStepKg: 2 },
  { id: 'dumbbells_fixed', name: 'Гантели с фиксированным весом', categoryName: 'Цельные гантели', iconName: 'Dumbbell', selected: false, singleDumbbellWeightKg: 16 },
  { id: 'barbell', name: 'Штанга и блины', categoryName: 'Олимпийский или прямой гриф', iconName: 'Shield', selected: true, maxWeightKg: 140 },
  { id: 'bench', name: 'Скамья для жима', categoryName: 'Горизонтальная или наклонная скамья', iconName: 'Square', selected: true },
  { id: 'resistance_bands', name: 'Эспандеры и резиновые ленты', categoryName: 'Фитнес-резинки и жгуты', iconName: 'Activity', selected: true },
  { id: 'kettlebells', name: 'Гири', categoryName: 'Чугунные гири', iconName: 'Circle', selected: false, singleDumbbellWeightKg: 16 },
  { id: 'jump_rope', name: 'Скакалка', categoryName: 'Кардио-разминка', iconName: 'Zap', selected: true },
  { id: 'gym_machines', name: 'Тренажёры', categoryName: 'Блочные и рычажные тренажеры', iconName: 'Cpu', selected: true },
  { id: 'other', name: 'Другой инвентарь', categoryName: 'Ролики для пресса, утяжелители', iconName: 'Plus', selected: false },
];

export const DEFAULT_USER_PARAMETERS: UserFitnessParameters = {
  goal: 'Развитие мышц',
  level: 'Средний',
  location: 'В зале',
  daysPerWeek: 4,
  durationMinutes: 60,
  availableDays: ['Пн', 'Вт', 'Чт', 'Пт'],
  preferredMuscles: ['chest', 'lats', 'shoulders', 'quads'],
  excludedExercises: [],
  healthRestrictions: [],
  notes: '',
};
