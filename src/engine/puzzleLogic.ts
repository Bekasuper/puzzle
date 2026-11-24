import type {PuzzleEdge, PuzzlePiece, SavedPuzzleState, SerializedPiece} from '../types/puzzle';

function seededRand(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createInitialPieces(
  cols: number,
  rows: number,
  rotationEnabled: boolean,
  seed: string
): PuzzlePiece[] {
  const rand = seededRand(seed);

  // Pre-generate shared internal horizontal & vertical edge signs so neighbors interlock
  const rightEdges: PuzzleEdge[][] = Array.from({length: rows}, () =>
    Array.from({length: cols}, () => 0)
  );
  const bottomEdges: PuzzleEdge[][] = Array.from({length: rows}, () =>
    Array.from({length: cols}, () => 0)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) {
        rightEdges[r][c] = rand() > 0.5 ? 1 : -1;
      }
      if (r < rows - 1) {
        bottomEdges[r][c] = rand() > 0.5 ? 1 : -1;
      }
    }
  }

  const total = cols * rows;
  const orderIndices = Array.from({length: total}, (_, i) => i);
  for (let i = orderIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [orderIndices[i], orderIndices[j]] = [orderIndices[j], orderIndices[i]];
  }

  const pieces: PuzzlePiece[] = [];
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top: PuzzleEdge = r === 0 ? 0 : ((-bottomEdges[r - 1][c]) as PuzzleEdge);
      const right: PuzzleEdge = c === cols - 1 ? 0 : rightEdges[r][c];
      const bottom: PuzzleEdge = r === rows - 1 ? 0 : bottomEdges[r][c];
      const left: PuzzleEdge = c === 0 ? 0 : ((-rightEdges[r][c - 1]) as PuzzleEdge);

      const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const rotation = rotationEnabled ? (Math.floor(rand() * 4) as 0 | 1 | 2 | 3) : 0;

      pieces.push({
        id: idx,
        row: r,
        col: c,
        edges: {top, right, bottom, left},
        location: 'tray',
        bx: c,
        by: r,
        rotation,
        clusterId: idx,
        locked: false,
        isEdge,
        trayOrder: orderIndices[idx],
        snapFlashUntil: 0,
      });
      idx++;
    }
  }

  return pieces;
}

/**
 * Rotates a grid delta (dc, dr) clockwise by `rot` quarter-turns.
 */
function rotateDelta(dc: number, dr: number, rot: 0 | 1 | 2 | 3): [number, number] {
  switch (rot) {
    case 0:
      return [dc, dr];
    case 1:
      return [-dr, dc];
    case 2:
      return [-dc, -dr];
    case 3:
      return [dr, -dc];
  }
}

/**
 * Rotates an entire cluster 90 degrees clockwise around `pivotPieceId`.
 */
export function rotateClusterClockwise(
  pieces: PuzzlePiece[],
  pivotPieceId: number
): PuzzlePiece[] {
  const pivot = pieces.find((p) => p.id === pivotPieceId);
  if (!pivot || pivot.locked) return pieces;

  const targetCluster = pivot.clusterId;
  const cx = pivot.bx;
  const cy = pivot.by;

  return pieces.map((p) => {
    if (p.clusterId !== targetCluster) return p;
    const dx = p.bx - cx;
    const dy = p.by - cy;
    // 90° clockwise in screen coordinates (Y down): (dx, dy) -> (-dy, dx)
    return {
      ...p,
      bx: cx - dy,
      by: cy + dx,
      rotation: ((p.rotation + 1) % 4) as 0 | 1 | 2 | 3,
    };
  });
}

export interface SnapOutcome {
  pieces: PuzzlePiece[];
  mergedNeighbors: boolean;
  lockedToBoard: boolean;
  mergedClusterSize: number;
  completed: boolean;
}

/**
 * Checks if the released cluster aligns with any orthogonal board neighbors
 * or its exact board frame target slot, merging clusters and locking solved pieces.
 */
