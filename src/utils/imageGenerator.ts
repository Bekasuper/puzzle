import type {ImageSourceKind, LevelConfig, RotationMode} from '../types/puzzle';

export interface LoadedPuzzleImage {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  sourceKind: ImageSourceKind;
  cols: number;
  rows: number;
}

export function getLevelConfig(level: number, rotationMode: RotationMode): LevelConfig {
  const safeLevel = Math.max(1, Math.floor(level));
  // Smooth progression from 3x3 (level 1) up to 12x12 (level 19+)
  const dimStep = Math.min(18, safeLevel - 1);
  const cols = Math.min(12, 3 + Math.ceil(dimStep / 2));
  const rows = Math.min(12, 3 + Math.floor(dimStep / 2));

  let rotationEnabled = false;
  if (rotationMode === 'always') {
    rotationEnabled = true;
  } else if (rotationMode === 'auto') {
    rotationEnabled = safeLevel >= 4;
  }

  return {
    level: safeLevel,
    cols,
    rows,
    rotationEnabled,
  };
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createPrng(seedStr: string) {
  let state = hashString(seedStr) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ['#0F172A', '#1E3A8A', '#0D9488', '#F59E0B', '#FEF3C7', '#E11D48'],
  ['#1A1423', '#3D314A', '#684756', '#AB8476', '#F4D58D', '#E86A58'],
  ['#0B3954', '#087E8B', '#BFD7EA', '#FF5A5F', '#C81D25', '#F9F7F3'],
  ['#132A13', '#31572C', '#4F772D', '#90A955', '#ECF39E', '#E07A5F'],
  ['#2B2D42', '#8D99AE', '#EDF2F4', '#EF233C', '#FFB703', '#219EBC'],
  ['#240046', '#5A189A', '#9D4EDD', '#FF9E00', '#FF6D00', '#FCEFB4'],
];

/**
 * Source 3: High-contrast procedural abstract/geometric artwork on Canvas
 * Used automatically when offline or when network image loading fails.
 */
export const MAX_PUZZLE_IMAGE_SIZE = 1024;

export function generateProceduralCanvas(
  seed: string,
  cols: number,
  rows: number,
  baseSize = MAX_PUZZLE_IMAGE_SIZE
): HTMLCanvasElement {
  const rand = createPrng(seed);
  const clampedBase = Math.min(MAX_PUZZLE_IMAGE_SIZE, baseSize);
  const maxDim = Math.max(cols, rows);
  const w = Math.round((clampedBase * cols) / maxDim);
  const h = Math.round((clampedBase * rows) / maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const palette = PALETTES[Math.floor(rand() * PALETTES.length)];
  const styleIndex = Math.floor(rand() * 4);

  // Rich base gradient
  const angle = rand() * Math.PI * 2;
  const gx = Math.cos(angle) * w * 0.5;
  const gy = Math.sin(angle) * h * 0.5;
  const bg = ctx.createLinearGradient(w / 2 - gx, h / 2 - gy, w / 2 + gx, h / 2 + gy);
  bg.addColorStop(0, palette[0]);
  bg.addColorStop(0.55, palette[1]);
  bg.addColorStop(1, palette[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (styleIndex === 0) {
    // Layered Bauhaus Geometry & Arches
    const cellCount = 4 + Math.floor(rand() * 3);
    const stepX = w / cellCount;
    const stepY = h / cellCount;
    for (let ry = 0; ry < cellCount; ry++) {
      for (let rx = 0; rx < cellCount; rx++) {
        const x = rx * stepX;
        const y = ry * stepY;
        const c1 = palette[Math.floor(rand() * palette.length)];
        const c2 = palette[Math.floor(rand() * palette.length)];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, stepX + 0.5, stepY + 0.5);
        ctx.clip();

        ctx.fillStyle = c1;
        ctx.fillRect(x, y, stepX + 0.5, stepY + 0.5);

        const shape = Math.floor(rand() * 4);
        ctx.fillStyle = c2;
        if (shape === 0) {
          ctx.beginPath();
          ctx.arc(x + stepX / 2, y + stepY / 2, stepX * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else if (shape === 1) {
          const corner = Math.floor(rand() * 4);
          const cx = corner % 2 === 0 ? x : x + stepX;
          const cy = corner < 2 ? y : y + stepY;
          ctx.beginPath();
          ctx.arc(cx, cy, stepX * 0.92, 0, Math.PI * 2);
          ctx.fill();
        } else if (shape === 2) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + stepX, y);
          ctx.lineTo(rand() > 0.5 ? x + stepX : x, y + stepY);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
          for (let s = 0; s < 4; s++) {
            ctx.fillRect(x, y + s * (stepY / 4), stepX, stepY / 8);
          }
        }
        ctx.restore();
      }
    }
  } else if (styleIndex === 1) {
    // Atmospheric Mountain Ridges & Sun
    const sunX = w * (0.25 + rand() * 0.5);
    const sunY = h * (0.2 + rand() * 0.25);
    const sunR = Math.min(w, h) * (0.11 + rand() * 0.08);
    const sunGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR * 2.2);
    sunGrad.addColorStop(0, palette[4]);
    sunGrad.addColorStop(0.45, palette[3]);
    sunGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette[4];
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle stars
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 45; i++) {
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h * 0.5, 1 + rand() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6 ridge layers
    for (let layer = 0; layer < 6; layer++) {
      const baseY = h * (0.34 + layer * 0.11);
      ctx.fillStyle = palette[(layer + 1) % palette.length];
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, baseY);
      const segs = 12;
      for (let i = 1; i <= segs; i++) {
        const px = (w / segs) * i;
        const peak = Math.sin(i * (0.7 + layer * 0.25) + rand() * 2) * (h * 0.075);
        const py = baseY + peak + (rand() - 0.5) * h * 0.05;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (styleIndex === 2) {
    // Stained-Glass Mosaic Ribbons & Orbs
    const count = 26;
    for (let i = 0; i < count; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const rad = Math.min(w, h) * (0.08 + rand() * 0.22);
      const colA = palette[Math.floor(rand() * palette.length)];
      const colB = palette[Math.floor(rand() * palette.length)];
      const grad = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
      grad.addColorStop(0, colA);
      grad.addColorStop(1, colB);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      const sides = 5 + Math.floor(rand() * 4);
      const rot = rand() * Math.PI * 2;
      for (let s = 0; s < sides; s++) {
        const a = rot + (s / sides) * Math.PI * 2;
        const r = rad * (0.75 + rand() * 0.35);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = palette[4];
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    // Flowing Topographic Waves & Botanical Ribbons
    for (let band = 0; band < 10; band++) {
      const y0 = (h / 9) * band - h * 0.05;
      ctx.fillStyle = palette[band % palette.length];
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, y0);
      const amp = h * (0.04 + rand() * 0.06);
      const phase = rand() * Math.PI * 2;
      for (let x = 0; x <= w; x += 24) {
        const y =
          y0 +
          Math.sin((x / w) * Math.PI * (2 + (band % 3)) + phase) * amp +
          Math.cos((x / w) * Math.PI * 4 - phase) * (amp * 0.35);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Contrasting focal medallions for easy visual landmarks
    for (let k = 0; k < 5; k++) {
      const mx = w * (0.15 + rand() * 0.7);
      const my = h * (0.15 + rand() * 0.7);
      const mr = Math.min(w, h) * (0.06 + rand() * 0.07);
      ctx.fillStyle = palette[(k + 3) % palette.length];
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette[4];
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  return canvas;
}

function drawCroppedToGridAspect(
  img: HTMLImageElement,
  cols: number,
  rows: number,
  maxSide = MAX_PUZZLE_IMAGE_SIZE
): HTMLCanvasElement {
  const targetRatio = cols / rows;
  const srcRatio = img.naturalWidth / img.naturalHeight;

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (srcRatio > targetRatio) {
    sw = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else if (srcRatio < targetRatio) {
    sh = img.naturalWidth / targetRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  // Compress/downscale large photos to max 1024px on the larger side
  const targetMax = Math.min(MAX_PUZZLE_IMAGE_SIZE, maxSide);
  const maxDim = Math.max(cols, rows);
  const w = Math.round((targetMax * cols) / maxDim);
  const h = Math.round((targetMax * rows) / maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}

function loadImageElement(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        img.src = '';
        reject(new Error('Image load timeout'));
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('Image load error'));
      }
    };
    img.src = src;
  });
}

/**
 * Loads level puzzle image from Picsum (Source 1) or falls back cleanly to Procedural Canvas (Source 3).
 */
export async function loadLevelPuzzleImage(
  seed: string,
  cols: number,
  rows: number,
  forceProcedural = false
): Promise<LoadedPuzzleImage> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!forceProcedural && isOnline) {
    try {
      const maxDim = Math.max(cols, rows);
      const reqW = Math.round((1000 * cols) / maxDim);
      const reqH = Math.round((1000 * rows) / maxDim);
      const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${reqW}/${reqH}`;
      const img = await loadImageElement(url, 5500);
      const canvas = drawCroppedToGridAspect(img, cols, rows, MAX_PUZZLE_IMAGE_SIZE);
      return {
        canvas,
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        sourceKind: 'picsum',
        cols,
        rows,
      };
    } catch {
      // Fall through cleanly to offline procedural generator
    }
  }

  const canvas = generateProceduralCanvas(seed, cols, rows, MAX_PUZZLE_IMAGE_SIZE);
  return {
    canvas,
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    sourceKind: 'procedural',
    cols,
    rows,
  };
}

/**
 * Source 2: Load custom image uploaded from device via <input type="file">.
 * Adapts (cols, rows) orientation to best match the uploaded photo's aspect ratio
 * while keeping every puzzle cell an exact square.
 */
export async function loadUploadedPuzzleImage(
  file: File,
  targetCols: number,
  targetRows: number
): Promise<LoadedPuzzleImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl, 10000);
    const totalTarget = targetCols * targetRows;
    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);

    // Choose cols & rows in [3..12] that preserve total piece count & match photo aspect
    let bestCols = targetCols;
    let bestRows = targetRows;
    let bestScore = Infinity;

    for (let r = 3; r <= 12; r++) {
      for (let c = 3; c <= 12; c++) {
        const countDiff = Math.abs(c * r - totalTarget) / totalTarget;
        const ratioDiff = Math.abs(Math.log(c / r / aspect));
        const score = ratioDiff * 2.2 + countDiff;
        if (score < bestScore) {
          bestScore = score;
          bestCols = c;
          bestRows = r;
        }
      }
    }

    const canvas = drawCroppedToGridAspect(img, bestCols, bestRows, MAX_PUZZLE_IMAGE_SIZE);
    return {
      canvas,
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
      sourceKind: 'upload',
      cols: bestCols,
      rows: bestRows,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function restoreImageFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(dataUrl, 5000);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return canvas;
}
