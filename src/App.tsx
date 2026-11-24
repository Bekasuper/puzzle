import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Eye,
  EyeOff,
  Frame,
  ImagePlus,
  Loader2,
  Moon,
  RefreshCw,
  Shuffle,
  SlidersHorizontal,
  Sun,
  WifiOff,
} from 'lucide-react';
import {PuzzleBoard, type PuzzleBoardHandle} from './components/PuzzleBoard';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SettingsModal} from './components/SettingsModal';
import {TrayItem} from './components/TrayItem';
import {VictoryModal} from './components/VictoryModal';
import {
  createInitialPieces,
  hydratePieces,
  loadGameFromStorage,
  loadSettingsFromStorage,
  saveGameToStorage,
  saveSettingsToStorage,
  serializePieces,
} from './engine/puzzleLogic';
import type {AppSettings, ImageSourceKind, PuzzlePiece} from './types/puzzle';
import {playPickupSound, playVictorySound, triggerHaptic} from './utils/audio';
import {
  generateProceduralCanvas,
  getLevelConfig,
  loadLevelPuzzleImage,
  loadUploadedPuzzleImage,
  restoreImageFromDataUrl,
} from './utils/imageGenerator';

const DEFAULT_SETTINGS: AppSettings = {
  theme:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  soundEnabled: true,
  vibrationEnabled: true,
  rotationMode: 'auto',
};

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadSettingsFromStorage(DEFAULT_SETTINGS)
  );
  const [level, setLevel] = useState(1);
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [sourceKind, setSourceKind] = useState<ImageSourceKind>('picsum');
  const [imageSeed, setImageSeed] = useState('level-1');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [sourceImage, setSourceImage] = useState<HTMLCanvasElement | null>(null);
  const [pieces, setPieces] = useState<PuzzlePiece[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completed, setCompleted] = useState(false);

  const [loading, setLoading] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [edgesOnly, setEdgesOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const boardRef = useRef<PuzzleBoardHandle | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [trayTopY, setTrayTopY] = useState<number>(600);
  const victoryTriggeredRef = useRef(false);

  // Sync dark mode class & theme-color meta
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        settings.theme === 'dark' ? '#121417' : '#0F766E'
      );
    }
    saveSettingsToStorage(settings);
  }, [settings]);

  // Track online/offline connectivity
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Measure tray top coordinate for drag-to-return-to-tray detection
  useEffect(() => {
    const updateTrayTop = () => {
      if (trayRef.current) {
        setTrayTopY(trayRef.current.getBoundingClientRect().top);
      }
    };
    updateTrayTop();
    window.addEventListener('resize', updateTrayTop);
    return () => window.removeEventListener('resize', updateTrayTop);
  }, [loading]);

  const startNewLevel = useCallback(
    async (
      targetLevel: number,
      opts?: {
        customGrid?: number;
        forceProcedural?: boolean;
        customSeed?: string;
        rotMode?: AppSettings['rotationMode'];
      }
    ) => {
      setLoading(true);
      setCompleted(false);
      setShowHint(false);
      setEdgesOnly(false);
      victoryTriggeredRef.current = false;

      const rotMode = opts?.rotMode ?? settings.rotationMode;
      const cfg = getLevelConfig(targetLevel, rotMode);
      const nextCols = opts?.customGrid ?? cfg.cols;
      const nextRows = opts?.customGrid ?? cfg.rows;
      const nextSeed =
        opts?.customSeed ?? `puzzle-lv${targetLevel}-${Date.now().toString(36)}`;

      const loaded = await loadLevelPuzzleImage(
        nextSeed,
        nextCols,
        nextRows,
        Boolean(opts?.forceProcedural)
      );

      const newPieces = createInitialPieces(
        loaded.cols,
        loaded.rows,
        cfg.rotationEnabled,
        nextSeed
      );

      setLevel(cfg.level);
      setCols(loaded.cols);
      setRows(loaded.rows);
      setRotationEnabled(cfg.rotationEnabled);
      setSourceKind(loaded.sourceKind);
      setImageSeed(nextSeed);
      setImageDataUrl(loaded.dataUrl);
      setSourceImage(loaded.canvas);
      setPieces(newPieces);
      setElapsedSeconds(0);
      setLoading(false);
    },
    [settings.rotationMode]
  );

  // Initial boot: restore saved game from localStorage or launch Level 1
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const saved = loadGameFromStorage();
      if (saved && saved.pieces.length > 0) {
        try {
          let canvas: HTMLCanvasElement;
          if (saved.imageDataUrl) {
            canvas = await restoreImageFromDataUrl(saved.imageDataUrl);
          } else {
            canvas = generateProceduralCanvas(
              saved.imageSeed,
              saved.cols,
              saved.rows,
              960
            );
          }
          if (cancelled) return;
          setLevel(saved.level);
          setCols(saved.cols);
          setRows(saved.rows);
          setRotationEnabled(saved.rotationEnabled);
          setSourceKind(saved.sourceKind);
          setImageSeed(saved.imageSeed);
          setImageDataUrl(saved.imageDataUrl || canvas.toDataURL('image/jpeg', 0.86));
          setSourceImage(canvas);
          setPieces(hydratePieces(saved.pieces, saved.cols, saved.rows));
          setElapsedSeconds(saved.elapsedSeconds || 0);
          setCompleted(Boolean(saved.completed));
          victoryTriggeredRef.current = Boolean(saved.completed);
          setLoading(false);
          return;
        } catch {
          // Fall back to fresh level 1
        }
      }

      if (!cancelled) {
        await startNewLevel(1);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed timer tick while playing
  useEffect(() => {
    if (loading || completed) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading, completed]);

  // Deterministic completion detection
  useEffect(() => {
    if (
      !loading &&
      !completed &&
      pieces.length > 0 &&
      pieces.every((p) => p.location === 'board' && p.locked)
    ) {
      setCompleted(true);
      if (!victoryTriggeredRef.current) {
        victoryTriggeredRef.current = true;
        playVictorySound(settings.soundEnabled);
        triggerHaptic(settings.vibrationEnabled, 60);
      }
    }
  }, [pieces, loading, completed, settings.soundEnabled, settings.vibrationEnabled]);

  // Auto-save to localStorage
  useEffect(() => {
    if (loading || pieces.length === 0) return;
    saveGameToStorage({
      version: 1,
      level,
      cols,
      rows,
      rotationEnabled,
      sourceKind,
      imageSeed,
      imageDataUrl,
      elapsedSeconds,
      completed,
      pieces: serializePieces(pieces),
    });
  }, [
    loading,
    level,
    cols,
    rows,
    rotationEnabled,
    sourceKind,
    imageSeed,
    imageDataUrl,
    elapsedSeconds,
    completed,
    pieces,
  ]);

  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = {...prev, ...patch};
      if (patch.rotationMode !== undefined) {
        const cfg = getLevelConfig(level, patch.rotationMode);
        setRotationEnabled(cfg.rotationEnabled);
        if (!cfg.rotationEnabled) {
          // Reset piece rotations cleanly to 0° if turned off
          setPieces((ps) => ps.map((p) => ({...p, rotation: 0})));
        }
      }
      return next;
    });
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLoading(true);
    setCompleted(false);
    setShowHint(false);
    setEdgesOnly(false);
    victoryTriggeredRef.current = false;

    try {
      const cfg = getLevelConfig(level, settings.rotationMode);
      const loaded = await loadUploadedPuzzleImage(file, cols, rows);
      const seed = `upload-${Date.now().toString(36)}`;
      const newPieces = createInitialPieces(
        loaded.cols,
        loaded.rows,
        cfg.rotationEnabled,
        seed
      );

      setCols(loaded.cols);
      setRows(loaded.rows);
      setRotationEnabled(cfg.rotationEnabled);
      setSourceKind('upload');
      setImageSeed(seed);
      setImageDataUrl(loaded.dataUrl);
      setSourceImage(loaded.canvas);
      setPieces(newPieces);
      setElapsedSeconds(0);
    } finally {
      setLoading(false);
    }
  };

  const handleShuffle = () => {
    const metrics = boardRef.current?.getBoardMetrics();
    const {width = 360, height = 400, boardX = 40, boardY = 40, cellSize = 60} =
      metrics ?? {};

    playPickupSound(settings.soundEnabled);
    triggerHaptic(settings.vibrationEnabled, 15);

    setPieces((prev) => {
      const trayPieces = prev.filter((p) => p.location === 'tray');
      const orders = trayPieces.map((_, idx) => idx);
      for (let i = orders.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orders[i], orders[j]] = [orders[j], orders[i]];
      }
      let trayCursor = 0;

      // Also scatter single unlocked pieces on the board neatly in outer margin
      return prev.map((p) => {
        if (p.location === 'tray') {
          const nextOrder = orders[trayCursor++] ?? p.trayOrder;
          return {...p, trayOrder: nextOrder};
        }
        if (!p.locked) {
          const isSingle =
            prev.filter((o) => o.clusterId === p.clusterId && o.location === 'board')
              .length === 1;
          if (isSingle) {
            const margin = Math.max(24, cellSize * 0.55);
            const rx = margin + Math.random() * Math.max(40, width - margin * 2);
            const ry = margin + Math.random() * Math.max(40, height - margin * 2);
            return {
              ...p,
              bx: (rx - boardX) / cellSize - 0.5,
              by: (ry - boardY) / cellSize - 0.5,
            };
          }
        }
        return p;
      });
    });
    boardRef.current?.markDirty();
  };

  const handlePullOutToBoard = useCallback(
    (pieceId: number, clientX: number, clientY: number, pointerId: number) => {
      boardRef.current?.startExternalDrag(pieceId, clientX, clientY, pointerId);
    },
    []
  );

  const handleQuickPlace = useCallback(
    (pieceId: number) => {
      const metrics = boardRef.current?.getBoardMetrics();
      if (!metrics) return;
      const {width, height, boardX, boardY, cellSize} = metrics;

      playPickupSound(settings.soundEnabled);
      triggerHaptic(settings.vibrationEnabled, 12);

      // Place cleanly in the upper or side work margin with slight jitter
      const jitterX = (Math.random() - 0.5) * Math.min(120, width * 0.35);
      const jitterY = (Math.random() - 0.5) * Math.min(80, height * 0.2);
      const targetPxX = width * 0.5 + jitterX;
      const targetPxY = Math.max(cellSize * 0.65, height * 0.25 + jitterY);

      const bx = (targetPxX - boardX) / cellSize - 0.5;
      const by = (targetPxY - boardY) / cellSize - 0.5;

      setPieces((prev) =>
        prev.map((p) => (p.id === pieceId ? {...p, location: 'board', bx, by} : p))
      );
      boardRef.current?.markDirty();
    },
    [settings.soundEnabled, settings.vibrationEnabled]
  );

  const handleReturnToTray = useCallback((pieceId: number) => {
    setPieces((prev) =>
      prev.map((p) =>
        p.id === pieceId
          ? {
              ...p,
              location: 'tray',
              clusterId: p.id,
              locked: false,
            }
          : p
      )
    );
  }, []);

  const handleReplay = () => {
    setCompleted(false);
    victoryTriggeredRef.current = false;
    setPieces(createInitialPieces(cols, rows, rotationEnabled, `${imageSeed}-r-${Date.now()}`));
    setElapsedSeconds(0);
    setEdgesOnly(false);
    setShowHint(false);
  };

  const trayPieces = useMemo(() => {
    return pieces
      .filter((p) => p.location === 'tray' && (!edgesOnly || p.isEdge))
      .sort((a, b) => a.trayOrder - b.trayOrder);
  }, [pieces, edgesOnly]);

  const totalCount = cols * rows;
  const lockedCount = useMemo(
    () => pieces.filter((p) => p.location === 'board' && p.locked).length,
    [pieces]
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F4F3EF] text-stone-900 select-none dark:bg-[#121417] dark:text-zinc-100">
      {/* Hidden file input for Source 2: custom photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadFile}
        className="hidden"
      />

      {/* Compact Top Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-stone-200/90 bg-white/85 px-3 backdrop-blur-md sm:px-5 dark:border-zinc-800 dark:bg-zinc-900/85">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="text-base font-bold tracking-tight whitespace-nowrap shrink-0 text-stone-900 dark:text-zinc-100">
            Пазлы
          </h1>
          <div className="font-mono-tabular flex items-center gap-1.5 truncate text-xs text-stone-500 dark:text-zinc-400">
            <span className="font-semibold text-teal-700 dark:text-teal-400">
              Ур. {level}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {cols}×{rows}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {lockedCount}/{totalCount}
            </span>
            <span className="hidden xs:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden xs:inline">{formatTimer(elapsedSeconds)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isOnline && (
            <span
              title="Офлайн-режим: используется процедурная генерация"
              className="flex h-9 items-center gap-1 px-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Офлайн</span>
            </span>
          )}

          <PWAInstallButton />

          <button
            type="button"
            onClick={() => void startNewLevel(level)}
            aria-label="Другая картинка"
            title="Загрузить новую картинку"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={() =>
              handleUpdateSettings({
                theme: settings.theme === 'dark' ? 'light' : 'dark',
              })
            }
            aria-label={
              settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'
            }
            title={settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {settings.theme === 'dark' ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки"
            title="Настройки"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* Main Play Canvas Stage */}
      <main className="relative min-h-0 flex-1">
        {sourceImage && !loading ? (
          <>
            <PuzzleBoard
              ref={boardRef}
              sourceImage={sourceImage}
              pieces={pieces}
              cols={cols}
              rows={rows}
              theme={settings.theme}
              showHint={showHint}
              rotationEnabled={rotationEnabled}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.vibrationEnabled}
              trayTopY={trayTopY}
              onPiecesChange={setPieces}
              onReturnToTray={handleReturnToTray}
            />
            {rotationEnabled && !completed && (
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 text-[11px] font-medium text-stone-500/85 whitespace-nowrap dark:text-zinc-400/80">
                Тап по детали поворачивает на 90°
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 text-sm text-stone-500 dark:text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-teal-700 dark:text-teal-400" />
            <span>Подготовка пазла...</span>
          </div>
        )}
      </main>

      {/* Bottom Controls & Horizontal Tray */}
      <footer className="shrink-0 border-t border-stone-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        {/* Action Bar */}
        <div className="grid grid-cols-4 border-b border-stone-200/70 dark:border-zinc-800/80">
          <button
            type="button"
            onClick={() => setShowHint((v) => !v)}
            aria-pressed={showHint}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              showHint
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                : 'text-stone-700 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            {showHint ? (
              <Eye className="h-4 w-4 shrink-0" />
            ) : (
              <EyeOff className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">Подсказка</span>
          </button>

          <button
            type="button"
            onClick={() => setEdgesOnly((v) => !v)}
            aria-pressed={edgesOnly}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 border-l border-stone-200/70 px-2 text-xs font-semibold transition-colors whitespace-nowrap dark:border-zinc-800/80 ${
              edgesOnly
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                : 'text-stone-700 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <Frame className="h-4 w-4 shrink-0" />
            <span className="truncate">Только края</span>
          </button>

          <button
            type="button"
            onClick={handleShuffle}
            className="flex min-h-[44px] items-center justify-center gap-1.5 border-l border-stone-200/70 px-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 active:bg-stone-200/60 whitespace-nowrap dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Shuffle className="h-4 w-4 shrink-0" />
            <span className="truncate">Перемешать</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[44px] items-center justify-center gap-1.5 border-l border-stone-200/70 px-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 active:bg-stone-200/60 whitespace-nowrap dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ImagePlus className="h-4 w-4 shrink-0" />
            <span className="truncate">Своё фото</span>
          </button>
        </div>

        {/* Horizontally Scrollable Tray */}
        <div
          ref={trayRef}
          className="no-scrollbar flex h-[86px] w-full snap-x items-center gap-2 overflow-x-auto px-3 py-1.5"
          style={{
            touchAction: 'pan-x',
            paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
          }}
        >
          {sourceImage && trayPieces.length > 0 ? (
            trayPieces.map((piece) => (
              <TrayItem
                key={piece.id}
                piece={piece}
                sourceImage={sourceImage}
                cols={cols}
                rows={rows}
                onPullOutToBoard={handlePullOutToBoard}
                onQuickPlace={handleQuickPlace}
              />
            ))
          ) : (
            <div className="flex w-full items-center justify-center text-xs text-stone-500 dark:text-zinc-400">
              {edgesOnly
                ? 'Все краевые детали уже на столе'
                : 'Все детали перемещены на стол'}
            </div>
          )}
        </div>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        currentGrid={{cols, rows}}
        onStartCustomGrid={(size) => void startNewLevel(level, {customGrid: size})}
        onGenerateProceduralLevel={() =>
          void startNewLevel(level, {
            customGrid: cols,
            forceProcedural: true,
          })
        }
      />

      <VictoryModal
        open={completed}
        level={level}
        cols={cols}
        rows={rows}
        elapsedSeconds={elapsedSeconds}
        imageDataUrl={imageDataUrl}
        onNextLevel={() => void startNewLevel(level + 1)}
        onReplay={handleReplay}
      />
    </div>
  );
}
