import React, {useState} from 'react';
import {Download, Share, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Установить приложение"
        title="Установить как приложение"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] whitespace-nowrap shrink-0 dark:bg-teal-600 dark:hover:bg-teal-500"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Установить</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Установить на экран Домой"
          title="Установить на iPhone / iPad"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-800 transition-colors hover:bg-stone-100 whitespace-nowrap shrink-0 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">На экран</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                  Установка на iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Закрыть"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-stone-600 dark:text-zinc-300">
                <li className="flex items-start gap-2">
                  <span className="font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                    1.
                  </span>
                  <span>
                    Нажмите кнопку <Share className="inline h-4 w-4 align-text-bottom" />{' '}
                    <strong>Поделиться</strong> в нижней панели Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                    2.
                  </span>
                  <span>
                    Выберите <strong>«На экран Домой»</strong> и подтвердите добавление.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-teal-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
