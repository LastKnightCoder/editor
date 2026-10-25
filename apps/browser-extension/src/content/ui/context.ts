import { createContext, useContext, useEffect, useRef } from "react";
import type { CompanionController } from "../state/controller";

export const ControllerContext = createContext<CompanionController | null>(null);

export const useController = (): CompanionController => {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error("ControllerContext 未提供");
  return controller;
};

/**
 * 浮层的 Esc 仲裁（LIFO）：只关最上面一层。页面不是 Tau 的壳层，伴读自建一个栈；
 * 没有浮层时不拦截 Esc，交还给网页。
 */
const stack: Array<{ close: () => void }> = [];

let installed = false;
const install = () => {
  if (installed) return;
  installed = true;
  addEventListener(
    "keydown",
    event => {
      if (event.key !== "Escape" || event.isComposing || !stack.length) return;
      event.preventDefault();
      event.stopPropagation();
      stack[stack.length - 1].close();
    },
    true
  );
};

export function useEscLayer(active: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active) return;
    install();
    const entry = { close: () => closeRef.current() };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [active]);
}
