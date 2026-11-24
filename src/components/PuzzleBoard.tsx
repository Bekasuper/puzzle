import React, {useCallback, useEffect, useImperativeHandle, useRef} from 'react';
import {createSpriteCache, type SpriteCache} from '../engine/puzzleGeometry';
import {resolveClusterSnap, rotateClusterClockwise} from '../engine/puzzleLogic';
import type {PuzzlePiece, ThemeMode} from '../types/puzzle';
import {
  playBoardLockSound,
  playPickupSound,
  playRotateSound,
  playSnapSound,
  triggerHaptic,
} from '../utils/audio';

export interface PuzzleBoardHandle {
  startExternalDrag: (
    pieceId: number,
    clientX: number,
    clientY: number,
    pointerId: number
  ) => void;
  getBoardMetrics: () => {
    width: number;
    height: number;
    boardX: number;
    boardY: number;
    cellSize: number;
  };
  markDirty: () => void;
}

interface PuzzleBoardProps {
  sourceImage: HTMLCanvasElement;
  pieces: PuzzlePiece[];
  cols: number;
  rows: number;
  theme: ThemeMode;
  showHint: boolean;
  rotationEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  trayTopY: number;
  onPiecesChange: (updater: (prev: PuzzlePiece[]) => PuzzlePiece[]) => void;
  onReturnToTray: (pieceId: number) => void;
}

interface DragState {
  pointerId: number;
  pieceId: number;
  clusterId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  startTime: number;
  totalMove: number;
  isExternal: boolean;
}

