const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

async function main() {
  const imagePath = path.resolve(process.cwd(), 'public/assets/aistudio/file_00000000520882109999d06d603d470c_f56b1378.png');
  const fileBuffer = fs.readFileSync(imagePath);
  const png = PNG.sync.read(fileBuffer);
  const width = png.width;
  const height = png.height;
  const data = png.data;

  console.log(`New image dimensions: ${width}x${height}`);

  const oldMappingPath = path.resolve(process.cwd(), 'public/assets/aistudio/form_core_atlas_mapping.json');
  const oldMapping = JSON.parse(fs.readFileSync(oldMappingPath, 'utf8'));

  const lineThreshold = 50;
  const mintTolerance = 25;
  const gapClose = 1;
  const minArea = 60;
  const totalPixels = width * height;

  const classification = new Uint8Array(totalPixels);
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
        classification[pIndex] = 2;
      } else if (isLine) {
        classification[pIndex] = 1;
      } else {
        classification[pIndex] = 0;
      }
    }
  }

  const workingBoundary = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    if (classification[i] === 1 || classification[i] === 2) {
      workingBoundary[i] = 1;
    }
  }

  if (gapClose > 0) {
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

  const labels = new Uint32Array(totalPixels);
  let nextLabel = 1;
  const parent = [0];

  function find(i) {
    let root = i;
    while (root !== parent[root]) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(i, j) {
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
        labels[idx] = union(left, top);
      }
    }
  }

  const regionMap = new Map();
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const raw = labels[rowOffset + x];
      if (raw === 0) continue;
      const root = find(raw);
      labels[rowOffset + x] = root;

      let r = regionMap.get(root);
      if (!r) {
        r = { area: 0, minX: x, minY: y, maxX: x, maxY: y, samplePoints: [], touchesBorder: false };
        regionMap.set(root, r);
      }
      r.area++;
      if (x < r.minX) r.minX = x;
      if (x > r.maxX) r.maxX = x;
      if (y < r.minY) r.minY = y;
      if (y > r.maxY) r.maxY = y;
      if (r.samplePoints.length < 2000) r.samplePoints.push({ x, y });
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) r.touchesBorder = true;
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

  const validRegions = [];
  regionMap.forEach((data, root) => {
    if (root === bgRoot) return;
    if (data.area < minArea) return;
    validRegions.push({ root, data });
  });

  validRegions.sort((a, b) => b.data.area - a.data.area);

  const rootToId = new Map();
  const finalRegions = [];

  const scaleX = 1408 / width;
  const scaleY = 768 / height;

  validRegions.forEach(({ root, data }, index) => {
    const id = index + 1;
    rootToId.set(root, id);

    let sumX = 0, sumY = 0;
    data.samplePoints.forEach(p => { sumX += p.x; sumY += p.y; });
    const cx = Math.round(sumX / data.samplePoints.length);
    const cy = Math.round(sumY / data.samplePoints.length);

    let bestPoint = data.samplePoints[0];
    let minDist = Infinity;
    data.samplePoints.forEach(p => {
      const d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
      if (d < minDist) { minDist = d; bestPoint = p; }
    });

    const projection = cx < width / 2 ? 'front' : 'back';

    const mappedOldX = cx * scaleX;
    const mappedOldY = cy * scaleY;
    let bestOldReg = null;
    let minOldDist = Infinity;

    oldMapping.regions.forEach(oldReg => {
      if (oldReg.projection === projection && oldReg.center) {
        const dist = Math.hypot(oldReg.center.x - mappedOldX, oldReg.center.y - mappedOldY);
        if (dist < minOldDist) {
          minOldDist = dist;
          bestOldReg = oldReg;
        }
      }
    });

    const assignedMuscle = bestOldReg ? bestOldReg.assignedMuscle : null;

    finalRegions.push({
      id,
      area: data.area,
      bbox: { minX: data.minX, minY: data.minY, maxX: data.maxX, maxY: data.maxY },
      center: bestPoint ? { x: bestPoint.x, y: bestPoint.y } : { x: cx, y: cy },
      projection,
      assignedMuscle,
      status: assignedMuscle ? 'assigned' : 'needs_review',
    });
  });

  const finalLabelMap = new Uint32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const root = labels[i];
    finalLabelMap[i] = rootToId.get(root) || 0;
  }

  const maskPng = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const regId = finalLabelMap[y * width + x];
      const pIdx = (y * width + x) * 4;
      if (regId === 0) {
        maskPng.data[pIdx] = 0;
        maskPng.data[pIdx + 1] = 0;
        maskPng.data[pIdx + 2] = 0;
        maskPng.data[pIdx + 3] = 0;
      } else {
        maskPng.data[pIdx] = regId & 255;
        maskPng.data[pIdx + 1] = (regId >> 8) & 255;
        maskPng.data[pIdx + 2] = 0;
        maskPng.data[pIdx + 3] = 255;
      }
    }
  }

  const maskOutputPath = path.resolve(process.cwd(), 'public/assets/aistudio/form_core_atlas_mask.png');
  fs.writeFileSync(maskOutputPath, PNG.sync.write(maskPng));
  console.log(`Saved mask PNG to ${maskOutputPath}`);

  const mappingOutputPath = path.resolve(process.cwd(), 'public/assets/aistudio/form_core_atlas_mapping.json');
  const exportJson = {
    version: '2.0.0',
    masterImage: 'file_00000000520882109999d06d603d470c_f56b1378.png',
    width,
    height,
    totalRegions: finalRegions.length,
    regions: finalRegions,
  };
  fs.writeFileSync(mappingOutputPath, JSON.stringify(exportJson, null, 2));
  console.log(`Saved mapping JSON to ${mappingOutputPath}`);
}

main().catch(console.error);
