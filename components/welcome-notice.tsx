'use client';

/**
 * Fork: NIE welcome and data-handling notice, shown on the classic home page
 * and on the Pro workspace home. The middle block offers a switch to the other
 * mode (Enter Pro Mode / Back to Classic Mode).
 *
 * The notice can be minimised to a single line (title + mode switch). The
 * choice is a per-browser convenience kept in localStorage and shared by both
 * homes, so minimising it in one mode keeps it minimised in the other.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';

interface ModeSwitch {
  /** 'enter' = classic home offering Pro; 'back' = Pro offering classic. */
  direction: 'enter' | 'back';
  onClick: () => void;
}

const MINIMISED_KEY = 'openmaic:welcome-notice-minimised';

function readMinimised(): boolean {
  try {
    return window.localStorage.getItem(MINIMISED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMinimised(value: boolean) {
  try {
    if (value) window.localStorage.setItem(MINIMISED_KEY, '1');
    else window.localStorage.removeItem(MINIMISED_KEY);
  } catch {
    // Storage blocked (private window etc.): the toggle still works for this visit.
  }
}

export function WelcomeNotice({
  modeSwitch,
  className,
}: {
  /** Omit to hide the switch (e.g. Pro mode is not available). */
  modeSwitch?: ModeSwitch;
  className?: string;
}) {
  const { t } = useI18n();
  const back = modeSwitch?.direction === 'back';
  // Start expanded so server and first client render match; apply the stored
  // choice after mount.
  const [minimised, setMinimised] = useState(false);
  useEffect(() => {
    setMinimised(readMinimised());
  }, []);

  const toggle = () => {
    setMinimised((prev) => {
      writeMinimised(!prev);
      return !prev;
    });
  };

  const switchButton = modeSwitch && (
    <button
      type="button"
      onClick={modeSwitch.onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-600 font-medium text-white shadow-sm transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400',
        minimised ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
      )}
    >
      {back && <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />}
      {t(back ? 'home.welcome.backToClassic' : 'home.welcome.enterPro')}
      {!back && <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />}
    </button>
  );

  return (
    <div
      role="note"
      // Fork: named for the Pro <-> classic swap, which flips this card over
      // the same way it flips the composer (see components/workbench/pro-swap.css).
      data-pro-morph="notice"
      className={cn(
        'w-full max-w-[800px] rounded-xl border border-sky-200/70 bg-sky-50/80 text-start text-sm text-sky-900 shadow-sm dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-100',
        minimised ? 'px-3 py-2' : 'px-4 py-3',
        className,
      )}
    >
      {minimised ? (
        <div className="flex items-center gap-3">
          <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="min-w-0 flex-1 truncate font-medium">{t('home.welcome.title')}</p>
          {switchButton}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={false}
            aria-label={t('home.welcome.expand')}
            title={t('home.welcome.expand')}
            className="shrink-0 rounded-md p-1 text-sky-700 transition-colors hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/60"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="min-w-0 flex-1 space-y-4">
            <p className="font-medium">{t('home.welcome.title')}</p>
            <p className="text-sky-900/80 dark:text-sky-100/80">
              {t('home.welcome.environment')}
            </p>
            <p className="text-sky-900/80 dark:text-sky-100/80">
              {t('home.welcome.supportPrefix')}{' '}
              <a
                href="mailto:ai@nie.edu.sg"
                className="font-medium underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300"
              >
                ai@nie.edu.sg
              </a>
              {t('home.welcome.supportSuffix')}
            </p>
            {modeSwitch && (
              <div className="space-y-3 text-sky-900/80 dark:text-sky-100/80">
                <p>{t(back ? 'home.welcome.classicPrompt' : 'home.welcome.proPrompt')}</p>
                <div className="flex justify-center">{switchButton}</div>
              </div>
            )}
            <p className="text-sky-900/80 dark:text-sky-100/80">{t('home.welcome.signOff')}</p>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={true}
            aria-label={t('home.welcome.minimise')}
            title={t('home.welcome.minimise')}
            className="-me-1 -mt-0.5 shrink-0 rounded-md p-1 text-sky-700 transition-colors hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/60"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
