import React from 'react';
import {ArrowRight, RotateCcw, Trophy} from 'lucide-react';

interface VictoryModalProps {
  open: boolean;
  level: number;
  cols: number;
  rows: number;
  elapsedSeconds: number;
  imageDataUrl: string;
  onNextLevel: () => void;
  onReplay: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  open,
  level,
  cols,
  rows,
  elapsedSeconds,
  imageDataUrl,
  onNextLevel,
  onReplay,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-stone-900 dark:text-zinc-100">
              Пазл собран
            </h2>
            <div className="font-mono-tabular flex items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
              <span>Уровень {level}</span>
              <span aria-hidden="true">·</span>
              <span>
                {cols}×{rows} ({cols * rows} дет.)
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {imageDataUrl && (
          <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-zinc-800 dark:bg-zinc-800">
            <img
              src={imageDataUrl}
              alt={`Собранный пазл уровня ${level}`}
              referrerPolicy="no-referrer"
              className="aspect-square w-full object-cover"
            />
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onNextLevel}
            className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            <span>Уровень {level + 1}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>

          <button
            type="button"
            onClick={onReplay}
            className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50 active:scale-[0.98] whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span>Ещё раз</span>
          </button>
        </div>
      </div>
    </div>
  );
};
