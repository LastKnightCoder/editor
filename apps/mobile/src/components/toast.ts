import { create } from "zustand";

export type ToastType = "success" | "info" | "warning" | "error";

export type ToastOptions = {
  id?: string;
  type: ToastType;
  text: string;
  duration?: number;
};

export type ToastMessage = {
  id: string;
  type: ToastType;
  text: string;
  duration: number;
};

type ToastStore = {
  toasts: ToastMessage[];
  addToast: (toast: ToastMessage) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
};

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 3000;

function createToastId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => {
      const merged = [
        ...state.toasts.filter((item) => item.id !== toast.id),
        toast,
      ];
      const overflow = merged.length - MAX_TOASTS;
      return {
        toasts: overflow > 0 ? merged.slice(overflow) : merged,
      };
    }),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clearAll: () => set({ toasts: [] }),
}));

type TypedToastInput = {
  text: string;
  id?: string;
  duration?: number;
};

type TypedToastFunction = (
  content: string | TypedToastInput,
  duration?: number,
) => () => void;

export type ToastAPI = {
  (options: ToastOptions): () => void;
  success: TypedToastFunction;
  info: TypedToastFunction;
  warning: TypedToastFunction;
  error: TypedToastFunction;
};

function pushToast(options: ToastOptions): () => void {
  const id = options.id?.trim() || createToastId();
  const message: ToastMessage = {
    id,
    type: options.type,
    text: options.text,
    duration: options.duration ?? DEFAULT_DURATION,
  };
  useToastStore.getState().addToast(message);
  return () => {
    useToastStore.getState().removeToast(message.id);
  };
}

function createTypedToast(type: ToastType): TypedToastFunction {
  return (content, duration) => {
    if (typeof content === "string") {
      return pushToast({
        type,
        text: content,
        duration: duration ?? DEFAULT_DURATION,
      });
    }
    return pushToast({
      id: content.id,
      type,
      text: content.text,
      duration: content.duration ?? duration ?? DEFAULT_DURATION,
    });
  };
}

function toastFunction(options: ToastOptions): () => void {
  return pushToast(options);
}

export const toast: ToastAPI = Object.assign(toastFunction, {
  success: createTypedToast("success"),
  info: createTypedToast("info"),
  warning: createTypedToast("warning"),
  error: createTypedToast("error"),
});

export const TOAST_DEFAULT_DURATION = DEFAULT_DURATION;
export const TOAST_MAX_COUNT = MAX_TOASTS;