export function resolveClusterSnap(
  inputPieces: PuzzlePiece[],
  activeClusterId: number,
  cols: number,
  rows: number,
  cellSize: number
): SnapOutcome {
  const snapThresholdCells = Math.max(0.24, Math.min(0.42, 22 / Math.max(1, cellSize)));
  const now = performance.now();

  let pieces = inputPieces.map((p) => ({...p}));
  let currentClusterId = activeClusterId;
  let mergedNeighbors = false;
  let lockedToBoard = false;

  // Iteratively merge any touching neighbors (chain-reaction if bridging 2 clusters)
  let changed = true;
  while (changed) {
    changed = false;
    const clusterPieces = pieces.filter((p) => p.clusterId === currentClusterId && p.location === 'board');

    for (const p of clusterPieces) {
      const neighbors = pieces.filter(
        (other) =>
          other.location === 'board' &&
          other.clusterId !== currentClusterId &&
          Math.abs(other.row - p.row) + Math.abs(other.col - p.col) === 1
      );

      for (const n of neighbors) {
        if (n.rotation !== p.rotation) continue;

        const [expectedDx, expectedDy] = rotateDelta(
          n.col - p.col,
          n.row - p.row,
          p.rotation
        );
        const targetBx = n.bx - expectedDx;
        const targetBy = n.by - expectedDy;
        const dist = Math.hypot(p.bx - targetBx, p.by - targetBy);

        if (dist <= snapThresholdCells) {
          const shiftX = targetBx - p.bx;
          const shiftY = targetBy - p.by;
          const absorbedClusterId = n.clusterId;
          const absorbedLocked = pieces.some(
            (x) => x.clusterId === absorbedClusterId && x.locked
          );
          const selfLocked = pieces.some(
            (x) => x.clusterId === currentClusterId && x.locked
          );
          const becomeLocked = absorbedLocked || selfLocked;

          pieces = pieces.map((item) => {
            if (item.clusterId === currentClusterId) {
              return {
                ...item,
                bx: becomeLocked ? item.col : item.bx + shiftX,
                by: becomeLocked ? item.row : item.by + shiftY,
                clusterId: absorbedClusterId,
                locked: becomeLocked,
                snapFlashUntil: now + 260,
              };
            }
            if (item.clusterId === absorbedClusterId) {
              return {
                ...item,
                locked: becomeLocked,
                snapFlashUntil: now + 260,
              };
            }
            return item;
          });

          currentClusterId = absorbedClusterId;
          mergedNeighbors = true;
          if (becomeLocked) lockedToBoard = true;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  // Check if current cluster aligns with the board frame itself (only at rotation 0)
  const finalCluster = pieces.filter(
    (p) => p.clusterId === currentClusterId && p.location === 'board'
  );
  if (finalCluster.length > 0 && !finalCluster[0].locked && finalCluster[0].rotation === 0) {
    const anchor = finalCluster[0];
    const frameDist = Math.hypot(anchor.bx - anchor.col, anchor.by - anchor.row);
    if (frameDist <= snapThresholdCells) {
      pieces = pieces.map((item) =>
        item.clusterId === currentClusterId
          ? {
              ...item,
              bx: item.col,
              by: item.row,
              locked: true,
              snapFlashUntil: now + 300,
            }
          : item
      );
      lockedToBoard = true;
    }
  }

  // Auto-snap entire puzzle if all pieces are merged into a single rotation-0 cluster anywhere on the table
  const boardPieces = pieces.filter((p) => p.location === 'board');
  let completed = false;
  if (boardPieces.length === cols * rows) {
    const firstCluster = boardPieces[0].clusterId;
    const allSameCluster = boardPieces.every(
      (p) => p.clusterId === firstCluster && p.rotation === 0
    );
    if (allSameCluster) {
      pieces = pieces.map((p) => ({
        ...p,
        bx: p.col,
        by: p.row,
        locked: true,
        snapFlashUntil: now + 450,
      }));
      lockedToBoard = true;
      completed = true;
    }
  }

  const mergedClusterSize = pieces.filter((p) => p.clusterId === currentClusterId).length;

  return {
    pieces,
    mergedNeighbors,
    lockedToBoard,
    mergedClusterSize,
    completed,
  };
}

export function serializePieces(pieces: PuzzlePiece[]): SerializedPiece[] {
  return pieces.map((p) => ({
    id: p.id,
    row: p.row,
    col: p.col,
    edges: p.edges,
    location: p.location,
    bx: p.bx,
    by: p.by,
    rotation: p.rotation,
    clusterId: p.clusterId,
    locked: p.locked,
    trayOrder: p.trayOrder,
  }));
}

export function hydratePieces(saved: SerializedPiece[], cols: number, rows: number): PuzzlePiece[] {
  return saved.map((s) => ({
    ...s,
    isEdge: s.row === 0 || s.row === rows - 1 || s.col === 0 || s.col === cols - 1,
    snapFlashUntil: 0,
  }));
}

const STORAGE_GAME_KEY = 'jigsaw_infinite_save_v1';
const STORAGE_SETTINGS_KEY = 'jigsaw_infinite_settings_v1';

export function saveGameToStorage(state: SavedPuzzleState): void {
  try {
    localStorage.setItem(STORAGE_GAME_KEY, JSON.stringify(state));
  } catch {
    // Handle quota exceeded gracefully (fallback: store without large dataUrl)
    try {
      const compact: SavedPuzzleState = {
        ...state,
        imageDataUrl: '',
      };
      localStorage.setItem(STORAGE_GAME_KEY, JSON.stringify(compact));
    } catch {
      // Ignore
    }
  }
}

export function loadGameFromStorage(): SavedPuzzleState | null {
  try {
    const raw = localStorage.getItem(STORAGE_GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPuzzleState;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.pieces)) {
      return parsed;
    }
  } catch {
    // Ignore corrupted storage
  }
  return null;
}

export function saveSettingsToStorage<T>(settings: T): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export function loadSettingsFromStorage<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return fallback;
    return {...fallback, ...JSON.parse(raw)};
  } catch {
    return fallback;
  }
}
