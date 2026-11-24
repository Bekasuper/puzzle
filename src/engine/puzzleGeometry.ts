import type {PieceEdges, PuzzlePiece} from '../types/puzzle';

export const TAB_PAD_RATIO = 0.34;

export type SpriteSurface = OffscreenCanvas | HTMLCanvasElement;

function createOffscreenSurface(width: number, height: number): SpriteSurface {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function pt(
  x1: number,
  y1: number,
  dx: number,
  dy: number,
  nx: number,
  ny: number,
  t: number,
  n: number
): [number, number] {
  return [x1 + dx * t + nx * n, y1 + dy * t + ny * n];
}

/**
 * Appends a symmetric cubic-Bezier jigsaw edge from (x1, y1) to (x2, y2).
 * `sign`: 0 = flat edge, +1 = outward tab, -1 = inward blank.
 */
export function traceBezierEdge(
  path: Path2D | CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sign: -1 | 0 | 1
): void {
  if (sign === 0) {
    path.lineTo(x2, y2);
    return;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const nx = dy;
  const ny = -dx;
  const s = sign;

  // Segment 1: shoulder into neck
  const [c1x, c1y] = pt(x1, y1, dx, dy, nx, ny, 0.18, 0);
  const [c2x, c2y] = pt(x1, y1, dx, dy, nx, ny, 0.3, -0.045 * s);
  const [p1x, p1y] = pt(x1, y1, dx, dy, nx, ny, 0.36, 0);
  path.bezierCurveTo(c1x, c1y, c2x, c2y, p1x, p1y);

  // Segment 2: left half of round tab
  const [c3x, c3y] = pt(x1, y1, dx, dy, nx, ny, 0.42, 0.04 * s);
  const [c4x, c4y] = pt(x1, y1, dx, dy, nx, ny, 0.3, 0.235 * s);
  const [p2x, p2y] = pt(x1, y1, dx, dy, nx, ny, 0.5, 0.235 * s);
  path.bezierCurveTo(c3x, c3y, c4x, c4y, p2x, p2y);

  // Segment 3: right half of round tab (mirror of segment 2)
  const [c5x, c5y] = pt(x1, y1, dx, dy, nx, ny, 0.7, 0.235 * s);
  const [c6x, c6y] = pt(x1, y1, dx, dy, nx, ny, 0.58, 0.04 * s);
  const [p3x, p3y] = pt(x1, y1, dx, dy, nx, ny, 0.64, 0);
  path.bezierCurveTo(c5x, c5y, c6x, c6y, p3x, p3y);

  // Segment 4: neck out to corner (mirror of segment 1)
  const [c7x, c7y] = pt(x1, y1, dx, dy, nx, ny, 0.7, -0.045 * s);
  const [c8x, c8y] = pt(x1, y1, dx, dy, nx, ny, 0.82, 0);
  path.bezierCurveTo(c7x, c7y, c8x, c8y, x2, y2);
}

/**
 * Builds a Path2D for a single piece centered at (0, 0) with inner cell size `cellSize`.
 */
export function buildCenteredPiecePath(edges: PieceEdges, cellSize: number): Path2D {
  const half = cellSize / 2;
  const path = new Path2D();
  path.moveTo(-half, -half);
  traceBezierEdge(path, -half, -half, half, -half, edges.top);
  traceBezierEdge(path, half, -half, half, half, edges.right);
  traceBezierEdge(path, half, half, -half, half, edges.bottom);
  traceBezierEdge(path, -half, half, -half, -half, edges.left);
  path.closePath();
  return path;
}

export interface PieceSprite {
  /** Floating sprite with pre-baked ambient drop shadow, clip mask, bevel & stroke */
  canvas: SpriteSurface;
  /** Flush sprite without outer drop shadow for locked board pieces */
  flushCanvas: SpriteSurface;
  path: Path2D;
  logicalSize: number;
  pad: number;
}

export interface SpriteCache {
  cellSize: number;
  dpr: number;
  sprites: Map<number, PieceSprite>;
}

/**
 * Pre-renders every piece once onto an OffscreenCanvas (with HTMLCanvasElement fallback)
 * including Bezier clip mask, baked ambient shadow, bevel highlight, and die-cut border.
 * Runtime rendering only uses fast drawImage() blits with zero shadowBlur or clip().
 */
export function createSpriteCache(
  sourceImage: HTMLCanvasElement,
  pieces: PuzzlePiece[],
  cols: number,
  rows: number,
  cellSize: number,
  rawDpr: number
): SpriteCache {
  const dpr = Math.min(rawDpr || 1, 2);
  const pad = Math.ceil(cellSize * TAB_PAD_RATIO);
  const logicalSize = cellSize + pad * 2;
  const pixelSize = Math.max(1, Math.ceil(logicalSize * dpr));
  const boardW = cols * cellSize;
  const boardH = rows * cellSize;
  const center = logicalSize / 2;

  const sprites = new Map<number, PieceSprite>();

  for (const piece of pieces) {
    const path = buildCenteredPiecePath(piece.edges, cellSize);
    const imgX = -cellSize / 2 - piece.col * cellSize;
    const imgY = -cellSize / 2 - piece.row * cellSize;

    // 1. Flush sprite (no drop shadow — used once pieces lock onto the board)
    const flushCanvas = createOffscreenSurface(pixelSize, pixelSize);
    const fCtx = flushCanvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;

    if (fCtx) {
      fCtx.scale(dpr, dpr);
      fCtx.save();
      fCtx.translate(center, center);
      fCtx.clip(path);

      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      fCtx.drawImage(sourceImage, imgX, imgY, boardW, boardH);

      // Subtle inner highlight/bevel
      fCtx.lineWidth = Math.max(1.1, cellSize * 0.022);
      fCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      fCtx.save();
      fCtx.translate(0.8, 0.8);
      fCtx.stroke(path);
      fCtx.restore();

      fCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      fCtx.save();
      fCtx.translate(-0.7, -0.7);
      fCtx.stroke(path);
      fCtx.restore();

      fCtx.restore();

      fCtx.save();
      fCtx.translate(center, center);
      fCtx.lineWidth = 1;
      fCtx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
      fCtx.stroke(path);
      fCtx.restore();
    }

    // 2. Floating sprite (pre-bakes subtle symmetrical drop shadow once at generation time)
    const floatingCanvas = createOffscreenSurface(pixelSize, pixelSize);
    const mCtx = floatingCanvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;

    if (mCtx) {
      mCtx.scale(dpr, dpr);
      mCtx.save();
      mCtx.translate(center, center);

      // Pre-baked ambient shadow (symmetrical so piece rotation at 90/180/270 looks natural)
      mCtx.save();
      mCtx.shadowColor = 'rgba(0, 0, 0, 0.32)';
      mCtx.shadowBlur = Math.max(4, Math.min(8, cellSize * 0.09));
      mCtx.shadowOffsetX = 0;
      mCtx.shadowOffsetY = 0;
      mCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      mCtx.fill(path);
      mCtx.restore();

      mCtx.restore();

      // Blit the crisp flush sprite cleanly over the pre-baked shadow
      mCtx.drawImage(flushCanvas, 0, 0, logicalSize, logicalSize);
    }

    sprites.set(piece.id, {
      canvas: floatingCanvas,
      flushCanvas,
      path,
      logicalSize,
      pad,
    });
  }

  return {
    cellSize,
    dpr,
    sprites,
  };
}

/**
 * Renders a crisp jigsaw-shaped preview thumbnail for the bottom horizontal tray.
 * Capped at dpr <= 2 and avoids real-time shadowBlur for fast mobile rendering.
 */
export function renderTrayThumbnail(
  canvas: HTMLCanvasElement,
  sourceImage: HTMLCanvasElement,
  piece: PuzzlePiece,
  cols: number,
  rows: number,
  displaySize: number
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(displaySize * dpr);
  canvas.height = Math.round(displaySize * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, displaySize, displaySize);

  const cellSize = displaySize / (1 + TAB_PAD_RATIO * 2);
  const boardW = cols * cellSize;
  const boardH = rows * cellSize;
  const center = displaySize / 2;
  const path = buildCenteredPiecePath(piece.edges, cellSize);

  ctx.save();
  ctx.translate(center, center);

  // Lightweight offset silhouette shadow (no expensive shadowBlur)
  ctx.save();
  ctx.translate(0, 2);
  ctx.rotate((piece.rotation * Math.PI) / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fill(path);
  ctx.restore();

  ctx.rotate((piece.rotation * Math.PI) / 2);

  ctx.save();
  ctx.clip(path);
  const imgX = -cellSize / 2 - piece.col * cellSize;
  const imgY = -cellSize / 2 - piece.row * cellSize;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImage, imgX, imgY, boardW, boardH);

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.stroke(path);
  ctx.restore();

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
  ctx.stroke(path);

  ctx.restore();
}
