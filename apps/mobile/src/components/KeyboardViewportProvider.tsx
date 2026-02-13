import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  useKeyboardViewportState,
  type KeyboardViewportState,
} from "../hooks/useKeyboardViewport";
import { useKeyboardAutoReveal } from "../hooks/useKeyboardAutoReveal";

function getDefaultViewportHeight(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  return Math.max(
    1,
    Math.round(
      window.innerHeight || document.documentElement.clientHeight || 1,
    ),
  );
}

const DEFAULT_KEYBOARD_VIEWPORT_STATE: KeyboardViewportState = {
  viewportHeight: getDefaultViewportHeight(),
  keyboardHeight: 0,
  isKeyboardVisible: false,
};

const KeyboardViewportContext = createContext<KeyboardViewportState>(
  DEFAULT_KEYBOARD_VIEWPORT_STATE,
);

function toPx(value: number): string {
  return `${Math.max(0, Math.round(value))}px`;
}

export function KeyboardViewportProvider(props: { children: ReactNode }) {
  const keyboardViewportState = useKeyboardViewportState();
  useKeyboardAutoReveal();

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty(
      "--kb-height",
      toPx(keyboardViewportState.keyboardHeight),
    );
    rootStyle.setProperty(
      "--kb-viewport-height",
      toPx(keyboardViewportState.viewportHeight),
    );
  }, [
    keyboardViewportState.keyboardHeight,
    keyboardViewportState.viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--kb-height");
      rootStyle.removeProperty("--kb-viewport-height");
    };
  }, []);

  return (
    <KeyboardViewportContext.Provider value={keyboardViewportState}>
      {props.children}
    </KeyboardViewportContext.Provider>
  );
}

export function useKeyboardViewport(): KeyboardViewportState {
  return useContext(KeyboardViewportContext);
}

export default KeyboardViewportProvider;
