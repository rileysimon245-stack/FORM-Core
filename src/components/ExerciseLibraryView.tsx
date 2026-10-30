import React, { useState } from 'react';
import {
  ExerciseLibraryItem,
  EXERCISE_CATALOG,
  MuscleGroup,
  EquipmentCategory,
  MUSCLE_DEFINITIONS,
} from '../types/workout';
import { StorageService } from '../services/storage';
import {
  Search,
  Star,
  ChevronRight,
  Filter,
  Check,
  Dumbbell,
  BookOpen,
  ArrowRightLeft,
  X,
} from 'lucide-react';

interface ExerciseLibraryViewProps {
  onSelectExercise?: (exercise: ExerciseLibraryItem) => void;
  selectionMode?: boolean;
  filterTargetMuscle?: MuscleGroup;
  filterRequiredEquipment?: EquipmentCategory;
  onClose?: () => void;
}

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({
  onSelectExercise,
  selectionMode = false,
  filterTargetMuscle,
  filterRequiredEquipment,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>(
    filterTargetMuscle || 'all'
  );
  const [selectedEquipment, setSelectedEquipment] = useState<string>(
    filterRequiredEquipment || 'all'
  );
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyHomeFriendly, setOnlyHomeFriendly] = useState(false);

  const [favorites, setFavorites] = useState<string[]>(
    StorageService.getFavoriteExerciseIds()
  );

  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const isFav = StorageService.toggleFavoriteExercise(id);
    setFavorites(StorageService.getFavoriteExerciseIds());
  };

  const filteredExercises = EXERCISE_CATALOG.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.technique.toLowerCase().includes(search.toLowerCase());

    const matchMuscle =
      selectedMuscle === 'all' ||
      item.primaryMuscle === selectedMuscle ||
      item.secondaryMuscles?.includes(selectedMuscle as MuscleGroup);

    const matchEquipment =
      selectedEquipment === 'all' || item.requiredEquipment === selectedEquipment;

    const matchFavorites = !onlyFavorites || favorites.includes(item.id);
    const matchHome = !onlyHomeFriendly || item.homeFriendly;

    return matchSearch && matchMuscle && matchEquipment && matchFavorites && matchHome;
  });

  return (
    <div className="w-full flex flex-col space-y-3 pb-24">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#E8E9E7]">
            {selectionMode ? 'Выбор упражнения' : 'Библиотека упражнений'}
          </h1>
          <span className="text-[11px] text-[#92999A]">
            {filteredExercises.length} упражнений с техникой и альтернативами
          </span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] bg-[#171D1F] border border-[#252D2F] rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#697174] absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Поиск по названию или технике..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#101719] border border-[#252D2F] rounded-xl pl-9 pr-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
        />
      </div>

      {/* Quick Filter Pills */}
      <div className="space-y-2">
        {/* Muscle group row */}
        <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedMuscle('all')}
            className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap border transition-all ${
              selectedMuscle === 'all'
                ? 'border-[#58C995] bg-[#315D4B]/40 text-[#58C995]'
                : 'border-[#252D2F] bg-[#171D1F] text-[#92999A]'
            }`}
          >
            Все мышцы
          </button>
          {(Object.keys(MUSCLE_DEFINITIONS) as MuscleGroup[]).map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMuscle(m)}
              className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap border transition-all ${
                selectedMuscle === m
                  ? 'border-[#58C995] bg-[#315D4B]/40 text-[#58C995]'
                  : 'border-[#252D2F] bg-[#171D1F] text-[#92999A]'
              }`}
            >
              {MUSCLE_DEFINITIONS[m].nameRu}
            </button>
          ))}
        </div>

        {/* Toggles row (Favorites & Home) */}
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`px-3 py-1 rounded-lg border flex items-center gap-1.5 transition-all ${
              onlyFavorites
                ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995]'
                : 'border-[#252D2F] bg-[#171D1F] text-[#92999A]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-[#58C995]' : ''}`} />
            <span>Избранное ({favorites.length})</span>
          </button>

          <button
            onClick={() => setOnlyHomeFriendly(!onlyHomeFriendly)}
            className={`px-3 py-1 rounded-lg border transition-all ${
              onlyHomeFriendly
                ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995]'
                : 'border-[#252D2F] bg-[#171D1F] text-[#92999A]'
            }`}
          >
            Для дома
          </button>
        </div>
      </div>

      {/* Exercises Cards Feed */}
      <div className="space-y-2.5 pt-1">
        {filteredExercises.length === 0 ? (
          <div className="p-8 text-center bg-[#101719] rounded-2xl border border-[#252D2F] text-[#92999A] text-xs">
            Упражнений не найдено. Попробуйте сбросить фильтры поиска.
          </div>
        ) : (
          filteredExercises.map((item) => {
            const isFav = favorites.includes(item.id);
            const isExpanded = expandedExerciseId === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setExpandedExerciseId(isExpanded ? null : item.id)}
                className={`bg-[#101719] border rounded-2xl p-3.5 transition-all cursor-pointer ${
                  isExpanded ? 'border-[#58C995]' : 'border-[#252D2F] hover:border-[#3a4447]'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] text-[#58C995] bg-[#315D4B]/40 px-2 py-0.5 rounded-md font-semibold">
                        {MUSCLE_DEFINITIONS[item.primaryMuscle]?.nameRu}
                      </span>
                      <span className="text-[10px] text-[#92999A] bg-[#171D1F] px-1.5 py-0.5 rounded-md">
                        {item.difficulty}
                      </span>
                      {item.homeFriendly && (
                        <span className="text-[10px] text-[#83CBA5] bg-[#171D1F] px-1.5 py-0.5 rounded-md">
                          Дома
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#E8E9E7]">{item.name}</h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, item.id)}
                      className="p-1.5 text-[#92999A] hover:text-[#58C995]"
                      title="В избранное"
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-[#58C995] text-[#58C995]' : ''}`} />
                    </button>

                    {selectionMode && onSelectExercise && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectExercise(item);
                        }}
                        className="px-3 py-1 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl"
                      >
                        Выбрать
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details: Technique, Muscles, Alternatives */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#252D2F] space-y-2.5 text-xs">
                    {/* Technique */}
                    <div>
                      <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-1">
                        Техника выполнения
                      </span>
                      <p className="text-[#E8E9E7] text-[11px] leading-relaxed bg-[#171D1F] p-2.5 rounded-xl border border-[#252D2F]">
                        {item.technique}
                      </p>
                    </div>

                    {/* Secondary muscles */}
                    {item.secondaryMuscles && item.secondaryMuscles.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#92999A]">
                        <span>Вторичные мышцы:</span>
                        <span className="text-[#E8E9E7]">
                          {item.secondaryMuscles.map((m) => MUSCLE_DEFINITIONS[m]?.nameRu).join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Alternatives */}
                    {item.alternatives && item.alternatives.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-1">
                          Варианты замены
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.alternatives.map((alt) => (
                            <span
                              key={alt}
                              className="px-2 py-0.5 bg-[#171D1F] text-[#83CBA5] rounded-md text-[11px] border border-[#252D2F]"
                            >
                              {alt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selection button when inside picker modal */}
                    {selectionMode && onSelectExercise && (
                      <button
                        type="button"
                        onClick={() => onSelectExercise(item)}
                        className="w-full py-2 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl mt-2"
                      >
                        Использовать это упражнение
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
