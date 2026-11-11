import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Toast as T } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn';

interface ToastItem {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

type Notify = (message: string, tone?: 'ok' | 'error') => void;

const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = useCallback<Notify>((message, tone = 'ok') => {
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), message, tone }]);
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      <T.Provider duration={5000} swipeDirection="right">
        {children}
        {items.map((item) => (
          <T.Root
            key={item.id}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((i) => i.id !== item.id))}
            className="elevated flex animate-rise items-start gap-3 rounded-[var(--radius-card)] border border-rule-strong/70 bg-ink-3 py-3 pl-3.5 pr-3"
          >
            <span aria-hidden="true" className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', item.tone === 'ok' ? 'bg-accent' : 'bg-danger')} />
            <T.Description className="flex-1 text-[13px] leading-5 text-fg">{item.message}</T.Description>
            <T.Close aria-label="Dismiss" className="text-fg-3 hover:text-fg">
              <X className="h-4 w-4" />
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed bottom-5 left-1/2 z-[80] flex w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-2 outline-none" />
      </T.Provider>
    </ToastContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used within a ToastProvider');
  return notify;
}
