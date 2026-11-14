/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StorageService } from './services/storage';
import { SafeWriteResult, StartupRecoveryResolution } from './services/migrations';
import { findExerciseInUnifiedCatalog } from './training-core/catalog';
import { normalizeMuscleKeyPure, normalizeMuscleListPure } from './training-core/muscles';
import { formatLocalIsoDate } from './training-core/dateUtils';
import {
  UserProfile,
  WorkoutProgram,
  WorkoutSession,
  ProgramWorkoutDay,
  ProgramSnapshot,
  MuscleGroup,
  WeeklyScheduleDay,
  SportSession,
} from './types/workout';
import { AnimationProvider } from './context/AnimationContext';
import { tabContentVariants } from './utils/animations';
import { BottomNavigation, TabType } from './components/BottomNavigation';
import { OverviewTab } from './components/OverviewTab';
import { WorkoutsTab } from './components/WorkoutsTab';
import { AnatomyTab } from './components/AnatomyTab';
import { ProfileTab } from './components/ProfileTab';
import { ActiveWorkoutModal } from './components/ActiveWorkoutModal';
import { ProgramEditorModal } from './components/ProgramEditorModal';
import { ProgramGeneratorModal } from './components/ProgramGeneratorModal';
import { DayDetailsModal } from './components/DayDetailsModal';
import { SettingsModal } from './components/SettingsModal';
import { EquipmentModal } from './components/EquipmentModal';
import { UserParametersModal } from './components/UserParametersModal';
import { WeeklyScheduleModal } from './components/WeeklyScheduleModal';
import { SportSessionModal } from './components/SportSessionModal';
import { ElasticScroll } from './components/ElasticScroll';
import { RecoveryBlockingScreen } from './components/RecoveryBlockingScreen';
import { RegionProbePage } from './dev/regionProbe/RegionProbePage';

const NONE_RECOVERY_RESOLUTION: StartupRecoveryResolution = {
  state: {
    status: 'none',
    error: null,
    pendingKeys: [],
    rawPendingValue: null,
    rawSnapshotValue: null,
  },
  autoAttempted: false,
  autoError: null,
};

function checkIsProbeMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.get('probe') === 'regions' || search.has('probe')) {
      return true;
    }
    const hash = window.location.hash || '';
    if (hash.includes('probe=regions') || hash.includes('probe') || hash === '#regions') {
      return true;
    }
    if (window.location.href.includes('probe=regions')) {
      return true;
    }
  } catch {
    // Ignore URL parsing errors
  }
  return false;
}

