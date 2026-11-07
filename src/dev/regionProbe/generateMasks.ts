/**
 * Autonomous script to process the master anatomical atlas image (1408x768),
 * perform Connected Component Labeling, and export:
 * 1. form_core_atlas_mask.png (indexed mask with region IDs in R/G channels)
 * 2. form_core_atlas_mapping.json (region details and preliminary muscle group hints)
 */

import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { MUSCLE_DEFINITIONS, MuscleGroup } from '../../types/workout';

interface RegionInfo {
  id: number;
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  center: { x: number; y: number };
  projection: 'front' | 'back';
  assignedMuscle: string | null;
  status: 'needs_review' | 'assigned' | 'background';
}

async function generateMasks() {
  const imagePath = path.resolve(process.cwd(), 'public/assets/aistudio/image_c10169b4_5780e2a9.jpg');
  if (!fs.existsSync(imagePath)) {
    console.error(`Master image not found at ${imagePath}`);
    process.exit(1);
  }

  console.log(`Loading master image from ${imagePath}...`);
  const fileBuffer = fs.readFileSync(imagePath);
  const rawImage = jpeg.decode(fileBuffer);
  const width = rawImage.width;
  const height = rawImage.height;
  const data = rawImage.data;

  console.log(`Image dimensions: ${width}x${height}`);

  // Parameters matching optimal segmentation
  const lineThreshold = 50;
  const mintTolerance = 25;
  const gapClose = 1;
  const minArea = 60;
  const totalPixels = width * height;

  console.log('Classifying pixels...');
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

      const isMint = g > r + mintTolerance && g > b + mintTolerance && g > 35;
      const isLine = lum < lineThreshold;

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

  // Working boundary (lines + mint if mintAsBoundary)
  const workingBoundary = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const c = classification[i];
    if (c === 1 || c === 2) {
      workingBoundary[i] = 1;
    }
  }

  // Gap closing (dilation)
  if (gapClose > 0) {
    console.log('Closing gaps in boundaries...');
    const dilated = new Uint8Array(totalPixels);
    dilated.set(workingBoundary);
    const rad = gapClose;
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
    workingBoundary.set(dilated);
  }

  console.log('Running Connected Component Labeling...');
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

  console.log('Building region statistics...');
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

      if (r.samplePoints.length < 2000) {
        r.samplePoints.push({ x, y });
      }

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        r.touchesBorder = true;
      }
    }
  }

  // Identify background (touches border and largest area)
  let maxBorderArea = -1;
  let bgRoot = -1;
  regionMap.forEach((r, root) => {
    if (r.touchesBorder && r.area > maxBorderArea) {
      maxBorderArea = r.area;
      bgRoot = root;
    }
  });

  const validRegions: { root: number; data: TempRegion }[] = [];
  regionMap.forEach((data, root) => {
    if (root === bgRoot) return;
    if (data.area < minArea) return;
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

    const projection = cx < width / 2 ? 'front' : 'back';

    // Preliminary heuristic hint without guessing randomly
    let assignedMuscle: string | null = null;
    const status: 'needs_review' | 'assigned' | 'background' = 'needs_review';

    if (projection === 'front') {
      if (cy > 250 && cy < 380 && cx > 500 && cx < 700) {
        assignedMuscle = 'chest_mid';
      } else if (cy >= 380 && cy < 500 && cx > 520 && cx < 680) {
        assignedMuscle = 'abs';
      }
    } else {
      if (cy > 300 && cy < 500 && cx > 1000 && cx < 1200) {
        assignedMuscle = 'lowerback';
      }
    }

    finalRegions.push({
      id,
      area: data.area,
      bbox: { minX: data.minX, minY: data.minY, maxX: data.maxX, maxY: data.maxY },
      center: bestPoint ? { x: bestPoint.x, y: bestPoint.y } : { x: cx, y: cy },
      projection,
      assignedMuscle,
      status,
    });
  });

  const finalLabelMap = new Uint32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const root = labels[i];
    finalLabelMap[i] = rootToId.get(root) || 0;
  }

  // 1. Export indexed PNG mask
  console.log('Exporting indexed PNG mask...');
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const regId = finalLabelMap[y * width + x];
      const pIdx = (y * width + x) * 4;

      if (regId === 0) {
        png.data[pIdx] = 0;
        png.data[pIdx + 1] = 0;
        png.data[pIdx + 2] = 0;
        png.data[pIdx + 3] = 0; // transparent
      } else {
        png.data[pIdx] = regId & 255;
        png.data[pIdx + 1] = (regId >> 8) & 255;
        png.data[pIdx + 2] = 0;
        png.data[pIdx + 3] = 255; // opaque
      }
    }
  }

  const maskOutputPath = path.resolve(process.cwd(), 'public/assets/aistudio/form_core_atlas_mask.png');
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(maskOutputPath, buffer);
  console.log(`Saved mask PNG to ${maskOutputPath}`);

  // 2. Export JSON mapping
  const mappingOutputPath = path.resolve(process.cwd(), 'public/assets/aistudio/form_core_atlas_mapping.json');
  const exportJson = {
    version: '1.0.0',
    masterImage: 'image_c10169b4_5780e2a9.jpg',
    width,
    height,
    totalRegions: finalRegions.length,
    regions: finalRegions,
  };

  fs.writeFileSync(mappingOutputPath, JSON.stringify(exportJson, null, 2));
  console.log(`Saved mapping JSON to ${mappingOutputPath}`);
  console.log(`Successfully generated masks and mapping for ${finalRegions.length} regions!`);
}

generateMasks().catch(err => {
  console.error('Error generating masks:', err);
  process.exit(1);
});
