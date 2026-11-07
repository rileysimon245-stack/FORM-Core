import React, { useState, useEffect, useMemo } from 'react';
import {
  ExerciseLibraryItem,
  MuscleGroup,
  EquipmentCategory,
  MUSCLE_DEFINITIONS,
} from '../types/workout';
import {
  FullExerciseItem,
  ExerciseCategoryKey,
  ExerciseLocation,
  ExerciseMovementType,
  EXERCISE_CATEGORIES_CONFIG,
  EQUIPMENT_OPTIONS_CONFIG,
} from '../data/exerciseTypes';
import { StorageService } from '../services/storage';
import {
  Search,
  Star,
  ChevronDown,
  ChevronUp,
  Filter,
  Check,
  Dumbbell,
  BookOpen,
  ArrowRightLeft,
  X,
  Plus,
  Trash2,
  Edit3,
  Home,
  Building2,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { ExerciseProgressModal } from './ExerciseProgressModal';

interface ExerciseLibraryViewProps {
  onSelectExercise?: (exercise: FullExerciseItem | ExerciseLibraryItem) => void;
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
  // State for all exercises (181 built-in + user-created custom)
  const [allExercises, setAllExercises] = useState<FullExerciseItem[]>(() =>
    StorageService.getAllExercises()
  );

  // Search input: matches both Russian & English names, plus subcategory & technique
  const [search, setSearch] = useState('');

  // Primary muscle category filter ('all' | ExerciseCategoryKey)
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Subcategory filter ('all' | specific subcategory string)
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');

  // Location filter: 'all' | 'home' | 'gym' | 'both'
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  // Equipment filter: 'all' | string
  const [selectedEquipment, setSelectedEquipment] = useState<string>(
    filterRequiredEquipment || 'all'
  );

  // Movement type filter: 'all' | ExerciseMovementType
  const [selectedMovementType, setSelectedMovementType] = useState<string>('all');

  // Favorites filter toggle
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Favorites state synced with StorageService
  const [favorites, setFavorites] = useState<string[]>(() =>
    StorageService.getFavoriteExerciseIds()
  );

  // Expanded card ID for viewing full details / technique / alternatives
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Custom exercise modal state (create / edit)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingCustomExercise, setEditingCustomExercise] = useState<FullExerciseItem | null>(null);

  // Delete confirmation modal state
  const [exerciseToDelete, setExerciseToDelete] = useState<FullExerciseItem | null>(null);

  // Selected exercise for viewing progress chart modal
  const [selectedProgressExercise, setSelectedProgressExercise] = useState<FullExerciseItem | null>(null);

  // Show secondary filters bar toggle
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Listen to StorageService updates
  useEffect(() => {
    const unsub = StorageService.subscribe(() => {
      setFavorites(StorageService.getFavoriteExerciseIds());
      setAllExercises(StorageService.getAllExercises());
    });
    return () => unsub();
  }, []);

  // When initial filterTargetMuscle is provided, map to category if possible
  useEffect(() => {
    if (filterTargetMuscle) {
      const match = EXERCISE_CATEGORIES_CONFIG.find(
        (c) => c.primaryMuscle === filterTargetMuscle
      );
      if (match) {
        setSelectedCategory(match.key);
      }
    }
  }, [filterTargetMuscle]);

  // Handle favorite toggle
  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    StorageService.toggleFavoriteExercise(id);
    setFavorites(StorageService.getFavoriteExerciseIds());
  };

  // Derive unique subcategories for the currently selected category
  const availableSubCategories = useMemo(() => {
    const pool = selectedCategory === 'all'
      ? allExercises
      : allExercises.filter((e) => e.categoryKey === selectedCategory);
    
    const set = new Set<string>();
    pool.forEach((e) => {
      if (e.subCategory) {
        set.add(e.subCategory);
      }
    });
    return Array.from(set);
  }, [allExercises, selectedCategory]);

  // Reset subcategory when category changes
  const handleCategorySelect = (catKey: string) => {
    setSelectedCategory(catKey);
    setSelectedSubCategory('all');
  };

  // Multi-field search and filter logic
  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allExercises.filter((item) => {
      // 1. Search text across Russian name, English name, technique, subcategory
      if (q) {
        const matchNameRu = item.name.toLowerCase().includes(q);
        const matchNameEn = item.nameEn?.toLowerCase().includes(q);
        const matchTechnique = item.technique?.toLowerCase().includes(q);
        const matchSub = item.subCategory?.toLowerCase().includes(q);
        const matchCat = item.categoryNameRu?.toLowerCase().includes(q);
        if (!matchNameRu && !matchNameEn && !matchTechnique && !matchSub && !matchCat) {
          return false;
        }
      }

      // 2. Favorites only filter
      if (onlyFavorites && !favorites.includes(item.id)) {
        return false;
      }

      // 3. Category filter
      if (selectedCategory !== 'all') {
        if (item.categoryKey !== selectedCategory) {
          return false;
        }
      }

      // 4. Subcategory filter
      if (selectedSubCategory !== 'all') {
        if (item.subCategory !== selectedSubCategory) {
          return false;
        }
      }

      // 5. Location filter (home, gym, both)
      if (selectedLocation !== 'all') {
        if (selectedLocation === 'home') {
          if (item.location !== 'home' && item.location !== 'both' && !item.homeFriendly) {
            return false;
          }
        } else if (selectedLocation === 'gym') {
          if (item.location !== 'gym' && item.location !== 'both') {
            return false;
          }
        }
      }

      // 6. Equipment filter
      if (selectedEquipment !== 'all') {
        const eqMatch =
          item.requiredEquipment === selectedEquipment ||
          (selectedEquipment === 'bodyweight' && item.isBodyweight) ||
          (selectedEquipment === 'dumbbells' && (item.requiredEquipment === 'dumbbells_adjustable' || item.requiredEquipment === 'dumbbells_fixed')) ||
          (selectedEquipment === 'barbell' && item.requiredEquipment === 'barbell');
        if (!eqMatch) {
          return false;
        }
      }

      // 7. Movement type filter
      if (selectedMovementType !== 'all') {
        if (item.type !== selectedMovementType) {
          return false;
        }
      }

      return true;
    });
  }, [
    allExercises,
    search,
    onlyFavorites,
    favorites,
    selectedCategory,
    selectedSubCategory,
    selectedLocation,
    selectedEquipment,
    selectedMovementType,
  ]);

  // Quick reset for all filters
  const hasActiveFilters =
    search !== '' ||
    selectedCategory !== 'all' ||
    selectedSubCategory !== 'all' ||
    selectedLocation !== 'all' ||
    selectedEquipment !== 'all' ||
    selectedMovementType !== 'all' ||
    onlyFavorites;

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setSelectedSubCategory('all');
    setSelectedLocation('all');
    setSelectedEquipment('all');
    setSelectedMovementType('all');
    setOnlyFavorites(false);
  };

  // Custom Exercise Creation & Save
  const handleOpenCreateModal = () => {
    setEditingCustomExercise(null);
    setShowCustomModal(true);
  };

  const handleOpenEditModal = (e: React.MouseEvent, exercise: FullExerciseItem) => {
    e.stopPropagation();
    setEditingCustomExercise(exercise);
    setShowCustomModal(true);
  };

  const handleDeleteCustomExercise = (e: React.MouseEvent, exercise: FullExerciseItem) => {
    e.stopPropagation();
    setExerciseToDelete(exercise);
  };

  const confirmDeleteExercise = () => {
    if (exerciseToDelete) {
      StorageService.deleteCustomExercise(exerciseToDelete.id);
      setAllExercises(StorageService.getAllExercises());
      setExerciseToDelete(null);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-3 pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1 px-0.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#E8E9E7]">
              {selectionMode ? 'Выбор упражнения' : 'База упражнений'}
            </h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#171D1F] border border-[#252D2F] text-[#58C995]">
              {allExercises.length}
            </span>
          </div>
          <p className="text-[11px] text-[#92999A] mt-0.5">
            Полноценная база FORM Core: анатомия, техника, инвентарь и альтернативы
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Custom Exercise Button */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171D1F] hover:bg-[#202729] border border-[#252D2F] hover:border-[#58C995]/50 text-[#E8E9E7] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm"
            title="Создать собственное упражнение"
          >
            <Plus className="w-3.5 h-3.5 text-[#58C995]" />
            <span className="hidden sm:inline">Своё упражнение</span>
            <span className="sm:hidden">Создать</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-[#92999A] hover:text-[#E8E9E7] bg-[#171D1F] border border-[#252D2F] rounded-xl cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#697174] absolute left-3 top-3 pointer-events-none" />
        <input
          type="text"
          placeholder="Поиск по названию (рус/англ), мышце или технике..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#101719] border border-[#252D2F] rounded-xl pl-9 pr-9 py-2.5 text-xs text-[#E8E9E7] placeholder-[#697174] focus:outline-none focus:border-[#58C995] transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 p-0.5 text-[#92999A] hover:text-[#E8E9E7]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Row 1: Muscle Categories Tabs (Scrollable) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => handleCategorySelect('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
              selectedCategory === 'all'
                ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995] shadow-xs'
                : 'border-[#252D2F] bg-[#101719] text-[#92999A] hover:text-[#E8E9E7]'
            }`}
          >
            Все мышцы
          </button>

          {EXERCISE_CATEGORIES_CONFIG.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => handleCategorySelect(cat.key)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995] shadow-xs'
                    : 'border-[#252D2F] bg-[#101719] text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                {cat.nameRu}
              </button>
            );
          })}
        </div>

        {/* Filter Row 2: Subcategories (when category is selected or has subcategories) */}
        {availableSubCategories.length > 0 && selectedCategory !== 'all' && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px] animate-in fade-in">
            <span className="text-[10px] uppercase font-bold text-[#697174] tracking-wider shrink-0 mr-1">
              Фокус:
            </span>
            <button
              onClick={() => setSelectedSubCategory('all')}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                selectedSubCategory === 'all'
                  ? 'border-[#58C995]/60 bg-[#58C995]/15 text-[#58C995] font-semibold'
                  : 'border-[#1E282A] bg-[#131A1C] text-[#858E90] hover:text-[#E8E9E7]'
              }`}
            >
              Все зоны
            </button>
            {availableSubCategories.map((sub) => {
              const isSubSelected = selectedSubCategory === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setSelectedSubCategory(sub)}
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                    isSubSelected
                      ? 'border-[#58C995]/60 bg-[#58C995]/15 text-[#58C995] font-semibold'
                      : 'border-[#1E282A] bg-[#131A1C] text-[#858E90] hover:text-[#E8E9E7]'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        )}

        {/* Filter Row 3: Quick Filter Badges (Favorites, Location, Advanced Filters Toggle) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Favorites Filter */}
            <button
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                onlyFavorites
                  ? 'border-[#58C995] bg-[#14231b] text-[#58C995] font-semibold'
                  : 'border-[#252D2F] bg-[#101719] text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  onlyFavorites ? 'fill-[#58C995] text-[#58C995]' : ''
                }`}
              />
              <span>Избранное</span>
              {favorites.length > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    onlyFavorites ? 'bg-[#58C995] text-black' : 'bg-[#1E282A] text-[#58C995]'
                  }`}
                >
                  {favorites.length}
                </span>
              )}
            </button>

            {/* Location Selector (Все / Дом / Зал) */}
            <div className="inline-flex rounded-xl border border-[#252D2F] bg-[#101719] p-0.5">
              <button
                onClick={() => setSelectedLocation('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  selectedLocation === 'all'
                    ? 'bg-[#1E282A] text-[#E8E9E7]'
                    : 'text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                Все места
              </button>
              <button
                onClick={() => setSelectedLocation('home')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  selectedLocation === 'home'
                    ? 'bg-[#315D4B]/40 text-[#58C995]'
                    : 'text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                <Home className="w-3 h-3" />
                <span>Дом</span>
              </button>
              <button
                onClick={() => setSelectedLocation('gym')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  selectedLocation === 'gym'
                    ? 'bg-[#315D4B]/40 text-[#58C995]'
                    : 'text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                <Building2 className="w-3 h-3" />
                <span>Зал</span>
              </button>
            </div>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                showAdvancedFilters || selectedEquipment !== 'all' || selectedMovementType !== 'all'
                  ? 'border-[#58C995]/60 bg-[#14231b] text-[#58C995]'
                  : 'border-[#252D2F] bg-[#101719] text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="text-[11px]">Инвентарь & Тип</span>
              {(selectedEquipment !== 'all' || selectedMovementType !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#58C995]" />
              )}
            </button>
          </div>

          {/* Reset Filters if any active */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] text-[#92999A] hover:text-[#58C995] underline cursor-pointer"
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        {/* Advanced Filters Expandable Drawer */}
        {showAdvancedFilters && (
          <div className="bg-[#101719] border border-[#252D2F] rounded-2xl p-3 space-y-3 animate-in fade-in">
            {/* Equipment Filter */}
            <div>
              <label className="text-[10px] uppercase font-bold text-[#92999A] tracking-wider block mb-1.5">
                Оборудование / Инвентарь
              </label>
              <div className="flex flex-wrap gap-1">
                {EQUIPMENT_OPTIONS_CONFIG.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedEquipment(opt.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all cursor-pointer ${
                      selectedEquipment === opt.key
                        ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995] font-semibold'
                        : 'border-[#252D2F] bg-[#171D1F] text-[#92999A] hover:text-[#E8E9E7]'
                    }`}
                  >
                    {opt.labelRu}
                  </button>
                ))}
              </div>
            </div>

            {/* Movement Type Filter */}
            <div>
              <label className="text-[10px] uppercase font-bold text-[#92999A] tracking-wider block mb-1.5">
                Тип движения
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  { key: 'all', label: 'Все типы' },
                  { key: 'Силовое', label: 'Силовое' },
                  { key: 'Базовое (многосуставное)', label: 'Базовое' },
                  { key: 'Изоляционное', label: 'Изоляционное' },
                  { key: 'С собственным весом', label: 'С весом тела' },
                  { key: 'Функциональное', label: 'Функциональное' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedMovementType(t.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all cursor-pointer ${
                      selectedMovementType === t.key
                        ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995] font-semibold'
                        : 'border-[#252D2F] bg-[#171D1F] text-[#92999A] hover:text-[#E8E9E7]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Result Counter & Active Filters Summary */}
      <div className="flex items-center justify-between px-1 text-[11px] text-[#92999A] pt-0.5">
        <span>
          Найдено: <strong className="text-[#E8E9E7]">{filteredExercises.length}</strong> упражнений
        </span>
        {hasActiveFilters && (
          <span className="text-[#58C995]">Фильтры активны</span>
        )}
      </div>

      {/* Exercise Cards Feed */}
      <div className="space-y-2.5 pt-0.5">
        {filteredExercises.length === 0 ? (
          <div className="p-8 text-center bg-[#101719] rounded-2xl border border-[#252D2F] space-y-2">
            <p className="text-xs text-[#92999A]">
              По заданным параметрам ничего не найдено.
            </p>
            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 bg-[#171D1F] border border-[#252D2F] hover:border-[#58C995] text-[#58C995] text-xs font-semibold rounded-xl cursor-pointer transition-colors"
            >
              Сбросить все фильтры
            </button>
          </div>
        ) : (
          filteredExercises.map((item) => {
            const isFav = favorites.includes(item.id);
            const isExpanded = expandedId === item.id;
            const primaryMuscleRu = MUSCLE_DEFINITIONS[item.primaryMuscle]?.nameRu || item.primaryMuscle;

            return (
              <div
                key={item.id}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className={`bg-[#101719] border rounded-2xl p-3.5 transition-all cursor-pointer ${
                  isExpanded
                    ? 'border-[#58C995] shadow-lg shadow-[#58C995]/5'
                    : 'border-[#252D2F] hover:border-[#3a4447]'
                }`}
              >
                {/* Header Row: Badges, Titles, Actions */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Badges line */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      {/* Muscle category */}
                      <span className="text-[10px] text-[#58C995] bg-[#315D4B]/30 border border-[#58C995]/30 px-2 py-0.5 rounded-md font-semibold">
                        {item.categoryNameRu || primaryMuscleRu}
                      </span>

                      {/* Subcategory */}
                      {item.subCategory && (
                        <span className="text-[10px] text-[#92999A] bg-[#171D1F] border border-[#252D2F] px-1.5 py-0.5 rounded-md">
                          {item.subCategory}
                        </span>
                      )}

                      {/* Location Badge */}
                      <span className="text-[10px] text-[#92999A] bg-[#171D1F] border border-[#252D2F] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        {item.location === 'home' ? (
                          <>
                            <Home className="w-2.5 h-2.5 text-[#58C995]" />
                            <span>Дом</span>
                          </>
                        ) : item.location === 'gym' ? (
                          <>
                            <Building2 className="w-2.5 h-2.5 text-[#858E90]" />
                            <span>Зал</span>
                          </>
                        ) : (
                          <>
                            <Home className="w-2.5 h-2.5 text-[#58C995]" />
                            <span>Дом/Зал</span>
                          </>
                        )}
                      </span>

                      {/* Type badge */}
                      <span className="text-[10px] text-[#858E90] bg-[#171D1F] border border-[#252D2F] px-1.5 py-0.5 rounded-md">
                        {item.type}
                      </span>

                      {/* Custom badge */}
                      {item.isCustom && (
                        <span className="text-[10px] text-[#FFB347] bg-[#FFB347]/10 border border-[#FFB347]/30 px-1.5 py-0.5 rounded-md font-semibold">
                          Своё
                        </span>
                      )}
                    </div>

                    {/* Exercise Names: Russian (Main) & English (Sub) */}
                    <h3 className="text-sm font-bold text-[#E8E9E7] leading-snug break-words">
                      {item.name}
                    </h3>
                    {item.nameEn && (
                      <p className="text-[11px] text-[#788285] font-medium tracking-tight">
                        {item.nameEn}
                      </p>
                    )}

                    {/* Compact Equipment & Defaults Line */}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#92999A]">
                      <span className="flex items-center gap-1 text-[#ACB4B6]">
                        <Dumbbell className="w-3 h-3 text-[#58C995]" />
                        <span>{item.equipmentNameRu}</span>
                      </span>
                      <span>·</span>
                      <span>
                        {item.defaultSets} × {item.defaultReps} повт
                      </span>
                    </div>
                  </div>

                  {/* Actions column: Star, Edit/Delete if custom, Select button */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {/* Progress Chart Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedProgressExercise(item);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[#58C995] bg-[#14231b] hover:bg-[#1a3025] rounded-lg border border-[#2f553f] hover:border-[#58C995] transition-all text-xs font-semibold cursor-pointer shadow-xs active:scale-95"
                        title="Посмотреть график прогресса"
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-[#58C995]" />
                        <span>Прогресс</span>
                      </button>

                      {/* Custom Exercise Actions */}
                      {item.isCustom && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditModal(e, item)}
                            className="p-1.5 text-[#92999A] hover:text-[#58C995] rounded-lg hover:bg-[#171D1F]"
                            title="Редактировать"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomExercise(e, item)}
                            className="p-1.5 text-[#92999A] hover:text-red-400 rounded-lg hover:bg-[#171D1F]"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(e, item.id)}
                        className="p-1.5 text-[#92999A] hover:text-[#58C995] rounded-lg hover:bg-[#171D1F]"
                        title={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFav ? 'fill-[#58C995] text-[#58C995]' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {/* Direct Select Button in Selection Mode */}
                    {selectionMode && onSelectExercise && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectExercise(item);
                        }}
                        className="px-3 py-1.5 bg-[#58C995] hover:bg-[#48b885] text-[#080D0E] font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
                      >
                        Выбрать
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details: Technique, Muscles, Alternatives, Difficulty */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#252D2F] space-y-3 text-xs animate-in fade-in">
                    {/* Technique */}
                    <div>
                      <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-1">
                        Техника выполнения
                      </span>
                      <p className="text-[#E8E9E7] text-[12px] leading-relaxed bg-[#171D1F] p-3 rounded-xl border border-[#252D2F]">
                        {item.technique}
                      </p>
                    </div>

                    {/* Muscles Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-[#171D1F] p-2.5 rounded-xl border border-[#252D2F]">
                        <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-1">
                          Основная мышца
                        </span>
                        <span className="text-xs font-semibold text-[#58C995]">
                          {primaryMuscleRu}
                        </span>
                      </div>

                      <div className="bg-[#171D1F] p-2.5 rounded-xl border border-[#252D2F]">
                        <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-1">
                          Вторичные мышцы
                        </span>
                        <span className="text-xs text-[#E8E9E7]">
                          {item.secondaryMuscles && item.secondaryMuscles.length > 0
                            ? item.secondaryMuscles
                                .map((m) => MUSCLE_DEFINITIONS[m as MuscleGroup]?.nameRu || m)
                                .join(', ')
                            : 'Изолированное воздействие'}
                        </span>
                      </div>
                    </div>

                    {/* Alternatives */}
                    {item.alternatives && item.alternatives.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-[#92999A] uppercase tracking-wider block mb-1">
                          Варианты замены (альтернативы)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.alternatives.map((alt) => (
                            <span
                              key={alt}
                              className="px-2.5 py-1 bg-[#171D1F] text-[#83CBA5] rounded-lg text-[11px] border border-[#252D2F]"
                            >
                              {alt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata summary (Difficulty, Rest, Unique ID) */}
                    <div className="flex items-center justify-between text-[11px] text-[#92999A] pt-1 border-t border-[#252D2F]">
                      <span>Сложность: <strong className="text-[#E8E9E7]">{item.difficulty}</strong></span>
                      <span>Отдых: <strong className="text-[#E8E9E7]">{item.defaultRestSeconds} сек</strong></span>
                      <span className="text-[10px] font-mono text-[#697174]">ID: {item.id}</span>
                    </div>

                    {/* Button: Open Progress Chart Panel */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedProgressExercise(item);
                      }}
                      className="w-full py-2.5 bg-[#14231b] hover:bg-[#1e3c30] border border-[#2f553f] hover:border-[#58C995] text-[#58C995] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
                    >
                      <TrendingUp className="w-4 h-4 text-[#58C995]" />
                      <span>Открыть график прогресса и историю</span>
                    </button>

                    {/* Big Select Button inside expanded view for convenience */}
                    {selectionMode && onSelectExercise && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectExercise(item);
                        }}
                        className="w-full py-2.5 bg-[#58C995] hover:bg-[#48b885] text-[#080D0E] font-bold text-xs rounded-xl mt-2 cursor-pointer shadow-md transition-all"
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

      {/* MODAL: Create / Edit Custom Exercise */}
      {showCustomModal && (
        <CustomExerciseModal
          initialExercise={editingCustomExercise}
          onClose={() => {
            setShowCustomModal(false);
            setEditingCustomExercise(null);
          }}
          onSave={(exercise) => {
            StorageService.saveCustomExercise(exercise);
            setAllExercises(StorageService.getAllExercises());
            setShowCustomModal(false);
            setEditingCustomExercise(null);
          }}
        />
      )}

      {/* MODAL: Confirm Delete Custom Exercise */}
      {exerciseToDelete && (
        <div className="fixed inset-0 z-70 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#101719] border border-[#252D2F] rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#E8E9E7]">Удалить упражнение?</h3>
            <p className="text-xs text-[#92999A]">
              Вы уверены, что хотите удалить упражнение «<strong>{exerciseToDelete.name}</strong>»? Это действие нельзя отменить.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExerciseToDelete(null)}
                className="flex-1 py-2 bg-[#171D1F] border border-[#252D2F] text-[#92999A] hover:text-[#E8E9E7] text-xs font-semibold rounded-xl cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDeleteExercise}
                className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-xs font-bold rounded-xl cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Exercise Progress Chart */}
      {selectedProgressExercise && (
        <ExerciseProgressModal
          exercise={selectedProgressExercise}
          onClose={() => setSelectedProgressExercise(null)}
        />
      )}
    </div>
  );
};

// ==========================================
// SUBCOMPONENT: Custom Exercise Modal Form
// ==========================================
interface CustomExerciseModalProps {
  initialExercise?: FullExerciseItem | null;
  onClose: () => void;
  onSave: (exercise: FullExerciseItem) => void;
}

const CustomExerciseModal: React.FC<CustomExerciseModalProps> = ({
  initialExercise,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialExercise?.name || '');
  const [nameEn, setNameEn] = useState(initialExercise?.nameEn || '');
  const [categoryKey, setCategoryKey] = useState<ExerciseCategoryKey>(
    initialExercise?.categoryKey || 'chest'
  );
  const [subCategory, setSubCategory] = useState(initialExercise?.subCategory || '');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>(
    initialExercise?.primaryMuscle || 'chest'
  );
  const [equipmentNameRu, setEquipmentNameRu] = useState(
    initialExercise?.equipmentNameRu || 'Гантели'
  );
  const [requiredEquipment, setRequiredEquipment] = useState<EquipmentCategory>(
    initialExercise?.requiredEquipment || 'dumbbells_adjustable'
  );
  const [location, setLocation] = useState<ExerciseLocation>(
    initialExercise?.location || 'both'
  );
  const [movementType, setMovementType] = useState<ExerciseMovementType>(
    initialExercise?.type || 'Силовое'
  );
  const [difficulty, setDifficulty] = useState<'Начинающий' | 'Средний' | 'Сложный'>(
    initialExercise?.difficulty || 'Средний'
  );
  const [technique, setTechnique] = useState(initialExercise?.technique || '');
  const [defaultSets, setDefaultSets] = useState(initialExercise?.defaultSets || 3);
  const [defaultReps, setDefaultReps] = useState(initialExercise?.defaultReps || 10);
  const [alternativesText, setAlternativesText] = useState(
    initialExercise?.alternatives?.join(', ') || ''
  );
  const [error, setError] = useState('');

  // When category changes, auto-update primaryMuscle defaults
  const handleCategoryChange = (key: ExerciseCategoryKey) => {
    setCategoryKey(key);
    const cat = EXERCISE_CATEGORIES_CONFIG.find((c) => c.key === key);
    if (cat) {
      setPrimaryMuscle(cat.primaryMuscle);
    }
  };

  const handleEquipmentChange = (optKey: string) => {
    const opt = EQUIPMENT_OPTIONS_CONFIG.find((o) => o.key === optKey);
    if (opt) {
      setEquipmentNameRu(opt.labelRu);
      setRequiredEquipment(opt.category);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Пожалуйста, введите название упражнения на русском.');
      return;
    }

    const catConfig = EXERCISE_CATEGORIES_CONFIG.find((c) => c.key === categoryKey);
    const catNameRu = catConfig?.nameRu || 'Другое';

    const alts = alternativesText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const isBodyweight =
      movementType === 'С собственным весом' ||
      requiredEquipment === 'bodyweight' ||
      equipmentNameRu.toLowerCase().includes('собственн') ||
      equipmentNameRu.toLowerCase().includes('без инвентаря');

    const exercise: FullExerciseItem = {
      id: initialExercise?.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      nameEn: nameEn.trim() || name.trim(),
      categoryKey,
      categoryNameRu: catNameRu,
      subCategory: subCategory.trim() || undefined,
      primaryMuscle,
      secondaryMuscles: [],
      isBodyweight,
      requiredEquipment,
      equipmentNameRu,
      location,
      type: movementType,
      difficulty,
      homeFriendly: location === 'home' || location === 'both',
      defaultSets: Number(defaultSets) || 3,
      defaultReps: Number(defaultReps) || 10,
      defaultWeight: 0,
      defaultRestSeconds: 75,
      technique:
        technique.trim() ||
        'Держите корпус стабилизированным, контролируйте темп движения и амплитуду.',
      alternatives: alts,
      isCustom: true,
    };

    onSave(exercise);
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-md bg-[#101719] border border-[#252D2F] rounded-2xl p-4 max-h-[90vh] flex flex-col my-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#252D2F]">
          <div>
            <h3 className="text-sm font-bold text-[#E8E9E7]">
              {initialExercise ? 'Редактировать упражнение' : 'Новое упражнение'}
            </h3>
            <span className="text-[11px] text-[#92999A]">
              Сохраняется в вашей персональной библиотеке
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#92999A] hover:text-[#E8E9E7] rounded-lg hover:bg-[#171D1F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Names */}
          <div className="space-y-2">
            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Название на русском *
              </label>
              <input
                type="text"
                placeholder="Например: Жим гантелей сидя"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#92999A] block mb-1">
                Название на английском (опционально)
              </label>
              <input
                type="text"
                placeholder="Например: Seated Dumbbell Press"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>
          </div>

          {/* Muscle Category & Subcategory */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Мышечная группа
              </label>
              <select
                value={categoryKey}
                onChange={(e) => handleCategoryChange(e.target.value as ExerciseCategoryKey)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              >
                {EXERCISE_CATEGORIES_CONFIG.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.nameRu}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Подкатегория / Фокус
              </label>
              <input
                type="text"
                placeholder="Верх, пик, ширина..."
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>
          </div>

          {/* Equipment & Location */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Оборудование
              </label>
              <select
                value={
                  EQUIPMENT_OPTIONS_CONFIG.find((o) => o.labelRu === equipmentNameRu)?.key ||
                  'dumbbells'
                }
                onChange={(e) => handleEquipmentChange(e.target.value)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              >
                {EQUIPMENT_OPTIONS_CONFIG.filter((o) => o.key !== 'all').map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.labelRu}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Место выполнения
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as ExerciseLocation)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              >
                <option value="both">Дом и Зал</option>
                <option value="home">Только дома</option>
                <option value="gym">Только в зале</option>
              </select>
            </div>
          </div>

          {/* Movement Type & Difficulty */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Тип упражнения
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as ExerciseMovementType)}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              >
                <option value="Силовое">Силовое</option>
                <option value="Базовое (многосуставное)">Базовое</option>
                <option value="Изоляционное">Изоляционное</option>
                <option value="С собственным весом">С собственным весом</option>
                <option value="Функциональное">Функциональное</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Сложность
              </label>
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as 'Начинающий' | 'Средний' | 'Сложный')
                }
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-2.5 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              >
                <option value="Начинающий">Начинающий</option>
                <option value="Средний">Средний</option>
                <option value="Сложный">Сложный</option>
              </select>
            </div>
          </div>

          {/* Default sets & reps */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Подходы по умолч.
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={defaultSets}
                onChange={(e) => setDefaultSets(Number(e.target.value))}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
                Повторы по умолч.
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={defaultReps}
                onChange={(e) => setDefaultReps(Number(e.target.value))}
                className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
              />
            </div>
          </div>

          {/* Technique Description */}
          <div>
            <label className="text-[11px] font-semibold text-[#E8E9E7] block mb-1">
              Техника выполнения
            </label>
            <textarea
              rows={3}
              placeholder="Опишите ключевые акценты техники, дыхание и положение тела..."
              value={technique}
              onChange={(e) => setTechnique(e.target.value)}
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl p-2.5 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995] resize-none"
            />
          </div>

          {/* Alternatives */}
          <div>
            <label className="text-[11px] font-semibold text-[#92999A] block mb-1">
              Альтернативы (через запятую)
            </label>
            <input
              type="text"
              placeholder="Например: Жим гантелей стоя, Армейский жим"
              value={alternativesText}
              onChange={(e) => setAlternativesText(e.target.value)}
              className="w-full bg-[#171D1F] border border-[#252D2F] rounded-xl px-3 py-2 text-xs text-[#E8E9E7] focus:outline-none focus:border-[#58C995]"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-[#252D2F]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#171D1F] border border-[#252D2F] text-[#92999A] hover:text-[#E8E9E7] text-xs font-semibold rounded-xl cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-[#58C995] hover:bg-[#48b885] text-[#080D0E] text-xs font-bold rounded-xl cursor-pointer shadow-md transition-all"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
