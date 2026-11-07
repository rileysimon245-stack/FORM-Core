/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StorageService } from './services/storage';
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
import { RegionProbePage } from './dev/regionProbe/RegionProbePage';

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

  useEffect(() => {
    const handleUrlChange = () => {
      setIsProbeMode(checkIsProbeMode());
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  if (isProbeMode) {
    return <RegionProbePage />;
  }

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
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Create an immutable snapshot of the program day and planned exercises
    const programSnapshot: ProgramSnapshot = {
      programId,
      programName,
      dayId: day.id,
      dayName: day.dayName,
      targetMuscleGroups: day.targetMuscleGroups ? [...day.targetMuscleGroups] : undefined,
      plannedExercises: (day.exercises || []).map((ex) => ({
        name: ex.name,
        targetMuscle: ex.targetMuscle,
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
      exercises: (day.exercises || []).map((ex, idx) => ({
        id: `ex_${idx}_${Date.now()}`,
        exerciseId: `ex_${idx}`,
        name: ex.name,
        targetMuscle: ex.targetMuscle,
        isBodyweight: ex.isBodyweight,
        restSeconds: ex.restSeconds || 90,
        sets: Array.from({ length: ex.sets || 3 }).map((_, sIdx) => ({
          setNumber: sIdx + 1,
          weightKg: ex.isBodyweight ? 0 : (ex.targetWeight || 0),
          reps: ex.reps || 10,
          completed: false,
        })),
      })),
    };

    setIsResumedDraft(false);
    setActiveWorkoutSession(newSession);
  };

  // Quick start blank workout
  const handleStartCustomQuickWorkout = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  const handleSaveActiveWorkout = (completedSession: WorkoutSession) => {
    StorageService.saveWorkoutSession(completedSession);
    StorageService.clearActiveDraft();
    setIsResumedDraft(false);
    setActiveWorkoutSession(null);
    setActiveDraft(null);
    setRecentlyCompletedDate(completedSession.date);
    setTimeout(() => setRecentlyCompletedDate(null), 3000);
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
    StorageService.setDayStatus(inspectingDay.dateStr, newStatus);
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
  const handleExportData = () => {
    const json = StorageService.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FORM_workout_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON backup
  const handleImportData = (jsonStr: string) => {
    return StorageService.importBackupJson(jsonStr);
  };

  // Save weekly schedule
  const handleSaveWeeklySchedule = (newSchedule: WeeklyScheduleDay[]) => {
    StorageService.saveWeeklySchedule(newSchedule);
    setShowWeeklyScheduleModal(false);
    reloadData();
  };

  // Save sport session
  const handleSaveSportSession = (session: SportSession) => {
    StorageService.saveSportSession(session);
    setSportModalDate(null);
    setRecentlyCompletedDate(session.date);
    setTimeout(() => setRecentlyCompletedDate(null), 3000);
    reloadData();
  };

  return (
    <AnimationProvider>
      <div className="h-[100dvh] w-full bg-[#080D0E] text-[#F0F3F2] flex justify-center selection:bg-[#58C995] selection:text-black overflow-hidden">
        {/* Mobile Smartphone Frame Container */}
        <div className="w-full max-w-md h-full bg-[#080D0E] flex flex-col relative px-4 pt-2 pb-0 border-x border-[#1C2628] shadow-2xl overflow-hidden">
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
                  if (confirm('Прервать текущую тренировку? Прогресс сохранен в черновик.')) {
                    setIsResumedDraft(false);
                    setActiveWorkoutSession(null);
                    setActiveDraft(StorageService.getActiveDraft());
                  }
                }}
              />
            )}

            {/* Program Editor Modal (Option A) */}
            {editingProgram && (
              <ProgramEditorModal
                key="modal-program-editor"
                initialProgram={editingProgram === 'new' ? null : editingProgram}
                onSave={(savedProgram) => {
                  StorageService.saveProgram(savedProgram);
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
                  StorageService.saveProgram(generatedProgram);
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
                  StorageService.resetAllData();
                  reloadData();
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
