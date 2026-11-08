import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Toast as T } from 'radix-ui';
import { CheckCircle2, X, XCircle } from 'lucide-react';

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
            className="elevated flex animate-rise items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-4 py-3"
          >
            {item.tone === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            )}
            <T.Description className="flex-1 text-[13px] text-fg">{item.message}</T.Description>
            <T.Close aria-label="Dismiss" className="text-fg-3 hover:text-fg">
              <X className="h-4 w-4" />
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed bottom-4 right-4 z-[80] flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2 outline-none" />
      </T.Provider>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used within a ToastProvider');
  return notify;
}
