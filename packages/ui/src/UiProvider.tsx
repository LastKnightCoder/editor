import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { getTheme } from "./theme/defineTheme";
import "./theme/themes";

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

export function UiProvider({
  children,
  theme,
  className,
}: {
  children: ReactNode;
  theme?: string;
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
  const mode = theme ? getTheme(theme)?.mode : undefined;
  useLayoutEffect(() => {
    if (!container) return;
    if (theme) container.dataset.theme = theme;
    else delete container.dataset.theme;
    container.classList.toggle("dark", mode === "dark");
  }, [container, theme, mode]);
  return (
    <PortalContext.Provider value={container}>
      <div
        data-theme={theme}
        className={["tau-ui", mode === "dark" ? "dark" : "", className].filter(Boolean).join(" ")}
      >
        {children}
      </div>
    </PortalContext.Provider>
  );
}
