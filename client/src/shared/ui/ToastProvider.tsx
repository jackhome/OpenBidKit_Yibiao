import * as Toast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

const toastTitleMap: Record<ToastType, string> = {
  success: '完成',
  error: '出错了',
  info: '提示',
};

const getToastDuration = (type: ToastType) => (type === 'error' ? 5000 : 2000);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [
      ...prev,
      {
        id,
        message,
        type,
        duration: getToastDuration(type),
      },
    ]);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => (
          <Toast.Root
            className={`app-toast is-${item.type}`}
            duration={item.duration}
            key={item.id}
            onOpenChange={(open) => {
              if (!open) {
                setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
              }
            }}
          >
            <Toast.Title className="app-toast-title">{toastTitleMap[item.type]}</Toast.Title>
            <Toast.Description className="app-toast-description">{item.message}</Toast.Description>
            <Toast.Close className="app-toast-close" aria-label="关闭提示">×</Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="app-toast-viewport" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }

  return context;
}