export const PuzzleBoard = React.forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
  (
    {
      sourceImage,
      pieces,
      cols,
      rows,
      theme,
      showHint,
      rotationEnabled,
      soundEnabled,
      vibrationEnabled,
      trayTopY,
      onPiecesChange,
      onReturnToTray,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    const dragRef = useRef<DragState | null>(null);
    const piecesRef = useRef(pieces);
    // Avoid overwriting in-flight drag coordinates if parent re-renders (e.g., 1s timer tick)
    if (!dragRef.current) {
      piecesRef.current = pieces;
    }

    const propsRef = useRef({
      sourceImage,
      cols,
      rows,
      theme,
      showHint,
      rotationEnabled,
      soundEnabled,
      vibrationEnabled,
      trayTopY,
      onPiecesChange,
      onReturnToTray,
    });
    propsRef.current = {
      sourceImage,
      cols,
      rows,
      theme,
      showHint,
      rotationEnabled,
      soundEnabled,
      vibrationEnabled,
      trayTopY,
      onPiecesChange,
      onReturnToTray,
    };

    const metricsRef = useRef({
      width: 360,
      height: 480,
      dpr: 1,
      cellSize: 60,
      boardX: 40,
      boardY: 40,
      boardW: 240,
      boardH: 240,
    });

    const spriteCacheRef = useRef<SpriteCache | null>(null);
    const zOrderRef = useRef<number[]>([]);
    const rafIdRef = useRef<number>(0);
    const overTrayRef = useRef(false);

    const getCanvasContext = useCallback((): CanvasRenderingContext2D | null => {
      if (ctxRef.current) return ctxRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const ctx =
        canvas.getContext('2d', {alpha: false, desynchronized: true}) ??
        canvas.getContext('2d', {alpha: false}) ??
        canvas.getContext('2d');
      ctxRef.current = ctx;
      return ctx;
    }, []);

    const drawFrame = useCallback((now: number) => {
      rafIdRef.current = 0;

      const ctx = getCanvasContext();
      const cache = spriteCacheRef.current;
      if (!ctx || !cache) return;

      const {width, height, dpr, cellSize, boardX, boardY, boardW, boardH} =
        metricsRef.current;
      const {
        sourceImage: img,
        cols: curCols,
        rows: curRows,
        theme: curTheme,
        showHint: hint,
      } = propsRef.current;

      const isDark = curTheme === 'dark';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Opaque background fill required when using { alpha: false }
      ctx.fillStyle = isDark ? '#121417' : '#F4F3EF';
      ctx.fillRect(0, 0, width, height);

      // 1. Puzzle board recessed mat
      ctx.save();
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(24, 24, 27, 0.035)';
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(24, 24, 27, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(boardX - 1, boardY - 1, boardW + 2, boardH + 2, 6);
      ctx.fill();
      ctx.stroke();

      // Subtle grid guide lines inside the mat
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(24, 24, 27, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < curCols; c++) {
        const x = boardX + c * cellSize;
        ctx.moveTo(x, boardY);
        ctx.lineTo(x, boardY + boardH);
      }
      for (let r = 1; r < curRows; r++) {
        const y = boardY + r * cellSize;
        ctx.moveTo(boardX, y);
        ctx.lineTo(boardX + boardW, y);
      }
      ctx.stroke();

      // 2. Hint underlay image
      if (hint) {
        ctx.save();
        ctx.globalAlpha = isDark ? 0.24 : 0.28;
        ctx.beginPath();
        ctx.roundRect(boardX, boardY, boardW, boardH, 5);
        ctx.clip();
        ctx.drawImage(img, boardX, boardY, boardW, boardH);
        ctx.restore();
      }
      ctx.restore();

      // Partition board pieces into locked, unlocked idle, and active dragged
      const byId = new Map<number, PuzzlePiece>();
      const lockedList: PuzzlePiece[] = [];
      let hasActiveFlash = false;

      for (const p of piecesRef.current) {
        if (p.snapFlashUntil > now) {
          hasActiveFlash = true;
        }
        if (p.location !== 'board') continue;
        if (p.locked) {
          lockedList.push(p);
        } else {
          byId.set(p.id, p);
        }
      }

      const activeClusterId = dragRef.current ? dragRef.current.clusterId : -1;

      // 3. Draw locked pieces flush on board using shadow-free pre-rendered sprites
      for (const piece of lockedList) {
        const sprite = cache.sprites.get(piece.id);
        if (!sprite) continue;
        const cx = boardX + (piece.bx + 0.5) * cellSize;
        const cy = boardY + (piece.by + 0.5) * cellSize;
        const half = sprite.logicalSize / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.drawImage(
          sprite.flushCanvas,
          -half,
          -half,
          sprite.logicalSize,
          sprite.logicalSize
        );

        if (piece.snapFlashUntil > now) {
          const alpha = Math.max(0, (piece.snapFlashUntil - now) / 300) * 0.55;
          ctx.strokeStyle = `rgba(20, 184, 166, ${alpha})`;
          ctx.lineWidth = 3;
          ctx.stroke(sprite.path);
        }
        ctx.restore();
      }

      // 4. Draw unlocked pieces via fast drawImage() blits (zero shadowBlur!)
      const drawFloatingPiece = (piece: PuzzlePiece, isDragging: boolean) => {
        const sprite = cache.sprites.get(piece.id);
        if (!sprite) return;
        const cx = boardX + (piece.bx + 0.5) * cellSize;
        const cy = boardY + (piece.by + 0.5) * cellSize;
        const half = sprite.logicalSize / 2;

        ctx.save();
        ctx.translate(cx, cy);
        if (isDragging) {
          const scale = overTrayRef.current ? 0.88 : 1.035;
          ctx.scale(scale, scale);
        }
        if (piece.rotation !== 0) {
          ctx.rotate((piece.rotation * Math.PI) / 2);
        }

        ctx.drawImage(
          sprite.canvas,
          -half,
          -half,
          sprite.logicalSize,
          sprite.logicalSize
        );

        // Crisp lightweight active outline instead of expensive GPU shadowBlur
        if (isDragging) {
          ctx.strokeStyle = isDark
            ? 'rgba(94, 234, 212, 0.45)'
            : 'rgba(15, 118, 110, 0.45)';
          ctx.lineWidth = 1.6;
          ctx.stroke(sprite.path);
        }

        if (piece.snapFlashUntil > now) {
          const alpha = Math.max(0, (piece.snapFlashUntil - now) / 300) * 0.7;
          ctx.strokeStyle = `rgba(20, 184, 166, ${alpha})`;
          ctx.lineWidth = 3;
          ctx.stroke(sprite.path);
        }
        ctx.restore();
      };

      const draggedPieces: PuzzlePiece[] = [];
      for (const id of zOrderRef.current) {
        const piece = byId.get(id);
        if (!piece) continue;
        if (piece.clusterId === activeClusterId) {
          draggedPieces.push(piece);
        } else {
          drawFloatingPiece(piece, false);
        }
      }

      // 5. Draw active dragged cluster on top
      for (const piece of draggedPieces) {
        drawFloatingPiece(piece, true);
      }

      // 6. Subtle bottom drop-back indicator when dragging 1 piece near tray
      if (overTrayRef.current) {
        ctx.save();
        ctx.fillStyle = 'rgba(20, 184, 166, 0.14)';
        ctx.fillRect(0, height - 36, width, 36);
        ctx.fillStyle = isDark ? '#5EEAD4' : '#0F766E';
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Отпустите, чтобы вернуть в лоток', width / 2, height - 13);
        ctx.restore();
      }

      // Only continue scheduling frames while a snap flash animation is active
      if (hasActiveFlash) {
        rafIdRef.current = window.requestAnimationFrame(drawFrame);
      }
    }, [getCanvasContext]);

    const scheduleRender = useCallback(() => {
      if (rafIdRef.current === 0) {
        rafIdRef.current = window.requestAnimationFrame(drawFrame);
      }
    }, [drawFrame]);

    useEffect(() => {
      return () => {
        if (rafIdRef.current !== 0) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = 0;
        }
      };
    }, []);

    // Ensure zOrder includes all pieces and trigger single redraw when props update
    useEffect(() => {
      const existing = new Set(zOrderRef.current);
      for (const p of pieces) {
        if (!existing.has(p.id)) {
          zOrderRef.current.push(p.id);
        }
      }
      scheduleRender();
    }, [pieces, scheduleRender]);

    useEffect(() => {
      scheduleRender();
    }, [theme, showHint, sourceImage, cols, rows, scheduleRender]);

    const rebuildMetricsAndCache = useCallback(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const width = Math.max(200, Math.floor(rect.width));
      const height = Math.max(200, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctxRef.current = null;

      // Leave comfortable table margin around the puzzle frame for loose pieces
      const paddingFactor = width < 500 ? 0.84 : 0.76;
      const maxBoardW = width * paddingFactor;
      const maxBoardH = height * paddingFactor;
      const cellSize = Math.max(22, Math.floor(Math.min(maxBoardW / cols, maxBoardH / rows)));
      const boardW = cellSize * cols;
      const boardH = cellSize * rows;
      const boardX = Math.round((width - boardW) / 2);
      const boardY = Math.round((height - boardH) / 2);

      metricsRef.current = {
        width,
        height,
        dpr,
        cellSize,
        boardX,
        boardY,
        boardW,
        boardH,
      };

      spriteCacheRef.current = createSpriteCache(
        sourceImage,
        piecesRef.current,
        cols,
        rows,
        cellSize,
        dpr
      );
      scheduleRender();
    }, [sourceImage, cols, rows, scheduleRender]);

    useEffect(() => {
      rebuildMetricsAndCache();
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(() => {
        rebuildMetricsAndCache();
      });
      observer.observe(container);
      return () => observer.disconnect();
    }, [rebuildMetricsAndCache]);

    const bringClusterToFront = useCallback((clusterId: number) => {
      const clusterIds = new Set(
        piecesRef.current.filter((p) => p.clusterId === clusterId).map((p) => p.id)
      );
      zOrderRef.current = [
        ...zOrderRef.current.filter((id) => !clusterIds.has(id)),
        ...Array.from(clusterIds),
      ];
    }, []);

    // Move cluster directly inside piecesRef during drag to avoid 60Hz React reconciliation
    const moveClusterInRef = useCallback(
      (clusterId: number, dxPx: number, dyPx: number, clientY: number) => {
        const {cellSize, width, height, boardX, boardY} = metricsRef.current;
        const dxCells = dxPx / cellSize;
        const dyCells = dyPx / cellSize;

        let clusterCount = 0;
        for (const p of piecesRef.current) {
          if (p.clusterId === clusterId && p.location === 'board') {
            clusterCount++;
          }
        }
        overTrayRef.current =
          clusterCount === 1 && clientY >= propsRef.current.trayTopY - 6;

        piecesRef.current = piecesRef.current.map((p) => {
          if (p.clusterId !== clusterId) return p;
          const nextBx = p.bx + dxCells;
          const nextBy = p.by + dyCells;
          const pxX = boardX + (nextBx + 0.5) * cellSize;
          const pxY = boardY + (nextBy + 0.5) * cellSize;
          const clampedX = Math.max(12, Math.min(width - 12, pxX));
          const clampedY = Math.max(12, Math.min(height + 64, pxY));
          return {
            ...p,
            bx: (clampedX - boardX) / cellSize - 0.5,
            by: (clampedY - boardY) / cellSize - 0.5,
          };
        });
        scheduleRender();
      },
      [scheduleRender]
    );

    // Complete drag / snap / rotation logic shared between internal canvas drag & external tray pull
    const finishPointerInteraction = useCallback(
      (drag: DragState, clientY: number) => {
        const {
          cols: curCols,
          rows: curRows,
          rotationEnabled: rotEnabled,
          soundEnabled: snd,
          vibrationEnabled: vib,
          trayTopY: curTrayTop,
          onPiecesChange: setPieces,
          onReturnToTray: returnToTray,
        } = propsRef.current;
        const {cellSize} = metricsRef.current;

        overTrayRef.current = false;
        const currentSnapshot = piecesRef.current;

        // Tap without drag -> Rotate cluster 90° clockwise
        if (!drag.isExternal && drag.totalMove < 7 && performance.now() - drag.startTime < 320) {
          if (rotEnabled) {
            playRotateSound(snd);
            triggerHaptic(vib, 15);
            const rotated = rotateClusterClockwise(currentSnapshot, drag.pieceId);
            const target = rotated.find((p) => p.id === drag.pieceId);
            if (target) {
              const snapped = resolveClusterSnap(
                rotated,
                target.clusterId,
                curCols,
                curRows,
                cellSize
              );
              if (snapped.mergedNeighbors || snapped.lockedToBoard) {
                if (snapped.lockedToBoard) playBoardLockSound(snd);
                else playSnapSound(snd, snapped.mergedClusterSize);
                triggerHaptic(vib, 30);
              }
              piecesRef.current = snapped.pieces;
              setPieces(() => snapped.pieces);
            } else {
              piecesRef.current = rotated;
              setPieces(() => rotated);
            }
          }
          scheduleRender();
          return;
        }

        // Check if single unlocked piece was dropped back onto the tray area
        const clusterMembers = currentSnapshot.filter(
          (p) => p.clusterId === drag.clusterId && p.location === 'board'
        );
        if (
          clusterMembers.length === 1 &&
          !clusterMembers[0].locked &&
          clientY >= curTrayTop - 6
        ) {
          playPickupSound(snd);
          const pieceIdToReturn = clusterMembers[0].id;
          piecesRef.current = currentSnapshot.map((p) =>
            p.id === pieceIdToReturn
              ? {...p, location: 'tray', clusterId: p.id, locked: false}
              : p
          );
          returnToTray(pieceIdToReturn);
          scheduleRender();
          return;
        }

        // Resolve neighbor snapping & board locking and sync back to React state
        const outcome = resolveClusterSnap(
          currentSnapshot,
          drag.clusterId,
          curCols,
          curRows,
          cellSize
        );
        if (outcome.mergedNeighbors || outcome.lockedToBoard) {
          if (outcome.lockedToBoard && !outcome.mergedNeighbors) {
            playBoardLockSound(snd);
          } else {
            playSnapSound(snd, outcome.mergedClusterSize);
          }
          triggerHaptic(vib, 30);
        }
        piecesRef.current = outcome.pieces;
        setPieces(() => outcome.pieces);
        scheduleRender();
      },
      [scheduleRender]
    );

    // Expose imperative handoff for dragging straight out of the bottom tray
    useImperativeHandle(
      ref,
      () => ({
        startExternalDrag: (pieceId, clientX, clientY, pointerId) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const {boardX, boardY, cellSize} = metricsRef.current;
          const bx = (clientX - rect.left - boardX) / cellSize - 0.5;
          const by = (clientY - rect.top - boardY) / cellSize - 0.5;

          const piece = piecesRef.current.find((p) => p.id === pieceId);
          const clusterId = piece ? piece.clusterId : pieceId;

          const updated = piecesRef.current.map((p) =>
            p.id === pieceId ? {...p, location: 'board' as const, bx, by} : p
          );
          piecesRef.current = updated;
          propsRef.current.onPiecesChange(() => updated);

          bringClusterToFront(clusterId);
          playPickupSound(propsRef.current.soundEnabled);

          dragRef.current = {
            pointerId,
            pieceId,
            clusterId,
            startClientX: clientX,
            startClientY: clientY,
            lastClientX: clientX,
            lastClientY: clientY,
            startTime: performance.now(),
            totalMove: 20,
            isExternal: true,
          };

          const handleMove = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId || !dragRef.current) return;
            const dxPx = ev.clientX - dragRef.current.lastClientX;
            const dyPx = ev.clientY - dragRef.current.lastClientY;
            dragRef.current.lastClientX = ev.clientX;
            dragRef.current.lastClientY = ev.clientY;
            dragRef.current.totalMove += Math.hypot(dxPx, dyPx);
            moveClusterInRef(clusterId, dxPx, dyPx, ev.clientY);
          };

          const handleUp = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
            const active = dragRef.current;
            dragRef.current = null;
            if (active) {
              finishPointerInteraction(active, ev.clientY);
            }
          };

          window.addEventListener('pointermove', handleMove);
          window.addEventListener('pointerup', handleUp);
          window.addEventListener('pointercancel', handleUp);
          scheduleRender();
        },
        getBoardMetrics: () => {
          const {width, height, boardX, boardY, cellSize} = metricsRef.current;
          return {width, height, boardX, boardY, cellSize};
        },
        markDirty: () => {
          scheduleRender();
        },
      }),
      [bringClusterToFront, finishPointerInteraction, moveClusterInRef, scheduleRender]
    );

    // Hit test unlocked board pieces from top-most to bottom-most
    const hitTestPiece = (canvasX: number, canvasY: number): PuzzlePiece | null => {
      const ctx = getCanvasContext();
      const cache = spriteCacheRef.current;
      if (!ctx || !cache) return null;

      const {boardX, boardY, cellSize} = metricsRef.current;
      const byId = new Map<number, PuzzlePiece>();
      for (const p of piecesRef.current) {
        if (p.location === 'board' && !p.locked) {
          byId.set(p.id, p);
        }
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      for (let i = zOrderRef.current.length - 1; i >= 0; i--) {
        const piece = byId.get(zOrderRef.current[i]);
        if (!piece) continue;
        const sprite = cache.sprites.get(piece.id);
        if (!sprite) continue;

        const cx = boardX + (piece.bx + 0.5) * cellSize;
        const cy = boardY + (piece.by + 0.5) * cellSize;
        const dx = canvasX - cx;
        const dy = canvasY - cy;

        const maxR = sprite.logicalSize * 0.55;
        if (Math.abs(dx) > maxR || Math.abs(dy) > maxR) continue;

        const angle = -(piece.rotation * Math.PI) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;

        if (ctx.isPointInPath(sprite.path, lx, ly)) {
          ctx.restore();
          return piece;
        }
      }

      ctx.restore();
      return null;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (dragRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      const hit = hitTestPiece(canvasX, canvasY);
      if (!hit) return;

      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      bringClusterToFront(hit.clusterId);
      playPickupSound(propsRef.current.soundEnabled);

      dragRef.current = {
        pointerId: e.pointerId,
        pieceId: hit.id,
        clusterId: hit.clusterId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        startTime: performance.now(),
        totalMove: 0,
        isExternal: false,
      };
      scheduleRender();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || drag.isExternal) return;

      const dxPx = e.clientX - drag.lastClientX;
      const dyPx = e.clientY - drag.lastClientY;
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      drag.totalMove += Math.hypot(dxPx, dyPx);

      moveClusterInRef(drag.clusterId, dxPx, dyPx, e.clientY);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || drag.isExternal) return;

      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }

      dragRef.current = null;
      finishPointerInteraction(drag, e.clientY);
    };

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full select-none overflow-hidden"
        style={{touchAction: 'none'}}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="block h-full w-full cursor-grab active:cursor-grabbing"
          style={{touchAction: 'none'}}
        />
      </div>
    );
  }
);

PuzzleBoard.displayName = 'PuzzleBoard';
