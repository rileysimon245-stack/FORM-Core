/**
 * Anatomical image processing engine with support for manual region editing (merge, split by line, label assignment).
 */

export interface ProbeParams {
  lineThreshold: number;
  mintTolerance: number;
  mintAsBoundary: boolean;
  gapClose: number;
  minArea: number;
}

export interface RegionInfo {
  id: number;
  area: number;
  color: [number, number, number];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  center: { x: number; y: number };
  isBackground: boolean;
  neighborsCount: number;
  assignedMuscle?: string; // MuscleGroup key or 'background'
}

export interface ProcessingResult {
  width: number;
  height: number;
  regions: RegionInfo[];
  stats: {
    totalPixels: number;
    linePixels: number;
    mintPixels: number;
    fillPixels: number;
    rawRegionsCount: number;
    filteredRegionsCount: number;
    smallRegionsCount: number;
    largestRegions: RegionInfo[];
  };
  labelMap: Uint32Array;
  classificationMap: Uint8Array;
}

const REGION_PALETTE: [number, number, number][] = [
  [88, 201, 149],  [59, 130, 246],  [239, 68, 68],   [245, 158, 11],
  [168, 85, 247],  [236, 72, 153],  [14, 165, 233],  [34, 197, 94],
  [250, 204, 21],  [129, 140, 248], [244, 63, 94],   [20, 184, 166],
  [251, 146, 60],  [192, 132, 252], [45, 212, 191],  [163, 230, 53],
  [248, 113, 113], [96, 165, 250],  [217, 70, 239],  [253, 186, 116],
  [110, 231, 183], [147, 197, 253], [252, 165, 165], [216, 180, 254],
];

function getRegionColor(index: number): [number, number, number] {
  return REGION_PALETTE[index % REGION_PALETTE.length];
}

export async function processAnatomicalImage(
  imgSource: HTMLImageElement | File,
  params: ProbeParams,
  onProgress?: (progress: number, status: string) => void
): Promise<ProcessingResult> {
  onProgress?.(10, 'Загрузка изображения...');

  let img: HTMLImageElement;
  if (imgSource instanceof File) {
    img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(imgSource);
    });
  } else {
    img = imgSource;
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Не удалось создать 2D контекст');

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  onProgress?.(25, 'Классификация пикселей...');

  const classification = new Uint8Array(totalPixels);
  let lineCount = 0;
  let mintCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const isMint = g > r + params.mintTolerance && g > b + params.mintTolerance && g > 35;
      const isLine = lum < params.lineThreshold;

      const pIndex = y * width + x;
      if (isMint) {
        mintCount++;
        classification[pIndex] = 2;
      } else if (isLine) {
        lineCount++;
        classification[pIndex] = 1;
      } else {
        classification[pIndex] = 0;
      }
    }
  }

  let workingBoundary = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const c = classification[i];
    if (c === 1 || (params.mintAsBoundary && c === 2)) {
      workingBoundary[i] = 1;
    }
  }

  if (params.gapClose > 0) {
    onProgress?.(45, 'Закрытие разрывов в контурах...');
    const dilated = new Uint8Array(totalPixels);
    dilated.set(workingBoundary);

    const rad = params.gapClose;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (workingBoundary[y * width + x] === 1) {
          const y0 = Math.max(0, y - rad);
          const y1 = Math.min(height - 1, y + rad);
          const x0 = Math.max(0, x - rad);
          const x1 = Math.min(width - 1, x + rad);
          for (let dy = y0; dy <= y1; dy++) {
            for (let dx = x0; dx <= x1; dx++) {
              dilated[dy * width + dx] = 1;
            }
          }
        }
      }
    }
    workingBoundary = dilated;
  }

  onProgress?.(65, 'Поиск связных областей...');

  const labels = new Uint32Array(totalPixels);
  let nextLabel = 1;
  const parent: number[] = [0];

  function find(i: number): number {
    let root = i;
    while (root !== parent[root]) {
      root = parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(i: number, j: number): number {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
      return rootJ;
    }
    return rootI;
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (workingBoundary[rowOffset + x] === 1) continue;

      const idx = rowOffset + x;
      const left = x > 0 && workingBoundary[rowOffset + (x - 1)] === 0 ? labels[rowOffset + (x - 1)] : 0;
      const top = y > 0 && workingBoundary[(y - 1) * width + x] === 0 ? labels[(y - 1) * width + x] : 0;

      if (left === 0 && top === 0) {
        parent.push(nextLabel);
        labels[idx] = nextLabel++;
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        const root = union(left, top);
        labels[idx] = root;
      }
    }
  }

  onProgress?.(85, 'Построение карты регионов...');

  const result = rebuildRegionsFromLabels(labels, width, height, params.minArea, find);

  return {
    width,
    height,
    regions: result.regions,
    stats: {
      totalPixels,
      linePixels: lineCount,
      mintPixels: mintCount,
      fillPixels: totalPixels - lineCount - mintCount,
      rawRegionsCount: result.rawCount,
      filteredRegionsCount: result.regions.length,
      smallRegionsCount: result.smallCount,
      largestRegions: [...result.regions].sort((a, b) => b.area - a.area).slice(0, 10),
    },
    labelMap: result.labelMap,
    classificationMap: classification,
  };
}

