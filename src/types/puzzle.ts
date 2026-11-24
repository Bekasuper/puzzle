export type ThemeMode = 'light' | 'dark';

export type ImageSourceKind = 'picsum' | 'upload' | 'procedural';

export type RotationMode = 'auto' | 'always' | 'off';

export type PuzzleEdge = -1 | 0 | 1;

export interface PieceEdges {
  top: PuzzleEdge;
  right: PuzzleEdge;
  bottom: PuzzleEdge;
  left: PuzzleEdge;
}

export interface PuzzlePiece {
  id: number;
  row: number;
  col: number;
  edges: PieceEdges;
  location: 'tray' | 'board';
  /** Horizontal offset in cell-size units relative to board top-left */
  bx: number;
  /** Vertical offset in cell-size units relative to board top-left */
  by: number;
  /** Quarter-turns clockwise: 0, 1, 2, 3 */
  rotation: 0 | 1 | 2 | 3;
  clusterId: number;
  locked: boolean;
  isEdge: boolean;
  trayOrder: number;
  snapFlashUntil: number;
}

export interface AppSettings {
  theme: ThemeMode;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  rotationMode: RotationMode;
}

export interface SerializedPiece {
  id: number;
  row: number;
  col: number;
  edges: PieceEdges;
  location: 'tray' | 'board';
  bx: number;
  by: number;
  rotation: 0 | 1 | 2 | 3;
  clusterId: number;
  locked: boolean;
  trayOrder: number;
}

export interface SavedPuzzleState {
  version: 1;
  level: number;
  cols: number;
  rows: number;
  rotationEnabled: boolean;
  sourceKind: ImageSourceKind;
  imageSeed: string;
  imageDataUrl: string;
  elapsedSeconds: number;
  completed: boolean;
  pieces: SerializedPiece[];
}

export interface LevelConfig {
  level: number;
  cols: number;
  rows: number;
  rotationEnabled: boolean;
}
