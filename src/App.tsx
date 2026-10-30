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
  MuscleGroup,
  WeeklyScheduleDay,
  SportSession,
} from './types/workout';
import { AnimationProvider } from './context/AnimationContext';
import { tabContentVariants } from './utils/animations';
import { BottomNavigation, TabType } from './components/BottomNavigation';
import { OverviewTab } from './components/OverviewTab';
import { WorkoutsTab } from './components/WorkoutsTab';
import { ProfileTab } from './components/ProfileTab';
import { ActiveWorkoutModal } from './components/ActiveWorkoutModal';
import { ProgramEditorModal } from './components/ProgramEditorModal';
import { ProgramGeneratorModal } from './components/ProgramGeneratorModal';
import { DayDetailsModal } from './components/DayDetailsModal';
import { SettingsApkModal } from './components/SettingsApkModal';
import { EquipmentModal } from './components/EquipmentModal';
import { UserParametersModal } from './components/UserParametersModal';
import { WeeklyScheduleModal } from './components/WeeklyScheduleModal';
import { SportSessionModal } from './components/SportSessionModal';
import { Wifi, BatteryMedium } from 'lucide-react';

export default function App() {
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
  const [editingProgram, setEditingProgram] = useState<WorkoutProgram | null | 'new'>(null);
  const [showProgramGenerator, setShowProgramGenerator] = useState<boolean>(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState<boolean>(false);
  const [showUserParamsModal, setShowUserParamsModal] = useState<boolean>(false);
  const [showSettingsApk, setShowSettingsApk] = useState<boolean>(false);
  const [showWeeklyScheduleModal, setShowWeeklyScheduleModal] = useState<boolean>(false);
  const [sportModalDate, setSportModalDate] = useState<string | null>(null);
  const [inspectingDay, setInspectingDay] = useState<{
    dateStr: string;
    status: 'completed' | 'skipped' | 'none';
  } | null>(null);

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
    const todayStr = '2026-10-29';
    const newSession: WorkoutSession = {
      id: `session_${Date.now()}`,
      programId,
      programName,
      name: day.dayName,
      date: todayStr,
      startTime: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      durationMinutes: day.estimatedDuration || 55,
      totalVolumeKg: 0,
      completedSets: 0,
      status: 'in_progress',
      exercises: day.exercises.map((ex, idx) => ({
        id: `ex_${idx}_${Date.now()}`,
        exerciseId: `ex_${idx}`,
        name: ex.name,
        targetMuscle: ex.targetMuscle,
        isBodyweight: ex.isBodyweight,
        restSeconds: ex.restSeconds || 90,
        sets: Array.from({ length: ex.sets || 3 }).map((_, sIdx) => ({
          setNumber: sIdx + 1,
          weightKg: ex.isBodyweight ? 0 : ex.targetWeight || 50,
          reps: ex.reps || 10,
          completed: false,
        })),
      })),
    };

    setActiveWorkoutSession(newSession);
  };

  // Quick start blank workout
  const handleStartCustomQuickWorkout = () => {
    const todayStr = '2026-10-29';
    const quickSession: WorkoutSession = {
      id: `session_${Date.now()}`,
      name: 'Свободная силовая тренировка',
      programName: 'По выбору',
      date: todayStr,
      startTime: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      durationMinutes: 45,
      totalVolumeKg: 0,
      completedSets: 0,
      status: 'in_progress',
      exercises: [
        {
          id: `ex_1_${Date.now()}`,
          exerciseId: 'bench_quick',
          name: 'Жим штанги лежа',
          targetMuscle: 'chest',
          isBodyweight: false,
          restSeconds: 90,
          sets: [
            { setNumber: 1, weightKg: 60, reps: 10, completed: false },
            { setNumber: 2, weightKg: 70, reps: 8, completed: false },
            { setNumber: 3, weightKg: 75, reps: 6, completed: false },
          ],
        },
      ],
    };

    setActiveWorkoutSession(quickSession);
  };

  // Complete and save active workout
  const handleSaveActiveWorkout = (completedSession: WorkoutSession) => {
    StorageService.saveWorkoutSession(completedSession);
    StorageService.clearActiveDraft();
    setActiveWorkoutSession(null);
    setActiveDraft(null);
    setRecentlyCompletedDate(completedSession.date);
    setTimeout(() => setRecentlyCompletedDate(null), 3000);
  };

  // Resume or discard draft
  const handleResumeDraft = (draft: WorkoutSession) => {
    setActiveWorkoutSession(draft);
  };

  const handleDiscardDraft = () => {
    StorageService.clearActiveDraft();
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
      <div className="min-h-screen bg-[#080D0E] text-[#E8E9E7] flex justify-center selection:bg-[#58C995] selection:text-black">
        {/* Mobile Smartphone Frame Container */}
        <div className="w-full max-w-md min-h-screen bg-[#080D0E] flex flex-col relative px-4 pt-2 border-x border-[#1a2224] shadow-2xl">
          {/* Android Top Status Bar Mockup matching Image 1 & 2 */}
          <div className="flex items-center justify-between py-1 px-1 text-[12px] text-[#92999A] font-medium shrink-0">
            <span className="font-semibold text-white tracking-tight">9:41</span>
            <div className="flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <BatteryMedium className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Tab Content Display with smooth tab transitions */}
          <main className="flex-1 overflow-x-hidden pt-1">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full"
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
                    onOpenSettings={() => setShowSettingsApk(true)}
                    onOpenWeeklySchedule={() => setShowWeeklyScheduleModal(true)}
                    onOpenSportModal={(date) => setSportModalDate(date || '2026-10-29')}
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
                  className="w-full"
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

              {activeTab === 'profile' && (
                <motion.div
                  key="profile"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full"
                >
                  <ProfileTab
                    profile={profile}
                    onUpdateProfile={(updated) => StorageService.updateProfile(updated)}
                    muscleStats={muscleStats}
                    sessions={sessions}
                    onOpenEquipment={() => setShowEquipmentModal(true)}
                    onOpenParameters={() => setShowUserParamsModal(true)}
                    onOpenApkGuide={() => setShowSettingsApk(true)}
                    onExportData={handleExportData}
                    onImportData={() => setShowSettingsApk(true)}
                    onResetData={() => StorageService.resetAllData()}
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
                onSave={handleSaveActiveWorkout}
                onCancel={() => {
                  if (confirm('Прервать текущую тренировку? Прогресс сохранен в черновик.')) {
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

            {/* Settings & Android APK Packaging Modal */}
            {showSettingsApk && (
              <SettingsApkModal
                key="modal-settings-apk"
                onClose={() => setShowSettingsApk(false)}
                onExportData={handleExportData}
                onImportData={handleImportData}
                onResetData={() => StorageService.resetAllData()}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </AnimationProvider>
  );
}
