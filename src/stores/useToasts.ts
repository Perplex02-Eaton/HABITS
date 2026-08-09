import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  icon?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, icon?: string) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, icon) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, icon }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3400);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}));

export const toast = (message: string, icon?: string) =>
  useToasts.getState().push(message, icon);
