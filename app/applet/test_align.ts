import fs from 'fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

async function testAlign() {
  const maskBuf = fs.readFileSync('public/assets/aistudio/form_core_atlas_mask.png');
  const maskPng = PNG.sync.read(maskBuf);

  const newImgBuf = fs.readFileSync('public/assets/aistudio/file_00000000520882109999d06d603d470c_f56b1378.png');
  const newPng = PNG.sync.read(newImgBuf);

  console.log('Mask:', maskPng.width, 'x', maskPng.height);
  console.log('New Img:', newPng.width, 'x', newPng.height);

  // Find bounding box of non-transparent pixels in mask
  let minX = maskPng.width, minY = maskPng.height, maxX = 0, maxY = 0;
  for (let y = 0; y < maskPng.height; y++) {
    for (let x = 0; x < maskPng.width; x++) {
      const idx = (y * maskPng.width + x) * 4;
      if (maskPng.data[idx + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log('Mask bounds:', { minX, minY, maxX, maxY });

  // Find bounding box of non-black pixels in new image (assuming black background #000000)
  let nMinX = newPng.width, nMinY = newPng.height, nMaxX = 0, nMaxY = 0;
  for (let y = 0; y < newPng.height; y++) {
    for (let x = 0; x < newPng.width; x++) {
      const idx = (y * newPng.width + x) * 4;
      const r = newPng.data[idx];
      const g = newPng.data[idx + 1];
      const b = newPng.data[idx + 2];
      // if not near black background
      if (r > 10 || g > 10 || b > 10) {
        if (x < nMinX) nMinX = x;
        if (x > nMaxX) nMaxX = x;
        if (y < nMinY) nMinY = y;
        if (y > nMaxY) nMaxY = y;
      }
    }
  }
  console.log('New image body bounds:', { nMinX, nMinY, nMaxX, nMaxY });
}

testAlign().catch(console.error);
