import React, { useState, useEffect, useRef, useCallback } from 'react';
import { processAnatomicalImage, rebuildRegionsFromLabels, ProbeParams, ProcessingResult, RegionInfo } from './imageProcessor';
import { MUSCLE_DEFINITIONS, MuscleGroup } from '../../types/workout';
import {
  Upload,
  Copy,
  Check,
  Sliders,
  BarChart2,
  Maximize2,
  ArrowLeft,
  Merge,
  Scissors,
  Undo2,
  Download,
  AlertTriangle,
  FileJson,
  Layers,
} from 'lucide-react';

const PRESET_IMAGES = [
  { id: 'atlas', name: 'Мастер-атлас (Спереди + Сзади)', url: '/assets/aistudio/image_c10169b4_5780e2a9.jpg' },
  { id: 'front', name: 'Спереди (старый)', url: '/assets/aistudio/1793615800573_ee14e923.jpg' },
  { id: 'back', name: 'Сзади (старый)', url: '/assets/aistudio/1793615808686_75ee0cf8.jpg' },
];

const MUSCLE_OPTIONS: { id: MuscleGroup | 'background'; name: string }[] = [
  { id: 'background', name: '🚫 Фон / Игнорировать' },
  ...Object.entries(MUSCLE_DEFINITIONS).map(([key, info]) => ({
    id: key as MuscleGroup,
    name: `${info.nameRu} (${key})`,
  })),
];

interface HistoryState {
  labelMap: Uint32Array;
  regions: RegionInfo[];
  assignments: Record<number, string>;
}