export function rebuildRegionsFromLabels(
  labels: Uint32Array,
  width: number,
  height: number,
  minArea: number,
  findFn?: (i: number) => number
) {
  const totalPixels = width * height;
  const find = findFn || ((i: number) => i);

  interface TempRegion {
    area: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    samplePoints: { x: number; y: number }[];
    touchesBorder: boolean;
  }

  const regionMap = new Map<number, TempRegion>();
  let rawCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const raw = labels[idx];
      if (raw === 0) continue;

      const root = find(raw);
      labels[idx] = root;

      let r = regionMap.get(root);
      if (!r) {
        rawCount++;
        r = {
          area: 0,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          samplePoints: [],
          touchesBorder: false,
        };
        regionMap.set(root, r);
      }

      r.area++;
      if (x < r.minX) r.minX = x;
      if (x > r.maxX) r.maxX = x;
      if (y < r.minY) r.minY = y;
      if (y > r.maxY) r.maxY = y;

      if (r.samplePoints.length < 2500) {
        r.samplePoints.push({ x, y });
      }

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        r.touchesBorder = true;
      }
    }
  }

  let maxBorderArea = -1;
  let bgRoot = -1;
  regionMap.forEach((r, root) => {
    if (r.touchesBorder && r.area > maxBorderArea) {
      maxBorderArea = r.area;
      bgRoot = root;
    }
  });

  let smallCount = 0;
  const validRegions: { root: number; data: TempRegion }[] = [];
  regionMap.forEach((data, root) => {
    if (root === bgRoot) return;
    if (data.area < minArea) {
      smallCount++;
      return;
    }
    validRegions.push({ root, data });
  });

  validRegions.sort((a, b) => b.data.area - a.data.area);

  const rootToId = new Map<number, number>();
  const finalRegions: RegionInfo[] = [];

  validRegions.forEach(({ root, data }, index) => {
    const id = index + 1;
    rootToId.set(root, id);

    let sumX = 0;
    let sumY = 0;
    data.samplePoints.forEach(p => {
      sumX += p.x;
      sumY += p.y;
    });
    const cx = Math.round(sumX / data.samplePoints.length);
    const cy = Math.round(sumY / data.samplePoints.length);

    let bestPoint = data.samplePoints[0];
    let minDist = Infinity;
    data.samplePoints.forEach(p => {
      const d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
      if (d < minDist) {
        minDist = d;
        bestPoint = p;
      }
    });

    finalRegions.push({
      id,
      area: data.area,
      color: getRegionColor(index),
      bbox: { minX: data.minX, minY: data.minY, maxX: data.maxX, maxY: data.maxY },
      center: bestPoint ? { x: bestPoint.x, y: bestPoint.y } : { x: cx, y: cy },
      isBackground: false,
      neighborsCount: 0,
      assignedMuscle: undefined,
    });
  });

  const finalLabelMap = new Uint32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const root = labels[i];
    finalLabelMap[i] = rootToId.get(root) || 0;
  }

  // Neighbor counts
  const neighborSets = new Map<number, Set<number>>();
  finalRegions.forEach(r => neighborSets.set(r.id, new Set<number>()));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const id1 = finalLabelMap[rowOffset + x];
      if (id1 === 0) continue;

      if (x + 1 < width) {
        const id2 = finalLabelMap[rowOffset + (x + 1)];
        if (id2 > 0 && id2 !== id1) {
          neighborSets.get(id1)?.add(id2);
          neighborSets.get(id2)?.add(id1);
        }
      }
      if (y + 1 < height) {
        const id3 = finalLabelMap[(y + 1) * width + x];
        if (id3 > 0 && id3 !== id1) {
          neighborSets.get(id1)?.add(id3);
          neighborSets.get(id3)?.add(id1);
        }
      }
    }
  }

  finalRegions.forEach(r => {
    r.neighborsCount = neighborSets.get(r.id)?.size || 0;
  });

  return {
    regions: finalRegions,
    labelMap: finalLabelMap,
    rawCount,
    smallCount,
  };
}
