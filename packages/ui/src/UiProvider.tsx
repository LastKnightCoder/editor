import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { DEFAULT_THEME_KEY, type ThemeMode } from "@tau/themes";

const PortalContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement {
  const container = useContext(PortalContext);
  return container ?? document.body;
}

/** 模态内的浮层留在同一层叠上下文，挂载点避开正文滚动区。 */
export function PortalScope({ children }: { children: ReactNode }) {
  const inherited = usePortalContainer();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <PortalContext.Provider value={container ?? inherited}>
      {children}
      <div ref={setContainer} data-ui-portal-scope className="contents" />
    </PortalContext.Provider>
  );
}

/**
 * 局部主题作用域：theme / mode 任一给定即建立作用域（数据块按 主题族 × 明暗 双属性匹配，
 * 缺省的一侧取默认主题族 / 浅色）；都不给则继承 <html> 上的全局主题。
 */
export function UiProvider({
  children,
  theme,
  mode,
  className,
}: {
  children: ReactNode;
  theme?: string;
  mode?: ThemeMode;
  className?: string;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = document.createElement("div");
    element.className = "tau-ui-portals";
    document.body.append(element);
    setContainer(element);
    return () => {
      element.remove();
    };
  }, []);
  const scoped = theme !== undefined || mode !== undefined;
  const scopeTheme = scoped ? (theme ?? DEFAULT_THEME_KEY) : undefined;
  const scopeMode = scoped ? (mode ?? "light") : undefined;
  useLayoutEffect(() => {
    if (!container) return;
    if (scopeTheme && scopeMode) {
      container.dataset.theme = scopeTheme;
      container.dataset.mode = scopeMode;
    } else {
      delete container.dataset.theme;
      delete container.dataset.mode;
    }
    container.classList.toggle("dark", scopeMode === "dark");
  }, [container, scopeTheme, scopeMode]);
  return (
    <PortalContext.Provider value={container}>
      <div
        data-theme={scopeTheme}
        data-mode={scopeMode}
        className={["tau-ui", scopeMode === "dark" ? "dark" : "", className]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </PortalContext.Provider>
  );
}