export const RegionProbePage: React.FC = () => {
  // Detection parameters
  const [params, setParams] = useState<ProbeParams>({
    lineThreshold: 50,
    mintTolerance: 25,
    mintAsBoundary: true,
    gapClose: 1,
    minArea: 60,
  });

  // Display toggles
  const [opacity, setOpacity] = useState<number>(0.65);
  const [showOriginal, setShowOriginal] = useState<boolean>(true);
  const [showNumbers, setShowNumbers] = useState<boolean>(true);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(false);
  const [toolMode, setToolMode] = useState<'select' | 'split'>('select');

  // Split line drawing state
  const [splitStart, setSplitStart] = useState<{ x: number; y: number } | null>(null);
  const [splitEnd, setSplitEnd] = useState<{ x: number; y: number } | null>(null);

  // Image & Processing
  const [activePreset, setActivePreset] = useState<string>('front');
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Region assignments (regionId -> MuscleGroup | 'background')
  const [assignments, setAssignments] = useState<Record<number, string>>({});

  // History stack for Undo
  const [history, setHistory] = useState<HistoryState[]>([]);

  // Zoom & Pan
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load preset image
  const loadPresetImage = useCallback((url: string) => {
    setLoading(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageElement(img);
      setSelectedRegionId(null);
      setMergeSourceId(null);
      setHistory([]);
      setAssignments({});
    };
    img.onerror = () => {
      setLoading(false);
      alert('Не удалось загрузить изображение: ' + url);
    };
    img.src = url;
  }, []);

  useEffect(() => {
    loadPresetImage(PRESET_IMAGES[0].url);
  }, [loadPresetImage]);

  // Run initial processing
  const runProcessing = useCallback(async (img: HTMLImageElement, currentParams: ProbeParams) => {
    setLoading(true);
    try {
      const res = await processAnatomicalImage(img, currentParams, (prog, text) => {
        setProgressText(`${text} (${prog}%)`);
      });
      setResult(res);
      setHistory([]);
      setAssignments({});
    } catch (err) {
      console.error(err);
      alert('Ошибка обработки: ' + err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!imageElement) return;
    const timer = setTimeout(() => {
      runProcessing(imageElement, params);
    }, 200);
    return () => clearTimeout(timer);
  }, [imageElement, params, runProcessing]);

  // Save state to history before modification
  const pushHistory = () => {
    if (!result) return;
    setHistory(prev => [
      ...prev,
      {
        labelMap: new Uint32Array(result.labelMap),
        regions: JSON.parse(JSON.stringify(result.regions)),
        assignments: { ...assignments },
      },
    ]);
  };

  const handleUndo = () => {
    if (history.length === 0 || !result) return;
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));
    setAssignments(last.assignments);
    setSelectedRegionId(null);
    setMergeSourceId(null);

    const rebuilt = rebuildRegionsFromLabels(last.labelMap, result.width, result.height, params.minArea);
    setResult({
      ...result,
      labelMap: rebuilt.labelMap,
      regions: rebuilt.regions,
      stats: {
        ...result.stats,
        filteredRegionsCount: rebuilt.regions.length,
        largestRegions: [...rebuilt.regions].sort((a, b) => b.area - a.area).slice(0, 10),
      },
    });
  };

  // Merge two regions
  const handleMergeWithSelected = (targetId: number) => {
    if (mergeSourceId === null || mergeSourceId === targetId || !result) return;
    pushHistory();

    const newLabelMap = new Uint32Array(result.labelMap);
    const srcId = mergeSourceId;

    for (let i = 0; i < newLabelMap.length; i++) {
      if (newLabelMap[i] === srcId) {
        newLabelMap[i] = targetId;
      }
    }

    const rebuilt = rebuildRegionsFromLabels(newLabelMap, result.width, result.height, params.minArea);
    setResult({
      ...result,
      labelMap: rebuilt.labelMap,
      regions: rebuilt.regions,
      stats: {
        ...result.stats,
        filteredRegionsCount: rebuilt.regions.length,
        largestRegions: [...rebuilt.regions].sort((a, b) => b.area - a.area).slice(0, 10),
      },
    });

    setMergeSourceId(null);
    setSelectedRegionId(targetId);
  };

  // Split region by drawing a line
  const handleExecuteSplit = () => {
    if (!selectedRegionId || !splitStart || !splitEnd || !result) return;
    pushHistory();

    const newLabelMap = new Uint32Array(result.labelMap);
    const width = result.width;
    const height = result.height;
    const targetId = selectedRegionId;

    // Rasterize line on labelMap (set to 0 i.e. boundary) using Bresenham's algorithm
    let x0 = Math.round(splitStart.x);
    let y0 = Math.round(splitStart.y);
    const x1 = Math.round(splitEnd.x);
    const y1 = Math.round(splitEnd.y);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
        const idx = y0 * width + x0;
        if (newLabelMap[idx] === targetId) {
          newLabelMap[idx] = 0; // cut through region
        }
      }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    const rebuilt = rebuildRegionsFromLabels(newLabelMap, width, height, params.minArea);
    setResult({
      ...result,
      labelMap: rebuilt.labelMap,
      regions: rebuilt.regions,
      stats: {
        ...result.stats,
        filteredRegionsCount: rebuilt.regions.length,
        largestRegions: [...rebuilt.regions].sort((a, b) => b.area - a.area).slice(0, 10),
      },
    });

    setSplitStart(null);
    setSplitEnd(null);
    setToolMode('select');
    setSelectedRegionId(null);
  };

  // File upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActivePreset('custom');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageElement(img);
      setSelectedRegionId(null);
      setMergeSourceId(null);
      setHistory([]);
      setAssignments({});
    };
    img.src = url;
  };

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement || !result) return;

    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, result.width, result.height);

    // 1. Original image
    if (showOriginal) {
      ctx.drawImage(imageElement, 0, 0);
    } else {
      ctx.fillStyle = '#080d0e';
      ctx.fillRect(0, 0, result.width, result.height);
    }

    // 2. Overlay region colors & assignment status
    const imgData = ctx.getImageData(0, 0, result.width, result.height);
    const data = imgData.data;

    const regionMap = new Map<number, RegionInfo>();
    result.regions.forEach(r => regionMap.set(r.id, r));

    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        const idx = y * result.width + x;
        const regionId = result.labelMap[idx];
        if (regionId === 0) continue;

        const region = regionMap.get(regionId);
        if (!region) continue;

        if (showOnlySelected && selectedRegionId !== null && region.id !== selectedRegionId) {
          continue;
        }

        const pIdx = idx * 4;
        const assigned = assignments[region.id];
        const isUnassignedWarning = !assigned;

        // Dim unassigned or color by region
        const [rC, gC, bC] = isUnassignedWarning ? [239, 68, 68] : region.color;

        data[pIdx] = Math.round(data[pIdx] * (1 - opacity) + rC * opacity);
        data[pIdx + 1] = Math.round(data[pIdx + 1] * (1 - opacity) + gC * opacity);
        data[pIdx + 2] = Math.round(data[pIdx + 2] * (1 - opacity) + bC * opacity);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // 3. Draw region numbers & assignment badge
    if (showNumbers) {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      result.regions.forEach(reg => {
        if (showOnlySelected && selectedRegionId !== null && reg.id !== selectedRegionId) {
          return;
        }
        const { x, y } = reg.center;
        const assigned = assignments[reg.id];

        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.fillRect(x - 18, y - 9, 36, 18);

        ctx.fillStyle = reg.id === selectedRegionId ? '#58C995' : assigned ? '#ffffff' : '#EF4444';
        ctx.fillText(`#${reg.id}`, x, y);
      });
    }

    // 4. Highlight selected region bbox
    if (selectedRegionId !== null) {
      const selected = result.regions.find(r => r.id === selectedRegionId);
      if (selected) {
        ctx.strokeStyle = '#58C995';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          selected.bbox.minX,
          selected.bbox.minY,
          selected.bbox.maxX - selected.bbox.minX,
          selected.bbox.maxY - selected.bbox.minY
        );
      }
    }

    // 5. Draw split line preview if drawing
    if (toolMode === 'split' && splitStart && splitEnd) {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(splitStart.x, splitStart.y);
      ctx.lineTo(splitEnd.x, splitEnd.y);
      ctx.stroke();
    }
  }, [imageElement, result, opacity, showOriginal, showNumbers, selectedRegionId, showOnlySelected, assignments, toolMode, splitStart, splitEnd]);

  // Click on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!result || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = Math.floor((e.clientX - rect.left) / scale);
    const clickY = Math.floor((e.clientY - rect.top) / scale);

    if (clickX < 0 || clickX >= result.width || clickY < 0 || clickY >= result.height) return;

    if (toolMode === 'split') {
      if (!splitStart) {
        setSplitStart({ x: clickX, y: clickY });
      } else {
        setSplitEnd({ x: clickX, y: clickY });
      }
      return;
    }

    const clickedRegionId = result.labelMap[clickY * result.width + clickX];
    if (clickedRegionId > 0) {
      setSelectedRegionId(clickedRegionId);
    } else {
      setSelectedRegionId(null);
    }
  };

  // Zoom & Pan
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale(prev => Math.min(Math.max(0.5, prev * zoomFactor), 15));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (toolMode === 'split') return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Validation: check if all regions have assignment
  const unassignedCount = result ? result.regions.filter(r => !assignments[r.id]).length : 0;

  // Export JSON Markup
  const handleExportJson = () => {
    if (!result) return;
    const mapping: Record<number, string> = {};
    result.regions.forEach(r => {
      mapping[r.id] = assignments[r.id] || 'unassigned';
    });

    const exportData = {
      version: '1.0',
      projection: activePreset,
      width: result.width,
      height: result.height,
      mappings: mapping,
      regions: result.regions.map(r => ({
        id: r.id,
        area: r.area,
        assignedMuscle: assignments[r.id] || null,
        bbox: r.bbox,
      })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `form_core_markup_${activePreset}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  // Export Indexed Mask PNG (exact pixel coordinates)
  const handleExportMaskPng = () => {
    if (!result) return;
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(result.width, result.height);
    const data = imgData.data;

    for (let i = 0; i < result.labelMap.length; i++) {
      const regId = result.labelMap[i];
      const pIdx = i * 4;
      if (regId === 0) {
        data[pIdx] = 0;
        data[pIdx + 1] = 0;
        data[pIdx + 2] = 0;
        data[pIdx + 3] = 0; // transparent background
      } else {
        // Encode region ID into R and G channels for exact retrieval
        data[pIdx] = regId & 255;
        data[pIdx + 1] = (regId >> 8) & 255;
        data[pIdx + 2] = 0;
        data[pIdx + 3] = 255; // opaque
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataUrl);
    dlAnchor.setAttribute('download', `form_core_mask_${activePreset}.png`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  const handleExitProbe = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('probe');
    url.hash = '';
    window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const selectedRegion = result?.regions.find(r => r.id === selectedRegionId);

  return (
    <div className="min-h-screen bg-[#080D0E] text-[#E8E9E7] flex flex-col font-sans select-none">
      {/* Header */}
      <header className="bg-[#101719] border-b border-[#252D2F] px-4 py-2.5 flex items-center justify-between sticky top-0 z-50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExitProbe}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#141C1E] text-[#92999A] hover:text-[#E8E9E7] border border-[#252D2F] rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Выход</span>
          </button>

          <span className="font-serif text-base font-bold tracking-wider text-[#58C995]">FORM Core</span>
          <span className="text-[11px] bg-[#1A2528] text-[#92999A] px-2 py-0.5 rounded-md border border-[#2B383B]">
            Этап 1: Пиксельные маски и разметка
          </span>
        </div>

        {/* Presets */}
        <div className="flex items-center gap-1.5 bg-[#0c1214] p-1 rounded-xl border border-[#202729]">
          {PRESET_IMAGES.map(preset => (
            <button
              key={preset.id}
              onClick={() => {
                setActivePreset(preset.id);
                loadPresetImage(preset.url);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activePreset === preset.id
                  ? 'bg-[#182821] text-[#58C995] border border-[#2f553f]'
                  : 'text-[#92999A] hover:text-[#E8E9E7]'
              }`}
            >
              {preset.name}
            </button>
          ))}

          <label className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-[#92999A] hover:text-[#E8E9E7] cursor-pointer transition-colors">
            <Upload className="w-3 h-3" />
            <span>Файл</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        </div>

        {/* Export & Undo */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#141C1E] text-[#E8E9E7] border border-[#252D2F] rounded-xl text-xs font-semibold hover:bg-[#1A2326] transition-colors cursor-pointer disabled:opacity-40"
            title="Отменить последнее действие"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Отмена ({history.length})</span>
          </button>

          <button
            onClick={handleExportJson}
            disabled={!result || unassignedCount > 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#14231b] text-[#58C995] border border-[#2f553f] rounded-xl text-xs font-semibold hover:bg-[#1a2d22] transition-colors cursor-pointer disabled:opacity-50"
            title="Скачать JSON разметки"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Экспорт JSON</span>
          </button>

          <button
            onClick={handleExportMaskPng}
            disabled={!result || unassignedCount > 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#14231b] text-[#58C995] border border-[#2f553f] rounded-xl text-xs font-semibold hover:bg-[#1a2d22] transition-colors cursor-pointer disabled:opacity-50"
            title="Скачать PNG маску"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Экспорт PNG</span>
          </button>
        </div>
      </header>

      {/* Validation warning banner */}
      {unassignedCount > 0 && (
        <div className="bg-[#291616] border-b border-[#5a2e2e] px-4 py-2 flex items-center justify-between text-xs text-[#EF4444]">
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
            Неразмеченных областей: {unassignedCount}. Каждая область должна быть привязана к группе мышц или фону перед экспортом.
          </span>
          <span className="font-mono">{Math.round((unassignedCount / (result?.regions.length || 1)) * 100)}%</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full lg:w-80 bg-[#101719] border-r border-[#252D2F] p-4 flex flex-col gap-4 overflow-y-auto shrink-0 max-h-[45vh] lg:max-h-none">
          {/* Correction Tools */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#58C995] flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" />
              Инструменты коррекции
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setToolMode(toolMode === 'select' ? 'split' : 'select')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  toolMode === 'split'
                    ? 'bg-[#2E1A1A] text-[#EF4444] border-[#5A2E2E]'
                    : 'bg-[#141C1E] text-[#E8E9E7] border-[#252D2F] hover:bg-[#1B2426]'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>{toolMode === 'split' ? 'Режим: Разрез линии' : 'Разрезать область'}</span>
              </button>

              <button
                onClick={() => {
                  if (selectedRegionId !== null) {
                    if (mergeSourceId === null) {
                      setMergeSourceId(selectedRegionId);
                    } else {
                      handleMergeWithSelected(selectedRegionId);
                    }
                  }
                }}
                disabled={selectedRegionId === null}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  mergeSourceId !== null
                    ? 'bg-[#182821] text-[#58C995] border-[#58C995] animate-pulse'
                    : 'bg-[#141C1E] text-[#E8E9E7] border-[#252D2F] hover:bg-[#1B2426]'
                }`}
              >
                <Merge className="w-3.5 h-3.5" />
                <span>{mergeSourceId === null ? 'Слить с...' : 'Подтвердить слияние'}</span>
              </button>
            </div>

            {toolMode === 'split' && (
              <div className="p-3 bg-[#1A1313] border border-[#3A2222] rounded-xl text-xs space-y-2">
                <p className="text-[#EF4444] font-medium">Кликните две точки на холсте внутри выбранной области для проведения линии разреза.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleExecuteSplit}
                    disabled={!splitStart || !splitEnd}
                    className="flex-1 py-1.5 bg-[#EF4444] text-white rounded-lg font-bold disabled:opacity-50 cursor-pointer"
                  >
                    Выполнить разрез
                  </button>
                  <button
                    onClick={() => { setSplitStart(null); setSplitEnd(null); setToolMode('select'); }}
                    className="px-3 py-1.5 bg-[#252D2F] text-[#92999A] rounded-lg cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detection Parameters */}
          <div className="space-y-3 pt-3 border-t border-[#252D2F]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#58C995] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Параметры генерации
            </h3>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#92999A]">Порог линий:</span>
                <span className="font-semibold text-[#E8E9E7]">{params.lineThreshold}</span>
              </div>
              <input
                type="range"
                min="10"
                max="120"
                value={params.lineThreshold}
                onChange={e => setParams(p => ({ ...p, lineThreshold: Number(e.target.value) }))}
                className="w-full accent-[#58C995] cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#92999A]">Закрыть щели в линиях:</span>
                <span className="font-semibold text-[#E8E9E7]">{params.gapClose} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                value={params.gapClose}
                onChange={e => setParams(p => ({ ...p, gapClose: Number(e.target.value) }))}
                className="w-full accent-[#58C995] cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#92999A]">Мин. площадь:</span>
                <span className="font-semibold text-[#E8E9E7]">{params.minArea} px</span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                value={params.minArea}
                onChange={e => setParams(p => ({ ...p, minArea: Number(e.target.value) }))}
                className="w-full accent-[#58C995] cursor-pointer"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-[#202729]">
              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span className="text-[#92999A]">Показывать оригинал:</span>
                <input
                  type="checkbox"
                  checked={showOriginal}
                  onChange={e => setShowOriginal(e.target.checked)}
                  className="accent-[#58C995] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span className="text-[#92999A]">Показывать номера:</span>
                <input
                  type="checkbox"
                  checked={showNumbers}
                  onChange={e => setShowNumbers(e.target.checked)}
                  className="accent-[#58C995] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Regions List */}
          {result && (
            <div className="space-y-2 pt-3 border-t border-[#252D2F]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#58C995] flex items-center justify-between">
                <span>Области ({result.regions.length})</span>
                <span className="text-[10px] text-[#92999A]">Клик для привязки</span>
              </h3>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {result.regions.map(reg => {
                  const assigned = assignments[reg.id];
                  return (
                    <div
                      key={reg.id}
                      onClick={() => setSelectedRegionId(reg.id)}
                      className={`p-2 rounded-lg border text-xs flex justify-between items-center cursor-pointer transition-colors ${
                        selectedRegionId === reg.id
                          ? 'bg-[#182821] border-[#58C995] text-[#58C995]'
                          : assigned
                          ? 'bg-[#080D0E] border-[#202729] text-[#C5CBCD]'
                          : 'bg-[#1D1010] border-[#3A2222] text-[#EF4444]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: `rgb(${reg.color.join(',')})` }} />
                        <span className="font-semibold">#{reg.id}</span>
                        <span className="text-[11px] truncate max-w-[110px]">
                          {assigned ? (assigned === 'background' ? '🚫 Фон' : assigned) : '⚠️ Не назначено'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#92999A]">{reg.area}px</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Canvas Workspace */}
        <main
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="flex-1 bg-[#050809] relative overflow-hidden flex items-center justify-center cursor-crosshair min-h-[50vh]"
        >
          {loading && (
            <div className="absolute inset-0 bg-[#080D0E]/80 z-40 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-[#58C995] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-[#58C995]">{progressText || 'Обработка...'}</p>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 bg-[#101719]/95 border border-[#252D2F] rounded-xl p-1.5 shadow-xl backdrop-blur-md">
            <button
              onClick={() => setScale(s => Math.min(s * 1.25, 15))}
              className="w-7 h-7 rounded-lg bg-[#141C1E] text-[#E8E9E7] flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              +
            </button>
            <span className="text-xs font-mono px-2 text-[#92999A]">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => Math.max(s / 1.25, 0.5))}
              className="w-7 h-7 rounded-lg bg-[#141C1E] text-[#E8E9E7] flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              -
            </button>
            <button
              onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
              className="w-7 h-7 rounded-lg bg-[#141C1E] text-[#92999A] hover:text-[#E8E9E7] flex items-center justify-center cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.05s ease-out',
            }}
            className="relative shadow-2xl rounded-lg overflow-hidden border border-[#1C2528]"
          >
            <canvas ref={canvasRef} onClick={handleCanvasClick} className="block" />
          </div>

          {/* Selected Region Assignment Inspector */}
          {selectedRegion && (
            <div className="absolute bottom-4 right-4 z-30 w-80 bg-[#101719]/95 border border-[#252D2F] rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between border-b border-[#202729] pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: `rgb(${selectedRegion.color.join(',')})` }} />
                  <h4 className="text-sm font-bold text-[#E8E9E7]">Область #{selectedRegion.id}</h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowOnlySelected(!showOnlySelected)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                      showOnlySelected ? 'bg-[#182821] text-[#58C995] border-[#58C995]' : 'bg-[#141C1E] text-[#92999A] border-[#252D2F]'
                    }`}
                  >
                    {showOnlySelected ? 'Изоляция: Вкл' : 'Изолировать'}
                  </button>
                  <button
                    onClick={() => setSelectedRegionId(null)}
                    className="w-6 h-6 rounded-lg bg-[#141C1E] text-[#92999A] hover:text-[#E8E9E7] flex items-center justify-center text-xs cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Assignment Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#58C995] uppercase tracking-wider block">
                  Привязать к мышце / группе:
                </label>
                <select
                  value={assignments[selectedRegion.id] || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setAssignments(prev => ({ ...prev, [selectedRegion.id]: val }));
                  }}
                  className="w-full bg-[#080D0E] border border-[#252D2F] text-xs text-[#E8E9E7] rounded-xl p-2.5 outline-none focus:border-[#58C995] cursor-pointer"
                >
                  <option value="" disabled>-- Выберите группу мышц FORM Core --</option>
                  {MUSCLE_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 text-xs text-[#92999A]">
                <div className="flex justify-between">
                  <span>Площадь:</span>
                  <span className="font-mono text-[#E8E9E7]">{selectedRegion.area} px</span>
                </div>
                <div className="flex justify-between">
                  <span>Соседей:</span>
                  <span className="font-mono text-[#E8E9E7]">{selectedRegion.neighborsCount}</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