export default function App() {
  const [isProbeMode, setIsProbeMode] = useState<boolean>(() => checkIsProbeMode());
  const [recoveryBoot, setRecoveryBoot] = useState<StartupRecoveryResolution>(() =>
    checkIsProbeMode() ? NONE_RECOVERY_RESOLUTION : StorageService.resolveStartupRecoveryState()
  );

  useEffect(() => {
    const handleUrlChange = () => {
      const nextProbe = checkIsProbeMode();
      if (!nextProbe) {
        setRecoveryBoot(StorageService.resolveStartupRecoveryState());
      }
      setIsProbeMode(nextProbe);
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  useEffect(() => {
    if (isProbeMode) return;
    const unsubscribe = StorageService.subscribe(() => {
      const nextState = StorageService.getRecoveryState();
      setRecoveryBoot((prev) => {
        if (
          prev.state.status === nextState.status &&
          prev.state.error === nextState.error &&
          prev.state.pendingKeys.join(',') === nextState.pendingKeys.join(',')
        ) {
          return prev;
        }
        return {
          state: nextState,
          autoAttempted: prev.autoAttempted,
          autoError:
            nextState.status === 'none'
              ? null
              : nextState.error || StorageService.getLastWriteError(),
        };
      });
    });
    return () => unsubscribe();
  }, [isProbeMode]);

  const handleRecovered = useCallback(() => {
    setRecoveryBoot({
      state: StorageService.getRecoveryState(),
      autoAttempted: true,
      autoError: null,
    });
  }, []);

  if (isProbeMode) {
    return <RegionProbePage />;
  }

  if (recoveryBoot.state.status !== 'none') {
    return (
      <RecoveryBlockingScreen
        key={`${recoveryBoot.state.status}:${recoveryBoot.state.error || ''}`}
        recoveryState={recoveryBoot.state}
        initialError={recoveryBoot.autoError}
        onRecovered={handleRecovered}
      />
    );
  }

  return <MainAppContent />;
}

function MainAppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentYear, setCurrentYear] = useState<number>(2026);

  // App reactive state
  const [profile, setProfile] = useState<UserProfile>(StorageService.getProfile());
  const [programs, setPrograms] = useState<WorkoutProgram[]>(StorageService.getPrograms());
  const [sessions, setSessions] = useState<WorkoutSession[]>(StorageService.getWorkoutSessions());
  const [activityMap, setActivityMap] = useState<Record<string, 'completed' | 'skipped' | 'none'>>(
    StorageService.getActivityMap(currentYear)
  );
  const [yearStats, setYearStats] = useState(StorageService.getYearStats(currentYear));
  const [totalActivityStats, setTotalActivityStats] = useState(StorageService.getTotalActivityStats(currentYear));
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleDay[]>(StorageService.getWeeklySchedule());
  const [muscleStats, setMuscleStats] = useState(StorageService.getMuscleStats());
  const [activeDraft, setActiveDraft] = useState<WorkoutSession | null>(StorageService.getActiveDraft());
  const [recentlyCompletedDate, setRecentlyCompletedDate] = useState<string | null>(null);
  const [storageErrorNotice, setStorageErrorNotice] = useState<string | null>(() =>
    StorageService.getLastWriteError()
  );
  const [corruptedKeysCount, setCorruptedKeysCount] = useState<number>(
    () => StorageService.getCorruptedKeys().length
  );

  // Modals state
  const [activeWorkoutSession, setActiveWorkoutSession] = useState<WorkoutSession | null>(null);
  const [isResumedDraft, setIsResumedDraft] = useState<boolean>(false);
  const [editingProgram, setEditingProgram] = useState<WorkoutProgram | null | 'new'>(null);
  const [showProgramGenerator, setShowProgramGenerator] = useState<boolean>(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState<boolean>(false);
  const [showUserParamsModal, setShowUserParamsModal] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showWeeklyScheduleModal, setShowWeeklyScheduleModal] = useState<boolean>(false);
  const [sportModalDate, setSportModalDate] = useState<string | null>(null);
  const [inspectingDay, setInspectingDay] = useState<{
    dateStr: string;
    status: 'completed' | 'skipped' | 'none';
  } | null>(null);

  // Lock body scroll when any modal is open
  const isAnyModalOpen = Boolean(
    activeWorkoutSession ||
    editingProgram ||
    showProgramGenerator ||
    showEquipmentModal ||
    showUserParamsModal ||
    showSettings ||
    showWeeklyScheduleModal ||
    sportModalDate ||
    inspectingDay
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isAnyModalOpen]);

  // Subscribe to storage changes
  const reloadData = useCallback(() => {
    setProfile(StorageService.getProfile());
    setPrograms(StorageService.getPrograms());
    setSessions(StorageService.getWorkoutSessions());
    setActivityMap(StorageService.getActivityMap(currentYear));
    setYearStats(StorageService.getYearStats(currentYear));
    setTotalActivityStats(StorageService.getTotalActivityStats(currentYear));
    setWeeklySchedule(StorageService.getWeeklySchedule());
    setMuscleStats(StorageService.getMuscleStats());
    setActiveDraft(StorageService.getActiveDraft());
    setStorageErrorNotice(StorageService.getLastWriteError());
    setCorruptedKeysCount(StorageService.getCorruptedKeys().length);
  }, [currentYear]);

  useEffect(() => {
    const unsubscribe = StorageService.subscribe(reloadData);
    return () => unsubscribe();
  }, [reloadData]);

  // Handle launching workout from a program day
  const handleStartProgramWorkout = (
    day: ProgramWorkoutDay,
    programName: string,
    programId?: string
  ) => {
    const now = new Date();
    const todayStr = formatLocalIsoDate(now);
    const customExercises = StorageService.getCustomExercises();

    // Create an immutable snapshot of the program day and planned exercises
    const programSnapshot: ProgramSnapshot = {
      programId,
      programName,
      dayId: day.id,
      dayName: day.dayName,
      targetMuscleGroups: day.targetMuscleGroups ? [...day.targetMuscleGroups] : undefined,
      plannedExercises: (day.exercises || []).map((ex) => ({
        name: ex.name,
        targetMuscle: normalizeMuscleKeyPure(ex.targetMuscle) || ex.targetMuscle,
        sets: ex.sets || 3,
        reps: ex.reps || 10,
        targetWeight: ex.isBodyweight ? 0 : (ex.targetWeight || 0),
        isBodyweight: Boolean(ex.isBodyweight),
        restSeconds: ex.restSeconds || 90,
      })),
    };

    const newSession: WorkoutSession = {
      id: `session_${Date.now()}`,
      programId,
      programName,
      programDayId: day.id,
      programDayName: day.dayName,
      programSnapshot,
      name: day.dayName,
      date: todayStr,
      startTime: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      durationMinutes: day.estimatedDuration || 55,
      totalVolumeKg: 0,
      completedSets: 0,
      status: 'in_progress',
      exercises: (day.exercises || []).map((ex, idx) => {
        const catalogEntry = findExerciseInUnifiedCatalog(
          ex.exerciseId,
          ex.name,
          customExercises,
          ex.targetMuscle
        );
        const resolvedPrimary =
          normalizeMuscleKeyPure(ex.targetMuscle || catalogEntry?.primaryMuscle) || ex.targetMuscle;
        const rawSec =
          ex.secondaryMuscles && ex.secondaryMuscles.length > 0
            ? ex.secondaryMuscles
            : catalogEntry?.secondaryMuscles || [];
        const resolvedSecondary = normalizeMuscleListPure(rawSec).filter(
          (m) => m !== resolvedPrimary
        );
        return {
          id: `ex_${idx}_${Date.now()}`,
          exerciseId: ex.exerciseId || catalogEntry?.id || `ex_${idx}`,
          name: ex.name,
          targetMuscle: resolvedPrimary,
          secondaryMuscles: resolvedSecondary,
          isBodyweight: ex.isBodyweight,
          requiredEquipment: ex.requiredEquipment || catalogEntry?.requiredEquipment,
          restSeconds: ex.restSeconds || 90,
          technique: ex.technique || catalogEntry?.technique,
          sets: Array.from({ length: ex.sets || 3 }).map((_, sIdx) => ({
            setNumber: sIdx + 1,
            weightKg: ex.isBodyweight ? 0 : (ex.targetWeight || 0),
            reps: ex.reps || 10,
            completed: false,
          })),
        };
      }),
    };

    setIsResumedDraft(false);
    setActiveWorkoutSession(newSession);
  };

  // Quick start blank workout
  const handleStartCustomQuickWorkout = () => {
    const now = new Date();
    const todayStr = formatLocalIsoDate(now);
    const quickSession: WorkoutSession = {
      id: `session_${Date.now()}`,
      name: 'Свободная тренировка',
      programName: 'По выбору',
      date: todayStr,
      startTime: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      durationMinutes: 0,
      totalVolumeKg: 0,
      completedSets: 0,
      status: 'in_progress',
      exercises: [],
    };

    setIsResumedDraft(false);
    setActiveWorkoutSession(quickSession);
  };

  // Complete and save active workout
  const handleSaveActiveWorkout = (completedSession: WorkoutSession): SafeWriteResult => {
    const res = StorageService.saveWorkoutSession(completedSession);
    if (!res.ok) {
      setStorageErrorNotice(
        res.error || 'Не удалось сохранить тренировку в память устройства.'
      );
      return res;
    }
    setStorageErrorNotice(null);
    setIsResumedDraft(false);
    setActiveWorkoutSession(null);
    setActiveDraft(null);
    setRecentlyCompletedDate(completedSession.date);
    setTimeout(() => setRecentlyCompletedDate(null), 3000);
    return res;
  };

  // Resume or discard draft
  const handleResumeDraft = (draft: WorkoutSession) => {
    setIsResumedDraft(true);
    setActiveWorkoutSession(draft);
  };

  const handleDiscardDraft = () => {
    StorageService.clearActiveDraft();
    setIsResumedDraft(false);
    setActiveDraft(null);
  };

  // Duplicate program
  const handleDuplicateProgram = (programId: string) => {
    const copy = StorageService.duplicateProgram(programId);
    if (copy) {
      setPrograms(StorageService.getPrograms());
    }
  };

  // Day status toggle from DayDetailsModal
  const handleSetDayStatus = (newStatus: 'completed' | 'skipped' | 'none') => {
    if (!inspectingDay) return;
    const res = StorageService.setDayStatus(inspectingDay.dateStr, newStatus);
    if (!res.ok) {
      setStorageErrorNotice(res.error || 'Не удалось обновить статус дня.');
      return;
    }
    setStorageErrorNotice(null);
    if (newStatus === 'completed') {
      setRecentlyCompletedDate(inspectingDay.dateStr);
      setTimeout(() => setRecentlyCompletedDate(null), 3000);
    }
    setInspectingDay(null);
  };

  // Start workout directly on selected date
  const handleStartWorkoutOnSelectedDay = () => {
    if (!inspectingDay) return;
    const day = programs[0]?.workouts[0] || {
      id: 'quick_day',
      dayName: 'Тренировка дня',
      targetMuscleGroups: ['chest' as MuscleGroup],
      estimatedDuration: 55,
      exercises: [
        { name: 'Жим штанги лежа', targetMuscle: 'chest' as MuscleGroup, isBodyweight: false, sets: 4, reps: 8, targetWeight: 75, restSeconds: 90 },
      ],
    };
    handleStartProgramWorkout(day, programs[0]?.name || 'FORM', programs[0]?.id);
    setInspectingDay(null);
  };

  // Export JSON backup
  const handleExportData = (): SafeWriteResult => {
    try {
      const json = StorageService.exportBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FORM_workout_backup_${formatLocalIsoDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true, error: null };
    } catch (err: any) {
      const msg = err?.message || 'Не удалось сформировать файл резервной копии.';
      setStorageErrorNotice(msg);
      return { ok: false, error: msg };
    }
  };

  // Import JSON backup
  const handleImportData = (jsonStr: string): SafeWriteResult => {
    const res = StorageService.importBackupJsonWithResult(jsonStr);
    if (res.ok) {
      setStorageErrorNotice(null);
      reloadData();
    } else {
      setStorageErrorNotice(res.error || 'Не удалось импортировать резервную копию.');
    }
    return res;
  };

  // Save weekly schedule
  const handleSaveWeeklySchedule = (newSchedule: WeeklyScheduleDay[]) => {
    const res = StorageService.saveWeeklySchedule(newSchedule);
    if (!res.ok) {
      setStorageErrorNotice(res.error || 'Не удалось сохранить расписание недели.');
      return;
    }
    setStorageErrorNotice(null);
    setShowWeeklyScheduleModal(false);
    reloadData();
  };

  // Save sport session
  const handleSaveSportSession = (session: SportSession): SafeWriteResult => {
    const res = StorageService.saveSportSession(session);
    if (!res.ok) {
      setStorageErrorNotice(res.error || 'Не удалось сохранить спортивное занятие.');
      return res;
    }
    setStorageErrorNotice(null);
    setSportModalDate(null);
    if (session.status === 'completed') {
      setRecentlyCompletedDate(session.date);
      setTimeout(() => setRecentlyCompletedDate(null), 3000);
    }
    reloadData();
    return res;
  };

  return (
    <AnimationProvider>
      <div className="h-[100dvh] w-full bg-[#08100D] text-[#F2F5F3] flex justify-center selection:bg-[#56CC97] selection:text-black overflow-hidden">
        {/* Mobile Smartphone Frame Container */}
        <div className="w-full max-w-md h-full bg-[#08100D] flex flex-col relative px-4 pt-2 pb-0 border-x border-[#12251E] shadow-2xl overflow-hidden">
          {(storageErrorNotice || corruptedKeysCount > 0) && (
            <div
              role="alert"
              className="mb-2 px-3 py-2 rounded-2xl bg-[#2B1414] border border-[#5C2626] text-[11px] text-[#FCA5A5] flex items-center justify-between gap-2 shrink-0"
            >
              <div className="min-w-0 flex-1">
                <strong className="text-[#F87171] block">
                  {corruptedKeysCount > 0
                    ? `Обнаружены повреждённые ключи (${corruptedKeysCount})`
                    : 'Ошибка сохранения данных'}
                </strong>
                <span className="truncate block">
                  {storageErrorNotice ||
                    'Повреждённый раздел заблокирован от перезаписи. Откройте настройки → Данные.'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="px-2 py-1 rounded-lg bg-[#3A1C1C] hover:bg-[#4B2323] text-white font-bold text-[10px] cursor-pointer"
                >
                  Данные
                </button>
                {storageErrorNotice && (
                  <button
                    type="button"
                    onClick={() => {
                      StorageService.clearLastWriteError();
                      setStorageErrorNotice(null);
                    }}
                    className="px-1.5 py-1 rounded-lg text-[#FCA5A5] hover:text-white font-bold text-[10px] cursor-pointer"
                    aria-label="Скрыть уведомление"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab Content Display with authentic iOS-style elastic scrolling */}
          <main className="flex-1 min-h-0 w-full relative flex flex-col overflow-hidden">
            <ElasticScroll
              className="flex-1 min-h-0 w-full"
            >
              <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                  <motion.div
                    key="overview"
                    variants={tabContentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full pb-28 pt-1"
                  >
                    <OverviewTab
                      year={currentYear}
                      onYearChange={(y) => setCurrentYear(y)}
                      activityMap={activityMap}
                      recentlyCompletedDate={recentlyCompletedDate}
                      stats={yearStats}
                      totalActivityStats={totalActivityStats}
                      weeklySchedule={weeklySchedule}
                      onDayClick={(dateStr, status) => setInspectingDay({ dateStr, status })}
                      programs={programs}
                      onStartWorkout={(workoutDay, progName) =>
                        handleStartProgramWorkout(workoutDay, progName, programs[0]?.id)
                      }
                      onOpenSettings={() => setShowSettings(true)}
                      onOpenWeeklySchedule={() => setShowWeeklyScheduleModal(true)}
                      onOpenSportModal={(date) => {
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        setSportModalDate(date || todayStr);
                      }}
                      onCreateProgram={() => setEditingProgram('new')}
                      onQuickStart={handleStartCustomQuickWorkout}
                    />
                  </motion.div>
                )}

                {activeTab === 'workouts' && (
                  <motion.div
                    key="workouts"
                    variants={tabContentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full pb-28 pt-1"
                  >
                    <WorkoutsTab
                      programs={programs}
                      sessions={sessions}
                      onStartProgramWorkout={(day, pName, pId) =>
                        handleStartProgramWorkout(day, pName, pId)
                      }
                      onStartCustomQuickWorkout={handleStartCustomQuickWorkout}
                      onCreateProgram={() => setEditingProgram('new')}
                      onGenerateProgram={() => setShowProgramGenerator(true)}
                      onEditProgram={(prog) => setEditingProgram(prog)}
                      onDuplicateProgram={handleDuplicateProgram}
                      onDeleteProgram={(id) => StorageService.deleteProgram(id)}
                      onDeleteSession={(id) => StorageService.deleteWorkoutSession(id)}
                      onOpenEquipment={() => setShowEquipmentModal(true)}
                      onOpenParameters={() => setShowUserParamsModal(true)}
                      activeDraft={activeDraft}
                      onResumeDraft={handleResumeDraft}
                      onDiscardDraft={handleDiscardDraft}
                    />
                  </motion.div>
                )}

                {activeTab === 'anatomy' && (
                  <motion.div
                    key="anatomy"
                    variants={tabContentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full pb-24 pt-1"
                  >
                    <AnatomyTab />
                  </motion.div>
                )}

                {activeTab === 'profile' && (
                  <motion.div
                    key="profile"
                    variants={tabContentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full pb-28 pt-1"
                  >
                    <ProfileTab
                      profile={profile}
                      onUpdateProfile={(updated) => StorageService.updateProfile(updated)}
                      muscleStats={muscleStats}
                      sessions={sessions}
                      onOpenEquipment={() => setShowEquipmentModal(true)}
                      onOpenParameters={() => setShowUserParamsModal(true)}
                      onOpenSettings={() => setShowSettings(true)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </ElasticScroll>
          </main>

          {/* Bottom Navigation with strictly 3 tabs */}
          <BottomNavigation activeTab={activeTab} onChangeTab={setActiveTab} />

          {/* Modals wrapped in AnimatePresence for smooth entry/exit */}
          <AnimatePresence>
            {/* Active Workout Tracker Modal */}
            {activeWorkoutSession && (
              <ActiveWorkoutModal
                key="modal-active-workout"
                session={activeWorkoutSession}
                isRestoredDraft={isResumedDraft}
                onSave={handleSaveActiveWorkout}
                onCancel={() => {
                  setIsResumedDraft(false);
                  setActiveWorkoutSession(null);
                  setActiveDraft(StorageService.getActiveDraft());
                }}
              />
            )}

            {/* Program Editor Modal (Option A) */}
            {editingProgram && (
              <ProgramEditorModal
                key="modal-program-editor"
                initialProgram={editingProgram === 'new' ? null : editingProgram}
                onSave={(savedProgram) => {
                  const res = StorageService.saveProgram(savedProgram);
                  if (!res.ok) {
                    setStorageErrorNotice(res.error || 'Не удалось сохранить программу.');
                    return;
                  }
                  setStorageErrorNotice(null);
                  setEditingProgram(null);
                }}
                onClose={() => setEditingProgram(null)}
              />
            )}

            {/* Program Generator Modal (Option B: AI & algorithmic) */}
            {showProgramGenerator && (
              <ProgramGeneratorModal
                key="modal-program-generator"
                onProgramGenerated={(generatedProgram) => {
                  const res = StorageService.saveProgram(generatedProgram);
                  if (!res.ok) {
                    setStorageErrorNotice(res.error || 'Не удалось сохранить программу.');
                    return;
                  }
                  setStorageErrorNotice(null);
                  setShowProgramGenerator(false);
                }}
                onClose={() => setShowProgramGenerator(false)}
                onOpenEquipment={() => {
                  setShowProgramGenerator(false);
                  setShowEquipmentModal(true);
                }}
                onOpenParameters={() => {
                  setShowProgramGenerator(false);
                  setShowUserParamsModal(true);
                }}
              />
            )}

            {/* My Equipment Modal */}
            {showEquipmentModal && (
              <EquipmentModal
                key="modal-equipment"
                onClose={() => setShowEquipmentModal(false)}
                onSaved={() => {
                  setShowEquipmentModal(false);
                  reloadData();
                }}
              />
            )}

            {/* My Fitness Parameters Modal */}
            {showUserParamsModal && (
              <UserParametersModal
                key="modal-user-params"
                onClose={() => setShowUserParamsModal(false)}
                onSaved={() => {
                  setShowUserParamsModal(false);
                  reloadData();
                }}
              />
            )}

            {/* Day Details Inspection Modal */}
            {inspectingDay && (
              <DayDetailsModal
                key="modal-day-details"
                dateStr={inspectingDay.dateStr}
                currentStatus={inspectingDay.status}
                strengthSessions={sessions.filter((s) => s.date === inspectingDay.dateStr)}
                sportSessions={StorageService.getSportSessions().filter((s) => s.date === inspectingDay.dateStr)}
                weeklySchedule={weeklySchedule}
                onSetStatus={handleSetDayStatus}
                onStartWorkoutForDay={handleStartWorkoutOnSelectedDay}
                onAddSportSession={(date) => {
                  setInspectingDay(null);
                  setSportModalDate(date);
                }}
                onDeleteStrengthSession={(sId) => {
                  StorageService.deleteWorkoutSession(sId);
                  reloadData();
                }}
                onDeleteSportSession={(sId) => {
                  StorageService.deleteSportSession(sId);
                  reloadData();
                }}
                onClose={() => setInspectingDay(null)}
              />
            )}

            {/* Weekly Schedule Planner Modal */}
            {showWeeklyScheduleModal && (
              <WeeklyScheduleModal
                key="modal-weekly-schedule"
                initialSchedule={weeklySchedule}
                onSave={handleSaveWeeklySchedule}
                onClose={() => setShowWeeklyScheduleModal(false)}
              />
            )}

            {/* Sport / Boxing Session Logger Modal */}
            {sportModalDate && (
              <SportSessionModal
                key="modal-sport-session"
                defaultDate={sportModalDate}
                onSave={handleSaveSportSession}
                onClose={() => setSportModalDate(null)}
              />
            )}

            {/* Full Form App Settings Modal */}
            {showSettings && (
              <SettingsModal
                key="modal-settings"
                onClose={() => setShowSettings(false)}
                onExportData={handleExportData}
                onImportData={handleImportData}
                onResetData={() => {
                  const res = StorageService.resetAllData();
                  reloadData();
                  return res;
                }}
                onDataChanged={reloadData}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </AnimationProvider>
  );
}
