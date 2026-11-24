import React from 'react';
import {RotateCw, Smartphone, Sparkles, Volume2, VolumeX, X} from 'lucide-react';
import type {AppSettings, RotationMode} from '../types/puzzle';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  currentGrid: {cols: number; rows: number};
  onStartCustomGrid: (size: number) => void;
  onGenerateProceduralLevel: () => void;
}

const GRID_PRESETS = [3, 4, 5, 6, 8, 10, 12];

const ROTATION_LABELS: {value: RotationMode; label: string}[] = [
  {value: 'auto', label: 'С 4 ур.'},
  {value: 'always', label: 'Всегда'},
  {value: 'off', label: 'Выкл'},
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  settings,
  onUpdateSettings,
  currentGrid,
  onStartCustomGrid,
  onGenerateProceduralLevel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-stone-200 bg-white p-5 pb-7 shadow-2xl sm:rounded-2xl sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300 sm:hidden dark:bg-zinc-700" />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-stone-900 dark:text-zinc-100">
            Настройки игры
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {/* Sound & Vibration */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onUpdateSettings({soundEnabled: !settings.soundEnabled})}
              className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                settings.soundEnabled
                  ? 'border-teal-600/40 bg-teal-50 text-teal-900 dark:border-teal-500/40 dark:bg-teal-950/50 dark:text-teal-200'
                  : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400'
              }`}
            >
              <span className="flex items-center gap-2">
                {settings.soundEnabled ? (
                  <Volume2 className="h-4 w-4 shrink-0" />
                ) : (
                  <VolumeX className="h-4 w-4 shrink-0" />
                )}
                Звук
              </span>
              <span className="font-mono-tabular text-xs">
                {settings.soundEnabled ? 'Вкл' : 'Выкл'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({vibrationEnabled: !settings.vibrationEnabled})
              }
              className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                settings.vibrationEnabled
                  ? 'border-teal-600/40 bg-teal-50 text-teal-900 dark:border-teal-500/40 dark:bg-teal-950/50 dark:text-teal-200'
                  : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 shrink-0" />
                Вибро
              </span>
              <span className="font-mono-tabular text-xs">
                {settings.vibrationEnabled ? 'Вкл' : 'Выкл'}
              </span>
            </button>
          </div>

          {/* Rotation Mode */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-zinc-400">
              <RotateCw className="h-3.5 w-3.5" />
              <span>Поворот деталей на 90° (тапом)</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-stone-100 p-1 dark:bg-zinc-800">
              {ROTATION_LABELS.map((opt) => {
                const active = settings.rotationMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateSettings({rotationMode: opt.value})}
                    className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white text-stone-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                        : 'text-stone-600 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Grid Size Selector */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-stone-600 dark:text-zinc-400">
              <span>Своя сложность сетки</span>
              <span className="font-mono-tabular">
                Сейчас: {currentGrid.cols}×{currentGrid.rows}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {GRID_PRESETS.map((size) => {
                const active = currentGrid.cols === size && currentGrid.rows === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      onStartCustomGrid(size);
                      onClose();
                    }}
                    className={`flex min-h-[44px] items-center justify-center rounded-lg border font-mono-tabular text-xs font-semibold transition-colors ${
                      active
                        ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600'
                        : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {size}×{size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Procedural Canvas Art Button */}
          <div className="border-t border-stone-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                onGenerateProceduralLevel();
                onClose();
              }}
              className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <span>Создать абстрактный арт-пазл (офлайн)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
