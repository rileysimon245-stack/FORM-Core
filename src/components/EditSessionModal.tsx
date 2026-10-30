import React, { useState } from 'react';
import {
  WorkoutSession,
  WorkoutExercise,
  ExerciseSet,
  MuscleGroup,
  EXERCISE_CATALOG,
} from '../types/workout';
import { StorageService } from '../services/storage';
import {
  X,
  Plus,
  Trash2,
  Check,
  Calendar,
  Clock,
  Dumbbell,
  ArrowUp,
  ArrowDown,
  BookOpen,
} from 'lucide-react';

interface EditSessionModalProps {
  session: WorkoutSession;
  onSave: (updatedSession: WorkoutSession) => void;
  onClose: () => void;
}

export const EditSessionModal: React.FC<EditSessionModalProps> = ({
  session,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(session.date);
  const [durationMinutes, setDurationMinutes] = useState(session.durationMinutes || 60);
  const [notes, setNotes] = useState(session.notes || '');
  const [exercises, setExercises] = useState<WorkoutExercise[]>(
    session.exercises ? JSON.parse(JSON.stringify(session.exercises)) : []
  );

  const [showAddPicker, setShowAddPicker] = useState(false);
  const [search, setSearch] = useState('');

  const handleAddSet = (exIdx: number) => {
    const next = [...exercises];
    const curSets = next[exIdx].sets || [];
    const lastSet = curSets[curSets.length - 1];
    const newSet: ExerciseSet = {
      setNumber: curSets.length + 1,
      weightKg: lastSet ? lastSet.weightKg : (next[exIdx].isBodyweight ? 0 : 50),
      reps: lastSet ? lastSet.reps : 10,
      completed: true,
    };
    curSets.push(newSet);
    next[exIdx].sets = curSets;
    setExercises(next);
  };

  const handleDeleteSet = (exIdx: number, setIdx: number) => {
    const next = [...exercises];
    next[exIdx].sets.splice(setIdx, 1);
    next[exIdx].sets.forEach((s, i) => {
      s.setNumber = i + 1;
    });
    setExercises(next);
  };

  const handleSetChange = (
    exIdx: number,
    setIdx: number,
    field: 'weightKg' | 'reps' | 'completed' | 'note',
    val: any
  ) => {
    const next = [...exercises];
    const setObj = next[exIdx].sets[setIdx];
    if (field === 'weightKg') {
      setObj.weightKg = parseFloat(val) || 0;
    } else if (field === 'reps') {
      setObj.reps = parseInt(val, 10) || 0;
    } else if (field === 'completed') {
      setObj.completed = Boolean(val);
    } else if (field === 'note') {
      setObj.note = val;
    }
    setExercises(next);
  };

  const handleMoveExercise = (exIdx: number, dir: 'up' | 'down') => {
    const next = [...exercises];
    const targetIdx = dir === 'up' ? exIdx - 1 : exIdx + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[exIdx];
    next[exIdx] = next[targetIdx];
    next[targetIdx] = temp;
    setExercises(next);
  };

  const handleDeleteExercise = (exIdx: number) => {
    if (confirm(`Удалить упражнение «${exercises[exIdx].name}»?`)) {
      setExercises(exercises.filter((_, i) => i !== exIdx));
    }
  };

  const handleAddExerciseFromCatalog = (catalogItem: typeof EXERCISE_CATALOG[0]) => {
    const newEx: WorkoutExercise = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      exerciseId: catalogItem.id,
      name: catalogItem.name,
      targetMuscle: catalogItem.primaryMuscle,
      secondaryMuscles: catalogItem.secondaryMuscles,
      isBodyweight: catalogItem.isBodyweight,
      restSeconds: catalogItem.defaultRestSeconds,
      sets: Array.from({ length: catalogItem.defaultSets }).map((_, i) => ({
        setNumber: i + 1,
        weightKg: catalogItem.defaultWeight,
        reps: catalogItem.defaultReps,
        completed: true,
      })),
    };
    setExercises([...exercises, newEx]);
    setShowAddPicker(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Введите название тренировки');
      return;
    }

    // Recalculate metrics
    let totalVolume = 0;
    let completedSetsCount = 0;
    let totalRepsCount = 0;

    exercises.forEach((ex) => {
      ex.sets.forEach((set) => {
        if (set.completed) {
          completedSetsCount++;
          totalRepsCount += set.reps;
          totalVolume += (ex.isBodyweight ? 75 : set.weightKg) * set.reps;
        }
      });
    });

    const updated: WorkoutSession = {
      ...session,
      name: name.trim(),
      date,
      durationMinutes: Number(durationMinutes) || 45,
      notes: notes.trim(),
      exercises,
      totalVolumeKg: Math.round(totalVolume),
      completedSets: completedSetsCount,
      totalReps: totalRepsCount,
      status: 'completed',
    };

    onSave(updated);
  };

  const filteredCatalog = EXERCISE_CATALOG.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
      <div className="w-full max-w-md bg-[#101719] border border-[#252D2F] rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#252D2F] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
              Редактирование записи
            </span>
            <h2 className="text-base font-bold text-[#E8E9E7] truncate max-w-[280px]">
              {name || 'Тренировка'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#92999A] hover:text-[#E8E9E7] transition-colors rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Workout Name */}
          <div>
            <label className="block text-xs font-semibold text-[#92999A] mb-1">
              Название тренировки
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              required
            />
          </div>

          {/* Date & Duration Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#92999A] mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#58C995]" />
                <span>Дата</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#92999A] mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#58C995]" />
                <span>Длительность (мин)</span>
              </label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                min={1}
                className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>
          </div>

          {/* Exercises Header */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-[#92999A] uppercase tracking-wider">
              Упражнения ({exercises.length})
            </span>
            <button
              type="button"
              onClick={() => setShowAddPicker(true)}
              className="py-1 px-2.5 bg-[#14231b] border border-[#2f553f] hover:border-[#58C995] text-[#58C995] font-bold text-xs rounded-lg flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить</span>
            </button>
          </div>

          {/* Exercise list */}
          <div className="space-y-3">
            {exercises.map((ex, exIdx) => (
              <div
                key={ex.id || exIdx}
                className="bg-[#080D0E] border border-[#202729] rounded-xl p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#101719] border border-[#252D2F] text-[10px] text-[#92999A] flex items-center justify-center font-bold">
                      {exIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={ex.name}
                      onChange={(e) => {
                        const next = [...exercises];
                        next[exIdx].name = e.target.value;
                        setExercises(next);
                      }}
                      className="bg-transparent font-bold text-xs text-[#E8E9E7] focus:outline-none focus:border-b border-[#58C995]"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={exIdx === 0}
                      onClick={() => handleMoveExercise(exIdx, 'up')}
                      className="p-1 text-[#92999A] hover:text-[#E8E9E7] disabled:opacity-30"
                      title="Поднять выше"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={exIdx === exercises.length - 1}
                      onClick={() => handleMoveExercise(exIdx, 'down')}
                      className="p-1 text-[#92999A] hover:text-[#E8E9E7] disabled:opacity-30"
                      title="Опустить ниже"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExercise(exIdx)}
                      className="p-1 text-[#92999A] hover:text-[#C83232] transition-colors"
                      title="Удалить упражнение"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sets table */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-1.5 text-[10px] text-[#92999A] font-semibold px-1 text-center">
                    <span className="col-span-2">Сет</span>
                    <span className="col-span-4">Вес (кг)</span>
                    <span className="col-span-3">Повт</span>
                    <span className="col-span-2">Факт</span>
                    <span className="col-span-1"></span>
                  </div>

                  {ex.sets.map((set, setIdx) => (
                    <div
                      key={setIdx}
                      className="grid grid-cols-12 gap-1.5 items-center bg-[#101719] p-1.5 rounded-lg border border-[#1e2628]"
                    >
                      <span className="col-span-2 text-center text-xs font-bold text-[#92999A]">
                        {set.setNumber}
                      </span>

                      <div className="col-span-4">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          value={set.weightKg}
                          onChange={(e) =>
                            handleSetChange(exIdx, setIdx, 'weightKg', e.target.value)
                          }
                          disabled={ex.isBodyweight}
                          className="w-full bg-[#080D0E] border border-[#252D2F] rounded px-1.5 py-1 text-xs text-center text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
                          placeholder={ex.isBodyweight ? 'Свой' : 'кг'}
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min={0}
                          value={set.reps}
                          onChange={(e) =>
                            handleSetChange(exIdx, setIdx, 'reps', e.target.value)
                          }
                          className="w-full bg-[#080D0E] border border-[#252D2F] rounded px-1.5 py-1 text-xs text-center text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
                        />
                      </div>

                      <div className="col-span-2 flex justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleSetChange(exIdx, setIdx, 'completed', !set.completed)
                          }
                          className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${
                            set.completed
                              ? 'bg-[#58C995] border-[#58C995] text-black font-bold'
                              : 'bg-[#080D0E] border-[#252D2F] text-[#92999A]'
                          }`}
                        >
                          {set.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      </div>

                      <div className="col-span-1 flex justify-center">
                        {ex.sets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSet(exIdx, setIdx)}
                            className="text-[#92999A] hover:text-[#C83232]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add set button */}
                <button
                  type="button"
                  onClick={() => handleAddSet(exIdx)}
                  className="w-full py-1 text-[11px] font-semibold text-[#58C995] hover:bg-[#14231b] rounded-lg border border-dashed border-[#2f553f] transition-colors"
                >
                  + Добавить подход
                </button>
              </div>
            ))}
          </div>

          {/* Overall Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#92999A] mb-1">
              Заметки к тренировке
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Как прошла тренировка, самочувствие, нюансы..."
              rows={2}
              className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl p-2.5 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995] resize-none"
            />
          </div>
        </div>

        {/* Footer CTAs */}
        <div className="p-3 border-t border-[#252D2F] flex gap-2 bg-[#101719]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#080D0E] border border-[#252D2F] hover:border-[#384346] text-[#92999A] font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 bg-[#58C995] hover:bg-[#68d7a4] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Сохранить</span>
          </button>
        </div>

        {/* Add Exercise Modal */}
        {showAddPicker && (
          <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
            <div className="w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-3 shadow-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-[#252D2F]">
                <h3 className="text-sm font-bold text-[#E8E9E7]">Добавить упражнение</h3>
                <button
                  onClick={() => setShowAddPicker(false)}
                  className="text-[#92999A] hover:text-[#E8E9E7]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <input
                type="text"
                placeholder="Поиск по названию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#080D0E] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {filteredCatalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddExerciseFromCatalog(item)}
                    className="w-full text-left p-2.5 bg-[#080D0E] hover:bg-[#14231b] border border-[#202729] hover:border-[#58C995] rounded-xl flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="text-xs font-semibold text-[#E8E9E7] block">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-[#92999A]">
                        {item.isBodyweight ? 'Свой вес' : `${item.defaultWeight} кг`} • {item.defaultSets} × {item.defaultReps}
                      </span>
                    </div>
                    <Plus className="w-4 h-4 text-[#58C995]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
