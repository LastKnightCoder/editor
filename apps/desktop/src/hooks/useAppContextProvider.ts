import { useEffect, useRef } from "react";
import { registerAppContextProvider, unregisterAppContextProvider } from "@/services/app-context";

/** 视图挂载期间登记一个应用上下文提供器；label / provide 经 ref 保鲜，调用方无需传稳定引用 */
export function useAppContextProvider(key: string, label: string, provide: () => unknown) {
  const ref = useRef({ label, provide });
  ref.current = { label, provide };

  useEffect(() => {
    registerAppContextProvider(key, {
      get label() {
        return ref.current.label;
      },
      provide: () => ref.current.provide(),
    });
    return () => unregisterAppContextProvider(key);
  }, [key]);
}
