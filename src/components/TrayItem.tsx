import React, {useEffect, useRef} from 'react';
import {renderTrayThumbnail} from '../engine/puzzleGeometry';
import type {PuzzlePiece} from '../types/puzzle';

interface TrayItemProps {
  piece: PuzzlePiece;
  sourceImage: HTMLCanvasElement;
  cols: number;
  rows: number;
  onPullOutToBoard: (
    pieceId: number,
    clientX: number,
    clientY: number,
    pointerId: number
  ) => void;
  onQuickPlace: (pieceId: number) => void;
}

const THUMB_SIZE = 66;

export const TrayItem: React.FC<TrayItemProps> = React.memo(
  ({piece, sourceImage, cols, rows, onPullOutToBoard, onQuickPlace}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      renderTrayThumbnail(canvas, sourceImage, piece, cols, rows, THUMB_SIZE);
    }, [sourceImage, piece.id, piece.rotation, cols, rows, piece]);

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;
      let resolved = false;

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || resolved) return;
        const dx = ev.clientX - startX;
        const dy = startY - ev.clientY; // positive = dragging upward

        // Horizontal swipe -> yield to tray scroll
        if (Math.abs(dx) > 12 && Math.abs(dx) > dy * 1.2) {
          resolved = true;
          cleanup();
          return;
        }

        // Upward drag -> pull piece onto board canvas
        if (dy > 14) {
          resolved = true;
          cleanup();
          onPullOutToBoard(piece.id, ev.clientX, ev.clientY, pointerId);
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || resolved) return;
        resolved = true;
        cleanup();
        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (dist < 10) {
          onQuickPlace(piece.id);
        }
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        resolved = true;
        cleanup();
      };

      window.addEventListener('pointermove', onMove, {passive: true});
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        aria-label={`Деталь ${piece.row + 1}-${piece.col + 1}${piece.isEdge ? ' (край)' : ''}`}
        className="group relative flex h-[74px] w-[74px] shrink-0 snap-start items-center justify-center rounded-xl transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-teal-600"
        style={{touchAction: 'pan-x'}}
      >
        <canvas
          ref={canvasRef}
          style={{width: THUMB_SIZE, height: THUMB_SIZE}}
          className="pointer-events-none block"
        />
      </button>
    );
  }
);

TrayItem.displayName = 'TrayItem';
